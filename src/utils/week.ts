// 每周菜单的日期工具：一周 = 周一 → 周日
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
