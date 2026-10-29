import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  App as AntApp,
  Popconfirm,
  Typography,
  Row,
  Col,
  Radio,
  Alert,
  Tooltip,
  Empty,
  Upload,
  Image,
} from 'antd';
import { SideBar } from 'antd-mobile';
import {
  PlusOutlined,
  EditOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileExcelOutlined,
  DeleteOutlined,
  PictureOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { pickImage, formatSize, IMAGE_ACCEPT } from '@/lib/imageUpload';
import { resolveImageUrl } from '@/lib/supabase';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { useIsAdmin } from '@/store/useAuthStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Ingredient, IngredientCategory, IngredientUnit } from '@/types';
import PriceTag from '@/components/PriceTag';
import { displayUnitPrice, cheapestPlatform } from '@/utils/price';
import {
  exportIngredientsToExcel,
  downloadIngredientTemplate,
  parseIngredientsExcel,
} from '@/utils/excel';

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

/** 计价单位只留：固体按斤 / 克 / 公斤，液体按毫升 / 升 */
const unitOptions: { value: IngredientUnit; label: string }[] = [
  { value: '斤', label: '斤（500 g，固体默认）' },
  { value: 'g', label: '克（g）' },
  { value: 'kg', label: '公斤（kg）' },
  { value: 'ml', label: '毫升（ml，液体）' },
  { value: 'L', label: '升（L，液体）' },
];

const NUTRI_FIELDS = [
  { key: 'calories', label: '热量', unit: 'kcal' },
  { key: 'protein', label: '蛋白质', unit: 'g' },
  { key: 'fat', label: '脂肪', unit: 'g' },
  { key: 'carbs', label: '碳水', unit: 'g' },
  { key: 'sodium', label: '钠', unit: 'mg' },
  { key: 'fiber', label: '膳食纤维', unit: 'g' },
] as const;

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

type ImportMode = 'merge' | 'replace';
const PREVIEW_COUNT = 100;

export default function Ingredients() {
  const { items, add, update, remove, replaceAll, bulkMerge } = useIngredientStore();
  const platforms = usePriceStore((s) => s.platforms);
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const { message, modal } = AntApp.useApp();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form] = Form.useForm<FormValuesWithPrices>();
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | undefined>();
  const [selectedRowKey, setSelectedRowKey] = useState<string | undefined>(undefined);
  // 当前正在预览大图的食材图片地址；null = 没在预览
  // 预览弹层挂在表格「外面」手动控制，不放在单元格里 —— 避免预览的 portal 事件
  // 冒泡回表格行，造成「点图片反而选中行」的冲突
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [imgProcessing, setImgProcessing] = useState(false);
  /** 本次上传的结果：体积 + 走的是对象存储还是本地压缩，用于在编辑区常驻显示 */
  const [imgInfo, setImgInfo] = useState<{ size: number; viaStorage: boolean } | null>(null);

  // 每次开关编辑器都清掉上一次的大小信息（这次还没传图，不该显示上次的数字）
  useEffect(() => setImgInfo(null), [editorOpen]);

  const currentImage = Form.useWatch('image', form);

  const handlePickImage = async (file: File) => {
    setImgProcessing(true);
    try {
      // 压缩成 WebP → 上传对象存储 → 只把 URL 存库（上传失败会直接抛错，不再降级）
      const picked = await pickImage(file, 'ingredients');
      form.setFieldsValue({ image: picked.url });
      // 体积存下来常驻显示，不再只靠弹窗（弹窗一闪而过，回头就查不到了）
      setImgInfo({ size: picked.size, viaStorage: picked.viaStorage });
    } catch (e) {
      // pickImage 抛出来的已经是可读文案（比如「不支持 GIF 动图…」），直接透传
      message.error((e as Error).message || '图片处理失败');
    } finally {
      setImgProcessing(false);
    }
  };

  // —— 导入相关 ——
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [parsedItems, setParsedItems] = useState<Ingredient[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [fileName, setFileName] = useState('');

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: '蔬菜', unit: '斤' });
    setEditorOpen(true);
  };

  /** 把食材对象摊平成表单字段：平台价格 → price_平台 / amount_平台 */
  const toFormValues = (row: Ingredient): FormValuesWithPrices => {
    const values: FormValuesWithPrices = {
      name: row.name,
      category: row.category,
      unit: row.unit,
      note: row.note,
      image: row.image,
      calories: row.nutrition?.calories,
      protein: row.nutrition?.protein,
      fat: row.nutrition?.fat,
      carbs: row.nutrition?.carbs,
      sodium: row.nutrition?.sodium,
      fiber: row.nutrition?.fiber,
    };
    for (const platform of platforms) {
      values[`price_${platform}`] = row.prices?.[platform]?.price;
      values[`amount_${platform}`] = row.prices?.[platform]?.amount;
    }
    return values;
  };

  const openEditRow = (row: Ingredient) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(toFormValues(row));
    setEditorOpen(true);
  };

  const openEdit = () => {
    if (!selectedRowKey) {
      message.warning('请先在表格里选一行');
      return;
    }
    const row = items.find((i) => i.id === selectedRowKey);
    if (!row) {
      message.error('找不到选中的食材，刷新后重试');
      return;
    }
    openEditRow(row);
  };

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

      if (editing) {
        await update(editing.id, payload);
        message.success('已更新');
        // 编辑完成后清掉选中态（回到未选中页面）
        setSelectedRowKey(undefined);
      } else {
        const newIng: Ingredient = {
          id: 'ing_' + Date.now().toString(36),
          ...payload,
        };
        await add(newIng);
        message.success('已添加');
      }
      setEditorOpen(false);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg) message.error(msg);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    setRemoving(true);
    try {
      await remove(editing.id);
      message.success('已删除');
      setEditorOpen(false);
      setSelectedRowKey(undefined);
    } catch (e) {
      // 占用检查在 store 里抛出
      message.error((e as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (categoryFilter && it.category !== categoryFilter) return false;
        const k = keyword.trim().toLowerCase();
        if (k && !it.name.toLowerCase().includes(k)) return false;
        return true;
      }),
    [items, keyword, categoryFilter]
  );

  // —— 导出 ——
  const handleExport = () => {
    if (items.length === 0) {
      message.warning('食材库是空的，没什么可导出');
      return;
    }
    exportIngredientsToExcel(items);
    message.success(`已导出 ${items.length} 条`);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = await parseIngredientsExcel(file);
      if (parsed.length === 0) {
        message.warning('这份 Excel 没有解析出任何食材行');
        return;
      }
      setParsedItems(parsed);
      setFileName(file.name);
      setImportModalOpen(true);
    } catch (err) {
      message.error('解析失败：' + (err as Error).message);
    }
  };

  const confirmImport = () => {
    if (parsedItems.length === 0) return;
    if (importMode === 'replace') {
      modal.confirm({
        title: '确认要替换全部食材吗？',
        content: `将清空当前 ${items.length} 条食材，替换为这 ${parsedItems.length} 条`,
        okText: '替换',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => {
          replaceAll(parsedItems);
          message.success(`已替换为 ${parsedItems.length} 条食材`);
          setImportModalOpen(false);
          setParsedItems([]);
          setFileName('');
        },
      });
    } else {
      bulkMerge(parsedItems);
      const added = parsedItems.filter((p) => !items.some((i) => i.id === p.id)).length;
      const updated = parsedItems.length - added;
      message.success(`合并完成：新增 ${added} 条，覆盖 ${updated} 条`);
      setImportModalOpen(false);
      setParsedItems([]);
      setFileName('');
    }
  };

  const handleDownloadTemplate = () => {
    downloadIngredientTemplate();
    message.success('模板已下载，里面有一条示例行');
  };

  return (
    <div>
      {isMobile ? (
        <>
          {/* 移动端：只留搜索框 + 左侧分类导航 + 右侧条目卡列表（不用表格，避免文字被压缩看不清） */}
          <Input.Search
            placeholder="搜食材名"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: '100%', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div
              style={{
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                zIndex: 5,
                borderRadius: 10,
                overflow: 'hidden',
                // 给一个接近整屏的高度：分类少的时候左边只占一截、下面空一大块，看着像没做完。
                // 分类多的时候 SideBar 自己内部滚动，不会顶出屏幕。
                height: 'calc(100vh - 150px)',
                border: '1px solid #f5ede4',
              }}
            >
              <SideBar
                className="ing-side-bar"
                activeKey={categoryFilter ?? ''}
                onChange={(key) =>
                  setCategoryFilter((key || undefined) as IngredientCategory | undefined)
                }
                // 宽度和配色都在 index.css 的 .ing-side-bar 里，这里只留主题色
                style={{ '--adm-color-primary': '#E8743C' } as CSSProperties}
              >
                <SideBar.Item key="" title="全部" />
                {categories.map((c) => (
                  <SideBar.Item key={c} title={c} />
                ))}
              </SideBar>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
                {categoryFilter ?? '全部'} · {filtered.length} 种
              </div>
              {filtered.length === 0 ? (
                <Empty description="没有符合条件的食材" style={{ marginTop: 40 }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filtered.map((it) => {
                    // 最便宜的平台：卡片右上角直接标出来，一眼知道该买哪家
                    const cheapest = cheapestPlatform(it);
                    return (
                      <div
                        key={it.id}
                        onClick={() => isAdmin && openEditRow(it)}
                        style={{
                          background: '#fff',
                          borderRadius: 12,
                          padding: '10px 12px',
                          // 极淡的暖色描边，跟左侧暖米色侧栏呼应，也把卡片边界勾出来
                          border: '1px solid #f7f1ea',
                          cursor: isAdmin ? 'pointer' : 'default',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          {it.image ? (
                            <img
                              src={resolveImageUrl(it.image)}
                              alt=""
                              loading="lazy"
                              style={{
                                width: 44,
                                height: 44,
                                objectFit: 'cover',
                                borderRadius: 8,
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            // 没上传图的食材也给一个占位块（取名字首字）：
                            // 每行左边都有一块，列表才整齐，不会看着像漏了东西
                            <div
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 8,
                                flexShrink: 0,
                                background: 'linear-gradient(135deg, #fff1e8, #ffe3d0)',
                                color: '#e8743c',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 17,
                                fontWeight: 600,
                              }}
                            >
                              {it.name.slice(0, 1)}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'baseline',
                                gap: 8,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 15,
                                  fontWeight: 600,
                                  color: '#2D2A26',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {it.name}
                              </span>
                              {cheapest ? (
                                <span style={{ flexShrink: 0 }}>
                                  <PriceTag value={cheapest.value} size="small" />
                                  <span style={{ color: '#999', fontSize: 12, marginLeft: 2 }}>
                                    /{cheapest.unit}
                                  </span>
                                </span>
                              ) : (
                                <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                                  没录价格
                                </Text>
                              )}
                            </div>
                            {/* 比价横排：四个平台一起看，最便宜的那个标橙 */}
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '2px 10px',
                                marginTop: 4,
                              }}
                            >
                              {platforms.map((platform) => {
                                const d = displayUnitPrice(it, platform);
                                const isCheapest = cheapest?.platform === platform;
                                return (
                                  <span
                                    key={platform}
                                    style={{
                                      fontSize: 12,
                                      color: d
                                        ? isCheapest
                                          ? '#E8743C'
                                          : '#8a8177'
                                        : '#ccc',
                                      fontWeight: isCheapest ? 600 : 400,
                                    }}
                                  >
                                    {platform} {d ? `¥${Number(d.value.toFixed(2))}/${d.unit}` : '—'}
                                  </span>
                                );
                              })}
                            </div>
                            {it.note && (
                              <div
                                style={{
                                  color: '#999',
                                  fontSize: 12,
                                  marginTop: 2,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {it.note}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              marginTop: 12,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="搜索食材名 / 分类"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 280 }}
            />
            <span style={{ color: '#999', fontSize: 13 }}>
              共 {items.length} 种食材
              {keyword ? `，匹配 ${filtered.length} 种` : ''}
            </span>
            <div style={{ flex: 1 }} />
            {isAdmin ? (
              <Space wrap>
                <Tooltip title="下载一份带示例的空白 Excel，方便照着填">
                  <Button icon={<FileExcelOutlined />} onClick={handleDownloadTemplate}>
                    下载模板
                  </Button>
                </Tooltip>
                <Button.Group>
                  <Tooltip title="把当前食材库导出为 Excel 文件">
                    <Button icon={<DownloadOutlined />} onClick={handleExport}>
                      导出 Excel
                    </Button>
                  </Tooltip>
                  <Tooltip title="从 Excel 文件导入，可选合并或替换现有数据">
                    <Button icon={<UploadOutlined />} onClick={handleImportClick}>
                      导入 Excel
                    </Button>
                  </Tooltip>
                </Button.Group>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <Button
                  icon={<EditOutlined />}
                  onClick={openEdit}
                  disabled={!selectedRowKey}
                >
                  编辑食材
                </Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
                  新增食材
                </Button>
              </Space>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                食材库由超级管理员维护
              </Text>
            )}
          </div>

          {isAdmin && selectedRowKey && (
            <Alert
              type="info"
              showIcon
              closable
              onClose={() => setSelectedRowKey(undefined)}
              style={{ marginBottom: 12 }}
              message={
                <span>
                  已选中：
                  <Text strong>
                    {items.find((i) => i.id === selectedRowKey)?.name}
                  </Text>
                  ，点右上角「编辑食材」可修改或删除它，点右侧 × 或再次点击该行可取消选中
                </span>
              }
            />
          )}

          <Table<Ingredient>
            rowKey="id"
            size="small"
            bordered
            dataSource={filtered}
            scroll={{ x: 900 }}
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              showTotal: (t) => `共 ${t} 种食材`,
            }}
            onRow={(record) => ({
              onClick: () => {
                if (!isAdmin) return;
                // 单选模式下无法直接取消选中：再次点击已选中的行就取消选中
                setSelectedRowKey((prev) => (prev === record.id ? undefined : record.id));
              },
              style: { cursor: isAdmin ? 'pointer' : 'default' },
            })}
            rowSelection={
              isAdmin
                ? {
                  type: 'radio',
                  selectedRowKeys: selectedRowKey ? [selectedRowKey] : [],
                  onChange: (keys) => setSelectedRowKey(keys[0] as string | undefined),
                  preserveSelectedRowKeys: true,
                  columnWidth: 48,
                }
                : undefined
            }
            columns={[
              {
                title: '图片',
                dataIndex: 'image',
                width: 64,
                render: (v: string | undefined) =>
                  v ? (
                    // 缩略图就是普通 img：stopPropagation 保证点它不会触发行选中；
                    // 点击后把地址交给表格「外面」的受控预览弹层放大
                    <img
                      src={v}
                      alt=""
                      loading="lazy"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewSrc(v);
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: 'cover',
                        borderRadius: 6,
                        display: 'block',
                        cursor: 'zoom-in',
                      }}
                    />
                  ) : (
                    <Text type="secondary">-</Text>
                  ),
              },
              {
                title: '名称',
                dataIndex: 'name',
                width: 180,
                render: (v: string) => <Text strong>{v}</Text>,
              },
              {
                title: '分类',
                dataIndex: 'category',
                width: 110,
                // 列头自带筛选下拉，跟菜单管理表格一致
                filters: [...new Set(items.map((i) => i.category))].map((c) => ({
                  text: c,
                  value: c,
                })),
                onFilter: (value, r) => r.category === value,
                render: (v: IngredientCategory) => <Tag color="orange">{v}</Tag>,
              },
              {
                title: '单位',
                dataIndex: 'unit',
                width: 80,
                // 单位种类不多，给个列头筛选方便只看「斤 / L」这类
                filters: [...new Set(items.map((i) => i.unit))].map((u) => ({
                  text: u,
                  value: u,
                })),
                onFilter: (value, r) => r.unit === value,
              },
              // 每个平台一列：直接显示折算后的「元/斤」或「元/L」，最便宜的标橙
              ...platforms.map((platform) => ({
                title: platform,
                key: `price_${platform}`,
                width: 118,
                sorter: (a: Ingredient, b: Ingredient) =>
                  (displayUnitPrice(a, platform)?.value ?? Infinity) -
                  (displayUnitPrice(b, platform)?.value ?? Infinity),
                render: (_: unknown, r: Ingredient) => {
                  const d = displayUnitPrice(r, platform);
                  if (!d) return <Text type="secondary">-</Text>;
                  const isCheapest = cheapestPlatform(r)?.platform === platform;
                  return (
                    <span style={{ color: isCheapest ? '#E8743C' : undefined }}>
                      <PriceTag value={d.value} size="small" />
                      <span style={{ color: '#999', fontSize: 12 }}>/{d.unit}</span>
                      {isCheapest && <Tag color="orange" style={{ marginLeft: 4 }}>最低</Tag>}
                    </span>
                  );
                },
              })),
              {
                title: '营养(每100)',
                width: 130,
                render: (_: unknown, r: Ingredient) =>
                  r.nutrition ? (
                    <Tooltip
                      title={
                        <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                          {NUTRI_FIELDS.map((f) => (
                            <div key={f.key}>
                              {f.label} {r.nutrition?.[f.key]} {f.unit}
                            </div>
                          ))}
                        </div>
                      }
                    >
                      <Text type="secondary">
                        {r.nutrition.calories} kcal · 蛋白 {r.nutrition.protein} g
                      </Text>
                    </Tooltip>
                  ) : (
                    <Text type="secondary">-</Text>
                  ),
              },
              { title: '备注', dataIndex: 'note', width: 180, ellipsis: true },
            ]}
          />

          {/*
            图片大图预览：故意放在 Table 外面、自身隐藏，只靠 previewSrc 手动开合。
            这样预览弹层的点击事件跟表格行完全不在一条事件链上，
            点缩略图 = 只开预览，点行其他地方 = 只切换选中，互不干扰。
          */}
          <Image
            style={{ display: 'none' }}
            preview={{
              visible: previewSrc !== null,
              src: previewSrc ?? undefined,
              onVisibleChange: (open) => {
                if (!open) setPreviewSrc(null);
              },
            }}
          />
        </>
      )}

      {/* 新增 / 编辑弹窗 */}
      <Modal
        title={editing ? `编辑食材：${editing.name}` : '新增食材'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        width={isMobile ? '94%' : 560}
        forceRender
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {editing ? (
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
              <Button onClick={() => setEditorOpen(false)}>取消</Button>
              <Button type="primary" onClick={onSave}>
                保存
              </Button>
            </Space>
          </div>
        }
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                <Input placeholder="如：五花肉" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                <Select options={categories.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item
                name="unit"
                label="计价单位"
                rules={[{ required: true }]}
                tooltip="固体用斤，液体用 ml / L；填价时按这个单位记「这一份多重」"
              >
                <Select options={unitOptions} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="note" label="备注（可选）">
                <Input placeholder="如：这一瓶 1 升 / 约两个中等土豆" />
              </Form.Item>
            </Col>
          </Row>

          {/* 平台价格：只记「这一份多少钱 + 这一份多重/多少容量」，系统自动折算比价 */}
          <div style={{ marginBottom: 6, fontWeight: 600 }}>
            各平台价格
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>
              只填这一份的价钱和份量（份量不填按 1 份算），自动折成元/斤、元/L
            </Text>
          </div>
          <Row gutter={12}>
            {platforms.map((platform) => (
              <Col span={isMobile ? 24 : 12} key={platform}>
                <Form.Item label={`${platform}：这一份多少钱（元）`}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name={`price_${platform}`} noStyle>
                      <InputNumber
                        min={0}
                        step={0.1}
                        style={{ width: '55%' }}
                        placeholder="价格 ¥"
                      />
                    </Form.Item>
                    <Form.Item name={`amount_${platform}`} noStyle>
                      <InputNumber
                        min={0}
                        step={0.1}
                        style={{ width: '45%' }}
                        placeholder="份量（默认1）"
                      />
                    </Form.Item>
                  </Space.Compact>
                </Form.Item>
              </Col>
            ))}
          </Row>
          <Text type="secondary" style={{ fontSize: 12 }}>
            例：生抽 1 升 10 元 → 单位选「L」，份量填 1，价格 10；土豆一袋 2 斤 3 元 →
            单位「斤」，份量 2，价格 3
          </Text>

          {/* 营养：每 100g / 100ml，主料填、调料不填 */}
          <div style={{ margin: '16px 0 6px', fontWeight: 600 }}>
            营养成分（每 100 g / 100 ml，调料可不填）
          </div>
          <Row gutter={12}>
            {NUTRI_FIELDS.map((f) => (
              <Col span={isMobile ? 12 : 8} key={f.key}>
                <Form.Item name={f.key} label={`${f.label}（${f.unit}）`}>
                  <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            ))}
          </Row>

          <Form.Item label="食材图片（可选）">
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
                {currentImage ? (
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
              <Form.Item name="image" noStyle>
                <Input placeholder="或粘贴图片链接" allowClear />
              </Form.Item>
              {currentImage && (
                <img
                  src={resolveImageUrl(currentImage)}
                  alt="图片预览"
                  style={{
                    width: 120,
                    height: 120,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: '1px solid #eee',
                  }}
                />
              )}
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入预览弹窗 */}
      <Modal
        title={
          <Space>
            <FileExcelOutlined style={{ color: '#52C41A' }} />
            <span>导入 Excel · 预览</span>
            {fileName && <Text type="secondary" style={{ fontSize: 13 }}>({fileName})</Text>}
          </Space>
        }
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        onOk={confirmImport}
        okText={`确认导入 ${parsedItems.length} 条`}
        cancelText="取消"
        width={900}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <div>
              共解析到 <Text strong>{parsedItems.length}</Text> 条食材记录，
              {parsedItems.length > PREVIEW_COUNT && (
                <>下面预览前 {PREVIEW_COUNT} 条</>
              )}
              。请选择导入方式：
            </div>
          }
        />
        <Radio.Group
          value={importMode}
          onChange={(e) => setImportMode(e.target.value as ImportMode)}
          style={{ marginBottom: 16, display: 'flex', gap: 24 }}
        >
          <Radio value="merge">
            <Text strong>合并（推荐）</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              按 ID 比对，相同 ID 用导入的数据覆盖，其余作为新增
            </Text>
          </Radio>
          <Radio value="replace">
            <Text strong style={{ color: '#CF1322' }}>替换全部</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              ⚠️ 清空现有食材库，再用导入的全部覆盖
            </Text>
          </Radio>
        </Radio.Group>

        <Table<Ingredient>
          rowKey="id"
          dataSource={parsedItems.slice(0, PREVIEW_COUNT)}
          pagination={false}
          size="small"
          scroll={{ y: 320 }}
          columns={[
            { title: '名称', dataIndex: 'name', width: 120 },
            {
              title: '分类',
              dataIndex: 'category',
              width: 90,
              render: (v: IngredientCategory) => <Tag color="orange">{v}</Tag>,
            },
            {
              title: '最低价',
              width: 130,
              render: (_: unknown, r: Ingredient) => {
                const c = cheapestPlatform(r);
                return c ? (
                  <Text>
                    ¥{Number(c.value.toFixed(2))}/{c.unit}
                    <Text type="secondary" style={{ fontSize: 12 }}> · {c.platform}</Text>
                  </Text>
                ) : (
                  '-'
                );
              },
            },
            { title: '单位', dataIndex: 'unit', width: 80 },
            { title: 'ID', dataIndex: 'id', ellipsis: true },
          ]}
        />
      </Modal>
    </div>
  );
}
