import { useMemo, useState } from 'react';
import { Button, Empty, Input, Modal, Popconfirm, Tag, Typography, App as AntApp } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { useWeeklyStore } from '@/store/useWeeklyStore';
import { calcDishCost } from '@/utils/price';
import { WEEKDAY_LABELS, getWeekDays, dayKey, today } from '@/utils/week';
import type { Dayjs } from 'dayjs';
import type { Dish } from '@/types';
import PriceTag from '@/components/PriceTag';

const { Text } = Typography;

/** 一周 7 个格子的宽度：手机横滑，桌面平分 */
const WEEK_STRIP_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  overflowX: 'auto',
  paddingBottom: 4,
  marginBottom: 20,
};

function dayBoxStyle(selected: boolean, isToday: boolean): React.CSSProperties {
  return {
    flex: '1 0 108px',
    minWidth: 108,
    borderRadius: 14,
    border: `1.5px solid ${selected ? '#E8743C' : isToday ? '#F3C9AF' : '#f0ebe4'}`,
    background: selected ? '#FFF6EC' : '#fff',
    padding: '10px 10px 8px',
    cursor: 'pointer',
    boxShadow: selected ? '0 4px 14px rgba(232,116,60,0.14)' : 'none',
    transition: 'all 0.15s',
  };
}

