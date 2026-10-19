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
  Statistic,
  Card,
  Radio,
  Alert,
  Tooltip,
  Empty,
  Upload,
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
} from '@ant-design/icons';
import { pickImage, formatSize, IMAGE_ACCEPT } from '@/lib/imageUpload';
import { useIngredientStore } from '@/store/useIngredientStore';
import { useIsAdmin } from '@/store/useAuthStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Ingredient, IngredientCategory } from '@/types';
import PriceTag from '@/components/PriceTag';
import {
  exportIngredientsToExcel,
  downloadIngredientTemplate,
  parseIngredientsExcel,
} from '@/utils/excel';

const { Text, Title } = Typography;

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

const unitOptions = [
  { value: '斤', label: '斤（mass）' },
  { value: 'g', label: '克（mass）' },
  { value: 'kg', label: '公斤（mass）' },
  { value: 'ml', label: '毫升（volume）' },
  { value: 'L', label: '升（volume）' },
  { value: '个', label: '个（count）' },
  { value: '把', label: '把（count）' },
  { value: '袋', label: '袋（count）' },
  { value: '瓶', label: '瓶（count）' },
  { value: '块', label: '块（count）' },
  { value: '头', label: '头（count）' },
  { value: '根', label: '根（count）' },
];

interface FormValues {
  name: string;
  category: IngredientCategory;
  pricePerUnit: number;
  unit: string;
  spec?: string;
  note?: string;
  unitGrams?: number;
  unitMl?: number;
  image?: string;
}

type ImportMode = 'merge' | 'replace';
const PREVIEW_COUNT = 100;

