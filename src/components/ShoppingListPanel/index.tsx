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
} from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { useShoppingStore } from '@/store/useShoppingStore';
import { mergeShoppingList } from '@/utils/merge';
import { cheapestPlatform } from '@/utils/price';
import PriceTag from '@/components/PriceTag';

const { Text } = Typography;

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
    clearChecked,
    checkedKeys,
  } = useShoppingStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  const selectedDishes = useMemo(
    () => dishes.filter((d) => selectedDishIds.includes(d.id)),
    [dishes, selectedDishIds]
  );
  const merged = useMemo(
    () => mergeShoppingList(selectedDishes, ingredients, platform),
    [selectedDishes, ingredients, platform]
  );
  const total = useMemo(
    () => merged.reduce((sum, x) => sum + x.totalCost, 0),
    [merged]
  );
  const checkedTotal = useMemo(
    () =>
      merged
        .filter((m) => checkedKeys.includes(`${m.ingredientId}_${m.unit}`))
        .reduce((sum, x) => sum + x.totalCost, 0),
    [merged, checkedKeys]
  );
  const checkedCount = useMemo(
    () =>
      checkedKeys.filter((k) => merged.some((m) => `${m.ingredientId}_${m.unit}` === k))
        .length,
    [merged, checkedKeys]
  );

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
              onClick={() => setPickerOpen(true)}
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
                  onClick={() => setPickerOpen(true)}
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
                        最低 {cheapest.platform} ¥{Number(cheapest.value.toFixed(2))}/{cheapest.unit}
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
