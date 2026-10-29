import { useState } from 'react';
import { Card, Tag, Space } from 'antd';
import { Link } from 'react-router-dom';
import type { Dish } from '@/types';
import { useIsMobile } from '@/hooks/useIsMobile';
import { resolveImageUrl } from '@/lib/supabase';
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

  /* ========== 图片诊断（排查「图片加载不出来」，查完可删） ==========
     第 1 步：拿到图片地址了吗？
     第 2 步：拿到地址后，浏览器真的把图渲染出来了吗？
     看控制台输出的这几行就能定位卡在哪一环：
       [图片诊断] 第1步 拿到了   有地址 → 继续看第2步
       [图片诊断] 第1步 根本没拿到 → 数据里就没有图片地址
       [图片诊断] 第2步 拿到了但没渲染出来 → 地址给了但请求失败（404/网络/CORS）
       [图片诊断] 第2步 渲染出来了     → 正常
  */
  const debugUrl = resolveImageUrl(dish.coverImage);

  /*
    封面加载状态。
    之前封面是个灰底方块，图从网络/Base64 解码出来之前就那么空着，
    列表一屏十几张，看着像一半没加载完。改成骨架屏：灰底 + 一道流光，
    图解码完再淡入，进出都平滑。
    没有封面图的（用首字占位）直接算加载完成，不走这套。
  */
  const [coverLoaded, setCoverLoaded] = useState(false);

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
      position: 'relative',
      overflow: 'hidden',
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
      position: 'relative',
      overflow: 'hidden',
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
              <>
                {!coverLoaded && <span className="sk-cover" aria-hidden />}
                <img
                  src={debugUrl}
                  alt={dish.name}
                  loading="lazy"
                  decoding="async"
                  onLoad={() => setCoverLoaded(true)}
                  // 图挂了也要把骨架屏收掉，否则位图一直流光
                  onError={() => setCoverLoaded(true)}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: coverRadius,
                    opacity: coverLoaded ? 1 : 0,
                    transition: 'opacity 260ms ease',
                  }}
                />
              </>
            ) : (
              // 没有封面图的菜：菜名首字占位（中性底色）。
              // 线上菜品目前全部有封面，这个分支实际不会走到。
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: '#f0eee9',
                  borderRadius: coverRadius,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isMobile ? 48 : 72,
                }}
              >
                {dish.name[0] || '🍳'}
              </div>
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
