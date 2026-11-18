import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns, ActionType } from '@ant-design/pro-components';
import {
  Table,
  Button,
  Space,
  Modal,
  Input,
  Tag,
  App as AntApp,
  Typography,
  Radio,
  Alert,
  Tooltip,
  Empty,
} from 'antd';
import { SideBar, Popup, Button as AmButton } from 'antd-mobile';
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
import { resolveImageUrl } from '@/lib/imageStorage';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { useIsAdmin } from '@/store/useAuthStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Ingredient, IngredientCategory } from '@/types';
import { CATEGORY_COLOR, NUTRI_FIELDS } from '@/types';
import PriceTag from '@/components/PriceTag';
import IngredientEditor from '@/components/IngredientEditor';
import BulkImagePairer from '@/components/BulkImagePairer';
import { priceSpec, displayUnitPrice, pricePerBase, cheapestPlatform } from '@/utils/price';
import {
  exportIngredientsToExcel,
  downloadIngredientTemplate,
  parseIngredientsExcel,
  MissingAmountError,
  InvalidUnitError,
} from '@/utils/excel';
import {
  planImport,
  buildMergeList,
  type ImportPlan,
  type ImportConflict,
} from '@/utils/importDiff';

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

type ImportMode = 'merge' | 'replace';
const PREVIEW_COUNT = 100;

