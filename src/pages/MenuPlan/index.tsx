// 菜单页面（对外叫「今日菜单」）
//
// 三种视图：
//   今日（默认）→ 今天的日期信息 + 今天的菜
//   本周       → 周一 ~ 周日 7 天条，点任意一天看/改，可←→翻周
//   本月       → 整月日历，每天显示几道菜，点任意一天看/改，可←→翻月
//
// 三种视图共用下面同一块「选中日期的详情 + 菜品列表」，只是上面的选择器不同，
// 所以添加/删除/清空的逻辑完全复用，没有三份代码。
//
// 数据存在 weekly_menus 表（日期 key → 菜品 id 列表），是按日期存的，
// 所以「今日 / 本周 / 本月」只是三种看法，底下是同一份数据。表名沿用 weekly_menus 未改。

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Switch,
  Tag,
  Tooltip,
  Typography,
  App as AntApp,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  DeleteOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  LeftOutlined,
  RightOutlined,
  FileTextOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { Link } from 'react-router-dom';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { useWeeklyStore } from '@/store/useWeeklyStore';
import { useFamilyStore } from '@/store/useFamilyStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import FamilyMenuHistory from '@/components/FamilyMenuHistory';
import { calcDishCost } from '@/utils/price';
import {
  WEEKDAY_LABELS,
  getWeekDays,
  getMonthGrid,
  startOfMonth,
  isSameMonth,
  weekdayLabel,
  formatMonthDay,
  dayKey,
  today,
} from '@/utils/week';
import type { Dish } from '@/types';
import PriceTag from '@/components/PriceTag';

const { Text } = Typography;

type ViewMode = 'day' | 'week' | 'month';

/** 一周 7 个格子的宽度：手机横滑，桌面平分 */
const WEEK_STRIP_STYLE: CSSProperties = {
  display: 'flex',
  gap: 10,
  overflowX: 'auto',
  paddingBottom: 4,
  marginBottom: 20,
};

function dayBoxStyle(selected: boolean, isToday: boolean): CSSProperties {
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

/** 周/月视图顶部的翻页条 */
const rangeBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 12,
  background: '#fff',
  border: '1px solid #f0ebe4',
  borderRadius: 12,
  padding: '8px 12px',
};

/** 月视图日历：7 列，周一开头 */
function gridStyle(isMobile: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: isMobile ? 4 : 6,
  };
}

function monthCellStyle(
  selected: boolean,
  isToday: boolean,
  inMonth: boolean,
  isMobile: boolean
): CSSProperties {
  return {
    height: isMobile ? 62 : 88,
    borderRadius: 10,
    border: `1.5px solid ${selected ? '#E8743C' : isToday ? '#F3C9AF' : '#f0ebe4'}`,
    background: selected ? '#FFF6EC' : '#fff',
    padding: isMobile ? '4px 4px 2px' : '6px 8px',
    cursor: 'pointer',
    overflow: 'hidden',
    opacity: inMonth ? 1 : 0.42,
    transition: 'all 0.15s',
  };
}

