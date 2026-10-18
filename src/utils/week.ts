// 菜单的日期工具：一周 = 周一 → 周日（不按 dayjs 默认周日开头）
// 页面对外叫「今日菜单」，支持 今日 / 本周 / 本月 三种视图，日期计算都放这里。
// 不依赖 dayjs 全局 locale（项目里没设置 dayjs.locale），手动计算周一

import dayjs, { type Dayjs } from 'dayjs';

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

/** 今天 0 点 */
export function today(): Dayjs {
  return dayjs().startOf('day');
}

/** 该日期所在周的周一 0 点 */
export function startOfWeek(d: Dayjs = today()): Dayjs {
  const daysFromMonday = (d.day() + 6) % 7; // day(): 0=周日 → 转成「距周一天数」
  return d.subtract(daysFromMonday, 'day').startOf('day');
}

/** 该日期所在周的 7 天（周一 → 周日） */
export function getWeekDays(d: Dayjs = today()): Dayjs[] {
  const monday = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => monday.add(i, 'day'));
}

/** 存储用的日期 key：YYYY-MM-DD */
export function dayKey(d: Dayjs): string {
  return d.format('YYYY-MM-DD');
}

/** 任意日期 → 「周一 … 周日」 */
export function weekdayLabel(d: Dayjs): string {
  return WEEKDAY_LABELS[(d.day() + 6) % 7];
}

/** 该日期所在月的 1 号 0 点 */
export function startOfMonth(d: Dayjs = today()): Dayjs {
  return d.startOf('month');
}

/**
 * 月视图用的日历网格：周一开头，包含当月前后补齐的几天（灰显），
 * 行数按当月实际需要的周数来（5 或 6 行），不留多余空行。
 */
export function getMonthGrid(d: Dayjs = today()): Dayjs[] {
  const first = startOfMonth(d);
  const gridStart = startOfWeek(first); // 当月 1 号所在周的周一
  const daysInMonth = first.daysInMonth();
  const offset = (first.day() + 6) % 7; // 1 号是周几（相对周一）
  const rows = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: rows * 7 }, (_, i) => gridStart.add(i, 'day'));
}

/** 两个日期是否在同一个月 */
export function isSameMonth(a: Dayjs, b: Dayjs): boolean {
  return a.year() === b.year() && a.month() === b.month();
}

/** 「10月19日」 */
export function formatMonthDay(d: Dayjs): string {
  return d.format('M月D日');
}