export default function Ingredients() {
  const { items, replaceAll, bulkMerge, load } = useIngredientStore();
  const platforms = usePriceStore((s) => s.platforms);
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const { message, modal } = AntApp.useApp();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  /** 新增时带进编辑器的初始值：搜索无结果时把关键词和分类带过去 */
  const [editorInitial, setEditorInitial] = useState<{ name?: string; category?: IngredientCategory }>({});
  const [keyword, setKeyword] = useState('');
  /** PC ProTable 搜索是否命中 —— keyword 有值 + 结果为空 → 提示条出现 */
  const [noResults, setNoResults] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<IngredientCategory | undefined>();
  const [selectedRowKey, setSelectedRowKey] = useState<string | undefined>(undefined);
  // 当前正在预览大图的食材图片地址；null = 没在预览
  // 预览弹层挂在表格「外面」手动控制，不放在单元格里 —— 避免预览的 portal 事件
  // 冒泡回表格行，造成「点图片反而选中行」的冲突
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [detail, setDetail] = useState<Ingredient | null>(null);

  // —— 导入相关 ——
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableActionRef = useRef<ActionType>();
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [parsedItems, setParsedItems] = useState<Ingredient[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [fileName, setFileName] = useState('');
  // 解析完立刻算好的比对计划：新增 / 冲突 / 无变化（跳过）
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  // 冲突对比弹窗 + 每行用户选的「用 Excel 覆盖 / 保留系统」
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictChoices, setConflictChoices] = useState<Record<string, 'excel' | 'system'>>({});
  // 正在写库（批量 upsert 期间按钮转圈，避免用户以为没反应又点一次）
  const [importing, setImporting] = useState(false);
  // 批量传图配对弹窗
  const [bulkImageOpen, setBulkImageOpen] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setEditorInitial({});
    setEditorOpen(true);
  };

  const openEditRow = (row: Ingredient) => {
    setEditing(row);
    setEditorInitial({});
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

  /**
   * 编辑器保存 / 删除后的收尾：清掉选中态，并手动让 ProTable 重新拉数。
   * 表单本身、图片、价格、营养都在 IngredientEditor 组件里（菜品编辑器也复用它），
   * 这里只剩表格自己的状态要收拾。
   */
  const afterEditorChange = () => {
    setSelectedRowKey(undefined);
    tableActionRef.current?.reload();
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
      // 解析完立刻和现有库比对：预览表格里能直接标出每行是新增/冲突/无变化
      setImportPlan(planImport(parsed, items));
      setImportModalOpen(true);
    } catch (err) {
      if (err instanceof MissingAmountError) {
        // 份量留空是最容易算出天价单价的坑，直接列出有问题的行，不进入预览
        modal.error({
          title: `份量没填，已阻止导入（${err.items.length} 处）`,
          width: 600,
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>
                份量的意思是「这一份包含多少个计价单位」。单位是 g 时，份量填 500 表示
                「500 克卖这个价」；留空会被系统当成 1 克，单价就算成几千上万元一斤。
              </p>
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {err.items.map((it, i) => (
                  <div key={`${it}-${i}`} style={{ fontSize: 13, lineHeight: 1.9 }}>
                    · {it}
                  </div>
                ))}
              </div>
            </div>
          ),
        });
        return;
      }
      if (err instanceof InvalidUnitError) {
        // 旧单位（斤 / 公斤 / 克）不再自动换算，列出来让用户改成 g / kg / ml / L
        modal.error({
          title: `单位不支持，已阻止导入（${err.items.length} 处）`,
          width: 600,
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>
                单位只能填 g（克）、kg（千克）、ml（毫升）、L（升）。
              </p>
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {err.items.map((it, i) => (
                  <div key={`${it}-${i}`} style={{ fontSize: 13, lineHeight: 1.9 }}>
                    · {it}
                  </div>
                ))}
              </div>
            </div>
          ),
        });
        return;
      }
      message.error('解析失败：' + (err as Error).message);
    }
  };

  /** 关掉导入弹窗并清空本次导入的所有暂存（计划、选择、文件名） */
  const closeImportModal = () => {
    setImportModalOpen(false);
    setParsedItems([]);
    setFileName('');
    setImportPlan(null);
    setConflictChoices({});
  };

  const confirmImport = async () => {
    if (parsedItems.length === 0 || importing) return;
    if (importMode === 'replace') {
      modal.confirm({
        title: '确认要替换全部食材吗？',
        content: `将清空当前 ${items.length} 条食材，替换为这 ${parsedItems.length} 条`,
        okText: '替换',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          setImporting(true);
          try {
            await replaceAll(parsedItems);
            message.success(`已替换为 ${parsedItems.length} 条食材`);
            closeImportModal();
          } catch (e) {
            // 关键：以前这里不 await，失败被静默吞掉，界面照样提示成功
            message.error('导入失败：' + ((e as Error).message || '写入云端失败'));
          } finally {
            setImporting(false);
          }
        },
      });
    } else {
      const plan = importPlan ?? planImport(parsedItems, items);
      if (plan.conflicts.length > 0) {
        // 有冲突 → 打开对比表逐条选边，默认全部「用 Excel 覆盖」（最常见的改价场景）
        setConflictChoices(
          Object.fromEntries(plan.conflicts.map((c) => [c.key, 'excel' as const]))
        );
        setConflictModalOpen(true);
        return;
      }
      // 没冲突：新增直接进库，无变化的静默跳过
      setImporting(true);
      try {
        await bulkMerge(plan.news);
        message.success(
          `导入完成：新增 ${plan.news.length} 条，${plan.skipped.length} 条无变化已跳过`
        );
        closeImportModal();
      } catch (e) {
        message.error('导入失败：' + ((e as Error).message || '写入云端失败'));
      } finally {
        setImporting(false);
      }
    }
  };

  /** 冲突表点「确认导入」：新增 + 选了「用 Excel」的覆盖项一起写库 */
  const confirmConflicts = async () => {
    if (!importPlan || importing) return;
    const mergeList = buildMergeList(importPlan, conflictChoices);
    const overwriteCount = importPlan.conflicts.filter(
      (c) => conflictChoices[c.key] === 'excel'
    ).length;
    const keepCount = importPlan.conflicts.length - overwriteCount;
    if (mergeList.length === 0) {
      // 全选了「保留系统」且没有新增 —— 什么都不用写
      message.info('没有需要写入的改动（全部保留了系统数据）');
      setConflictModalOpen(false);
      closeImportModal();
      return;
    }
    setImporting(true);
    try {
      await bulkMerge(mergeList);
      message.success(
        `导入完成：新增 ${importPlan.news.length} 条，覆盖 ${overwriteCount} 条` +
        (keepCount ? `，保留系统 ${keepCount} 条` : '') +
        (importPlan.skipped.length ? `，${importPlan.skipped.length} 条无变化已跳过` : '')
      );
      setConflictModalOpen(false);
      closeImportModal();
    } catch (e) {
      // 失败就把弹窗留着，用户可以直接重试，不用重新选一遍文件
      message.error('导入失败：' + ((e as Error).message || '写入云端失败'));
    } finally {
      setImporting(false);
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
          {/*
            搜索框常驻吸顶：列表往下翻的时候也能随时改关键词。
            负外边距 + safe-area 的处理和首页吸顶栏一致，横贯全屏、不被状态栏压住。
          */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 6,
              marginTop: 'calc(-16px - env(safe-area-inset-top))',
              marginLeft: -12,
              marginRight: -12,
              padding: 'calc(10px + env(safe-area-inset-top)) 12px 10px',
            }}
          >
            <Input.Search
              className="app-search"
              placeholder="搜食材名"
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div
              style={{
                flexShrink: 0,
                position: 'sticky',
                // 顶部让出吸顶搜索栏的高度（36 高 + 上下各 10 内边距），否则会被搜索栏盖住
                top: 'calc(56px + env(safe-area-inset-top))',
                zIndex: 5,
                borderRadius: 10,
                overflow: 'hidden',
                // 给一个接近整屏的高度：分类少的时候左边只占一截、下面空一大块，看着像没做完。
                // 分类多的时候 SideBar 自己内部滚动，不会顶出屏幕。
                height: 'calc(100vh - 206px)',
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
                        onClick={() => setDetail(it)}
                        style={{
                          background: '#fff',
                          borderRadius: 12,
                          padding: '10px 12px',
                          // 极淡的暖色描边，跟左侧暖米色侧栏呼应，也把卡片边界勾出来
                          border: '1px solid #f7f1ea',
                          cursor: 'pointer',
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
                                  <PriceTag value={cheapest.price} size="small" />
                                  <span style={{ color: '#999', fontSize: 12, marginLeft: 2 }}>
                                    / {cheapest.amount}{cheapest.unit}
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
                                const d = priceSpec(it, platform);
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
                                    {platform} {d ? `¥${Number(d.price.toFixed(2))} / ${d.amount}${d.unit}` : '—'}
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
        <ProTable<Ingredient>
          actionRef={tableActionRef}
          rowKey="id"
          bordered
          size="small"
          tableExtraRender={() =>
            isAdmin && noResults ? (
              <div style={{ padding: '4px 0 8px' }}>
                没找到「{keyword}」？
                <Typography.Link
                  style={{ marginLeft: 4 }}
                  onClick={() => {
                    setEditing(null);
                    setEditorInitial({ name: keyword, category: '其他' });
                    setEditorOpen(true);
                  }}
                >
                  立即添加「{keyword}」
                </Typography.Link>
              </div>
            ) : null
          }
          search={{ labelWidth: 'auto', defaultCollapsed: false, span: 6 }}
          columns={[
            {
              // 图片 + 名称合成一列：有图显示「小图 + 名称」，没图只显示名称
              title: '食材名',
              dataIndex: 'name',
              width: 220,
              fixed: 'left',
              fieldProps: { style: { width: 225 } },
              render: (_, r: Ingredient) => (
                <Space size={10}>
                  {r.image && (
                    <img
                      src={resolveImageUrl(r.image)}
                      alt=""
                      loading="lazy"
                      onClick={(e) => { e.stopPropagation(); setPreviewSrc(resolveImageUrl(r.image)); }}
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, display: 'block', cursor: 'zoom-in', flexShrink: 0 }}
                    />
                  )}
                  <Typography.Link strong onClick={(e) => { e.stopPropagation(); setDetail(r); }}>
                    {r.name}
                  </Typography.Link>
                </Space>
              ),
            },
            {
              title: '分类',
              dataIndex: 'category',
              width: 110,
              valueType: 'select',
              fieldProps: { mode: 'multiple', style: { width: 225 } },
              valueEnum: () => categories.reduce((acc, c) => ({ ...acc, [c]: { text: c } }), {}),
              render: (_, r) => <Tag color={CATEGORY_COLOR[r.category]}>{r.category}</Tag>,
            },
            {
              title: '单位',
              dataIndex: 'unit',
              width: 80,
              // 单位只在列里展示，不参与查询
              search: false,
            },
            {
              // 各平台单价统一挂在一个父表头「食材单价」下
              title: '食材单价',
              key: 'unitPrice',
              search: false,
              children: platforms.map<ProColumns<Ingredient>>((platform) => ({
                title: platform,
                key: `price_${platform}`,
                width: 118,
                search: false,
                sorter: (a, b) =>
                  (pricePerBase(a, platform)?.value ?? Infinity) -
                  (pricePerBase(b, platform)?.value ?? Infinity),
                render: (_, r) => {
                  const d = priceSpec(r, platform);
                  if (!d) return <Text type="secondary">-</Text>;
                  const isCheapest = cheapestPlatform(r)?.platform === platform;
                  return (
                    <span style={{ color: isCheapest ? '#E8743C' : undefined }}>
                      <PriceTag value={d.price} size="small" />
                      <span style={{ color: '#999', fontSize: 12 }}> / {d.amount}{d.unit}</span>
                    </span>
                  );
                },
              })),
            },
            {
              // 营养也走分组表头，和「菜单管理」里的菜品表格保持一致
              title: '营养成分(每100g)',
              key: 'nutrition',
              search: false,
              children: NUTRI_FIELDS.map<ProColumns<Ingredient>>((f) => ({
                title: `${f.label}(${f.unit})`,
                key: `n_${f.key}`,
                width: 84,
                search: false,
                align: 'right',
                render: (_, r) => {
                  const v = r.nutrition?.[f.key];
                  return v === undefined || v === null ? (
                    <Text type="secondary">—</Text>
                  ) : (
                    <span style={{ color: '#2D2A26' }}>{v}</span>
                  );
                },
              })),
            },
            { title: '备注', dataIndex: 'note', width: 180, ellipsis: true, search: false },
          ]}
          params={{ platformCount: platforms.length }}
          request={async (params) => {
            const { current = 1, pageSize = 20, name, category } = params;
            // 同步搜索词 + 是否无结果 —— 搜索框下方「没找到X？立即添加」用
            const trimmedKeyword = String(name ?? '').trim();
            setKeyword(trimmedKeyword);
            let list = [...items];
            if (name) list = list.filter((it) => it.name.toLowerCase().includes(String(name).toLowerCase()));
            if (category?.length) list = list.filter((it) => category.includes(it.category));
            const total = list.length;
            setNoResults(!!trimmedKeyword && total === 0);
            const paged = list.slice((current - 1) * pageSize, current * pageSize);
            return { data: paged, total, success: true };
          }}
          rowSelection={
            isAdmin
              ? {
                type: 'radio',
                selectedRowKeys: selectedRowKey ? [selectedRowKey] : [],
                onChange: (keys) => setSelectedRowKey(keys[0] as string | undefined),
                preserveSelectedRowKeys: true,
                columnWidth: 48,
                fixed: true,
              }
              : undefined
          }
          onRow={(record) => ({
            onClick: () => {
              if (!isAdmin) return;
              setSelectedRowKey((prev) => (prev === record.id ? undefined : record.id));
            },
            style: { cursor: isAdmin ? 'pointer' : 'default' },
          })}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (t) => `共 ${t} 种食材`,
          }}
          scroll={{ x: 1750, y: 'calc(100vh - 290px)' }}
          tableAlertRender={false}
          toolBarRender={() =>
            isAdmin
              ? [
                <Tooltip key="tpl" title="下载一份带示例的空白 Excel">
                  <Button icon={<FileExcelOutlined />} onClick={handleDownloadTemplate}>下载模板</Button>
                </Tooltip>,
                // 导入导出成组放，跟后面的单品操作区分开
                <Space.Compact key="excel">
                  <Button icon={<UploadOutlined />} onClick={handleExport}>导出 Excel</Button>
                  <Button icon={<DownloadOutlined />} onClick={handleImportClick}>导入 Excel</Button>
                </Space.Compact>,
                <Button key="bulkimg" icon={<PictureOutlined />} onClick={() => setBulkImageOpen(true)}>
                  批量传图
                </Button>,
                <input
                  key="file"
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />,
                <Button key="edit" icon={<EditOutlined />} disabled={!selectedRowKey} onClick={openEdit}>
                  编辑食材{selectedRowKey ? `（${items.find((i) => i.id === selectedRowKey)?.name}）` : ''}
                </Button>,
                <Button key="add" type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增食材</Button>,
              ]
              : []
          }
        />
      )}

      {/* 新增 / 编辑食材：抽屉表单抽成了 IngredientEditor，菜品编辑器里「没找到食材」也复用它 */}
      <IngredientEditor
        open={editorOpen}
        ingredient={editing}
        initialName={editorInitial.name}
        initialCategory={editorInitial.category}
        onClose={() => setEditorOpen(false)}
        onSaved={afterEditorChange}
        onDeleted={afterEditorChange}
      />

      {/* 食材详情弹窗：表格「操作」列的「食材详情」打开（移动端另有一套 Popup 版本） */}
      <Modal
        title="食材详情"
        open={!!detail && !isMobile}
        onCancel={() => setDetail(null)}
        footer={null}
        width={560}
      >
        {detail && (
          <>
            <Space align="start" size={16} style={{ width: '100%', marginBottom: 4 }}>
              {detail.image ? (
                <img
                  src={resolveImageUrl(detail.image)}
                  alt={detail.name}
                  style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                />
              ) : (
                <div
                  style={{
                    width: 96, height: 96, borderRadius: 8, flexShrink: 0,
                    background: '#fafafa', color: '#bbb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                  }}
                >
                  暂无图片
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#2D2A26' }}>{detail.name}</div>
                <Space size={6} wrap style={{ marginTop: 8 }}>
                  <Tag color={CATEGORY_COLOR[detail.category]}>{detail.category}</Tag>
                  <Tag>按{detail.unit}计价</Tag>
                  {cheapestPlatform(detail) && (
                    <Tag color="orange">最低价 · {cheapestPlatform(detail)!.platform}</Tag>
                  )}
                </Space>
                {detail.note && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>{detail.note}</div>
                )}
              </div>
            </Space>

            <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>各平台单价</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {platforms.map((p) => {
                const d = priceSpec(detail, p);
                const isCheapest = cheapestPlatform(detail)?.platform === p;
                // 次要信息：折算成每斤 / 每升多少钱，方便三个平台横向对比（只在详情里出现）
                const unitPrice = displayUnitPrice(detail, p);
                return (
                  <div key={p} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, color: '#999' }}>{p}</div>
                    {d ? (
                      <div style={{ marginTop: 2 }}>
                        <PriceTag value={d.price} size="small" />
                        <span style={{ color: '#999', fontSize: 12 }}> / {d.amount}{d.unit}</span>
                        {isCheapest && <Tag color="orange" style={{ marginLeft: 4 }}>最低</Tag>}
                        {unitPrice && (
                          <div style={{ fontSize: 11, color: '#b0aaa3', marginTop: 2 }}>
                            约 ¥{Number(unitPrice.value.toFixed(2))} / {unitPrice.unit}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Text type="secondary">未录入</Text>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>
              营养成分（每 100g / 100ml）
            </div>
            {detail.nutrition ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {NUTRI_FIELDS.map((f) => (
                  <div key={f.key} style={{ background: '#fafafa', borderRadius: 6, padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, color: '#999' }}>{f.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#2D2A26' }}>
                      {detail.nutrition?.[f.key] ?? '—'}
                      <span style={{ fontSize: 12, fontWeight: 400, color: '#999' }}> {f.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Text type="secondary">未填写营养成分</Text>
            )}
          </>
        )}
      </Modal>

      {/*
        移动端食材详情：antd-mobile Popup 从顶部弹出，点遮罩即关闭。
        内容结构和 PC 端 Modal 一致，但按窄屏重新排了一遍，不复用 PC 那套布局。
      */}
      {isMobile && (
        <Popup
          position="top"
          visible={!!detail}
          onMaskClick={() => setDetail(null)}
          bodyStyle={{
            maxHeight: '82vh',
            overflowY: 'auto',
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
            padding: 'calc(14px + env(safe-area-inset-top)) 16px 20px',
            background: '#fff',
          }}
        >
          {detail && (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {detail.image ? (
                  <img
                    src={resolveImageUrl(detail.image)}
                    alt={detail.name}
                    style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: 'linear-gradient(135deg, #fff1e8, #ffe3d0)',
                      color: '#e8743c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      fontWeight: 600,
                    }}
                  >
                    {detail.name.slice(0, 1)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: '#2D2A26' }}>{detail.name}</div>
                  <Space size={6} wrap style={{ marginTop: 8 }}>
                    <Tag color={CATEGORY_COLOR[detail.category]} style={{ marginInlineEnd: 0 }}>
                      {detail.category}
                    </Tag>
                    <Tag style={{ marginInlineEnd: 0 }}>按{detail.unit}计价</Tag>
                    {cheapestPlatform(detail) && (
                      <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                        最低价 · {cheapestPlatform(detail)!.platform}
                      </Tag>
                    )}
                  </Space>
                  {detail.note && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#999', lineHeight: 1.5 }}>
                      {detail.note}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, margin: '18px 0 8px' }}>各平台单价</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {platforms.map((p) => {
                  const d = priceSpec(detail, p);
                  const isCheapest = cheapestPlatform(detail)?.platform === p;
                  const unitPrice = displayUnitPrice(detail, p);
                  return (
                    <div
                      key={p}
                      style={{ border: '1px solid #f5ede4', borderRadius: 10, padding: '8px 10px' }}
                    >
                      <div style={{ fontSize: 12, color: '#999' }}>{p}</div>
                      {d ? (
                        <div style={{ marginTop: 2 }}>
                          <PriceTag value={d.price} size="small" />
                          <span style={{ color: '#999', fontSize: 12 }}>
                            {' '}/ {d.amount}
                            {d.unit}
                          </span>
                          {isCheapest && (
                            <Tag color="orange" style={{ marginLeft: 4, marginInlineEnd: 0 }}>
                              最低
                            </Tag>
                          )}
                          {unitPrice && (
                            <div style={{ fontSize: 11, color: '#b0aaa3', marginTop: 2 }}>
                              约 ¥{Number(unitPrice.value.toFixed(2))} / {unitPrice.unit}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          未录入
                        </Text>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, margin: '18px 0 8px' }}>
                营养成分（每 100g / 100ml）
              </div>
              {detail.nutrition ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {NUTRI_FIELDS.map((f) => (
                    <div key={f.key} style={{ background: '#faf7f2', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontSize: 11, color: '#999' }}>{f.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2A26' }}>
                        {detail.nutrition?.[f.key] ?? '—'}
                        <span style={{ fontSize: 11, fontWeight: 400, color: '#999' }}> {f.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  未填写营养成分
                </Text>
              )}

              {isAdmin && (
                <AmButton
                  block
                  color="primary"
                  style={{ marginTop: 18, '--color': '#E8743C' } as CSSProperties}
                  onClick={() => {
                    setDetail(null);
                    openEditRow(detail);
                  }}
                >
                  编辑食材
                </AmButton>
              )}

              {/* 顶部弹层底部的拖拽指示条 */}
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: '#e8e3dd',
                  margin: '18px auto 0',
                }}
              />
            </>
          )}
        </Popup>
      )}

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
        onCancel={closeImportModal}
        onOk={confirmImport}
        confirmLoading={importing}
        okText={
          importMode === 'merge' && (importPlan?.conflicts.length ?? 0) > 0
            ? `去处理 ${importPlan!.conflicts.length} 条冲突`
            : `确认导入 ${parsedItems.length} 条`
        }
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
              按 ID 比对（ID 留空的按名称比对），有差异的会让你逐条选保留哪一边，其余新增
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

        {/* 合并模式下的比对结果统计：一眼看清这次导入会发生什么 */}
        {importMode === 'merge' && importPlan && (
          <Space style={{ marginBottom: 12 }} size={16}>
            <span>
              <Tag color="green">新增</Tag>
              <Text strong>{importPlan.news.length}</Text> 条
            </span>
            <span>
              <Tag color="orange">冲突</Tag>
              <Text strong>{importPlan.conflicts.length}</Text> 条
            </span>
            <span>
              <Tag>无变化</Tag>
              <Text strong>{importPlan.skipped.length}</Text> 条
            </span>
          </Space>
        )}

        <Table<Ingredient>
          rowKey="id"
          dataSource={parsedItems.slice(0, PREVIEW_COUNT)}
          pagination={false}
          size="small"
          scroll={{ y: 320 }}
          columns={[
            // 合并模式下先标出每行的去向，再让用户决定导不导
            ...(importMode === 'merge' && importPlan
              ? [
                {
                  title: '状态',
                  key: 'status',
                  width: 80,
                  render: (_: unknown, r: Ingredient) => {
                    if (importPlan.conflicts.some((c) => c.key === r.id))
                      return <Tag color="orange">冲突</Tag>;
                    if (importPlan.skipped.some((s) => s.id === r.id)) return <Tag>无变化</Tag>;
                    return <Tag color="green">新增</Tag>;
                  },
                },
              ]
              : []),
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
                    ¥{Number(c.price.toFixed(2))} / {c.amount}{c.unit}
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

      {/* 冲突对比弹窗：逐条看「系统值 → Excel 值」，选保留哪一边 */}
      <Modal
        title={`处理冲突：${importPlan?.conflicts.length ?? 0} 条食材系统里已存在`}
        open={conflictModalOpen}
        onCancel={() => setConflictModalOpen(false)}
        onOk={confirmConflicts}
        confirmLoading={importing}
        okText="确认导入"
        cancelText="返回"
        width={1000}
        destroyOnClose
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={
            <div>
              下面这些食材和系统里的对上了（按 ID 或名称），内容有差异。请逐条选择保留哪一边；
              选「用 Excel 覆盖」会保留系统里的原 ID 和图片，只更新内容。
            </div>
          }
        />
        <Space style={{ marginBottom: 12 }}>
          <Button
            size="small"
            onClick={() =>
              setConflictChoices(
                Object.fromEntries(
                  (importPlan?.conflicts ?? []).map((c) => [c.key, 'excel' as const])
                )
              )
            }
          >
            全部用 Excel
          </Button>
          <Button
            size="small"
            onClick={() =>
              setConflictChoices(
                Object.fromEntries(
                  (importPlan?.conflicts ?? []).map((c) => [c.key, 'system' as const])
                )
              )
            }
          >
            全部保留系统
          </Button>
        </Space>
        <Table<ImportConflict>
          rowKey="key"
          dataSource={importPlan?.conflicts ?? []}
          pagination={false}
          size="small"
          scroll={{ y: 420 }}
          columns={[
            {
              title: '食材',
              key: 'name',
              width: 160,
              render: (_: unknown, c: ImportConflict) => (
                <Space direction="vertical" size={2}>
                  <Text strong>{c.excel.name}</Text>
                  {c.matchBy === 'name' ? (
                    // ID 留空却同名：重点提示「系统里已经有了」，用户多半是想起来已有这条
                    <Tag color="gold">系统已有同名食材</Tag>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ID: {c.system.id}
                    </Text>
                  )}
                </Space>
              ),
            },
            {
              title: '差异（系统 → Excel）',
              key: 'diffs',
              render: (_: unknown, c: ImportConflict) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {c.diffs.map((d) => (
                    <div key={d.label} style={{ fontSize: 12 }}>
                      <Text type="secondary">{d.label}：</Text>
                      <Text>{d.systemValue}</Text>
                      <Text type="secondary"> → </Text>
                      <Text strong style={{ color: '#E8743C' }}>
                        {d.excelValue}
                      </Text>
                    </div>
                  ))}
                </div>
              ),
            },
            {
              title: '保留哪一边',
              key: 'choice',
              width: 200,
              render: (_: unknown, c: ImportConflict) => (
                <Radio.Group
                  value={conflictChoices[c.key] ?? 'excel'}
                  onChange={(e) =>
                    setConflictChoices((prev) => ({
                      ...prev,
                      [c.key]: e.target.value as 'excel' | 'system',
                    }))
                  }
                >
                  <Radio value="excel">用 Excel 覆盖</Radio>
                  <Radio value="system">保留系统</Radio>
                </Radio.Group>
              ),
            },
          ]}
        />
      </Modal>
      <BulkImagePairer
        open={bulkImageOpen}
        onClose={() => setBulkImageOpen(false)}
        onAllSuccess={async () => {
          // 全部上传完：从云端拉最新数据 + 让 ProTable 重新渲染
          await load();
          tableActionRef.current?.reload();
        }}
      />
    </div>
  );
}
