// 移动端底部导航栏（antd-mobile TabBar + public/svg 下的彩色图标）
// 5 个 tab：首页 / 今日菜单 / 食材库 / 采购清单 / 个人
//
// 图标用的是 iconfont 导出的多色 SVG（放在 public/svg/，直接按 /svg/xxx.svg 访问）。
// 未选中态用 CSS 把它降饱和压淡，选中态恢复全彩并弹一下（动效在 src/index.css 的 .tab-ico-* 里）。

// 只有「移动端 + 非管理员」显示；管理员统一用桌面端布局

import { useEffect, useState } from 'react';
import { TabBar, Badge } from 'antd-mobile';
import { useLocation, useNavigate } from 'react-router-dom';
import { CircleFadingArrowUp } from 'lucide-react';
import { LiquidGlass } from '@sohumsuthar/liquid-glass';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useFamilyStore } from '@/store/useFamilyStore';

/** 胶囊圆角：外层裁切容器负责圆角 + overflow:hidden，强制把 LiquidGlass 的一切 filter 输出裁成圆角 */
const CAPSULE_RADIUS = 56;

/** 页面往下滚超过这个距离，首页 tab 就切成「回到顶部」 */
const BACK_TO_TOP_OFFSET = 160;

/** 「回到顶部」图标：lucide 的 circle-fading-arrow-up，尺寸和普通 tab 图标对齐（26px） */
function BackToTopIcon({ active }: { active?: boolean }) {
  return (
    <span
      style={{
        display: 'flex',
        filter: active
          ? 'drop-shadow(0 3px 6px rgba(232, 116, 60, 0.32))'
          : 'grayscale(1) opacity(0.45)',
        transition: 'filter 240ms ease',
      }}
    >
      <CircleFadingArrowUp size={26} color="#E8743C" strokeWidth={1.8} />
    </span>
  );
}

export default function MobileTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const dishCount = useShoppingStore((s) => s.selectedDishIds.length);
  const familyIncomingCount = useFamilyStore((s) => s.incoming.length + s.incomingTransfers.length);

  // 页面滚动位置：滚下去了就把首页 tab 变成「回到顶部」，滚回顶部再变回来
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > BACK_TO_TOP_OFFSET);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const path = location.pathname;
  const activeKey = path.startsWith('/menu-plan')
    ? '/menu-plan'
    : path.startsWith('/ingredients')
      ? '/ingredients'
      : path.startsWith('/shopping')
        ? '/shopping'
        : path.startsWith('/profile')
          ? '/profile'
          : '/menu';

  /*
    已经在首页并且页面滚下去了：把 activeKey 置空，让第一个 tab 变成可点击的
    「回到顶部」动作。否则 key 与 activeKey 相同，antd-mobile 不会触发 onChange，
    点了没反应。
  */
  const tabActiveKey = scrolled && activeKey === '/menu' ? '' : activeKey;

  // 图标是 public/svg 下的多色 SVG（文件名即英文含义，一一对应）
  const tabs = [
    { key: '/menu', title: '首页', icon: '/svg/home.svg', badge: undefined },
    { key: '/menu-plan', title: '今日菜单', icon: '/svg/calendar.svg', badge: undefined },
    { key: '/ingredients', title: '食材库', icon: '/svg/search.svg', badge: undefined },
    {
      key: '/shopping',
      title: '采购清单',
      icon: '/svg/shopping.svg',
      badge: dishCount > 0 ? <Badge content={dishCount} color="#E8743C" /> : undefined,
    },
    {
      key: '/profile',
      title: '个人',
      icon: '/svg/user.svg',
      badge:
        familyIncomingCount > 0 ? (
          <Badge content={familyIncomingCount} color="#E8743C" />
        ) : undefined,
    },
  ];

  return (
    // 外层裁切容器：唯一职责是 fixed 定位 + 胶囊圆角 + overflow: hidden
    // LiquidGlass 的 backdrop-filter / SVG displacement / box-shadow 等一切 filter 输出
    // 都会被这个父容器强制裁成圆角，彻底绕过 liquid-glass 库自身对圆角的不支持
    <div
      style={{
        position: 'fixed',
        bottom: `calc(0px + env(safe-area-inset-bottom))`,
        left: 12,
        right: 12,
        zIndex: 100,
        borderRadius: CAPSULE_RADIUS,
        overflow: 'hidden',
      }}
    >
      <LiquidGlass
        variant="regular"
        macro
        className="mobile-tabbar"
        style={{
          position: 'relative',
          borderRadius: CAPSULE_RADIUS,
          // 让 LiquidGlass 填满父容器（它原本是 fixed 定位，现在改成 relative 后需要手动撑满）
          inset: 'auto',
          width: '100%',
          height: '100%',
          padding: 0,
          // 库自带的 box-shadow 会投射到父容器圆角外面，关掉，让父容器的 overflow 裁掉它
          boxShadow: 'none',
        }}
        contentStyle={{ padding: '4px 10px' }}
      >
        <TabBar
          activeKey={tabActiveKey}
          onChange={(key) => {
            // 页面已经滚下去了：首页 tab 这时是「回到顶部」，点了先回顶部，不跳页
            if (key === '/menu' && scrolled) {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
            navigate(key);
          }}
          style={
            {
              '--adm-color-primary': '#E8743C',
              // TabBar 自身底色置为透明，露出外层 LiquidGlass 的玻璃效果
              '--adm-color-background': 'transparent',
              background: 'transparent',
              '--height': '56px',
            } as React.CSSProperties
          }
        >
          {tabs.map((t) => {
            // 滚下去后，第一个 tab（首页）临时变成「回到顶部」
            const showBackToTop = t.key === '/menu' && scrolled;
            return (
              <TabBar.Item
                key={t.key}
                icon={(active) => {
                  // 滚下去时这个 tab 已经是「回到顶部」动作，保持高亮提醒可以点
                  const activeLook = active || showBackToTop;
                  return (
                    <span className={activeLook ? 'tab-ico tab-ico-on' : 'tab-ico'}>
                      {showBackToTop ? (
                        <BackToTopIcon active={activeLook} />
                      ) : (
                        <img src={t.icon} alt="" />
                      )}
                    </span>
                  );
                }}
                title={(active) => {
                  const activeLook = active || showBackToTop;
                  return (
                    <span className={activeLook ? 'tab-txt tab-txt-on' : 'tab-txt'}>
                      {showBackToTop ? '回到顶部' : t.title}
                    </span>
                  );
                }}
                badge={t.badge}
              />
            );
          })}
        </TabBar>
      </LiquidGlass>
    </div>
  );
}