export default function Weekly() {
  const { message } = AntApp.useApp();
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  const plans = useWeeklyStore((s) => s.plans);
  const addDishToDay = useWeeklyStore((s) => s.addDishToDay);
  const removeDishFromDay = useWeeklyStore((s) => s.removeDishFromDay);
  const clearDay = useWeeklyStore((s) => s.clearDay);

  const days = useMemo<Dayjs[]>(() => getWeekDays(), []);
  const todayKey = dayKey(today());
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [addOpen, setAddOpen] = useState(false);
  const [keyword, setKeyword] = useState('');

  const dishById = useMemo(() => {
    const m = new Map<string, Dish>();
    for (const d of dishes) m.set(d.id, d);
    return m;
  }, [dishes]);

  /** 某天的有效菜品（过滤掉已被删除的 id） */
  const dishesOf = (day: string): Dish[] =>
    (plans[day] ?? [])
      .map((id) => dishById.get(id))
      .filter((d): d is Dish => Boolean(d));

  const weekDishCount = days.reduce((sum, d) => sum + dishesOf(dayKey(d)).length, 0);
  const selectedDate = days.find((d) => dayKey(d) === selectedDay) ?? days[0];
  const selectedIndex = days.indexOf(selectedDate);
  const selectedDishes = dishesOf(selectedDay);
  const selectedCost = selectedDishes.reduce((sum, d) => sum + calcDishCost(d, ingredients), 0);

  const handleAdd = async (dish: Dish) => {
    await addDishToDay(selectedDay, dish.id);
    message.success(`已把「${dish.name}」加进${WEEKDAY_LABELS[selectedIndex]}的菜单`);
  };

  const handleRemove = async (dish: Dish) => {
    await removeDishFromDay(selectedDay, dish.id);
    message.success(`已移除「${dish.name}」`);
  };

  const handleClear = async () => {
    await clearDay(selectedDay);
    message.success('已清空当天的菜单');
  };

  // 添加弹窗里的候选：排除当天已有的，支持按名称/标签搜索
  const candidates = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const already = new Set(plans[selectedDay] ?? []);
    return dishes
      .filter((d) => !already.has(d.id))
      .filter((d) => {
        if (!k) return true;
        return (
          d.name.toLowerCase().includes(k) || d.tags.some((t) => t.toLowerCase().includes(k))
        );
      });
  }, [dishes, plans, selectedDay, keyword]);

  return (
    <div>
      {/* 标题 */}
      <div style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: 700, color: '#2D2A26' }}>每周菜单</Text>
        <div style={{ color: '#888', marginTop: 4 }}>
          {days[0].format('M月D日')} ~ {days[6].format('M月D日')} · 本周已安排 {weekDishCount} 道菜
          · 默认显示今天，点击任意一天切换查看
        </div>
      </div>

      {/* 一周 7 天格子：能看到整周安排 */}
      <div style={WEEK_STRIP_STYLE}>
        {days.map((d, i) => {
          const key = dayKey(d);
          const isToday = key === todayKey;
          const selected = key === selectedDay;
          const dayDishes = dishesOf(key);
          return (
            <div
              key={key}
              onClick={() => setSelectedDay(key)}
              style={dayBoxStyle(selected, isToday)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 600, color: selected ? '#E8743C' : '#2D2A26' }}>
                  {WEEKDAY_LABELS[i]}
                </span>
                {isToday && (
                  <Tag color="orange" style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>
                    今天
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>{d.format('M/D')}</div>
              {dayDishes.length === 0 ? (
                <div style={{ fontSize: 12, color: '#ccc' }}>还没安排</div>
              ) : (
                dayDishes.slice(0, 3).map((dish) => (
                  <div
                    key={dish.id}
                    style={{
                      fontSize: 12,
                      color: '#666',
                      background: '#FAF7F2',
                      borderRadius: 6,
                      padding: '2px 6px',
                      marginBottom: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={dish.name}
                  >
                    {dish.name}
                  </div>
                ))
              )}
              {dayDishes.length > 3 && (
                <div style={{ fontSize: 12, color: '#bbb' }}>+{dayDishes.length - 3} 道</div>
              )}
            </div>
          );
        })}
      </div>

      {/* 选中那天的详情 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <Text style={{ fontSize: 17, fontWeight: 600, color: '#2D2A26' }}>
            {WEEKDAY_LABELS[selectedIndex]} · {selectedDate.format('M月D日')}
            {selectedDay === todayKey && '（今天）'}
          </Text>
          <span style={{ color: '#888', fontSize: 13, marginLeft: 12 }}>
            {selectedDishes.length} 道菜 · 预估{' '}
            <PriceTag value={selectedCost} size="small" />
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            添加菜品
          </Button>
          {selectedDishes.length > 0 && (
            <Popconfirm title="清空这一天的菜单？" okText="清空" cancelText="取消" onConfirm={handleClear}>
              <Button danger icon={<DeleteOutlined />}>
                清空
              </Button>
            </Popconfirm>
          )}
        </div>
      </div>

      {/* 当天菜品列表 */}
      {selectedDishes.length === 0 ? (
        <Empty
          description={
            selectedDay === todayKey
              ? '今天还没想好吃什么，点「添加菜品」安排上'
              : '这一天还没安排，点「添加菜品」加两道'
          }
          style={{ marginTop: 40 }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {selectedDishes.map((dish) => (
            <div
              key={dish.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: '#fff',
                border: '1px solid #f0ebe4',
                borderRadius: 14,
                padding: '12px 16px',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: '#f0eee9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#E8743C',
                  fontSize: 22,
                  fontWeight: 600,
                }}
              >
                {dish.coverImage ? (
                  <img
                    src={dish.coverImage}
                    alt={dish.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  dish.name.slice(0, 1)
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link
                  to={`/menu/${dish.id}`}
                  style={{ fontSize: 16, fontWeight: 600, color: '#2D2A26' }}
                >
                  {dish.name}
                </Link>
                <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                  {dish.category} · {dish.cookTimeMin} 分钟 · 难度 {dish.difficulty}/3
                </div>
              </div>
              <PriceTag value={calcDishCost(dish, ingredients)} suffix="/份" size="small" />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleRemove(dish)}
              />
            </div>
          ))}
        </div>
      )}

      {/* 添加菜品弹窗 */}
      <Modal
        title={`添加到${WEEKDAY_LABELS[selectedIndex]}（${selectedDate.format('M月D日')}）`}
        open={addOpen}
        onCancel={() => {
          setAddOpen(false);
          setKeyword('');
        }}
        footer={null}
        width={520}
      >
        <Input
          allowClear
          autoFocus
          prefix={<SearchOutlined />}
          placeholder="搜索菜名或标签"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {candidates.length === 0 ? (
            <Empty description="没有找到可添加的菜" style={{ marginTop: 24 }} />
          ) : (
            candidates.map((dish) => (
              <div
                key={dish.id}
                onClick={() => handleAdd(dish)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid #f0ebe4',
                  cursor: 'pointer',
                  background: '#fff',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#E8743C')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#f0ebe4')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: '#2D2A26' }}>{dish.name}</span>
                  <span style={{ color: '#999', fontSize: 12, marginLeft: 10 }}>
                    {dish.category} · {dish.cookTimeMin} 分钟
                  </span>
                </div>
                <PriceTag value={calcDishCost(dish, ingredients)} suffix="/份" size="small" />
                <CheckOutlined style={{ color: '#bbb' }} />
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
