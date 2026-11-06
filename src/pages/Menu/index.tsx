import { useEffect, useMemo, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { Input, Segmented, Empty, Row, Col, Switch, Space, Spin, Tag, App as AntApp } from 'antd';
import { Dropdown, Tabs, PullToRefresh, Toast } from 'antd-mobile';
import { CaretDownFilled, SearchOutlined } from '@ant-design/icons';
import {
  CakeSlice,
  ChefHat,
  Citrus,
  CookingPot,
  Dumbbell,
  Flame,
  FlameKindling,
  Leaf,
  MapPin,
  MoonStar,
  PartyPopper,
  Pizza,
  Salad,
  Sandwich,
  Snowflake,
  Soup,
  Sprout,
  Store,
  UtensilsCrossed,
  Wheat,
  Wine,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { calcDishCost } from '@/utils/price';
import DishCard from '@/components/DishCard';
import DishEditor from '@/components/DishEditor';
import DishManageTable from '@/components/DishManageTable';
import { useIsAdmin } from '@/store/useAuthStore';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useIsPadPortrait } from '@/hooks/useIsPadPortrait';
import type { Dish, DishCategory } from '@/types';
import { TAG_GROUPS } from '@/types';

// 顶部标题区（「今天想吃点啥？」+ 收录数量）已整块删除，这里原本解构的 Text 也不再需要。

/**
 * 首页 Tab / PC 菜单的菜系顺序（两端共用这一份）。
 * 只按地域流派分 7 类（见 types/index.ts 的 DishCategory），一道菜必须且只能归其中一个。
 * 归不了流派的 → 家常；实在没地方放的 → 其他。
 */
const categories: Array<DishCategory | '全部'> = [
  '全部',
  '家常',
  '川菜',
  '粤菜',
  '湘菜',
  '鲁菜',
  '江浙',
  '其他',
];

/**
 * 每个属性标签配一个线稿图标（lucide-react），移动端圆圈和「更多」面板里都带上，
 * 比纯文字更好认。标签清单本身来自 types/index.ts 的 TAG_GROUPS。
 */
const TAG_ICONS: Record<string, LucideIcon> = {
  // 口味风味
  清淡: Leaf,
  重口: Flame,
  辛辣: FlameKindling,
  酸甜: Citrus,
  // 营养健康
  减脂: Salad,
  高蛋白: Dumbbell,
  低碳水: Wheat,
  暖胃: CookingPot,
  // 做法形态
  红烧: ChefHat,
  凉菜: Snowflake,
  汤羹: Soup,
  烘焙: CakeSlice,
  主食: Sandwich,
  // 场景节奏
  快手: Zap,
  下饭: UtensilsCrossed,
  下酒: Wine,
  宴请: PartyPopper,
  // 饮食偏好
  素食: Sprout,
  清真: MoonStar,
  西餐: Pizza,
  陕味: MapPin,
  // 品牌系列
  大碗先生: Store,
};

/**
 * 移动端默认在一行里先露出的 6 个标签（其余收进「更多」面板）。
 * 特意不按分组顺序取前 6 个 —— 优先露出大家最常点的几个。
 */
const MOBILE_PREVIEW_TAGS = ['减脂', '快手', '下饭', '清淡', '重口', '素食'];
const MOBILE_TAG_PREVIEW = MOBILE_PREVIEW_TAGS.length;

const PAGE_SIZE = 8;

export default function Menu() {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  // 订阅当前平台：切换平台后卡片成本要立刻跟着变
  usePriceStore((s) => s.platform);
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const isPadPortrait = useIsPadPortrait();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<DishCategory | '全部'>('全部');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [favOnly, setFavOnly] = useState(false);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Dish | null>(null);
  // 菜单管理表格的选中行 id（单选），保存成功后清空，跟食材库管理一致
  const [selectedRowKey, setSelectedRowKey] = useState<string | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement>(null);

  /*
    PC 端 + 管理员：这里换成「菜单管理」表格，一行一道菜、字段摊开，
    选中一行后点工具栏「编辑菜品」打开编辑器（删除也在编辑器里），跟食材库管理一致。
    卡片墙适合浏览挑选，不适合逐条核对维护 —— 管理员进来是干活的，不是逛的。

    其他情况（移动端 / 非管理员）继续用原来的卡片墙，一行代码都不走这条分支。
  */
  const showManageTable = isAdmin && !isMobile;

  const toggleTag = (t: string) =>
    setActiveTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  /** 移动端属性标签：小圆圈里放图标，圆圈下方写汉字，选中时圆圈变实心橙 */
  const renderCircleTag = (t: string) => {
    const on = activeTags.includes(t);
    const Icon = TAG_ICONS[t] ?? UtensilsCrossed;
    return (
      <button
        key={t}
        type="button"
        aria-pressed={on}
        onClick={() => toggleTag(t)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '2px 0',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: on ? '#E8743C' : '#FAF7F2',
            border: on ? '1px solid #E8743C' : '1px solid #EFE7DC',
            color: on ? '#fff' : '#8A7F72',
            transition: 'background-color 180ms ease, border-color 180ms ease, color 180ms ease',
          }}
        >
          <Icon size={20} strokeWidth={2} />
        </span>
        <span
          style={{
            fontSize: 11,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            color: on ? '#E8743C' : '#6B6259',
          }}
        >
          {t}
        </span>
      </button>
    );
  };

  /** 移动端默认露出的 6 个标签之外，还有几个处于选中状态（用来给倒三角入口提个醒） */
  const hiddenSelectedCount = activeTags.filter((t) => !MOBILE_PREVIEW_TAGS.includes(t)).length;

  /*
    移动端左右滑动切换分类：左滑看下一个、右滑看上一个。
    只在水平位移明显大于垂直位移时触发，避免跟上下滚动、下拉刷新抢手势。
  */
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleSwipeStart = (e: TouchEvent) => {
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleSwipeEnd = (e: TouchEvent) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!isMobile || !start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = categories.indexOf(category);
    if (idx < 0) return;
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= categories.length) return;
    setCategory(categories[nextIdx]);
  };

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return dishes.filter((d) => {
      if (category !== '全部' && d.category !== category) return false;
      // 属性 chips：多选时是「或」—— 只要菜挂上任意一个选中的属性就算命中
      if (activeTags.length > 0 && !d.tags.some((t) => activeTags.includes(t))) return false;
      if (favOnly && !d.favorite) return false;
      if (k) {
        const matchName = d.name.toLowerCase().includes(k);
        const matchTag = d.tags.some((t) => t.toLowerCase().includes(k));
        if (!matchName && !matchTag) return false;
      }
      return true;
    });
  }, [dishes, keyword, category, activeTags, favOnly]);

  // 筛选条件变了 → 把已加载的页数重置回 PAGE_SIZE
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [keyword, category, activeTags, favOnly]);

  // 滚到底（sentinel 进入视口）→ 加载下一页
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setDisplayCount((c) => {
            if (c >= filtered.length) return c;
            return c + PAGE_SIZE;
          });
        }
      },
      { rootMargin: '200px 0px' } // 距离底部 200px 就触发，体验更顺
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, keyword, category, favOnly]);

  const visible = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;
  const isAllLoaded = !hasMore && filtered.length > 0;

  /**
   * 下拉刷新：重新从云端拉菜品和食材库。
   * 场景是「别人在别的手机上加了菜 / 改了食材价格，我这边还是旧的」，
   * 首页数据只在进页面时拉一次，这里给个手动触发的入口。
   */
  const handleRefresh = async () => {
    const results = await Promise.allSettled([
      useDishStore.getState().load(),
      useIngredientStore.getState().load(),
    ]);
    const failed = results.some((r) => r.status === 'rejected');
    if (failed) {
      Toast.show({ content: '刷新失败，稍后再试' });
    } else {
      Toast.show({ content: '已更新' });
    }
  };

  const content = (
    <div>
      {/*
        原来这里有一块「今天想吃点啥？」+「收录 N 道菜 ｜ 成本说明」的标题区，
        现在整个删掉了 —— 桌面端也不用再显示这两行字。

        这块里原本还带着管理员的「添加菜品」按钮（它是全页唯一的添加入口），
        现在由 DishManageTable 右上角的那个按钮承担，所以删掉这块不会让管理员没法加菜。
      */}

      {/*
        移动端：logo + 搜索框 + 标签栏常驻吸顶（一进页面就贴在顶部，滚动时不动），
        毛玻璃背景；搜索框靠右，左侧是「我是大厨」logo。
        桌面端：保持原有布局不变。

        ⚠️ 管理员桌面端（showManageTable）整块跳过：
        下面 DishManageTable 自带搜索框 + 分类筛选列 + 「添加菜品」按钮，
        这里再来一套搜索框和分类 tab 就是重复两遍，而且分类筛选在表格里是列筛选，
        比 tab 切换更直观。两边都有会让管理员不知道该用哪个。
      */}
      {!showManageTable && (
        <div
          style={
            isMobile
              ? {
                position: 'sticky',
                top: 0,
                zIndex: 20,
                // 负外边距抵消内容区的上下/左右内边距，让吸顶栏从屏幕最顶端开始、横贯全屏。
                // 顶部连同 AppLayout 给状态栏留出的那部分一起抵消掉，
                // 这样这层渐变是直接画到状态栏底下的，跟它连成一片。
                // 栏内的 padding 仍然保留 env(safe-area-inset-top)，搜索框不会被状态栏压住。
                marginTop: 'calc(-16px - env(safe-area-inset-top))',
                marginLeft: -12,
                marginRight: -12,
                marginBottom: 12,
                padding: 'calc(10px + env(safe-area-inset-top)) 12px 10px',
                /*
                  从左上角（135deg）铺一层很淡的品牌橙渐变，右下角收干净，和下面的卡片列表自然衔接。
                  多层背景里写在前面的在上层，所以这层渐变是盖在毛玻璃底色之上的，
                  底色本身半透明，渐变也就跟着很淡，不会糊住搜索框。
                */
                background:
                  'linear-gradient(135deg, rgba(232, 116, 60, 0.16) 0%, rgba(255, 179, 122, 0.08) 40%, rgba(232, 116, 60, 0.02) 70%, rgba(232, 116, 60, 0) 100%), rgba(250, 247, 242, 0.82)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(45, 42, 38, 0.06)',
              }
              : { margin: '20px 0 16px' }
          }
        >
          <div
            style={{
              display: 'flex',
              justifyContent: isMobile ? 'flex-start' : 'space-between',
              alignItems: 'center',
              // 只保留同一行内的间距（搜索框 ↔ 收藏按钮）。
              // 这个容器是 flexWrap: wrap，分类标签行会换到第二行，
              // 写 gap: 12 的话它会同时变成行间距，再叠上下面的 marginTop，中间就空出一大块。
              columnGap: 12,
              rowGap: 0,
              flexWrap: 'wrap',
            }}
          >
            {/*
              移动端：搜索框改成「假输入框」，点一下跳到独立的搜索页（/search）。
              真输入框留在这会让输入时列表跟着重排，而且小屏上键盘会挡住半屏；
              独立搜索页有更大的结果区域，也方便复用给菜单/采购清单的「添加」。
            */}
            {isMobile ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate('/search')}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid #e3ddd4',
                  background: '#fff',
                  color: '#b8b2aa',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                <SearchOutlined style={{ fontSize: 13 }} />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  搜菜名或标签（如：番茄、汤、快手）
                </span>
              </div>
            ) : (
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="搜菜名或标签（如：番茄、汤、快手）"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ maxWidth: 320 }}
              />
            )}
            {/*
              收藏入口已从首页移除，统一收到「个人」页面里
              （个人 → 我的收藏 → 独立的收藏列表页）。
            */}
            {/* 移动端：分类用 antd-mobile Tabs，横向滚动，点击后选中项自动滚入视野；桌面端保持 Segmented 不变 */}
            {isMobile ? (
              <div style={{ flex: '0 0 100%', marginTop: 4, minWidth: 0 }}>
                <Tabs
                  className="menu-tabs-mobile"
                  activeKey={category}
                  onChange={(key) => setCategory(key as DishCategory | '全部')}
                  stretch={false}
                  style={
                    {
                      '--title-font-size': '15px',
                      '--active-line-color': '#E8743C',
                      '--active-title-color': '#E8743C',
                    } as CSSProperties
                  }
                >
                  {categories.map((c) => (
                    <Tabs.Tab key={c} title={c} />
                  ))}
                </Tabs>
              </div>
            ) : (
              <div
                style={{
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  WebkitOverflowScrolling: 'touch',
                  maxWidth: '100%',
                }}
              >
                <Space size={8} style={{ display: 'inline-flex', flexWrap: 'nowrap', paddingBottom: 4 }}>
                  <Segmented
                    options={categories}
                    value={category}
                    onChange={(v) => setCategory(v as DishCategory | '全部')}
                  />
                  <Switch
                    checked={favOnly}
                    onChange={setFavOnly}
                    checkedChildren="我的收藏"
                    unCheckedChildren="全部菜品"
                  />
                </Space>
              </div>
            )}
            {/*
              属性筛选 chips（减脂/快手/下饭…）：可多选，和上面的菜系 Tab 组合过滤。
              移动端默认一行露出 6 个带图标的圆圈，剩下的收进「更多」下拉里；
              PC 保持原来的 CheckableTag 平铺。
            */}
            {isMobile ? (
              <div
                style={{
                  flex: '0 0 100%',
                  marginTop: 6,
                  position: 'relative',
                }}
              >
                {/* 标签区：和「更多」面板一样等分整行 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${MOBILE_TAG_PREVIEW}, 1fr)`,
                    alignItems: 'center',
                  }}
                >
                  {MOBILE_PREVIEW_TAGS.map((t) => renderCircleTag(t))}
                </div>
                {/*
                  展开入口：不占布局位置，是一个实心倒三角，放在六个圆圈的水平中心、行底部，
                  点它弹出全部标签。
                */}
                <div
                  className="menu-tag-more"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: -8,
                    transform: 'translateX(-50%)',
                    zIndex: 2,
                  }}
                >
                  <Dropdown closeOnMaskClick>
                    <Dropdown.Item
                      key="more"
                      arrowIcon={null}
                      highlight={hiddenSelectedCount > 0}
                      title={<CaretDownFilled style={{ fontSize: 12 }} />}
                    >
                      {/* 全部标签按分组展示，每组一个小标题，方便快速定位 */}
                      <div
                        style={{
                          padding: '12px 12px 16px',
                          maxHeight: '60vh',
                          overflowY: 'auto',
                        }}
                      >
                        {TAG_GROUPS.map((group) => (
                          <div key={group.name} style={{ marginBottom: 14 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#5c554e',
                                margin: '0 2px 10px',
                                letterSpacing: 0.4,
                              }}
                            >
                              {group.name}
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(5, 1fr)',
                                gap: '10px 4px',
                              }}
                            >
                              {group.tags.map((t) => renderCircleTag(t))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Dropdown.Item>
                  </Dropdown>
                </div>
              </div>
            ) : (
              <div
                style={{
                  flex: '0 0 100%',
                  marginTop: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {TAG_GROUPS.map((group) => (
                  <div
                    key={group.name}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                  >
                    <span
                      style={{
                        width: 56,
                        flexShrink: 0,
                        fontSize: 12,
                        color: '#a9a29a',
                      }}
                    >
                      {group.name}
                    </span>
                    {group.tags.map((t) => {
                      const on = activeTags.includes(t);
                      return (
                        <Tag.CheckableTag
                          key={t}
                          checked={on}
                          onChange={() => toggleTag(t)}
                          style={{ fontSize: 14, padding: '2px 10px' }}
                        >
                          {t}
                        </Tag.CheckableTag>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 结果区（移动端左右滑动切换分类的手势落在这里，不干扰上方吸顶筛选栏） */}
      <div
        onTouchStart={isMobile ? handleSwipeStart : undefined}
        onTouchEnd={isMobile ? handleSwipeEnd : undefined}
      >
        {showManageTable ? (
          <div className="menu-manage-table">
            <DishManageTable
              dishes={filtered}
              ingredients={ingredients}
              selectedRowKey={selectedRowKey}
              onSelectedRowKeyChange={setSelectedRowKey}
              onCreate={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
              onEdit={(d) => {
                setEditing(d);
                setEditorOpen(true);
              }}
            />
          </div>
        ) : filtered.length === 0 ? (
          <Empty description="没找到这道菜，换个关键词试试" style={{ marginTop: 48 }} />
        ) : (
          <>
            <Row gutter={isMobile ? [10, 10] : [16, 16]}>
              {visible.map((d) => (
                // Pad 竖屏强制 3 列（span 8）。其余走响应式：手机 2 列、md 3 列、lg 起 4 列。
                // 注意不能写成 lg={8}：iPad 横屏（1024~1194）也落在 lg 区间，那样横屏会变 3 列。
                <Col key={d.id} {...(isPadPortrait ? { span: 8 } : { xs: 12, sm: 12, md: 8, lg: 6 })}>
                  <DishCard dish={d} cost={calcDishCost(d, ingredients)} />
                </Col>
              ))}
            </Row>

            {/* sentinel：观察这个元素的位置来触发加载 */}
            <div ref={sentinelRef} style={{ height: 1 }} />

            {/* 底部状态条 */}
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0 8px',
                color: '#999',
                fontSize: 13,
              }}
            >
              {hasMore ? (
                <Space size={6}>
                  <Spin size="small" />
                  <span>正在加载更多…</span>
                </Space>
              ) : (
                isAllLoaded && (
                  <span>
                    已显示全部 {filtered.length} 道菜
                  </span>
                )
              )}
            </div>
          </>
        )}
      </div>

      <DishEditor
        mode={editing ? 'edit' : 'create'}
        dish={editing ?? undefined}
        open={editorOpen}
        container={showManageTable ? 'drawer' : 'modal'}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onCreated={(d) => navigate('/menu/' + d.id)}
        onSaved={() => {
          message.success('已保存');
          setEditorOpen(false);
          setEditing(null);
          // 编辑保存后清掉选中态（回到未选中页面），跟食材库管理一致
          setSelectedRowKey(undefined);
        }}
      />
    </div>
  );

  // 移动端套一层下拉刷新（桌面端用浏览器刷新就够了）。
  // 该组件只改自己那个 head 的高度，不给内容加 transform，所以首页的吸顶搜索栏不受影响。
  if (isMobile) {
    return <PullToRefresh onRefresh={handleRefresh}>{content}</PullToRefresh>;
  }
  return content;
}
