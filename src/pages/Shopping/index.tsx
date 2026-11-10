// 采购清单页面（移动端专用路由，PC 端仍用抽屉）
// 顶部返回栏 / 标题全去掉 —— 纯内容区

import { useEffect } from 'react';
import ShoppingListPanel from '@/components/ShoppingListPanel';

export default function Shopping() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', paddingTop: 4 }}>
      <ShoppingListPanel />
    </div>
  );
}
