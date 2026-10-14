import { Card, Tag, Space } from 'antd';
import { Link } from 'react-router-dom';
import type { Dish } from '@/types';
import PriceTag from '../PriceTag';

interface Props {
  dish: Dish;
  cost: number;
}

const COVER_HEIGHT = 160;

const placeholderStyle: React.CSSProperties = {
  height: COVER_HEIGHT,
  background: '#f0eee9',
  borderRadius: '16px 16px 0 0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#c8c4be',
  fontSize: 13,
  userSelect: 'none',
};

export default function DishCard({ dish, cost }: Props) {
  return (
    <Link to={`/menu/${dish.id}`}>
      <Card
        hoverable
        cover={
          <div style={placeholderStyle}>
            {dish.coverImage ? (
              <img
                src={dish.coverImage}
                alt={dish.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span>图片</span>
            )}
          </div>
        }
        style={{ height: '100%' }}
        styles={{ body: { padding: 16 } }}
      >
        <div
          style={{
            marginBottom: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 600, color: '#2D2A26' }}>
            {dish.name}
          </span>
          {dish.favorite && (
            <span style={{ color: '#F0AD4E', fontSize: 12, flexShrink: 0 }}>★</span>
          )}
        </div>
        <Space wrap size={4} style={{ marginBottom: 10 }}>
          <Tag color="orange" style={{ margin: 0 }}>
            {dish.category}
          </Tag>
          {dish.tags.slice(0, 2).map((t) => (
            <Tag key={t} style={{ margin: 0 }}>
              {t}
            </Tag>
          ))}
        </Space>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#888',
            fontSize: 12,
            gap: 8,
          }}
        >
          <Space size={12} wrap>
            <span>{dish.cookTimeMin} 分钟</span>
            <span>难度 {dish.difficulty}/3</span>
          </Space>
          <PriceTag value={cost} suffix="/份" size="small" />
        </div>
      </Card>
    </Link>
  );
}
