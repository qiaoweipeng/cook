// 菜品的创建/编辑/删除弹窗（仅超级管理员可见）
// 用法：
//   <DishEditor mode="create" open onClose onCreated={dish => navigate('/menu/' + dish.id)} />
//   <DishEditor mode="edit" open dish={current} onClose onSaved={dish => ...} />

import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Space,
  Divider,
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

const { Text } = Typography;

// 顺序跟首页 Tab / PC 菜单完全一致（见 Menu/index.tsx 的 categories）
const CATEGORIES: DishCategory[] = [
  '家常', '川菜', '粤菜', '湘菜', '鲁菜', '快手', '烘焙', '汤羹', '凉菜', '减脂', '江浙', '其他',
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

  // 每次打开编辑器都清掉上一次的大小信息（这次还没传图，不该显示上次的数字）
  useEffect(() => setImgInfo(null), [open]);

  const coverImage = Form.useWatch('coverImage', form);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && dish) {
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
      const coverImage = values.coverImage?.trim() || undefined;
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

  return (
    <Modal
      title={mode === 'create' ? '添加菜品' : `编辑菜品：${dish?.name ?? ''}`}
      open={open}
      onCancel={onClose}
      width={760}
      forceRender
      footer={
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
      }
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Space wrap size={12} style={{ width: '100%' }}>
          <Form.Item
            name="name"
            label="菜名"
            rules={[{ required: true, message: '请输入菜名' }]}
            style={{ minWidth: 200, flex: 1 }}
          >
            <Input placeholder="如：西红柿炒鸡蛋" />
          </Form.Item>
          <Form.Item name="category" label="分类" rules={[{ required: true }]}>
            <Select options={CATEGORIES.map((c) => ({ value: c, label: c }))} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="difficulty" label="难度" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 1, label: '★☆☆' },
                { value: 2, label: '★★☆' },
                { value: 3, label: '★★★' },
              ]}
              style={{ width: 100 }}
            />
          </Form.Item>
          <Form.Item name="cookTimeMin" label="用时(分钟)" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber min={1} max={999} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item name="servings" label="份量(人份)" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber min={1} max={20} style={{ width: 100 }} />
          </Form.Item>
        </Space>

        <Form.Item name="tags" label="标签（回车添加）">
          <Select mode="tags" placeholder="如：下饭、快手" />
        </Form.Item>

        <Form.Item label="封面图（可选）">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space wrap>
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
              {coverImage ? (
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
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  支持 JPG / PNG / WebP 静态图
                </Text>
              )}
              {/* 上传完把大小常驻在这里，不再只是弹窗一闪而过 */}
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
            {coverImage && (
              <img
                src={resolveImageUrl(coverImage)}
                alt="封面预览"
                style={{
                  width: 160,
                  height: 90,
                  objectFit: 'cover',
                  borderRadius: 8,
                  border: '1px solid #eee',
                }}
              />
            )}
          </Space>
        </Form.Item>

        <Divider orientation="left" plain>
          食材
        </Divider>
        {rows.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            还没添加食材，点下面的按钮加一行
          </Text>
        )}
        {rows.map((row, i) => (
          <Space.Compact key={i} style={{ display: 'flex', marginBottom: 8, gap: 8 }}>
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
              style={{ flex: 2, minWidth: 160 }}
            />
            <InputNumber
              placeholder="用量"
              min={0}
              value={row.amount}
              onChange={(v) => updateRow(i, { amount: v ?? undefined })}
              style={{ flex: 1, minWidth: 90 }}
            />
            <Input
              placeholder="单位"
              value={row.unit}
              onChange={(e) => updateRow(i, { unit: e.target.value })}
              style={{ flex: 1, minWidth: 70 }}
            />
            <Button danger icon={<DeleteOutlined />} onClick={() => removeRow(i)} />
          </Space.Compact>
        ))}
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addRow}
          block
          style={{ marginTop: 4 }}
        >
          添加一行食材
        </Button>

        <Divider orientation="left" plain>
          烹饪步骤
        </Divider>
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

        <Form.Item name="tips" label="小贴士（可选）" style={{ marginTop: 20 }}>
          <Input.TextArea
            placeholder="如：番茄要炒到绵软出汁才够味"
            autoSize={{ minRows: 1, maxRows: 4 }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
