import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Segmented, Empty, Row, Col, Switch, Space, Typography, Spin } from 'antd';
import { SearchOutlined, StarFilled } from '@ant-design/icons';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { calcDishCost } from '@/utils/price';
import DishCard from '@/components/DishCard';
import type { DishCategory } from '@/types';

const { Text } = Typography;

const categories: Array<DishCategory | '全部'> = [
  '全部',
  '家常',
  '川菜',
  '粤菜',
  '江浙',
  '湘菜',
  '快手',
  '烘焙',
  '汤羹',
  '凉菜',
  '其他',
];

const PAGE_SIZE = 8;

export default function Menu() {
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<DishCategory | '全部'>('全部');
  const [favOnly, setFavOnly] = useState(false);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return dishes.filter((d) => {
      if (category !== '全部' && d.category !== category) return false;
      if (favOnly && !d.favorite) return false;
      if (k) {
        const matchName = d.name.toLowerCase().includes(k);
        const matchTag = d.tags.some((t) => t.toLowerCase().includes(k));
        if (!matchName && !matchTag) return false;
      }
      return true;
    });
  }, [dishes, keyword, category, favOnly]);

  // 筛选条件变了 → 把已加载的页数重置回 PAGE_SIZE
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [keyword, category, favOnly]);

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

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: 700, color: '#2D2A26' }}>今天想吃点啥？</Text>
        <div style={{ color: '#888', marginTop: 4 }}>
          收录 {dishes.length} 道菜 · 每份成本按当前食材库价格实时估算
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '20px 0 16px',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜菜名或标签（如：番茄、汤、快手）"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Space wrap>
          <Segmented
            options={categories}
            value={category}
            onChange={(v) => setCategory(v as DishCategory | '全部')}
          />
          <Space>
            <StarFilled style={{ color: favOnly ? '#F0AD4E' : '#ccc' }} />
            <Switch
              checked={favOnly}
              onChange={setFavOnly}
              checkedChildren="只看收藏"
              unCheckedChildren="全部"
            />
          </Space>
        </Space>
      </div>

      {filtered.length === 0 ? (
        <Empty description="没找到这道菜，换个关键词试试" style={{ marginTop: 48 }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {visible.map((d) => (
              <Col key={d.id} xs={24} sm={12} md={8} lg={6}>
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
  );
}
