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
  EditOutlined,
  LeftOutlined,
  ShoppingCartOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
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
import { resolveImageUrl } from '@/lib/supabase';
import PriceTag from '@/components/PriceTag';
import DishEditor from '@/components/DishEditor';

const { Title, Text } = Typography;

const COVER_HEIGHT = 240;

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
  const [editorOpen, setEditorOpen] = useState(false);

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
    <div>
      {/*
        移动端顶部统一用 NavBar：返回交给它自带的返回箭头，采购 / 收藏放右侧。
        之前那套毛玻璃圆钮是浮在封面图上的（沉浸式），但状态辨识度不够，
        而且圆钮会挡住封面图 —— 换成常规 NavBar 后标题栏显示菜名，滚到哪都知道在看哪道菜。
      */}
      {isMobile && (
        <NavBar
          onBack={() => navigate('/menu')}
          backArrow={
            <span className="icon-btn" style={iconCircle}>
              <LeftOutlined />
            </span>
          }
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="icon-btn"
                role="button"
                aria-label={inShopping ? '从采购清单移除' : '加入采购清单'}
                onClick={() => {
                  toggleDishInShopping(dish.id);
                  message.success(inShopping ? '已从采购清单移除' : '已加入采购清单');
                }}
                style={{ ...iconCircle, ...(inShopping ? iconCircleActive : null) }}
              >
                {inShopping ? <CheckOutlined /> : <ShoppingCartOutlined />}
              </span>
              {/* 今日菜单：只加今天这一天，已在今天菜单里再点就是移除 */}
              <span
                className="icon-btn"
                role="button"
                aria-label={inTodayMenu ? '从今日菜单移除' : '加入今日菜单'}
                onClick={() => {
                  if (todayMenuReadOnly) return; // 只读成员点了没意义，交给 toggle 里的 warning
                  void toggleTodayMenu();
                }}
                style={{
                  ...iconCircle,
                  ...(inTodayMenu ? iconCircleActive : null),
                  ...(todayMenuReadOnly ? { opacity: 0.4, cursor: 'not-allowed' } : null),
                }}
              >
                {inTodayMenu ? <CheckOutlined /> : <CalendarOutlined />}
              </span>
              <span
                className="icon-btn"
                role="button"
                aria-label={dish.favorite ? '取消收藏' : '收藏'}
                onClick={() => {
                  toggleFavorite(dish.id);
                  message.success(dish.favorite ? '已取消收藏' : '已收藏');
                }}
                style={{ ...iconCircle, ...(dish.favorite ? iconCircleActive : null) }}
              >
                {dish.favorite ? <StarFilled /> : <StarOutlined />}
              </span>
            </div>
          }
        >
          {dish.name}
        </NavBar>
      )}

      {/* 桌面端才需要这个占位的返回按钮（移动端用上面的悬浮箭头） */}
      {!isMobile && (
        <Button
          type="link"
          onClick={() => navigate('/menu')}
          style={{ paddingLeft: 0, marginBottom: 8 }}
        >
          返回菜单
        </Button>
      )}
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
        styles={{ body: { padding: '24px 28px 28px' } }}
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

        {isMobile ? (
          // 移动端：采购 / 收藏已经挪到顶部悬浮栏，底部只留管理员的编辑按钮
          isAdmin && (
            <Button
              size="large"
              block
              icon={<EditOutlined />}
              onClick={() => setEditorOpen(true)}
              style={{ marginTop: 32 }}
            >
              编辑
            </Button>
          )
        ) : (
          <Space style={{ marginTop: 32 }} size={12} wrap>
            <Button
              type="primary"
              size="large"
              icon={inShopping ? <CheckOutlined /> : <ShoppingCartOutlined />}
              onClick={() => {
                toggleDishInShopping(dish.id);
                message.success(inShopping ? '已从采购清单移除' : '已加入采购清单');
              }}
              style={{ minWidth: 180 }}
            >
              {inShopping ? '已加入采购清单' : '加入采购清单'}
            </Button>
            <Button
              size="large"
              icon={inTodayMenu ? <CheckOutlined /> : <CalendarOutlined />}
              onClick={() => void toggleTodayMenu()}
              disabled={todayMenuReadOnly}
              title={todayMenuReadOnly ? '你在家庭菜单里是只读权限' : undefined}
              style={{ minWidth: 180 }}
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
            {isAdmin && (
              <Button
                size="large"
                icon={<EditOutlined />}
                onClick={() => setEditorOpen(true)}
              >
                编辑
              </Button>
            )}
          </Space>
        )}
      </Card>

      <DishEditor
        mode="edit"
        open={editorOpen}
        dish={dish}
        onClose={() => setEditorOpen(false)}
        onDeleted={() => navigate('/menu')}
      />
    </div>
  );
}
