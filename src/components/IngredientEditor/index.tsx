// 食材的新增 / 编辑抽屉：食材库管理页和菜品编辑器（没找到食材时的新增）共用这一份。
// 以前菜品编辑器里另写了一个「快速添加」小弹窗，只有名称/分类/单位三个字段，
// 图片、平台价格、营养都补不了，回头还得再去食材库补一遍 —— 所以统一成这个完整表单。

import { useEffect, useState } from 'react';
import { ProCard } from '@ant-design/pro-components';
import {
  Button,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  App as AntApp,
} from 'antd';
import { DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { pickImage, formatSize, IMAGE_ACCEPT } from '@/lib/imageUpload';
import { resolveImageUrl, describeImageSource } from '@/lib/imageStorage';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePasteImage } from '@/hooks/usePasteImage';
import type { Ingredient, IngredientCategory, IngredientUnit } from '@/types';
import { NUTRI_FIELDS } from '@/types';

const { Text } = Typography;

const categories: IngredientCategory[] = [
  '蔬菜',
  '肉类',
  '海鲜',
  '调料',
  '主食',
  '蛋奶',
  '水果',
  '其他',
];

/** 计价单位只有 4 个：固体 g / kg，液体 ml / L */
const unitOptions: { value: IngredientUnit; label: string }[] = [
  { value: 'g', label: 'g 克（固体默认）' },
  { value: 'kg', label: 'kg 千克' },
  { value: 'ml', label: 'ml 毫升（液体默认）' },
  { value: 'L', label: 'L 升' },
];

/** 平台价格在表单里平铺成 price_平台 / amount_平台 两组字段 */
type PriceField = `price_${string}` | `amount_${string}`;

interface FormValues {
  name: string;
  category: IngredientCategory;
  unit: IngredientUnit;
  note?: string;
  image?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  sodium?: number;
  fiber?: number;
}

type FormValuesWithPrices = FormValues & Partial<Record<PriceField, number>>;

interface Props {
  open: boolean;
  /** 传了就是编辑，不传 / null 就是新增 */
  ingredient?: Ingredient | null;
  /** 新增时预填的名称（比如从菜品编辑器的搜索词带过来） */
  initialName?: string;
  /** 新增时的默认分类，不传就是「蔬菜」 */
  initialCategory?: IngredientCategory;
  onClose: () => void;
  /** 保存成功：新增返回新建的食材，编辑返回合并后的食材 */
  onSaved?: (ing: Ingredient) => void;
  onDeleted?: (id: string) => void;
}

