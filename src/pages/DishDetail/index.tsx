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
  CheckOutlined,
  EditOutlined,
  ShoppingCartOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { useShoppingStore } from '@/store/useShoppingStore';
import { useIsAdmin } from '@/store/useAuthStore';
import { calcDishCost, lineCost } from '@/utils/price';
import { useIsMobile } from '@/hooks/useIsMobile';
import PriceTag from '@/components/PriceTag';
import DishEditor from '@/components/DishEditor';

const { Title, Text } = Typography;

const COVER_HEIGHT = 240;

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
  const toggleFavorite = useDishStore((s) => s.toggleFavorite);
  const toggleDishInShopping = useShoppingStore((s) => s.toggleDish);
  const inShopping = useShoppingStore((s) =>
    id ? s.selectedDishIds.includes(id) : false
  );
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const [editorOpen, setEditorOpen] = useState(false);

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
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 18 }}>
              <span
                role="button"
                aria-label={inShopping ? '从采购清单移除' : '加入采购清单'}
                onClick={() => {
                  toggleDishInShopping(dish.id);
                  message.success(inShopping ? '已从采购清单移除' : '已加入采购清单');
                }}
                style={{ color: inShopping ? '#E8743C' : undefined, cursor: 'pointer' }}
              >
                {inShopping ? <CheckOutlined /> : <ShoppingCartOutlined />}
              </span>
              <span
                role="button"
                aria-label={dish.favorite ? '取消收藏' : '收藏'}
                onClick={() => {
                  toggleFavorite(dish.id);
                  message.success(dish.favorite ? '已取消收藏' : '已收藏');
                }}
                style={{ color: dish.favorite ? '#E8743C' : undefined, cursor: 'pointer' }}
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
                src={dish.coverImage}
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
                    {ing.spec && <Text type="secondary">（{ing.spec}）</Text>}
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
