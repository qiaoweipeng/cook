import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Segmented, Empty, Row, Col, Switch, Space, Typography, Spin, Button } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { calcDishCost } from '@/utils/price';
import DishCard from '@/components/DishCard';
import DishEditor from '@/components/DishEditor';
import { useIsAdmin } from '@/store/useAuthStore';
import { useIsMobile } from '@/hooks/useIsMobile';
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
  const navigate = useNavigate();
  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  const isAdmin = useIsAdmin();
  const isMobile = useIsMobile();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<DishCategory | '全部'>('全部');
  const [favOnly, setFavOnly] = useState(false);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [editorOpen, setEditorOpen] = useState(false);
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
      {/* 移动端：隐藏「今天想吃点啥？」标题与副标题，进入首页直接是 logo + 搜索区 */}
      <div
        style={{
          marginBottom: 8,
          display: isMobile && !isAdmin ? 'none' : 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Text style={{ fontSize: 22, fontWeight: 700, color: '#2D2A26' }}>今天想吃点啥？</Text>
          <div style={{ color: '#888', marginTop: 4 }}>
            收录 {dishes.length} 道菜 ｜ 每道菜的成本按当前食材库价格实时估算
          </div>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditorOpen(true)}>
            添加菜品
          </Button>
        )}
      </div>

      {/*
        移动端：logo + 搜索框 + 标签栏常驻吸顶（一进页面就贴在顶部，滚动时不动），
        毛玻璃背景；搜索框靠右，左侧是「大厨房」logo。
        桌面端：保持原有布局不变。
      */}
      <div
        style={
          isMobile
            ? {
              position: 'sticky',
              top: 0,
              zIndex: 20,
              // 负外边距抵消内容区 16px 上内边距与 12px 左右内边距，让吸顶栏贴顶、横贯全屏
              margin: '-16px -12px 12px',
              padding: 'calc(10px + env(safe-area-inset-top)) 12px 10px',
              background: 'rgba(250, 247, 242, 0.82)',
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
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {/* 移动端 logo：仅在搜索栏吸顶区域显示 */}
          {isMobile && (
            <span className="brand" style={{ fontSize: 18, flexShrink: 0 }}>
              大厨房
            </span>
          )}
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜菜名或标签（如：番茄、汤、快手）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{
              maxWidth: isMobile ? 'none' : 320,
              flex: isMobile ? 1 : undefined,
              minWidth: 0,
            }}
          />
          {/* 移动端：标签横向滚动，不换行不撑宽屏幕；独占第二行 */}
          <div
            style={{
              overflowX: 'auto',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
              maxWidth: '100%',
              flex: isMobile ? '0 0 100%' : undefined,
              marginTop: isMobile ? 10 : undefined,
            }}
          >
            <Space size={8} style={{ display: 'inline-flex', flexWrap: 'nowrap', paddingBottom: 4 }}>
              <Segmented
                className={isMobile ? 'menu-seg-mobile' : undefined}
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
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty description="没找到这道菜，换个关键词试试" style={{ marginTop: 48 }} />
      ) : (
        <>
          <Row gutter={isMobile ? [10, 10] : [16, 16]}>
            {visible.map((d) => (
              <Col key={d.id} xs={12} sm={12} md={8} lg={6}>
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

      <DishEditor
        mode="create"
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onCreated={(d) => navigate('/menu/' + d.id)}
      />
    </div>
  );
}