export default function MenuPlan() {
  const { message } = AntApp.useApp();
  const isMobile = useIsMobile();
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  const personalPlans = useWeeklyStore((s) => s.plans);
  const familyPlans = useWeeklyStore((s) => s.familyPlans);
  const mode = useWeeklyStore((s) => s.mode);
  const setMode = useWeeklyStore((s) => s.setMode);
  const family = useFamilyStore((s) => s.family);
  const myRole = useFamilyStore((s) => s.myRole);
  const myPermission = useFamilyStore((s) => s.myPermission);
  const addDishToDay = useWeeklyStore((s) => s.addDishToDay);
  const removeDishFromDay = useWeeklyStore((s) => s.removeDishFromDay);
  const clearDay = useWeeklyStore((s) => s.clearDay);

  const familyId = family?.id ?? null;
  const familyMode = mode === 'family' && Boolean(familyId);
  /** 家庭模式下我是否为只读（非管理员且无修改权限） */
  const familyReadOnly = familyMode && myRole !== 'admin' && myPermission !== 'edit';
  /** 当前展示/编辑的菜单：家庭模式用共享菜单，个人模式用私有菜单 */
  const plans = familyMode ? familyPlans : personalPlans;

  // 绑定被解除时自动切回个人菜单
  useEffect(() => {
    if (mode === 'family' && !familyId) setMode('personal');
  }, [mode, familyId, setMode]);

  // 今天固定取一次（页面开着跨过午夜也不跳，刷新即更新）
  const todayDate = useMemo<Dayjs>(() => today(), []);
  const todayKey = dayKey(todayDate);

  // 周/月视图各自有「翻到哪一页」的锚点，互不影响
  const [weekAnchor, setWeekAnchor] = useState<Dayjs>(todayDate);
  // 月锚点固定用当月 1 号：否则 1月31 +1个月 → 2月28，再翻一次就从 28 号开始漂了
  const [monthAnchor, setMonthAnchor] = useState<Dayjs>(() => startOfMonth(todayDate));
  const days = useMemo<Dayjs[]>(() => getWeekDays(weekAnchor), [weekAnchor]);
  const monthGrid = useMemo<Dayjs[]>(() => getMonthGrid(monthAnchor), [monthAnchor]);
  // 只用来判断「当前翻到的这一周是不是本周」
  const todayWeekDays = useMemo<Dayjs[]>(() => getWeekDays(todayDate), [todayDate]);

  const isThisWeek = dayKey(days[0]) === dayKey(todayWeekDays[0]);
  const isThisMonth = isSameMonth(monthAnchor, todayDate);

  // 默认进「今日」视图，选中今天
  const [view, setView] = useState<ViewMode>('day');
  const [selectedDay, setSelectedDay] = useState<string>(todayKey);
  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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

  const selectedDate = dayjs(selectedDay);
  const selectedDishes = dishesOf(selectedDay);
  const selectedIsToday = selectedDay === todayKey;

  // 今日视图的三组统计：今天几道菜 / 预估花费 / 预计耗时（参考稿的概览卡用）
  const todayDishes = dishesOf(todayKey);
  const todayCost = todayDishes.reduce((sum, d) => sum + calcDishCost(d, ingredients), 0);
  const todayMinutes = todayDishes.reduce((sum, d) => sum + (d.cookTimeMin ?? 0), 0);

  /** 周/月视图标题里的统计：跟着当前翻到的那一页 */
  const viewDishCount = days.reduce((sum, d) => sum + dishesOf(dayKey(d)).length, 0);
  const viewDaysWithPlan = monthGrid.filter(
    (d) => isSameMonth(d, monthAnchor) && dishesOf(dayKey(d)).length > 0
  ).length;

  const switchView = (v: ViewMode) => {
    setView(v);
    // 切到周/月视图时，锚点对到当前选中的那天（保证它可见）；今日视图固定看今天
    if (v === 'day') {
      setSelectedDay(todayKey);
    } else if (v === 'week') {
      setWeekAnchor(selectedDate);
    } else {
      setMonthAnchor(startOfMonth(selectedDate));
    }
  };

  /** 翻周/翻月：delta = -1 上一页 / +1 下一页；翻完后选中新范围的第一天，避免上面翻页、下面还停在旧日期 */
  const shiftWeek = (delta: number) => {
    const next = weekAnchor.add(delta, 'week');
    setWeekAnchor(next);
    setSelectedDay(dayKey(getWeekDays(next)[0]));
  };

  const shiftMonth = (delta: number) => {
    const next = startOfMonth(monthAnchor).add(delta, 'month');
    setMonthAnchor(next);
    setSelectedDay(dayKey(next));
  };

  const backToToday = () => {
    setWeekAnchor(todayDate);
    setMonthAnchor(startOfMonth(todayDate));
    setSelectedDay(todayKey);
  };

  const handleAdd = async (dish: Dish) => {
    await addDishToDay(selectedDay, dish.id);
    message.success(`已把「${dish.name}」加进 ${formatMonthDay(selectedDate)} 的菜单`);
  };

  const handleRemove = async (dish: Dish) => {
    await removeDishFromDay(selectedDay, dish.id);
    message.success(`已移除「${dish.name}」`);
  };

  const handleClear = async () => {
    await clearDay(selectedDay);
    message.success('已清空这一天的菜单');
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

  /**
   * 标题下面那行日期。
   * 全页的日期只在这里报一次 —— 原来标题下面、今日概览卡、菜品列表标题三处都在写「10月19日」，
   * 手机一屏里能同时看到三个，纯属重复。
   * 周/月视图这里给范围，具体选中的那天交给下面的列表标题交代。
   */
  const dateLine =
    view === 'week'
      ? `${formatMonthDay(days[0])} ~ ${formatMonthDay(days[6])}`
      : view === 'month'
        ? monthAnchor.format('YYYY年M月')
        : `${formatMonthDay(selectedDate)} · ${weekdayLabel(selectedDate)}`;

  /** 家庭模式的说明，只在开着共享菜单时出现 */
  const familyHint = familyMode
    ? familyReadOnly
      ? `「${family?.adminName}的家庭」共享菜单 · 仅查看`
      : `「${family?.adminName}的家庭」共享菜单`
    : '';

  /** 周视图 / 月视图顶部那条：← 范围 → + 回到本周/本月 */
  const rangeBar = (() => {
    if (view === 'week') {
      return (
        <div style={rangeBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              size="small"
              icon={<LeftOutlined />}
              onClick={() => shiftWeek(-1)}
              title="上一周"
            />
            <Text style={{ fontSize: 15, fontWeight: 600, color: '#2D2A26' }}>
              {formatMonthDay(days[0])} ~ {formatMonthDay(days[6])}
            </Text>
            <Button
              size="small"
              icon={<RightOutlined />}
              onClick={() => shiftWeek(1)}
              title="下一周"
            />
            {isThisWeek ? (
              <Tag color="orange" style={{ margin: 0 }}>
                本周
              </Tag>
            ) : (
              <Button size="small" type="link" onClick={backToToday} style={{ padding: 0 }}>
                回到本周
              </Button>
            )}
          </div>
          <span style={{ color: '#888', fontSize: 13 }}>
            这一周已安排 {viewDishCount} 道菜
          </span>
        </div>
      );
    }
    if (view === 'month') {
      return (
        <div style={rangeBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              size="small"
              icon={<LeftOutlined />}
              onClick={() => shiftMonth(-1)}
              title="上一月"
            />
            <Text style={{ fontSize: 15, fontWeight: 600, color: '#2D2A26' }}>
              {monthAnchor.format('YYYY年M月')}
            </Text>
            <Button
              size="small"
              icon={<RightOutlined />}
              onClick={() => shiftMonth(1)}
              title="下一月"
            />
            {isThisMonth ? (
              <Tag color="orange" style={{ margin: 0 }}>
                本月
              </Tag>
            ) : (
              <Button size="small" type="link" onClick={backToToday} style={{ padding: 0 }}>
                回到本月
              </Button>
            )}
          </div>
          <span style={{ color: '#888', fontSize: 13 }}>{viewDaysWithPlan} 天有安排</span>
        </div>
      );
    }
    return null;
  })();

  // —— 三视图共用的下半部分：列表标题行 + 菜品列表 ——
  /*
    列表标题：
    今日视图写「今日菜品」（上面那行已经报过今天了，这里不要再报一遍日期）；
    周/月视图写具体那一天，因为上面显示的是整个范围。
  */
  const listTitle =
    view === 'day' ? '今日菜品' : `${formatMonthDay(selectedDate)} · ${weekdayLabel(selectedDate)}`;

  const dayDetail = (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          margin: '4px 0 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <Text style={{ fontSize: 16, fontWeight: 600, color: '#2D2A26' }}>{listTitle}</Text>
          <span style={{ color: '#8C7C6C', fontSize: 12, whiteSpace: 'nowrap' }}>
            共 {selectedDishes.length} 道
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {!selectedIsToday && (
            <Button size="small" type="link" onClick={backToToday} style={{ padding: 0 }}>
              回到今天
            </Button>
          )}
          {!familyReadOnly && (
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setAddOpen(true)}
            >
              添加
            </Button>
          )}
        </div>
      </div>

      {selectedDishes.length === 0 ? (
        <Empty
          description={
            familyReadOnly
              ? '这一天还没安排（你只有查看权限）'
              : selectedIsToday
                ? '今天还没想好吃什么，点「添加」安排上'
                : '这一天还没安排，点「添加」加两道'
          }
          style={{ marginTop: 32 }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {selectedDishes.map((dish) => (
            <div
              key={dish.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: '#fff',
                border: '1px solid #f0ebe4',
                borderRadius: 16,
                padding: 12,
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
                    loading="lazy"
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
                <div style={{ color: '#8C7C6C', fontSize: 12, marginTop: 4 }}>
                  {dish.category} · {dish.cookTimeMin} 分钟 · 难度 {dish.difficulty}/3
                </div>
              </div>
              <PriceTag value={calcDishCost(dish, ingredients)} size="small" />
              {!familyReadOnly && (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemove(dish)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 清空整天的入口挪到列表底部，标题那一行只留「共 N 道 + 添加」 */}
      {!familyReadOnly && selectedDishes.length > 0 && (
        <Popconfirm
          title={`清空 ${formatMonthDay(selectedDate)} 的菜单？`}
          okText="清空"
          cancelText="取消"
          onConfirm={handleClear}
        >
          <Button type="text" danger size="small" style={{ marginTop: 8 }}>
            清空这一天
          </Button>
        </Popconfirm>
      )}
    </>
  );

  return (
    <div>
      {/*
        顶部：标题 + 日期（日期的全页唯一一处）+ 个人/家庭切换，下面接三段视图切换。
        今日视图接下来还会渲染一张「今日概览」卡（白底、三列统计），但它**不**再写日期。
        周/月视图切换到别的视图后那张卡自动消失。
      */}
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 24, fontWeight: 700, color: '#2A2119' }}>今日菜单</Text>
            <div style={{ color: '#8C7C6C', marginTop: 4, fontSize: 13 }}>
              {dateLine}
              {familyHint && ` · ${familyHint}`}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {familyReadOnly && <Tag>仅查看</Tag>}
            {familyMode && (
              <Button size="small" onClick={() => setHistoryOpen(true)}>
                历史记录
              </Button>
            )}
            <Tooltip
              title={
                family
                  ? familyMode
                    ? `正在查看「${family.adminName}的家庭」共享菜单，点一下切回个人菜单`
                    : `切到「${family.adminName}的家庭」共享菜单（和家人看到同一份）`
                  : '先在右上角头像菜单「我的家庭」里创建或加入家庭'
              }
            >
              <Switch
                checked={familyMode}
                disabled={!family}
                checkedChildren="家庭"
                unCheckedChildren="个人"
                onChange={(v) => setMode(v ? 'family' : 'personal')}
              />
            </Tooltip>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <Segmented
            value={view}
            onChange={(v) => switchView(v as ViewMode)}
            block={isMobile}
            options={[
              { label: '今日', value: 'day' },
              { label: '本周', value: 'week' },
              { label: '本月', value: 'month' },
            ]}
          />
        </div>
      </div>

      {/*
        —— 今日视图：今日概览卡（参考稿样式：白底圆角 + 三列统计 + 中间竖分隔线）——
        放回这三个统计（今天几道菜 / 预估花费 / 预计耗时）——
        参考稿就是这样的：顶部一个汇总卡，下接菜品列表，不是冗余。
        这里**不**再写日期，全页日期只在标题下面那行报一次。
      */}
      {view === 'day' && (
        <div
          style={{
            background: '#fff',
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 2px 12px rgba(120, 102, 84, 0.06)',
          }}
        >
          {/* 列 1：今日菜品（参考稿图标底色 #FBEDE3） */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 13,
                background: '#FBEDE3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#E8743C',
                fontSize: 18,
              }}
            >
              <FileTextOutlined />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2A2119' }}>
              {todayDishes.length} 道
            </div>
            <div style={{ fontSize: 12, color: '#8C7C6C' }}>今日菜品</div>
          </div>

          {/* 分隔线 1 */}
          <div style={{ width: 1, height: 40, background: '#F0EBE4' }} />

          {/* 列 2：预估花费（参考稿图标底色 #FAF1E2） */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 13,
                background: '#FAF1E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#C08A2E',
                fontSize: 18,
              }}
            >
              <WalletOutlined />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2A2119' }}>
              <PriceTag value={todayCost} size="small" />
            </div>
            <div style={{ fontSize: 12, color: '#8C7C6C' }}>预估花费</div>
          </div>

          {/* 分隔线 2 */}
          <div style={{ width: 1, height: 40, background: '#F0EBE4' }} />

          {/* 列 3：预计耗时（参考稿图标底色 #EDF2E6） */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 13,
                background: '#EDF2E6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6B8B5C',
                fontSize: 18,
              }}
            >
              <ClockCircleOutlined />
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#2A2119' }}>
              {todayMinutes}
              <span style={{ fontSize: 13, fontWeight: 500 }}> 分</span>
            </div>
            <div style={{ fontSize: 12, color: '#8C7C6C' }}>预计耗时</div>
          </div>
        </div>
      )}

      {/* 周/月视图的翻页条（今日视图不显示） */}
      {rangeBar}

      {/* —— 周视图：周一 ~ 周日 —— */}
      {view === 'week' && (
        <div style={WEEK_STRIP_STYLE}>
          {days.map((d, i) => {
            const key = dayKey(d);
            const isToday = key === todayKey;
            const selected = key === selectedDay;
            const dayDishes = dishesOf(key);
            return (
              <div key={key} onClick={() => setSelectedDay(key)} style={dayBoxStyle(selected, isToday)}>
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
      )}

      {/* —— 月视图：整月日历 —— */}
      {view === 'month' && (
        <div style={{ marginBottom: 20 }}>
          <div style={gridStyle(isMobile)}>
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#999',
                  paddingBottom: 4,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={gridStyle(isMobile)}>
            {monthGrid.map((d) => {
              const key = dayKey(d);
              const isToday = key === todayKey;
              const selected = key === selectedDay;
              const inMonth = isSameMonth(d, todayDate);
              const dayDishes = dishesOf(key);
              return (
                <div
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  style={monthCellStyle(selected, isToday, inMonth, isMobile)}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: isMobile ? 12 : 13,
                        fontWeight: isToday ? 700 : 500,
                        color: isToday ? '#fff' : '#2D2A26',
                        background: isToday ? '#E8743C' : 'transparent',
                        borderRadius: '50%',
                        width: isMobile ? 18 : 20,
                        height: isMobile ? 18 : 20,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {d.date()}
                    </span>
                    {dayDishes.length > 0 && (
                      <span style={{ fontSize: 10, color: '#E8743C' }}>{dayDishes.length} 道</span>
                    )}
                  </div>
                  {dayDishes.length > 0 && !isMobile && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: '#666',
                        background: '#FAF7F2',
                        borderRadius: 5,
                        padding: '2px 4px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={dayDishes.map((x) => x.name).join('、')}
                    >
                      {dayDishes[0].name}
                    </div>
                  )}
                  {dayDishes.length === 0 && (
                    <div style={{ marginTop: isMobile ? 2 : 4 }}>
                      <ClockCircleOutlined style={{ fontSize: 10, color: '#e6e0d8' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 选中那天的详情（三视图共用） */}
      {dayDetail}

      {/* 添加菜品弹窗 */}
      <Modal
        title={`添加到 ${formatMonthDay(selectedDate)}（${weekdayLabel(selectedDate)}）`}
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

      {/* 家庭菜单修改历史 */}
      <FamilyMenuHistory open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
