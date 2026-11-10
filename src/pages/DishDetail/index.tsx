import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Tag,
  Space,
  Typography,
  Button,
  Result,
  Empty,
  List,
  Row,
  Col,
  Descriptions,
  App as AntApp,
} from 'antd';
import { NavBar } from 'antd-mobile';
import {
  CalendarOutlined,
  CheckOutlined,
  LeftOutlined,
  SearchOutlined,
  ShareAltOutlined,
  ShoppingCartOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useWeeklyStore } from '@/store/useWeeklyStore';
import { useFamilyStore } from '@/store/useFamilyStore';
import { useIsAdmin } from '@/store/useAuthStore';
import { dayKey, today } from '@/utils/week';
import { calcDishCost, lineCost } from '@/utils/price';
import { useIsMobile } from '@/hooks/useIsMobile';
import { resolveImageUrl } from '@/lib/imageStorage';
import PriceTag from '@/components/PriceTag';

const { Title, Text } = Typography;

const COVER_HEIGHT = 400;

/*
  NavBar 里的圆形图标底座：裸图标直接搁在白底导航栏上太素，加个淡橙圆圈压一下。
  比之前那套 38px 的毛玻璃圆钮小一圈（30px），不再喧宾夺主，也不挡封面图。
*/
const iconCircle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  background: 'rgba(232, 116, 60, 0.12)',
  color: '#E8743C',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  lineHeight: 1,
  cursor: 'pointer',
};

/** 选中态：填充品牌橙，正好是未激活态的反转（橙底白图标） */
const iconCircleActive: React.CSSProperties = {
  background: '#E8743C',
  color: '#fff',
};

const placeholderStyle: React.CSSProperties = {
  height: COVER_HEIGHT,
  background: '#f0eee9',
  borderRadius: '16px 16px 0 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#c8c4be',
  fontSize: 14,
  userSelect: 'none',
};

