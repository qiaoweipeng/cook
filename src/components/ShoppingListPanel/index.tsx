import { useMemo, useState } from 'react';
import {
  Checkbox,
  Space,
  Button,
  Empty,
  Tag,
  Statistic,
  App as AntApp,
  Typography,
  Modal,
  Input,
  Popconfirm,
  Divider,
  Segmented,
  InputNumber,
} from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  ShoppingOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Popup } from 'antd-mobile';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { useShoppingStore, ExtraItem } from '@/store/useShoppingStore';
import { mergeShoppingList } from '@/utils/merge';
import { cheapestPlatform, calcDishCost } from '@/utils/price';
import PriceTag from '@/components/PriceTag';

const { Text } = Typography;

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #f3eee7',
  padding: '12px 14px',
};
const cardHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

/**
 * 采购清单面板
 * - 用作 /shopping 路由的内容（独立页面）
 * - 也被 AppLayout 顶部购物车按钮唤起的 Drawer 复用
 *
 * 在 Drawer 中展示时，使用「单列堆叠」布局：
 * 顶部统计 → 已选菜品 → 合并食材，每段独立滚动，
 * 避免双列在窄空间被挤变形。
 */
export default function ShoppingListPanel() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  // 采购时手动切平台：总成本立刻按这个平台的价格重算
  const platform = usePriceStore((s) => s.platform);
  const platforms = usePriceStore((s) => s.platforms);
  const setPlatform = usePriceStore((s) => s.setPlatform);
  const {
    selectedDishIds,
    toggleDish,
    clearDishes,
    toggleCheckedKey,
    setCheckedKeys,
    clearChecked,
    checkedKeys,
    // 新增的其他项
    extraItems,
    extraCheckedIds,
    addExtraItem,
    removeExtraItem,
    toggleExtraChecked,
    clearExtraItems,
    // 结算
    settle,
    selectAllCheckedKeys,
    history,
  } = useShoppingStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  // 移动端：其他项的添加 Popup 状态
  const [extraOpen, setExtraOpen] = useState(false);        // 主面板：手动/食材库选择
  const [extraManualOpen, setExtraManualOpen] = useState(false); // 手动输入弹框
  const [extraIngOpen, setExtraIngOpen] = useState(false);      // 食材库选择弹框
  const [ingKeyword, setIngKeyword] = useState('');
  const [ingPickedIds, setIngPickedIds] = useState<string[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState<number | null>(null);
  const [manualUnit, setManualUnit] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectedDishes = useMemo(
    () => dishes.filter((d) => selectedDishIds.includes(d.id)),
    [dishes, selectedDishIds]
  );
  const merged = useMemo(
    () => mergeShoppingList(selectedDishes, ingredients, platform),
    [selectedDishes, ingredients, platform]
  );
  const mergedExtraTotal = useMemo(
    () => extraItems.reduce((s, e) => s + (e.price ?? 0), 0),
    [extraItems]
  );
  const total = useMemo(
    () => merged.reduce((sum, x) => sum + x.totalCost, 0) + mergedExtraTotal,
    [merged, mergedExtraTotal]
  );
  const mergedCheckedTotal = useMemo(
    () =>
      merged
        .filter((m) => checkedKeys.includes(`${m.ingredientId}_${m.unit}`))
        .reduce((sum, x) => sum + x.totalCost, 0),
    [merged, checkedKeys]
  );
  const extraCheckedTotal = useMemo(
    () =>
      extraItems
        .filter((e) => extraCheckedIds.includes(e.id))
        .reduce((s, e) => s + (e.price ?? 0), 0),
    [extraItems, extraCheckedIds]
  );
  const checkedTotal = mergedCheckedTotal + extraCheckedTotal;

  const checkedCount = useMemo(
    () =>
      checkedKeys.filter((k) => merged.some((m) => `${m.ingredientId}_${m.unit}` === k)).length +
      extraCheckedIds.length,
    [merged, checkedKeys, extraCheckedIds]
  );

  // 还有多少项没勾选（用于结算确认弹框）
  const uncheckedCount = useMemo(() => {
    const mergedUnchecked = merged.filter(
      (m) => !checkedKeys.includes(`${m.ingredientId}_${m.unit}`)
    ).length;
    const extraUnchecked = extraItems.filter((e) => !extraCheckedIds.includes(e.id)).length;
    return mergedUnchecked + extraUnchecked;
  }, [merged, checkedKeys, extraItems, extraCheckedIds]);

  const pickerDishes = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const arr = dishes.filter((d) => !selectedDishIds.includes(d.id));
    if (!k) return arr;
    return arr.filter(
      (d) =>
        d.name.toLowerCase().includes(k) ||
        d.tags.some((t) => t.toLowerCase().includes(k))
    );
  }, [dishes, selectedDishIds, keyword]);

  // ============ 移动端全新布局 ============
  if (isMobile) {
    // 所有 merged 项的 key（用于"全选"）
    const allMergedKeys = merged.map((m) => `${m.ingredientId}_${m.unit}`);
    const allCheckedKeys = [...allMergedKeys, ...extraItems.map((e) => e.id)];
    const allChecked =
      allMergedKeys.every((k) => checkedKeys.includes(k)) &&
      extraItems.every((e) => extraCheckedIds.includes(e.id));

    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 'calc(130px + env(safe-area-inset-bottom))' }}>
          {/* —— 顶部历史按钮 —— */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setHistoryOpen(true)}>
              历史记录 {history.length > 0 && `(${history.length})`}
            </Button>
          </div>

          {/* —— 已选菜品 —— */}
          <div style={cardStyle}>
            <div style={cardHeader}>
              <Space>
                <Text strong style={{ fontSize: 14 }}>已选菜品</Text>
                <Tag color="orange" style={{ margin: 0 }}>{selectedDishIds.length}</Tag>
              </Space>
              <Space>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/search?mode=shopping')}
                >
                  添加
                </Button>
                {selectedDishIds.length > 0 && (
                  <Popconfirm
                    title="清空已选菜品？"
                    okText="清空"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => clearDishes()}
                  >
                    <Button size="small" danger>清空</Button>
                  </Popconfirm>
                )}
              </Space>
            </div>
            {selectedDishIds.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="还没选菜，点上面的「添加」"
                style={{ padding: '20px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedDishes.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      background: '#FAF7F2',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ width: 4, height: 28, borderRadius: 2, background: '#E8743C', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                        {d.category} · {d.cookTimeMin}分钟
                      </div>
                    </div>
                    <PriceTag value={calcDishCost(d, ingredients)} size="small" />
                    <Button type="text" size="small" danger onClick={() => toggleDish(d.id)}>
                      移除
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* —— 合并食材 —— */}
          <div style={cardStyle}>
            <div style={cardHeader}>
              <Space>
                <Text strong style={{ fontSize: 14 }}>合并食材</Text>
                <Tag style={{ margin: 0 }}>{merged.length} 项</Tag>
              </Space>
              <Space>
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => {
                    if (allChecked) {
                      setCheckedKeys([]);
                      useShoppingStore.setState({ extraCheckedIds: [] });
                    } else {
                      setCheckedKeys(allMergedKeys);
                      useShoppingStore.setState({ extraCheckedIds: extraItems.map((e) => e.id) });
                    }
                  }}
                >
                  {allChecked ? '全不选' : '全选'}
                </Button>
              </Space>
            </div>
            {merged.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="勾几道菜，自动汇总食材"
                style={{ padding: '24px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {merged.map((item) => {
                  const key = `${item.ingredientId}_${item.unit}`;
                  const checked = checkedKeys.includes(key);
                  const ing = ingredients.find((x) => x.id === item.ingredientId);
                  const cheapest = ing ? cheapestPlatform(ing) : null;
                  return (
                    <div
                      key={key}
                      onClick={() => toggleCheckedKey(key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: checked ? '#F0F7EC' : '#FAF7F2',
                        border: checked ? '1.5px solid #BFD9B2' : '1.5px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: checked ? 'none' : '1.5px solid #ccc',
                          background: checked ? '#6B8B5C' : 'transparent',
                          color: '#fff',
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {checked && <CheckOutlined style={{ fontSize: 10 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: checked ? 700 : 500, textDecoration: checked ? 'line-through' : 'none', color: checked ? '#6B8B5C' : '#2D2A26' }}>
                          {item.ingredientName}
                        </div>
                        {cheapest && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            最低 {cheapest.platform} ¥{Number(cheapest.price.toFixed(2))} / {cheapest.amount}{cheapest.unit}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 13, minWidth: 70, textAlign: 'right', color: checked ? '#6B8B5C' : '#2D2A26' }}>
                        {item.amount} {item.unit}
                      </div>
                      <PriceTag
                        value={item.totalCost}
                        size="small"
                        variant={checked ? 'light' : 'solid'}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* —— 其他（手动/食材库选） —— */}
          <div style={cardStyle}>
            <div style={cardHeader}>
              <Space>
                <Text strong style={{ fontSize: 14 }}>其他</Text>
                <Tag style={{ margin: 0 }}>{extraItems.length} 项</Tag>
              </Space>
              <Button
                size="small"
                type="primary"
                ghost
                icon={<PlusOutlined />}
                onClick={() => setExtraOpen(true)}
              >
                添加
              </Button>
            </div>
            {extraItems.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="顺手想买的、不在任何一道菜里的，记这里"
                style={{ padding: '20px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {extraItems.map((item) => {
                  const checked = extraCheckedIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleExtraChecked(item.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: checked ? '#F0F7EC' : '#FAF7F2',
                        border: checked ? '1.5px solid #BFD9B2' : '1.5px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          border: checked ? 'none' : '1.5px solid #ccc',
                          background: checked ? '#6B8B5C' : 'transparent',
                          color: '#fff',
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {checked && <CheckOutlined style={{ fontSize: 10 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: checked ? 700 : 500, color: checked ? '#6B8B5C' : '#2D2A26' }}>
                          {item.name}
                          {item.source === 'manual' && (
                            <Tag style={{ margin: 0, marginLeft: 6 }}>手动</Tag>
                          )}
                        </div>
                      </div>
                      <PriceTag value={item.price} size="small" />
                      <Button
                        type="text"
                        size="small"
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          removeExtraItem(item.id);
                        }}
                      >
                        删除
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* —— 平台切换 —— */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>默认采购平台</Text>
            <Segmented
              size="small"
              value={platform}
              onChange={(v) => setPlatform(String(v))}
              options={platforms}
            />
          </div>
        </div>

        {/* —— 底部 sticky 结算栏（叠在导航栏上方 ~64px + safe） —— */}
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(64px + env(safe-area-inset-bottom))',
            left: 0,
            right: 0,
            padding: '10px 16px',
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            zIndex: 99,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#E8743C' }}>
                ¥{total.toFixed(2)}
              </span>
              <span style={{ fontSize: 11, color: '#999' }}>总成本</span>
            </div>
            <div style={{ fontSize: 11, color: '#6B8B5C', marginTop: 2 }}>
              已勾选 ¥{checkedTotal.toFixed(2)} / {checkedCount} 项
            </div>
          </div>
          <Button
            type="primary"
            size="large"
            disabled={merged.length === 0 && extraItems.length === 0}
            onClick={() => {
              // 未勾选提示
              if (uncheckedCount > 0) {
                Modal.confirm({
                  title: '还有没勾选的',
                  content: `还有 ${uncheckedCount} 项没勾选，确认全部结算吗？`,
                  okText: '确认结算',
                  cancelText: '继续看看',
                  okButtonProps: { danger: true },
                  onOk: () => {
                    settle({ platform, total, checkedTotal });
                    message.success('已结算');
                  },
                });
              } else {
                Modal.confirm({
                  title: '确认结算？',
                  content: `本次共 ${merged.length + extraItems.length} 项，总成本 ¥${total.toFixed(2)}`,
                  okText: '结算',
                  cancelText: '取消',
                  onOk: () => {
                    settle({ platform, total, checkedTotal });
                    message.success('已结算');
                  },
                });
              }
            }}
          >
            结算
          </Button>
        </div>

        {/* —— 其他项添加 Popup —— */}
        <Popup
          visible={extraOpen}
          onMaskClick={() => setExtraOpen(false)}
          bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>
              添加其他食材
            </div>
            <Button
              size="large"
              icon={<PlusOutlined />}
              onClick={() => {
                setExtraOpen(false);
                setExtraManualOpen(true);
              }}
            >
              手动输入
            </Button>
            <Button
              size="large"
              type="primary"
              ghost
              icon={<ShoppingOutlined />}
              onClick={() => {
                setExtraOpen(false);
                setIngPickedIds([]);
                setIngKeyword('');
                setExtraIngOpen(true);
              }}
            >
              从食材库选
            </Button>
            <Button type="text" onClick={() => setExtraOpen(false)}>
              取消
            </Button>
          </div>
        </Popup>

        {/* —— 手动输入弹框 —— */}
        <Modal
          title="手动添加"
          open={extraManualOpen}
          onCancel={() => setExtraManualOpen(false)}
          onOk={() => {
            if (!manualName.trim() || !manualPrice) {
              message.warning('名字和价格都要填');
              return;
            }
            addExtraItem({
              name: manualName.trim(),
              price: Number(manualPrice),
              unit: manualUnit.trim() || undefined,
              source: 'manual',
            });
            setManualName('');
            setManualPrice(null);
            setManualUnit('');
            setExtraManualOpen(false);
          }}
          okText="添加"
          cancelText="取消"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: '#8C7C6C', marginBottom: 4 }}>名字</div>
              <Input
                placeholder="如：餐巾纸"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C7C6C', marginBottom: 4 }}>价格（¥）</div>
              <InputNumber
                min={0}
                precision={2}
                placeholder="0.00"
                value={manualPrice}
                onChange={(v) => setManualPrice(v as number | null)}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C7C6C', marginBottom: 4 }}>单位（可选）</div>
              <Input
                placeholder="如：包 / 瓶 / 只"
                value={manualUnit}
                onChange={(e) => setManualUnit(e.target.value)}
              />
            </div>
          </div>
        </Modal>

        {/* —— 食材库选择弹框 —— */}
        <Popup
          visible={extraIngOpen}
          onMaskClick={() => setExtraIngOpen(false)}
          bodyStyle={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '78vh', overflow: 'auto', padding: 16 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong>从食材库选（{ingPickedIds.length} 项）</Text>
              <Button
                size="small"
                type="primary"
                disabled={ingPickedIds.length === 0}
                onClick={() => {
                  for (const id of ingPickedIds) {
                    const ing = ingredients.find((x) => x.id === id);
                    if (ing) {
                      const cp = cheapestPlatform(ing);
                      addExtraItem({
                        name: ing.name,
                        price: cp ? cp.price : 0,
                        unit: ing.unit,
                        source: 'ingredient',
                        ingredientId: ing.id,
                      });
                    }
                  }
                  setExtraIngOpen(false);
                  setIngPickedIds([]);
                }}
              >
                添加 {ingPickedIds.length}
              </Button>
            </div>
            <Input.Search
              placeholder="搜食材名"
              value={ingKeyword}
              onChange={(e) => setIngKeyword(e.target.value)}
              allowClear
            />
            {(() => {
              const k = ingKeyword.trim().toLowerCase();
              const list = k ? ingredients.filter((i) => i.name.toLowerCase().includes(k)) : ingredients;
              if (list.length === 0) return <Empty description="食材库没这个" />;
              return list.slice(0, 50).map((ing) => {
                const picked = ingPickedIds.includes(ing.id);
                return (
                  <div
                    key={ing.id}
                    onClick={() => {
                      setIngPickedIds((prev) =>
                        prev.includes(ing.id) ? prev.filter((x) => x !== ing.id) : [...prev, ing.id]
                      );
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background: picked ? '#FFF6EC' : '#FAF7F2',
                      border: picked ? '1.5px solid #F3C9AF' : '1.5px solid transparent',
                    }}
                  >
                    <div
                      style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: picked ? 'none' : '1.5px solid #ccc',
                        background: picked ? '#E8743C' : 'transparent',
                        color: '#fff', fontSize: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {picked && <CheckOutlined style={{ fontSize: 10 }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: picked ? 700 : 500, color: picked ? '#E8743C' : '#2D2A26' }}>
                        {ing.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {ing.category} · {ing.unit}
                      </div>
                    </div>
                    <PriceTag value={(() => {
                      const cp = cheapestPlatform(ing);
                      return cp ? cp.price : 0;
                    })()} size="small" />
                  </div>
                );
              });
            })()}
          </div>
        </Popup>

        {/* —— 历史采购清单抽屉 —— */}
        <Popup
          visible={historyOpen}
          onMaskClick={() => setHistoryOpen(false)}
          position="top"
          bodyStyle={{
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            maxHeight: '78vh',
            overflow: 'auto',
            padding: '14px 16px 24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>采购历史</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {history.length > 0 && (
                <Popconfirm
                  title="清空全部历史？"
                  okText="清空"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => {
                    useShoppingStore.getState().clearHistory();
                    message.success('已清空历史');
                  }}
                >
                  <Button size="small" danger>全部清空</Button>
                </Popconfirm>
              )}
              <Button size="small" onClick={() => setHistoryOpen(false)}>关闭</Button>
            </div>
          </div>

          {history.length === 0 ? (
            <Empty
              description="还没有结算过，买完东西点「结算」就会记一笔"
              style={{ padding: '40px 0' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((entry) => {
                const d = new Date(entry.settledAt);
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                return (
                  <div
                    key={entry.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #f3eee7',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 13, color: '#8C7C6C' }}>
                        {dateStr} {timeStr}
                      </div>
                      <Tag style={{ margin: 0 }}>{entry.platform}</Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#999' }}>菜品</div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{entry.selectedDishIds.length} 道</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#999' }}>其他</div>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{entry.extraItems.length} 项</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: '#999' }}>已勾选</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#6B8B5C' }}>¥{entry.checkedTotal.toFixed(2)}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#999' }}>总成本</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#E8743C' }}>¥{entry.total.toFixed(2)}</div>
                      </div>
                    </div>
                    {entry.selectedDishIds.length > 0 && (
                      <div style={{ fontSize: 11, color: '#8C7C6C', marginTop: 6, paddingTop: 6, borderTop: '1px dashed #f3eee7' }}>
                        菜品：{entry.selectedDishIds.map((id) => dishes.find((d) => d.id === id)?.name).filter(Boolean).join('、')}
                        {entry.extraItems.length > 0 && (
                          <>
                            ；其他：{entry.extraItems.map((e) => e.name).join('、')}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Popup>
      </>
    );
  }

  // ============ 桌面端 Drawer 布局（保持原样） ============
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* —— 标题 —— */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShoppingOutlined style={{ color: '#E8743C', fontSize: 18 }} />
        <Text strong style={{ fontSize: 17 }}>
          采购清单
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          勾选几道菜，自动汇总食材 + 价格
        </Text>
      </div>

      {/* —— 顶部统计 —— */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #f3eee7',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 32,
          flexWrap: 'wrap',
        }}
      >
        <Statistic
          title={<span style={{ fontSize: 12 }}>总成本</span>}
          value={total}
          precision={2}
          prefix="¥"
          valueStyle={{ color: '#E8743C', fontWeight: 700, fontSize: 22 }}
        />
        <Divider type="vertical" style={{ height: 36 }} />
        <Statistic
          title={<span style={{ fontSize: 12 }}>已勾选</span>}
          value={checkedTotal}
          precision={2}
          prefix="¥"
          suffix={
            <Text type="secondary" style={{ fontSize: 12 }}>
              {' '}/ {checkedCount} 项
            </Text>
          }
          valueStyle={{ color: '#7BB661', fontWeight: 700, fontSize: 22 }}
        />
        <div style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={platform}
          onChange={(v) => setPlatform(String(v))}
          options={platforms}
        />
        <Button
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => {
            clearChecked();
            message.success('已重置勾选');
          }}
        >
          重置勾选
        </Button>
      </div>

      {/* —— 已选菜品 —— */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #f3eee7',
          padding: '14px 18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Space>
            <Text strong style={{ fontSize: 14 }}>已选菜品</Text>
            <Tag color="orange" style={{ margin: 0 }}>{selectedDishIds.length}</Tag>
          </Space>
          <Space>
            <Button
              size="small"
              type="primary"
              ghost
              icon={<PlusOutlined />}
              onClick={() => {
                // 移动端去独立搜索页选菜，桌面端保留原来的弹窗
                if (isMobile) navigate('/search?mode=shopping');
                else setPickerOpen(true);
              }}
            >
              添加
            </Button>
            {selectedDishIds.length > 0 && (
              <Popconfirm
                title="清空已选菜品？"
                okText="清空"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => {
                  clearDishes();
                  message.success('已清空');
                }}
              >
                <Button size="small" danger>
                  清空
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>

        {selectedDishIds.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <div style={{ color: '#999' }}>还没有选菜</div>
                <Button
                  type="link"
                  onClick={() =>
                    isMobile ? navigate('/search?mode=shopping') : setPickerOpen(true)
                  }
                  style={{ paddingTop: 4 }}
                >
                  + 从菜单添加
                </Button>
              </div>
            }
            style={{ padding: '16px 0' }}
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 8,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {selectedDishes.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: '#FAF7F2',
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 28,
                    borderRadius: 3,
                    background: '#E8743C',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {d.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#999' }}>
                    <Tag color="orange" style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
                      {d.category}
                    </Tag>
                    <span style={{ marginLeft: 4 }}>{d.cookTimeMin} 分钟</span>
                  </div>
                </div>
                <Button
                  type="link"
                  size="small"
                  danger
                  onClick={() => toggleDish(d.id)}
                  style={{ padding: '0 4px', flexShrink: 0 }}
                >
                  移除
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* —— 合并食材 —— */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #f3eee7',
          padding: '14px 18px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}
        >
          <Space>
            <Text strong style={{ fontSize: 14 }}>合并食材</Text>
            <Tag style={{ margin: 0 }}>{merged.length} 项</Tag>
          </Space>
        </div>

        {merged.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="勾几道菜，自动汇总食材"
            style={{ padding: '40px 0' }}
          />
        ) : (
          <div
            style={{
              maxHeight: 420,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {merged.map((item) => {
              const key = `${item.ingredientId}_${item.unit}`;
              const checked = checkedKeys.includes(key);
              // 这项食材全平台最低价：买的时候一眼知道该去哪个平台
              const ing = ingredients.find((x) => x.id === item.ingredientId);
              const cheapest = ing ? cheapestPlatform(ing) : null;
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    marginBottom: 4,
                    background: checked ? '#f3faf0' : '#FAF7F2',
                    transition: 'all .15s',
                  }}
                >
                  <Checkbox
                    checked={checked}
                    onChange={() => toggleCheckedKey(key)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      strong
                      style={{
                        textDecoration: checked ? 'line-through' : 'none',
                        fontSize: 14,
                      }}
                    >
                      {item.ingredientName}
                    </Text>
                    {cheapest && (
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                        最低 {cheapest.platform} ¥{Number(cheapest.price.toFixed(2))} / {cheapest.amount}{cheapest.unit}
                      </div>
                    )}
                  </div>
                  <Text
                    type={checked ? 'secondary' : undefined}
                    style={{ fontSize: 13, minWidth: 80, textAlign: 'right' }}
                  >
                    {item.amount} {item.unit}
                  </Text>
                  <div style={{ minWidth: 70, textAlign: 'right' }}>
                    <PriceTag
                      value={item.totalCost}
                      size="small"
                      variant={checked ? 'light' : 'solid'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* —— 选菜 Modal —— */}
      <Modal
        title="选择要做的菜"
        open={pickerOpen}
        onCancel={() => setPickerOpen(false)}
        footer={null}
        width={680}
      >
        <Input.Search
          className="app-search"
          placeholder="搜菜名 / 标签"
          allowClear
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {pickerDishes.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 8px',
                borderBottom: '1px solid #f5f0e8',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: '#f0eee9',
                  marginRight: 12,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{d.name}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>
                  <Tag color="orange" style={{ margin: 0 }}>{d.category}</Tag>
                  {d.tags.slice(0, 2).map((t) => (
                    <Tag key={t} style={{ margin: 0, marginLeft: 4 }}>{t}</Tag>
                  ))}
                </div>
              </div>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => toggleDish(d.id)}
              >
                加入
              </Button>
            </div>
          ))}
          {pickerDishes.length === 0 && (
            <Empty description="没有可加入的菜了" style={{ padding: 40 }} />
          )}
        </div>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button onClick={() => setPickerOpen(false)}>完成</Button>
        </div>
      </Modal>
    </div>
  );
}
