// 超级管理员专属：起始页（仪表盘）
// 统计当前菜品数、食材数、用户数，快速概览后台状态

import { useEffect, useState } from 'react';
import { StatisticCard } from '@ant-design/pro-components';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { listUsers, type UserRow } from '@/lib/userAdmin';
import { latestLoginMap } from '@/lib/clientInfo';

export default function AdminHome() {
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loginCount, setLoginCount] = useState(0);

  useEffect(() => {
    listUsers().then(setUsers).catch(() => { });
    latestLoginMap().then((m) => setLoginCount(m.size)).catch(() => { });
  }, []);

  const disabled = users.filter((u) => u.disabled).length;

  return (
    <StatisticCard.Group direction="row">
      <StatisticCard statistic={{ title: '菜品总数', value: dishes.length }} />
      <StatisticCard statistic={{ title: '食材总数', value: ingredients.length }} />
      <StatisticCard statistic={{ title: '用户总数', value: users.length, suffix: disabled > 0 ? `（停用 ${disabled}）` : undefined }} />
      <StatisticCard statistic={{ title: '活跃登录记录', value: loginCount }} />
    </StatisticCard.Group>
  );
}