export default function Ingredients() {
  const { items, add, update, remove, replaceAll, bulkMerge } = useIngredientStore();
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const { message, modal } = AntApp.useApp();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | undefined>();
  const [selectedRowKey, setSelectedRowKey] = useState<string | undefined>(undefined);
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
      // 压缩成 WebP → 上传对象存储 → 只把 URL 存库（失败时自动退回 Base64）
      const picked = await pickImage(file, 'ingredients');
      form.setFieldsValue({ image: picked.url });
      // 体积存下来常驻显示，不再只靠弹窗（弹窗一闪而过，回头就查不到了）
      setImgInfo({ size: picked.size, viaStorage: picked.viaStorage });
      if (!picked.viaStorage) {
        // 只有异常（对象存储没开通）才弹窗，正常上传不打扰
        message.warning(
          '对象存储没开通，已退回压缩图存本地。建议执行 supabase/storage.sql 建 bucket'
        );
      }
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

  const openEditRow = (row: Ingredient) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(row);
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
      if (editing) {
        await update(editing.id, values);
        message.success('已更新');
        // 编辑完成后清掉选中态（回到未选中页面）
        setSelectedRowKey(undefined);
      } else {
        const newIng: Ingredient = {
          id: 'ing_' + Date.now().toString(36),
          ...values,
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

  const total = items.reduce((sum, i) => sum + i.pricePerUnit, 0);

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
                  {filtered.map((it) => (
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
                            src={it.image}
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
                            <span style={{ flexShrink: 0 }}>
                              <PriceTag value={it.pricePerUnit} size="small" />
                              <span style={{ color: '#999', fontSize: 12, marginLeft: 2 }}>
                                /{it.unit}
                              </span>
                            </span>
                          </div>
                      {(it.spec || it.unitGrams || it.unitMl) && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                            marginTop: 2,
                          }}
                        >
                          <span
                            style={{
                              color: '#999',
                              fontSize: 12,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {it.spec}
                          </span>
                          {(it.unitGrams || it.unitMl) && (
                            <span style={{ color: '#bbb', fontSize: 12, flexShrink: 0 }}>
                              1 {it.unit} ≈ {it.unitGrams ? `${it.unitGrams} g` : `${it.unitMl} ml`}
                            </span>
                          )}
                          </div>
                        )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <Title level={3} style={{ marginTop: 0 }}>
            食材库
            <Text type="secondary" style={{ fontSize: 14, marginLeft: 12, fontWeight: 400 }}>
              维护价格，单位换算会自动生效
            </Text>
          </Title>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="食材总数" value={items.length} suffix="种" />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="分类"
                  value={categories.filter((c) => items.some((i) => i.category === c)).length}
                  suffix="类"
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="单价合计（无统计意义）"
                  value={total}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#aaa' }}
                />
              </Card>
            </Col>
          </Row>

          <div
            style={{
              marginBottom: 12,
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <Space wrap>
              <Input.Search
                placeholder="搜食材名"
                allowClear
                onSearch={setKeyword}
                onChange={(e) => !e.target.value && setKeyword('')}
                style={{ width: 220 }}
              />
              <Select
                placeholder="按分类筛选"
                allowClear
                style={{ width: 160 }}
                options={categories.map((c) => ({ value: c, label: c }))}
                value={categoryFilter}
                onChange={setCategoryFilter}
              />
            </Space>
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
              style={{ marginBottom: 12 }}
              message={
                <span>
                  已选中：
                  <Text strong>
                    {items.find((i) => i.id === selectedRowKey)?.name}
                  </Text>
                  ，点右上角「编辑食材」可修改或删除它
                </span>
              }
            />
          )}

          <Table<Ingredient>
            rowKey="id"
            dataSource={filtered}
            pagination={{ pageSize: 10, showSizeChanger: false }}
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
                    <img
                      src={v}
                      alt=""
                      loading="lazy"
                      style={{
                        width: 40,
                        height: 40,
                        objectFit: 'cover',
                        borderRadius: 6,
                        display: 'block',
                      }}
                    />
                  ) : (
                    <Text type="secondary">-</Text>
                  ),
              },
              { title: '名称', dataIndex: 'name', render: (v: string) => <Text strong>{v}</Text> },
              {
                title: '分类',
                dataIndex: 'category',
                render: (v: IngredientCategory) => <Tag color="orange">{v}</Tag>,
              },
              {
                title: '单价',
                dataIndex: 'pricePerUnit',
                render: (v: number) => <PriceTag value={v} size="small" />,
              },
              { title: '单位', dataIndex: 'unit' },
              { title: '规格', dataIndex: 'spec', ellipsis: true },
              {
                title: '单件换算',
                render: (_, r) => {
                  if (r.unitGrams)
                    return (
                      <Text type="secondary">
                        1 {r.unit} ≈ {r.unitGrams} g
                      </Text>
                    );
                  if (r.unitMl)
                    return (
                      <Text type="secondary">
                        1 {r.unit} ≈ {r.unitMl} ml
                      </Text>
                    );
                  return <Text type="secondary">-</Text>;
                },
              },
            ]}
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
                name="pricePerUnit"
                label="单价（元）"
                rules={[{ required: true, type: 'number', min: 0 }]}
              >
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
                <Select options={unitOptions} showSearch />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item
                name="unitGrams"
                label="换算：1 单位 = ? 克（可选）"
                tooltip="用于把「个/把/袋」折算成克"
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="如：番茄 200" />
              </Form.Item>
            </Col>
            <Col span={isMobile ? 24 : 12}>
              <Form.Item
                name="unitMl"
                label="换算：1 单位 = ? 毫升（可选）"
                tooltip="用于把「瓶/袋」折算成毫升"
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="如：生抽 500" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="spec" label="规格备注（可选）">
                <Input placeholder="如：土鸡蛋、盒装" />
              </Form.Item>
            </Col>
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
                  src={currentImage}
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
              title: '单价',
              dataIndex: 'pricePerUnit',
              width: 90,
              render: (v: number) => <PriceTag value={v} size="small" />,
            },
            { title: '单位', dataIndex: 'unit', width: 80 },
            { title: 'ID', dataIndex: 'id', ellipsis: true },
          ]}
        />
      </Modal>
    </div>
  );
}