export default function DishDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  const dish = useDishStore((s) => s.items.find((d) => d.id === id));
  const ingredients = useIngredientStore((s) => s.items);
  // 订阅当前平台：切换平台后食材小计 / 总成本要跟着变
  usePriceStore((s) => s.platform);
  const toggleFavorite = useDishStore((s) => s.toggleFavorite);
  const toggleDishInShopping = useShoppingStore((s) => s.toggleDish);
  const inShopping = useShoppingStore((s) =>
    id ? s.selectedDishIds.includes(id) : false
  );
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();

  /*
    今日菜单：只认「今天」这一天，不能加到明天/前天，所以 day 一律用 dayKey(today())，
    不接受任何外部传入的日期。
    菜单分个人/家庭两份，当前用哪份由菜单页选定的 mode 决定，这里保持一致，
    否则会出现「详情页说已加入、菜单页却看不到」。
  */
  const personalPlans = useWeeklyStore((s) => s.plans);
  const familyPlans = useWeeklyStore((s) => s.familyPlans);
  const menuMode = useWeeklyStore((s) => s.mode);
  const addDishToDay = useWeeklyStore((s) => s.addDishToDay);
  const removeDishFromDay = useWeeklyStore((s) => s.removeDishFromDay);
  const family = useFamilyStore((s) => s.family);
  const myRole = useFamilyStore((s) => s.myRole);
  const myPermission = useFamilyStore((s) => s.myPermission);

  if (!dish) {
    return (
      <Result
        status="404"
        title="这道菜不存在"
        subTitle="可能已被删除，去菜单找找别的吧"
        extra={
          <Button type="primary" onClick={() => navigate('/menu')}>
            返回菜单
          </Button>
        }
      />
    );
  }

  const totalCost = calcDishCost(dish, ingredients);
  const missing = dish.ingredients.filter(
    (di) => !ingredients.some((i) => i.id === di.ingredientId)
  );

  /** 家庭模式（且真的有家庭）下，菜单看的是共享那份 */
  const familyMenuMode = menuMode === 'family' && Boolean(family?.id);
  const activePlans = familyMenuMode ? familyPlans : personalPlans;
  /** 「今天」的 key —— 只加今天这一天，永远不取明天/前天 */
  const todayMenuKey = dayKey(today());
  const inTodayMenu = (activePlans[todayMenuKey] ?? []).includes(dish.id);
  /** 家庭菜单里的只读成员：能看不能改，按钮点了也白点，直接禁用 */
  const todayMenuReadOnly =
    familyMenuMode && myRole !== 'admin' && myPermission !== 'edit';

  const toggleTodayMenu = async () => {
    if (todayMenuReadOnly) {
      message.warning('你在家庭菜单里是只读权限，不能修改菜单');
      return;
    }
    try {
      if (inTodayMenu) {
        await removeDishFromDay(todayMenuKey, dish.id);
        message.success('已从今日菜单移除');
      } else {
        await addDishToDay(todayMenuKey, dish.id);
        message.success('已加入今日菜单');
      }
    } catch {
      message.error('操作失败，请稍后再试');
    }
  };

  return (
    <div
      style={
        isMobile
          ? { paddingBottom: 'calc(78px + env(safe-area-inset-bottom))' }
          : undefined
      }
    >
      {/*
        移动端顶部：左边保留返回，中间的菜名改成「搜索入口」，点击跳搜索页；
        采购 / 菜单 / 收藏三个操作全部移到底部操作条（见下面的 fixed bar）。
      */}
      {isMobile && (
        <div
          className="glass-panel"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            marginTop: 'calc(-16px - env(safe-area-inset-top))',
            paddingTop: 'calc(16px + env(safe-area-inset-top))',
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            borderRadius: 0,
            boxShadow: '0 1px 0 rgba(45, 42, 38, 0.04)',
          }}
        >
          <NavBar
            onBack={() => navigate('/menu')}
            backArrow={
              <span className="icon-btn" style={iconCircle}>
                <LeftOutlined />
              </span>
            }
            right={
              <span
                className="icon-btn"
                role="button"
                aria-label="分享"
                onClick={async () => {
                  const shareData = { title: dish.name, url: window.location.href };
                  try {
                    if (typeof navigator !== 'undefined' && navigator.share) {
                      await navigator.share(shareData);
                    } else if (navigator.clipboard) {
                      await navigator.clipboard.writeText(shareData.url);
                      message.success('链接已复制，去分享给朋友吧');
                    } else {
                      message.info(window.location.href);
                    }
                  } catch {
                    /* 用户取消分享，不报错 */
                  }
                }}
                style={iconCircle}
              >
                <ShareAltOutlined />
              </span>
            }
            style={{ background: 'transparent' }}
          >
            <div
              role="button"
              aria-label="搜索菜品"
              onClick={() => navigate('/search')}
              style={{
                width: '100%',
                height: 32,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 12px',
                borderRadius: 16,
                background: 'rgba(244, 241, 236, 0.85)',
                color: '#b8b2aa',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <SearchOutlined style={{ fontSize: 13 }} />
              <span
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                搜索菜品
              </span>
            </div>
          </NavBar>
        </div>
      )}

      {/* 桌面端：整页一张卡片，上半部分是「左图 + 右信息」，下半部分是详细做法，中间用一条分隔线衔接 */}
      {!isMobile && (
        <>
          <Button
            type="link"
            onClick={() => navigate('/menu')}
            style={{ paddingLeft: 0, marginBottom: 12 }}
          >
            ← 返回菜单
          </Button>

          <div
            style={{
              padding: 28,
              borderRadius: 16,
              background: '#FFFFFF',
              border: '1px solid #F0EEE9',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
            }}
          >
            {/* 上层：左图 + 右信息，信息整体贴着图片底部对齐 */}
            <div style={{ display: 'flex', gap: 32, alignItems: 'stretch' }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 250,
                  height: 330,
                  borderRadius: 12,
                  background: '#FAF7F2',
                  border: '1px solid #F0EEE9',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {dish.coverImage ? (
                  <img
                    src={resolveImageUrl(dish.coverImage)}
                    alt={dish.name}
                    style={{
                      maxWidth: '100%',
                      // maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <span style={{ color: '#c8c4be', fontSize: 13 }}>图片占位</span>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  gap: 14,
                }}
              >
                <Space wrap size={6}>
                  <Tag color="orange" style={{ margin: 0 }}>{dish.category}</Tag>
                  {dish.tags.map((t) => (
                    <Tag key={t} style={{ margin: 0 }}>{t}</Tag>
                  ))}
                </Space>
                <Title level={2} style={{ margin: 0 }}>
                  {dish.name}
                  {dish.favorite && (
                    <span style={{ color: '#F0AD4E', marginLeft: 12, fontSize: 18 }}>★</span>
                  )}
                </Title>
                <Descriptions column={2} size="small" colon={false} style={{ marginBottom: 0 }}>
                  <Descriptions.Item label="用时">{dish.cookTimeMin} 分钟</Descriptions.Item>
                  <Descriptions.Item label="份量">{dish.servings} 人份</Descriptions.Item>
                  <Descriptions.Item label="难度">
                    <span style={{ color: '#E8743C' }}>
                      {'★'.repeat(dish.difficulty)}
                    </span>
                    <span style={{ color: '#ddd' }}>{'☆'.repeat(3 - dish.difficulty)}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="成本估算">
                    <PriceTag value={totalCost} suffix="/ 份" />
                  </Descriptions.Item>
                </Descriptions>

                {/* 操作区：管理员在菜品详情页不需要编辑入口，这里只给普通用户 */}
                {!isAdmin && (
                  <Space size={12} wrap>
                    <Button
                      type="primary"
                      size="large"
                      icon={inShopping ? <CheckOutlined /> : <ShoppingCartOutlined />}
                      onClick={() => {
                        toggleDishInShopping(dish.id);
                        message.success(inShopping ? '已从采购清单移除' : '已加入采购清单');
                      }}
                    >
                      {inShopping ? '已加入采购清单' : '加入采购清单'}
                    </Button>
                    <Button
                      size="large"
                      icon={inTodayMenu ? <CheckOutlined /> : <CalendarOutlined />}
                      onClick={() => void toggleTodayMenu()}
                      disabled={todayMenuReadOnly}
                      title={todayMenuReadOnly ? '你在家庭菜单里是只读权限' : undefined}
                    >
                      {inTodayMenu ? '已加入今日菜单' : '加入今日菜单'}
                    </Button>
                    <Button
                      size="large"
                      icon={
                        dish.favorite ? <StarFilled style={{ color: '#F0AD4E' }} /> : <StarOutlined />
                      }
                      onClick={() => {
                        toggleFavorite(dish.id);
                        message.success(dish.favorite ? '已取消收藏' : '已收藏');
                      }}
                    >
                      {dish.favorite ? '已收藏' : '收藏'}
                    </Button>
                  </Space>
                )}
              </div>
            </div>

            {/* 分隔线：上层菜品概览和下层详细做法在同一张卡里，靠这条线连起来 */}
            <div style={{ height: 1, background: '#F0EEE9', margin: '28px 0 0' }} />

            {/* 下层：食材清单 / 烹饪步骤 / 小贴士 */}
            <div className="section-title">食材清单</div>
            {dish.ingredients.length === 0 ? (
              <Empty description="还没填食材" />
            ) : missing.length > 0 ? (
              <Empty description={`有 ${missing.length} 项食材未在食材库中`} />
            ) : (
              <List
                size="small"
                dataSource={dish.ingredients}
                split={false}
                renderItem={(di) => {
                  const ing = ingredients.find((i) => i.id === di.ingredientId)!;
                  const cost = lineCost(di, ingredients);
                  return (
                    <List.Item
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: '#FAF7F2',
                        borderRadius: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Space>
                        <Text strong>{ing.name}</Text>
                        {ing.note && <Text type="secondary">（{ing.note}）</Text>}
                      </Space>
                      <Space size={16}>
                        <span>{di.amount} {di.unit}</span>
                        <Text type="secondary">≈ {cost.toFixed(2)} 元</Text>
                      </Space>
                    </List.Item>
                  );
                }}
              />
            )}

            <div className="section-title">烹饪步骤</div>
            <div>
              {dish.steps.map((s) => (
                <div className="steps-row" key={s.order}>
                  <div className="step-num">{s.order}</div>
                  <div style={{ flex: 1, lineHeight: 1.75, color: '#444' }}>{s.text}</div>
                </div>
              ))}
            </div>

            {dish.tips && (
              <>
                <div className="section-title">小贴士</div>
                <div
                  style={{
                    background: '#FFF6EC',
                    borderLeft: '3px solid #E8743C',
                    padding: '12px 16px',
                    borderRadius: 8,
                    color: '#5a4a3a',
                  }}
                >
                  {dish.tips}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* 移动端：保留原设计（NavBar + Card + 封面图） */}
      {isMobile && (
        <>
          <Card
            cover={
              <div style={placeholderStyle}>
                {dish.coverImage ? (
                  <img
                    src={resolveImageUrl(dish.coverImage)}
                    alt={dish.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span>图片占位</span>
                )}
              </div>
            }
            style={{ borderRadius: 16 }}
            styles={{ body: { padding: '24px 20px 28px' } }}
          >
            <Space wrap size={6} style={{ marginBottom: 8 }}>
              <Tag color="orange" style={{ margin: 0 }}>{dish.category}</Tag>
              {dish.tags.map((t) => (
                <Tag key={t} style={{ margin: 0 }}>{t}</Tag>
              ))}
            </Space>
            <Title level={2} style={{ marginTop: 0, marginBottom: 12 }}>
              {dish.name}
              {dish.favorite && (
                <span style={{ color: '#F0AD4E', marginLeft: 12, fontSize: 18 }}>★</span>
              )}
            </Title>
            <Row gutter={24} style={{ marginBottom: 20 }}>
              <Col flex="auto">
                <Descriptions column={{ xs: 2, sm: 4 }} size="small" colon={false}>
                  <Descriptions.Item label="用时">{dish.cookTimeMin} 分钟</Descriptions.Item>
                  <Descriptions.Item label="份量">{dish.servings} 人份</Descriptions.Item>
                  <Descriptions.Item label="难度">
                    <span style={{ color: '#E8743C' }}>
                      {'★'.repeat(dish.difficulty)}
                    </span>
                    <span style={{ color: '#ddd' }}>{'☆'.repeat(3 - dish.difficulty)}</span>
                  </Descriptions.Item>
                  <Descriptions.Item label="成本估算">
                    <PriceTag value={totalCost} suffix="/ 份" />
                  </Descriptions.Item>
                </Descriptions>
              </Col>
            </Row>

            <div className="section-title">食材清单</div>
            {dish.ingredients.length === 0 ? (
              <Empty description="还没填食材" />
            ) : missing.length > 0 ? (
              <Empty description={`有 ${missing.length} 项食材未在食材库中`} />
            ) : (
              <List
                size="small"
                dataSource={dish.ingredients}
                split={false}
                renderItem={(di) => {
                  const ing = ingredients.find((i) => i.id === di.ingredientId)!;
                  const cost = lineCost(di, ingredients);
                  return (
                    <List.Item
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: '#FAF7F2',
                        borderRadius: 10,
                        marginBottom: 6,
                      }}
                    >
                      <Space>
                        <Text strong>{ing.name}</Text>
                        {ing.note && <Text type="secondary">（{ing.note}）</Text>}
                      </Space>
                      <Space size={16}>
                        <span>
                          {di.amount} {di.unit}
                        </span>
                        <Text type="secondary">≈ {cost.toFixed(2)} 元</Text>
                      </Space>
                    </List.Item>
                  );
                }}
              />
            )}

            <div className="section-title">烹饪步骤</div>
            <div>
              {dish.steps.map((s) => (
                <div className="steps-row" key={s.order}>
                  <div className="step-num">{s.order}</div>
                  <div style={{ flex: 1, lineHeight: 1.75, color: '#444' }}>{s.text}</div>
                </div>
              ))}
            </div>

            {dish.tips && (
              <>
                <div className="section-title">小贴士</div>
                <div
                  style={{
                    background: '#FFF6EC',
                    borderLeft: '3px solid #E8743C',
                    padding: '12px 16px',
                    borderRadius: 8,
                    color: '#5a4a3a',
                  }}
                >
                  {dish.tips}
                </div>
              </>
            )}

          </Card>

          {/* 底部固定操作条：最左收藏图标，右侧两个主操作按钮 —— 液态玻璃底 */}
          <div
            className="glass-panel"
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
              borderTop: '1px solid rgba(45, 42, 38, 0.06)',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              borderRadius: 0,
              boxShadow: '0 -2px 16px rgba(0, 0, 0, 0.04)',
            }}
          >
            <span
              className="icon-btn"
              role="button"
              aria-label={dish.favorite ? '取消收藏' : '收藏'}
              onClick={() => {
                toggleFavorite(dish.id);
                message.success(dish.favorite ? '已取消收藏' : '已收藏');
              }}
              style={{
                ...iconCircle,
                width: 38,
                height: 38,
                fontSize: 17,
                flexShrink: 0,
                ...(dish.favorite ? iconCircleActive : null),
              }}
            >
              {dish.favorite ? <StarFilled /> : <StarOutlined />}
            </span>
            <Button
              style={{ flex: 1, height: 40 }}
              disabled={todayMenuReadOnly}
              title={todayMenuReadOnly ? '你在家庭菜单里是只读权限' : undefined}
              onClick={() => void toggleTodayMenu()}
            >
              {inTodayMenu ? '已加入今日菜单' : '加入今日菜单'}
            </Button>
            <Button
              type="primary"
              style={{ flex: 1, height: 40 }}
              onClick={() => {
                toggleDishInShopping(dish.id);
                message.success(inShopping ? '已从采购清单移除' : '已加入采购清单');
              }}
            >
              {inShopping ? '已加入采购清单' : '加入采购清单'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
