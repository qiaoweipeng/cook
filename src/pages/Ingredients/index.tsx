import { useRef, useState } from 'react';
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
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  UploadOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { useIngredientStore } from '@/store/useIngredientStore';
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
}

type ImportMode = 'merge' | 'replace';
const PREVIEW_COUNT = 100;

export default function Ingredients() {
  const {
    items,
    add,
    update,
    remove,
    replaceAll,
    bulkMerge,
  } = useIngredientStore();
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | undefined>();

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
    setOpen(true);
  };

  const openEdit = (record: Ingredient) => {
    setEditing(record);
    form.setFieldsValue(record);
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      update(editing.id, values);
      message.success('已更新');
    } else {
      const newIng: Ingredient = {
        id: 'ing_' + Date.now().toString(36),
        ...values,
      };
      add(newIng);
      message.success('已添加');
    }
    setOpen(false);
  };

  const filtered = items.filter((it) => {
    if (categoryFilter && it.category !== categoryFilter) return false;
    const k = keyword.trim().toLowerCase();
    if (k && !it.name.toLowerCase().includes(k)) return false;
    return true;
  });

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

  // —— 触发文件选择 ——
  const handleImportClick = () => fileInputRef.current?.click();

  // —— 文件选择后解析 ——
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 让下一次选同名文件也能触发
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

  // —— 确认导入 ——
  const confirmImport = () => {
    if (parsedItems.length === 0) return;
    if (importMode === 'replace') {
      replaceAll(parsedItems);
      message.success(`已替换为 ${parsedItems.length} 条食材`);
    } else {
      bulkMerge(parsedItems);
      const added = parsedItems.filter((p) => !items.some((i) => i.id === p.id)).length;
      const updated = parsedItems.length - added;
      message.success(`合并完成：新增 ${added} 条，覆盖 ${updated} 条`);
    }
    setImportModalOpen(false);
    setParsedItems([]);
    setFileName('');
  };

  const handleDownloadTemplate = () => {
    downloadIngredientTemplate();
    message.success('模板已下载，里面有一条示例行');
  };

  return (
    <div>
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
        <Space wrap>
          <Tooltip title="下载一份带示例的空白 Excel，方便照着填">
            <Button icon={<FileExcelOutlined />} onClick={handleDownloadTemplate}>
              下载模板
            </Button>
          </Tooltip>
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
            新增食材
          </Button>
        </Space>
      </div>

      <Table<Ingredient>
        rowKey="id"
        dataSource={filtered}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        columns={[
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
          {
            title: '操作',
            width: 140,
            render: (_, r) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Popconfirm
                  title="确认删除？"
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => {
                    remove(r.id);
                    message.success('已删除');
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {/* 新增 / 编辑弹窗 */}
      <Modal
        title={editing ? '编辑食材' : '新增食材'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onSubmit}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="名称" rules={[{ required: true }]}>
                <Input placeholder="如：五花肉" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="分类" rules={[{ required: true }]}>
                <Select options={categories.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="pricePerUnit"
                label="单价（元）"
                rules={[{ required: true, type: 'number', min: 0 }]}
              >
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
                <Select options={unitOptions} showSearch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="unitGrams"
                label="换算：1 单位 = ? 克（可选）"
                tooltip="用于把「个/把/袋」折算成克"
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="如：番茄 200" />
              </Form.Item>
            </Col>
            <Col span={12}>
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
