// 移动端底部导航栏（antd-mobile TabBar + lucide-react 图标）
// 5 个 tab：首页 / 每周菜单 / 食材库 / 采购清单 / 个人
// 只有「移动端 + 非管理员」显示；管理员统一用桌面端布局

import { TabBar, Badge } from 'antd-mobile';
import {
  Store,
  Calendar,
  TextSearch,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useFamilyStore } from '@/store/useFamilyStore';

export default function MobileTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const dishCount = useShoppingStore((s) => s.selectedDishIds.length);
  const familyIncomingCount = useFamilyStore((s) => s.incoming.length + s.incomingTransfers.length);

  const path = location.pathname;
  const activeKey = path.startsWith('/weekly')
    ? '/weekly'
    : path.startsWith('/ingredients')
      ? '/ingredients'
      : path.startsWith('/shopping')
        ? '/shopping'
        : path.startsWith('/profile')
          ? '/profile'
          : '/menu';

  // 显式控制图标大小与描边粗细（lucide 图标通过 size / strokeWidth 控制，颜色跟随 currentColor）
  const iconSize = 24;
  const iconStrokeWidth = 1.5;

  return (
    <div
      className="mobile-tabbar"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        maxWidth: '100vw',
        zIndex: 100,
        // 毛玻璃效果：半透明白底 + 高斯模糊，内容从导航栏下滑过时呈朦胧感
        background: 'rgba(255, 255, 255, 0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(45, 42, 38, 0.08)',
        // iPhone 底部安全区
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxSizing: 'border-box',
      }}
    >
      <TabBar
        activeKey={activeKey}
        onChange={(key) => navigate(key)}
        style={
          {
            '--adm-color-primary': '#E8743C',
            // TabBar 自身底色置为透明，露出外层容器的毛玻璃
            '--adm-color-background': 'transparent',
            background: 'transparent',
            '--height': '56px',
          } as React.CSSProperties
        }
      >
        <TabBar.Item
          key="/menu"
          icon={<Store size={iconSize} strokeWidth={iconStrokeWidth} />}
          title="首页"
        />
        <TabBar.Item
          key="/weekly"
          icon={<Calendar size={iconSize} strokeWidth={iconStrokeWidth} />}
          title="每周菜单"
        />
        <TabBar.Item
          key="/ingredients"
          icon={<TextSearch size={iconSize} strokeWidth={iconStrokeWidth} />}
          title="食材库"
        />
        <TabBar.Item
          key="/shopping"
          icon={<ShoppingCart size={iconSize} strokeWidth={iconStrokeWidth} />}
          title="采购清单"
          badge={dishCount > 0 ? <Badge content={dishCount} color="#E8743C" /> : undefined}
        />
        <TabBar.Item
          key="/profile"
          icon={<UserRound size={iconSize} strokeWidth={iconStrokeWidth} />}
          title="个人"
          badge={
            familyIncomingCount > 0 ? (
              <Badge content={familyIncomingCount} color="#E8743C" />
            ) : undefined
          }
        />
      </TabBar>
    </div>
  );
}
