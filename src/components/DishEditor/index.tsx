// 菜品的创建/编辑/删除弹窗（仅超级管理员可见）
// 用法：
//   <DishEditor mode="create" open onClose onCreated={dish => navigate('/menu/' + dish.id)} />
//   <DishEditor mode="edit" open dish={current} onClose onSaved={dish => ...} />

import { useEffect, useRef, useState } from 'react';
import { ProCard } from '@ant-design/pro-components';
import {
  Modal,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Row,
  Col,
  App as AntApp,
  Popconfirm,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { DeleteOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { pickImage, formatSize, IMAGE_ACCEPT } from '@/lib/imageUpload';
import { resolveImageUrl, storageDelete } from '@/lib/supabase';
import type { Dish, DishCategory, DishIngredient, Step } from '@/types';
import { BUILTIN_TAGS } from '@/types';

const { Text } = Typography;

// 顺序跟首页 Tab / PC 菜单完全一致（见 Menu/index.tsx 的 categories）
// 只按地域流派分 7 类，汤羹/凉菜/烘焙/减脂/快手都是形态/属性，走 tags 不放这里
const CATEGORIES: DishCategory[] = [
  '家常', '川菜', '粤菜', '湘菜', '鲁菜', '江浙', '其他',
];

/** 配料单位：固体用斤 / g / kg，液体用 ml / L（跟食材库的计价单位保持一致） */
const UNIT_OPTIONS = [
  { value: 'g', label: 'g 克' },
  { value: '斤', label: '斤' },
  { value: 'kg', label: 'kg 公斤' },
  { value: 'ml', label: 'ml 毫升' },
  { value: 'L', label: 'L 升' },
];

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  /** edit 模式必填 */
  dish?: Dish;
  onClose: () => void;
  /** create 成功 */
  onCreated?: (d: Dish) => void;
  /** edit 成功 */
  onSaved?: (d: Dish) => void;
  /** 删除成功 */
  onDeleted?: (id: string) => void;
  /**
   * 容器类型：modal（默认，详情页 / 卡片墙用）还是 drawer（管理台用）。
   *
   * 管理台的「菜单管理」是表格，一行行扫着改。弹框会把整张表盖住，
   * 关掉又要重新找刚才那条。换成右侧抽屉，表单拉出来时表格还在左边，
   * 改完可以直接接着看下一条 —— 所以管理台统一用抽屉。
   */
  container?: 'modal' | 'drawer';
  /** drawer 模式宽度，默认 720 */
  drawerWidth?: number;
}

interface FormValues {
  name: string;
  category: DishCategory;
  difficulty: 1 | 2 | 3;
  cookTimeMin: number;
  servings: number;
  tags: string[];
  coverImage?: string;
  tips?: string;
}

interface RowIngredient {
  ingredientId?: string;
  amount?: number;
  unit?: string;
}



export default function DishEditor({
  open,
  mode,
  dish,
  onClose,
  onCreated,
  onSaved,
  onDeleted,
  container = 'modal',
  drawerWidth = 720,
}: Props) {
  const { message } = AntApp.useApp();
  const addDish = useDishStore((s) => s.add);
  const updateDish = useDishStore((s) => s.update);
  const removeDish = useDishStore((s) => s.remove);
  const ingredients = useIngredientStore((s) => s.items);
  const [form] = Form.useForm<FormValues>();

  const [rows, setRows] = useState<RowIngredient[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [imgProcessing, setImgProcessing] = useState(false);
  /**
   * 本次上传的结果：体积 + 走的是对象存储还是本地压缩。
   * 单独存一份是为了在编辑区**常驻显示**大小 ——
   * 以前只在弹窗里说一句就消失了，回头想看这张图多大只能重新传一次。
   */
  const [imgInfo, setImgInfo] = useState<{ size: number; viaStorage: boolean } | null>(null);

  /*
    本次会话新上传、但**还没存进数据库**的那张图。
    用 ref 而不是 state：它只在保存/回滚时读写，不参与渲染。
    null = 当前没有「待提交」的新图。
  */
  const pendingUploadRef = useRef<{ url: string; path: string } | null>(null);
  // 编辑器打开那一刻 dish 的图地址。用来区分「用户主动清空」和
  // 「打开太早、数据还没从云端就位所以表单本来就是空的」——后者绝不能当清空处理
  const openedCoverRef = useRef<string | undefined>(undefined);

  // 每次打开编辑器都清掉上一次的大小信息（这次还没传图，不该显示上次的数字）
  useEffect(() => setImgInfo(null), [open]);

  const coverImage = Form.useWatch('coverImage', form);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && dish) {
      openedCoverRef.current = dish.coverImage;
      form.setFieldsValue({
        name: dish.name,
        category: dish.category,
        difficulty: dish.difficulty,
        cookTimeMin: dish.cookTimeMin,
        servings: dish.servings,
        tags: dish.tags,
        coverImage: dish.coverImage ?? '',
        tips: dish.tips,
      });
      setRows(dish.ingredients.map((i) => ({ ...i })));
      setSteps(dish.steps.map((s) => s.text));
    } else {
      openedCoverRef.current = undefined;
      form.resetFields();
      form.setFieldsValue({
        category: '家常',
        difficulty: 1,
        cookTimeMin: 15,
        servings: 2,
        tags: [],
        coverImage: '',
      });
      setRows([]);
      setSteps(['']);
    }
  }, [open, mode, dish, form]);

  const handlePickImage = async (file: File) => {
    setImgProcessing(true);
    try {
      // 压缩成 WebP → 上传对象存储 → 只把 URL 填进表单（上传失败会直接抛错）
      const picked = await pickImage(file, 'dishes');
      form.setFieldsValue({ coverImage: picked.url });
      /*
        记下「本次新传的这张图」。

        上传和保存是**两步**：先传图（成功），再点保存写数据库。
        这两步之间可能隔着十几秒，而第二步完全可能失败 ——
        一旦失败，桶里就多了一张没人引用的图，数据库里却没地址，
        正是「桶里有图、数据库没记录」这种不一致状态的来源。

        记下路径，onSave 失败时用它把图删掉，让两边回到一致。
      */
      pendingUploadRef.current = { url: picked.url, path: picked.storagePath };
      // 体积存下来常驻显示，不再只靠弹窗（弹窗一闪而过，回头就查不到了）
      setImgInfo({ size: picked.size, viaStorage: picked.viaStorage });
    } catch (e) {
      // pickImage 抛出来的已经是可读文案（比如「不支持 GIF 动图…」），直接透传
      message.error((e as Error).message || '图片处理失败');
    } finally {
      setImgProcessing(false);
    }
  };

  /** 回滚：删掉刚上传但没能存进数据库的图，保证桶与数据库一致 */
  const rollbackUpload = async () => {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    pendingUploadRef.current = null;
    try {
      await storageDelete(pending.path);
      console.warn('[image] 数据库没存住，已回滚删除桶里的图：', pending.path);
    } catch (e) {
      // 删不掉不算保存失败，但必须留下痕迹，否则又是一张查不到来源的孤儿图
      console.error('[image] 回滚删除失败，桶里可能留下一张孤儿图：', pending.path, e);
    }
  };

  // —— 食材行操作 ——
  const addRow = () => setRows((r) => [...r, {}]);
  const removeRow = (i: number) =>
    setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<RowIngredient>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  // —— 步骤操作 ——
  const addStep = () => setSteps((s) => [...s, '']);
  const removeStep = (i: number) =>
    setSteps((s) => (s.length <= 1 ? s : s.filter((_, idx) => idx !== i)));
  const updateStep = (i: number, v: string) =>
    setSteps((s) => s.map((x, idx) => (idx === i ? v : x)));

  const validateBeforeSave = (): { ok: boolean; error?: string } => {
    const cleanedRows = rows.filter((r) => r.ingredientId && (r.amount ?? 0) > 0);
    if (cleanedRows.length === 0) return { ok: false, error: '请至少添加一种食材' };
    if (steps.every((s) => !s.trim())) return { ok: false, error: '请至少写一个步骤' };
    return { ok: true };
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      const v = validateBeforeSave();
      if (!v.ok) {
        message.error(v.error);
        return;
      }
      const cleanedRows: DishIngredient[] = rows
        .filter((r) => r.ingredientId && (r.amount ?? 0) > 0)
        .map((r) => ({
          ingredientId: r.ingredientId!,
          amount: Number(r.amount),
          unit: r.unit || 'g',
        }));
      const cleanedSteps: Step[] = steps
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((text, i) => ({ order: i + 1, text }));

      setSaving(true);
      /*
        表单里图地址的取值，三档语义（配合 useDishStore.update 的 undefined 跳过逻辑）：
        - 有 URL/路径 → 照传，正常保存
        - 空串，但打开编辑器时有图 → 用户真的清空了，传 '' 落库为 null
        - 空串，且打开时就没图 → 打开太早云端数据还没就位，表单空≠清空，
          传 undefined 让 update 跳过该字段，保住数据库里已有的图地址
      */
      const formCover = values.coverImage !== undefined ? values.coverImage.trim() : undefined;
      const coverImage = formCover === '' && !openedCoverRef.current ? undefined : formCover;
      if (mode === 'create') {
        const newDish: Dish = {
          id: 'dish_' + Date.now().toString(36),
          name: values.name.trim(),
          category: values.category,
          difficulty: values.difficulty,
          cookTimeMin: values.cookTimeMin,
          servings: values.servings,
          tags: values.tags || [],
          coverImage,
          tips: values.tips?.trim() || undefined,
          favorite: false,
          createdAt: Date.now(),
          ingredients: cleanedRows,
          steps: cleanedSteps,
        };
        await addDish(newDish);
        // 数据库确认存住了（writeCloud 里有回读校验），这张图才算「有主」了
        pendingUploadRef.current = null;
        message.success('已添加');
        onCreated?.(newDish);
      } else if (dish) {
        const patch = {
          name: values.name.trim(),
          category: values.category,
          difficulty: values.difficulty,
          cookTimeMin: values.cookTimeMin,
          servings: values.servings,
          tags: values.tags || [],
          coverImage,
          tips: values.tips?.trim() || undefined,
          ingredients: cleanedRows,
          steps: cleanedSteps,
        };
        await updateDish(dish.id, patch);
        pendingUploadRef.current = null;
        message.success('已保存');
        onSaved?.({ ...dish, ...patch });
      }
      onClose();
    } catch (e) {
      /*
        保存失败 —— 这里是最容易留下不一致状态的地方：
        图已经在桶里了（十几秒前传上去的），但数据库没存住地址。

        把刚传的图删掉，回到「桶和数据库都没有」的一致状态，
        而不是留下「桶里有、库里没有」的半成品。
      */
      await rollbackUpload();
      const msg = (e as Error).message;
      if (msg) message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!dish) return;
    setRemoving(true);
    try {
      await removeDish(dish.id);
      message.success('已删除');
      onDeleted?.(dish.id);
      onClose();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const ingredientOptions = ingredients.map((i) => ({
    value: i.id,
    label: `${i.name}（${i.unit}）`,
  }));

  const title = mode === 'create' ? '添加菜品' : `编辑菜品：${dish?.name ?? ''}`;

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      {mode === 'edit' ? (
        <Popconfirm
          title="删除这道菜？"
          description="如果有人正把它放在采购清单或菜单（今日/本周/本月）里，会被拒"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <Button danger icon={<DeleteOutlined />} loading={removing}>
            删除菜品
          </Button>
        </Popconfirm>
      ) : (
        <span />
      )}
      <Space>
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" onClick={onSave} loading={saving}>
          保存
        </Button>
      </Space>
    </div>
  );

  // 表单内容：两种容器共用同一份，容器只负责外壳（标题 / 关闭 / 底部按钮）
  // 排版按「菜品信息 / 食材信息 / 烹饪步骤与小贴士」三块分区（ProCard），
  // 每块内部统一用 Row + Col 栅格，字段宽度对齐，不再一行行长短不齐。
  const formBody = (
    <Form form={form} layout="vertical" preserve={false}>
      <ProCard
        title="菜品信息"
        headerBordered
        bordered
        style={{ marginBottom: 16 }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="name"
              label="菜名"
              rules={[{ required: true, message: '请输入菜名' }]}
            >
              <Input placeholder="如：西红柿炒鸡蛋" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="category" label="菜系" rules={[{ required: true }]}>
              <Select options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="difficulty" label="难度" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 1, label: '★☆☆ 简单' },
                  { value: 2, label: '★★☆ 中等' },
                  { value: 3, label: '★★★ 较难' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="cookTimeMin"
              label="用时（分钟）"
              rules={[{ required: true, type: 'number', min: 1 }]}
            >
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              name="servings"
              label="份量（人份）"
              rules={[{ required: true, type: 'number', min: 1 }]}
            >
              <InputNumber min={1} max={20} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="tags"
          label="标签"
          rules={[
            { required: true, message: '至少选 1 个标签' },
            {
              validator: (_, v: string[]) => {
                if (!v || v.length === 0) return Promise.resolve(); // 上面 required 已经拦
                if (v.length > 5) return Promise.reject(new Error('最多 5 个标签'));
                return Promise.resolve();
              },
            },
          ]}
          extra="从下拉里选或直接输入回车，1~5 个"
        >
          <Select
            mode="tags"
            placeholder="选一些能描述这道菜的标签，如：汤羹、减脂、下饭"
            maxTagCount={5}
            options={BUILTIN_TAGS.map((t) => ({ value: t, label: t }))}
          />
        </Form.Item>

        {/* 封面图：左边固定尺寸预览框（没图时是虚线占位，高度不跳），右边操作区 */}
        <Form.Item label="封面图（可选）" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 120,
                height: 160,
                flexShrink: 0,
                borderRadius: 10,
                overflow: 'hidden',
                background: coverImage ? 'transparent' : '#fafafa',
                border: coverImage ? '1px solid #eee' : '1px dashed #d9d9d9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bfbfbf',
                fontSize: 12,
              }}
            >
              {coverImage ? (
                <img
                  src={resolveImageUrl(coverImage)}
                  alt="封面预览"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <PictureOutlined style={{ fontSize: 24, display: 'block', marginBottom: 6 }} />
                  暂无封面
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
                {coverImage && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      form.setFieldsValue({ coverImage: '' });
                      setImgInfo(null);
                      /*
                        传完又点「清除图片」＝ 用户反悔了。
                        刚传到桶里的那张图现在没人要了，直接删掉，
                        否则又是一张永远不会被引用的孤儿图。
                      */
                      void (async () => {
                        await rollbackUpload();
                        message.success('已清除');
                      })();
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
              </Space>

              <Form.Item name="coverImage" noStyle>
                <Input placeholder="或粘贴图片链接（如 /dishes/xxx.jpg 或 http://…）" allowClear />
              </Form.Item>

              <Text type="secondary" style={{ fontSize: 12 }}>
                支持 JPG / PNG / WebP 静态图，建议 3:4 竖图（上传前会自动压缩）
              </Text>
            </div>
          </div>
        </Form.Item>
      </ProCard>

      <ProCard
        title="食材信息"
        headerBordered
        bordered
        style={{ marginBottom: 16 }}
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            已添加 {rows.length} 种
          </Text>
        }
      >
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 8, color: '#999', fontSize: 12, marginBottom: 6 }}>
            <span style={{ flex: 1, minWidth: 0 }}>食材</span>
            <span style={{ width: 120 }}>用量</span>
            <span style={{ width: 110 }}>单位</span>
            <span style={{ width: 32 }} />
          </div>
        )}

        {rows.length === 0 && (
          <div
            style={{
              padding: '18px 12px',
              marginBottom: 8,
              background: '#fafafa',
              borderRadius: 8,
              color: '#999',
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            还没有食材，点下面的按钮加一行
          </div>
        )}

        {rows.map((row, i) => (
          <div
            key={i}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选食材"
              value={row.ingredientId}
              onChange={(v) => {
                const ing = ingredients.find((x) => x.id === v);
                updateRow(i, { ingredientId: v, unit: ing?.unit || row.unit });
              }}
              options={ingredientOptions}
              style={{ flex: 1, minWidth: 0 }}
            />
            <InputNumber
              placeholder="用量"
              min={0}
              value={row.amount}
              onChange={(v) => updateRow(i, { amount: v ?? undefined })}
              style={{ width: 120 }}
            />
            <Select
              placeholder="单位"
              value={row.unit}
              onChange={(v) => updateRow(i, { unit: v })}
              options={UNIT_OPTIONS}
              style={{ width: 110 }}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeRow(i)}
              style={{ width: 32, paddingInline: 0, flexShrink: 0 }}
            />
          </div>
        ))}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addRow}
          block
          style={{ marginTop: rows.length ? 4 : 0 }}
        >
          添加一行食材
        </Button>
      </ProCard>

      <ProCard
        title="烹饪步骤与小贴士"
        headerBordered
        bordered
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {steps.length} 步
          </Text>
        }
      >
        {steps.map((text, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <Tag color="orange" style={{ marginTop: 6, minWidth: 28, textAlign: 'center' }}>
              {i + 1}
            </Tag>
            <Input.TextArea
              placeholder={`第 ${i + 1} 步`}
              value={text}
              onChange={(e) => updateStep(i, e.target.value)}
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{ flex: 1 }}
            />
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={steps.length <= 1}
              onClick={() => removeStep(i)}
              style={{ width: 32, paddingInline: 0, flexShrink: 0 }}
            />
          </div>
        ))}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addStep}
          block
          style={{ marginTop: 4 }}
        >
          添加一个步骤
        </Button>

        <Form.Item name="tips" label="小贴士（可选）" style={{ margin: '16px 0 0' }}>
          <Input.TextArea
            placeholder="如：番茄要炒到绵软出汁才够味"
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
        </Form.Item>
      </ProCard>
    </Form>
  );

  if (container === 'drawer') {
    return (
      <Drawer
        title={title}
        open={open}
        onClose={onClose}
        width={drawerWidth}
        forceRender
        styles={{ body: { paddingTop: 12 } }}
        footer={footer}
      >
        {formBody}
      </Drawer>
    );
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      width={760}
      forceRender
      footer={footer}
    >
      {formBody}
    </Modal>
  );
}