export default function IngredientEditor({
  open,
  ingredient,
  initialName,
  initialCategory,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const { add, update, remove, load } = useIngredientStore();
  const platforms = usePriceStore((s) => s.platforms);
  const isMobile = useIsMobile();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValuesWithPrices>();
  const [removing, setRemoving] = useState(false);
  const [imgProcessing, setImgProcessing] = useState(false);
  /** 本次上传的结果：体积 + 走的是对象存储还是本地压缩，用于在编辑区常驻显示 */
  const [imgInfo, setImgInfo] = useState<{ size: number; viaStorage: boolean } | null>(null);

  // 每次开关编辑器都清掉上一次的大小信息（这次还没传图，不该显示上次的数字）
  useEffect(() => setImgInfo(null), [open]);

  // 打开时按「新增 / 编辑」初始化表单；编辑把食材摊平成表单字段，新增给默认值
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (ingredient) {
      const values: FormValuesWithPrices = {
        name: ingredient.name,
        category: ingredient.category,
        unit: ingredient.unit,
        note: ingredient.note,
        image: ingredient.image,
        calories: ingredient.nutrition?.calories,
        protein: ingredient.nutrition?.protein,
        fat: ingredient.nutrition?.fat,
        carbs: ingredient.nutrition?.carbs,
        sodium: ingredient.nutrition?.sodium,
        fiber: ingredient.nutrition?.fiber,
      };
      for (const platform of platforms) {
        values[`price_${platform}`] = ingredient.prices?.[platform]?.price;
        values[`amount_${platform}`] = ingredient.prices?.[platform]?.amount;
      }
      form.setFieldsValue(values);
    } else {
      form.setFieldsValue({ category: initialCategory ?? '蔬菜', unit: 'g', name: initialName });
    }
  }, [open, ingredient, initialName, initialCategory, platforms, form]);

  const currentImage = Form.useWatch('image', form);

  const handlePickImage = async (file: File) => {
    setImgProcessing(true);
    try {
      // 压缩成 WebP → 上传对象存储 → 只把相对 key 存库（上传失败会直接抛错，不再降级）
      const picked = await pickImage(file, 'ingredients');
      form.setFieldsValue({ image: picked.key });
      // 体积存下来常驻显示，不再只靠弹窗（弹窗一闪而过，回头就查不到了）
      setImgInfo({ size: picked.size, viaStorage: picked.viaStorage });
    } catch (e) {
      // pickImage 抛出来的已经是可读文案（比如「不支持 GIF 动图…」），直接透传
      message.error((e as Error).message || '图片处理失败');
    } finally {
      setImgProcessing(false);
    }
  };

  // 编辑器打开时，支持直接把图片粘贴进来（截图 / 网页复制 / 复制的图片文件）
  usePasteImage(open, (file) => {
    void handlePickImage(file);
  });

  const onSave = async () => {
    try {
      const values = await form.validateFields();

      // 表单 → Ingredient：把 price_平台 / amount_平台 收回成 prices 对象
      const prices: Ingredient['prices'] = {};
      for (const platform of platforms) {
        const price = values[`price_${platform}`];
        if (price === undefined || price === null) continue;
        const amount = values[`amount_${platform}`];
        prices[platform] = { price, amount: amount && amount > 0 ? amount : 1 };
      }
      const hasNutrition = NUTRI_FIELDS.some((f) => values[f.key] !== undefined);
      const payload: Omit<Ingredient, 'id'> = {
        name: values.name,
        category: values.category,
        unit: values.unit,
        note: values.note,
        image: values.image,
        prices,
        nutrition: hasNutrition
          ? {
              calories: values.calories ?? 0,
              protein: values.protein ?? 0,
              fat: values.fat ?? 0,
              carbs: values.carbs ?? 0,
              sodium: values.sodium ?? 0,
              fiber: values.fiber ?? 0,
            }
          : undefined,
      };

      if (ingredient) {
        await update(ingredient.id, payload, true);
        message.success('已更新');
        onSaved?.({ ...ingredient, ...payload });
      } else {
        const newIng: Ingredient = {
          id: 'ing_' + Date.now().toString(36),
          ...payload,
        };
        await add(newIng);
        message.success('已添加');
        onSaved?.(newIng);
      }
      // 从云端重新拉最新数据，保证其它页面（菜品编辑器、详情页）拿到的是同一份
      await load();
      onClose();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg) message.error(msg);
    }
  };

  const onDelete = async () => {
    if (!ingredient) return;
    setRemoving(true);
    try {
      await remove(ingredient.id);
      message.success('已删除');
      onDeleted?.(ingredient.id);
      await load();
      onClose();
    } catch (e) {
      // 占用检查在 store 里抛出
      message.error((e as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Drawer
      title={ingredient ? `编辑食材：${ingredient.name}` : '新增食材'}
      open={open}
      onClose={onClose}
      width={isMobile ? '100%' : 620}
      forceRender
      styles={{ body: { paddingTop: 12 } }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {ingredient ? (
            <Popconfirm
              title="删除这个食材？"
              description="如果有任何菜品正在使用，会被拒"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={onDelete}
            >
              <Button danger icon={<DeleteOutlined />} loading={removing}>
                删除
              </Button>
            </Popconfirm>
          ) : (
            <span />
          )}
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={onSave}>
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <Form form={form} layout="vertical" preserve={false}>
        <ProCard title="基本信息" headerBordered bordered style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                <Input placeholder="如：五花肉" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                <Select options={categories.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="unit"
                label="计价单位"
                rules={[{ required: true }]}
                tooltip="固体用 g / kg，液体用 ml / L；填价时按这个单位记「这一份多重 / 多少容量」"
              >
                <Select options={unitOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="note" label="备注（可选）">
                <Input placeholder="如：这一瓶 1 升 / 约两个中等土豆" />
              </Form.Item>
            </Col>
          </Row>

          {/* 食材图片：左边固定尺寸预览框（没图时是虚线占位），右边操作区 */}
          <Form.Item label="食材图片（可选）" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 96,
                  height: 96,
                  flexShrink: 0,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: currentImage ? 'transparent' : '#fafafa',
                  border: currentImage ? '1px solid #eee' : '1px dashed #d9d9d9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#bfbfbf',
                  fontSize: 12,
                }}
              >
                {currentImage ? (
                  <img
                    src={resolveImageUrl(currentImage)}
                    alt="图片预览"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <PictureOutlined style={{ fontSize: 22, display: 'block', marginBottom: 4 }} />
                    暂无图片
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Space wrap size={8}>
                  <Upload
                    accept={IMAGE_ACCEPT}
                    showUploadList={false}
                    beforeUpload={(file) => {
                      void handlePickImage(file);
                      return false;
                    }}
                  >
                    <Button icon={<PictureOutlined />} loading={imgProcessing}>
                      选择本地图片
                    </Button>
                  </Upload>
                  {currentImage && (
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        form.setFieldsValue({ image: '' });
                        setImgInfo(null);
                      }}
                    >
                      清除图片
                    </Button>
                  )}
                  {imgInfo && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatSize(imgInfo.size)}
                      {imgInfo.viaStorage ? ' · 已存云端' : ' · 压缩后存本地'}
                    </Text>
                  )}
                  {currentImage && (() => {
                    const src = describeImageSource(currentImage);
                    const color =
                      src.kind === 'external' ? 'red' :
                      src.kind === 'local' ? 'orange' :
                      src.kind === 'cos' ? 'blue' :
                      src.kind === 'supabase' ? 'geekblue' : 'default';
                    return (
                      <Tag color={color} style={{ margin: 0 }}>
                        来源：{src.label}
                        {src.kind === 'external' && ' — 外链随时可能失效'}
                      </Tag>
                    );
                  })()}
                </Space>

                <Form.Item name="image" noStyle>
                  <Input placeholder="或输入相对路径（如 ingredients/xxx.webp）" allowClear />
                </Form.Item>

                <Text type="secondary" style={{ fontSize: 12 }}>
                  只允许本地上传到对象存储（当前：腾讯云 COS），不支持外链；支持 JPG / PNG / WebP
                </Text>
              </div>
            </div>
          </Form.Item>
        </ProCard>

        {/* 平台价格：只记「这一份多少钱 + 这一份多重/多少容量」，系统自动折算比价 */}
        <ProCard
          title="各平台价格"
          headerBordered
          bordered
          style={{ marginBottom: 16 }}
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              只填这一份的价格与份量
            </Text>
          }
        >
          <div style={{ display: 'flex', gap: 8, color: '#999', fontSize: 12, marginBottom: 6 }}>
            <span style={{ width: 88 }}>平台</span>
            <span style={{ flex: 1, minWidth: 0 }}>这一份价格（元）</span>
            <span style={{ flex: 1, minWidth: 0 }}>这一份份量（默认 1）</span>
          </div>

          {platforms.map((platform) => (
            <div
              key={platform}
              style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
            >
              <span style={{ width: 88, flexShrink: 0, fontWeight: 500, color: '#2D2A26', fontSize: 13 }}>
                {platform}
              </span>
              <Form.Item name={`price_${platform}`} noStyle>
                <InputNumber
                  min={0}
                  step={0.1}
                  prefix="¥"
                  placeholder="如 3.5"
                  style={{ flex: 1, minWidth: 0 }}
                />
              </Form.Item>
              <Form.Item name={`amount_${platform}`} noStyle>
                <InputNumber
                  min={0}
                  step={0.1}
                  placeholder="默认 1"
                  style={{ flex: 1, minWidth: 0 }}
                />
              </Form.Item>
            </div>
          ))}

          <Text type="secondary" style={{ fontSize: 12 }}>
            例：生抽 1 升 10 元 → 单位「L」，份量 1，价格 10；土豆一袋 1 千克 3 元 →
            单位「kg」，份量 1，价格 3；土豆一盒 700 克 5 元 → 单位「g」，份量 700，价格 5
          </Text>
        </ProCard>

        {/* 营养：每 100g / 100ml，主料填、调料不填 */}
        <ProCard
          title="营养成分"
          headerBordered
          bordered
          extra={
            <Text type="secondary" style={{ fontSize: 12 }}>
              每 100 g / 100 ml，调料可不填
            </Text>
          }
        >
          <Row gutter={16}>
            {NUTRI_FIELDS.map((f) => (
              <Col xs={12} md={8} key={f.key}>
                <Form.Item name={f.key} label={`${f.label}（${f.unit}）`}>
                  <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            ))}
          </Row>
        </ProCard>
      </Form>
    </Drawer>
  );
}
