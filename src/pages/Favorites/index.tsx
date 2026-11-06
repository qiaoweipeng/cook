// 我的收藏（移动端为主的独立列表页）
// 入口在「个人」页面；菜品详情页的收藏开关决定这里显示什么。

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty, Row, Col, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { calcDishCost } from '@/utils/price';
import { useIsMobile } from '@/hooks/useIsMobile';
import DishCard from '@/components/DishCard';

export default function Favorites() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  // 订阅平台，切平台后卡片上的成本跟着变
  usePriceStore((s) => s.platform);

  const favorites = useMemo(() => dishes.filter((d) => d.favorite), [dishes]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/profile');
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 0 14px',
        }}
      >
        <button type="button" onClick={goBack} aria-label="返回" style={iconBtnStyle}>
          <ArrowLeftOutlined style={{ fontSize: 16 }} />
        </button>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#2D2A26' }}>我的收藏</div>
        {favorites.length > 0 && (
          <span style={{ fontSize: 12, color: '#999' }}>{favorites.length} 道菜</span>
        )}
      </div>

      {favorites.length === 0 ? (
        <Empty description="还没有收藏的菜品" style={{ marginTop: 48 }}>
          <Button type="primary" ghost onClick={() => navigate('/menu')}>
            去菜单逛逛
          </Button>
        </Empty>
      ) : (
        <Row gutter={isMobile ? [10, 10] : [16, 16]}>
          {favorites.map((d) => (
            <Col key={d.id} {...(isMobile ? { span: 12 } : { xs: 12, sm: 12, md: 8, lg: 6 })}>
              <DishCard dish={d} cost={calcDishCost(d, ingredients)} />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}

const iconBtnStyle = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: '#5c554e',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
} as const;
