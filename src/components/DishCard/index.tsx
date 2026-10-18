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
/**
 * 移动端两列布局的封面比例（宽 / 高）。
 * 原来是 3 / 4（高 = 1.33 倍宽），比 PC 端高太多，卡片拖得很长；
 * 现在对齐 PC 端：PC 卡片宽约 270、高 300，高 ≈ 1.11 倍宽，这里用 9 / 10 保持一致。
 */
const MOBILE_COVER_RATIO = '9 / 10';

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
        // hoverable 是给鼠标悬停用的：移动端没有 hover，点一下会残留一层阴影，反而脏。
        // PC 端保留（鼠标划过有反馈），移动端关掉。
        hoverable={!isMobile}
        cover={
          <div style={placeholderStyle}>
            {dish.coverImage ? (
              <img
                src={dish.coverImage}
                alt={dish.name}
                loading="lazy"
                decoding="async"
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
