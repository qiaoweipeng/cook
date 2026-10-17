import { Card, Tag, Space } from 'antd';
import { Link } from 'react-router-dom';
import type { Dish } from '@/types';
import { useIsMobile } from '@/hooks/useIsMobile';
import PriceTag from '../PriceTag';

interface Props {
  dish: Dish;
  cost: number;
}

const COVER_HEIGHT = 300;
// 移动端两列布局：封面用竖向比例（高 > 宽），贴合手机拍摄的竖图
const MOBILE_COVER_RATIO = '3 / 4';

export default function DishCard({ dish, cost }: Props) {
  // 移动端首页两列布局，卡片整体尺寸等比缩小
  const isMobile = useIsMobile();
  const coverRadius = isMobile ? '12px 12px 0 0' : '16px 16px 0 0';

  const placeholderStyle: React.CSSProperties = isMobile
    ? {
      width: '100%',
      aspectRatio: MOBILE_COVER_RATIO,
      background: '#f0eee9',
      borderRadius: coverRadius,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#c8c4be',
      fontSize: 13,
      userSelect: 'none',
    }
    : {
      height: COVER_HEIGHT,
      background: '#f0eee9',
      borderRadius: coverRadius,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#c8c4be',
      fontSize: 13,
      userSelect: 'none',
    };

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
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: coverRadius }}
              />
            ) : (
              <span>图片</span>
            )}
          </div>
        }
        style={{ height: '100%' }}
        styles={{ body: { padding: isMobile ? 10 : 16 } }}
      >
        <div
          style={{
            marginBottom: isMobile ? 4 : 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: isMobile ? 15 : 18, fontWeight: 600, color: '#2D2A26' }}>
            {dish.name}
          </span>
          {dish.favorite && (
            <span style={{ color: '#F0AD4E', fontSize: 12, flexShrink: 0 }}>★</span>
          )}
        </div>
        <Space wrap size={4} style={{ marginBottom: isMobile ? 8 : 10 }}>
          <Tag color="orange" style={{ margin: 0 }}>
            {dish.category}
          </Tag>
          {dish.tags.slice(0, isMobile ? 1 : 2).map((t) => (
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
          <Space size={isMobile ? 8 : 12} wrap>
            <span>{dish.cookTimeMin} 分钟</span>
            <span>难度 {dish.difficulty}/3</span>
          </Space>
          <PriceTag value={cost} suffix="/份" size="small" />
        </div>
      </Card>
    </Link>
  );
}
