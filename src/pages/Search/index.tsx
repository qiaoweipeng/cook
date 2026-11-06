// 菜品搜索页（移动端为主，桌面端也能用）
//
// 三个入口共用这一个页面，通过 query 参数区分「搜完要干什么」：
//   /search                        首页搜索框进入 → 点结果进菜品详情
//   /search?mode=plan&day=YYYY-MM-DD  今日/本周/本月菜单点「添加」 → 点结果直接加进那一天
//   /search?mode=shopping          采购清单点「添加」 → 点结果勾选进采购清单，可多选
//
// 三个入口的搜索体验完全一致，差别只在点击结果后的动作和右上角按钮。

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Empty, Input, Tag, App as AntApp, type InputRef } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, SearchOutlined } from '@ant-design/icons';
import { useDishStore } from '@/store/useDishStore';
import { useIngredientStore } from '@/store/useIngredientStore';
import { usePriceStore } from '@/store/usePriceStore';
import { useWeeklyStore } from '@/store/useWeeklyStore';
import { useShoppingStore } from '@/store/useShoppingStore';
import { calcDishCost } from '@/utils/price';
import { resolveImageUrl } from '@/lib/imageStorage';
import { useIsMobile } from '@/hooks/useIsMobile';
import PriceTag from '@/components/PriceTag';
import type { Dish } from '@/types';

type Mode = 'browse' | 'plan' | 'shopping';

export default function Search() {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntApp.useApp();
  const isMobile = useIsMobile();

  const params = new URLSearchParams(location.search);
  const mode: Mode = (() => {
    const m = params.get('mode');
    return m === 'plan' || m === 'shopping' ? m : 'browse';
  })();
  const day = params.get('day') ?? '';

  const dishes = useDishStore((s) => s.items);
  const ingredients = useIngredientStore((s) => s.items);
  // 订阅平台，切平台后这里显示的成本也跟着变
  usePriceStore((s) => s.platform);
  const addDishToDay = useWeeklyStore((s) => s.addDishToDay);
  const selectedDishIds = useShoppingStore((s) => s.selectedDishIds);
  const toggleDish = useShoppingStore((s) => s.toggleDish);

  const [keyword, setKeyword] = useState('');
  const inputRef = useRef<InputRef>(null);

  // 移动端进入即聚焦，省一次点击；桌面上也会自动聚焦
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const results = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return dishes.filter((d) => {
      if (!k) return true;
      return d.name.toLowerCase().includes(k) || d.tags.some((t) => t.toLowerCase().includes(k));
    });
  }, [dishes, keyword]);

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/menu');
  };

  const handlePick = async (dish: Dish) => {
    if (mode === 'browse') {
      navigate('/menu/' + dish.id);
      return;
    }
    if (mode === 'plan') {
      if (!day) {
        message.error('没拿到日期，请返回菜单重试');
        return;
      }
      await addDishToDay(day, dish.id);
      message.success(`已把「${dish.name}」加进菜单`);
      goBack();
      return;
    }
    // shopping：勾选 / 取消勾选，留在页面方便连续加菜
    const picked = selectedDishIds.includes(dish.id);
    await toggleDish(dish.id);
    if (picked) message.success(`已移出「${dish.name}」`);
    else message.success(`已把「${dish.name}」加入采购清单`);
  };

  const headerAction =
    mode === 'shopping' ? (
      <button type="button" onClick={goBack} style={actionStyle}>
        完成
      </button>
    ) : (
      <button type="button" onClick={goBack} style={actionStyle}>
        取消
      </button>
    );

  const placeholder =
    mode === 'plan' ? '搜菜名或标签，点一下加进这一天的菜单' : '搜菜名或标签（如：番茄、汤、快手）';

  return (
    <div>
      {/* 顶部：返回 + 搜索框 + 取消/完成 */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 0 12px',
          background: isMobile ? 'rgba(250, 247, 242, 0.92)' : 'transparent',
          backdropFilter: isMobile ? 'blur(12px)' : undefined,
          WebkitBackdropFilter: isMobile ? 'blur(12px)' : undefined,
        }}
      >
        <button type="button" onClick={goBack} aria-label="返回" style={iconBtnStyle}>
          <ArrowLeftOutlined style={{ fontSize: 16 }} />
        </button>
        <Input
          ref={inputRef}
          allowClear
          prefix={<SearchOutlined style={{ color: '#b8b2aa' }} />}
          placeholder={placeholder}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ flex: 1, minWidth: 0, borderRadius: 10 }}
        />
        {headerAction}
      </div>

      {/* 模式提示条 */}
      {mode !== 'browse' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: '#8c857e',
            padding: '0 4px 10px',
          }}
        >
          {mode === 'plan'
            ? `点菜品即可加进 ${day || '这一天的'} 菜单`
            : '点菜品勾选进采购清单，可连续选择多个'}
          {mode === 'shopping' && selectedDishIds.length > 0 && (
            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
              已选 {selectedDishIds.length} 道
            </Tag>
          )}
        </div>
      )}

      {/* 结果列表 */}
      {results.length === 0 ? (
        <Empty
          description={
            keyword.trim() ? '没找到这道菜，换个关键词试试' : '还没有菜品，先去菜单页添加吧'
          }
          style={{ marginTop: 48 }}
        />
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
          {results.map((dish, i) => {
            const picked = mode === 'shopping' && selectedDishIds.includes(dish.id);
            const cost = calcDishCost(dish, ingredients);
            return (
              <div
                key={dish.id}
                onClick={() => {
                  void handlePick(dish);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 12px',
                  borderTop: i === 0 ? undefined : '1px solid #f6f2ec',
                  cursor: 'pointer',
                }}
              >
                {dish.coverImage ? (
                  <img
                    src={resolveImageUrl(dish.coverImage)}
                    alt={dish.name}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 10,
                      objectFit: 'cover',
                      flexShrink: 0,
                      background: '#faf7f2',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 10,
                      flexShrink: 0,
                      background: 'linear-gradient(135deg, #fff1e8, #ffe3d0)',
                      color: '#e8743c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                      fontWeight: 600,
                    }}
                  >
                    {dish.name.slice(0, 1)}
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: '#2D2A26',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {dish.name}
                    </span>
                    <PriceTag value={cost} suffix="/份" size="small" />
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                    {dish.category} · {dish.cookTimeMin} 分钟 · {dish.servings} 人份
                  </div>
                  {dish.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {dish.tags.slice(0, 4).map((t) => (
                        <Tag key={t} style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: '18px' }}>
                          {t}
                        </Tag>
                      ))}
                    </div>
                  )}
                </div>

                {mode === 'shopping' && (
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: picked ? '1px solid #E8743C' : '1px solid #e3ddd4',
                      background: picked ? '#E8743C' : '#fff',
                      color: picked ? '#fff' : '#c8c4be',
                    }}
                  >
                    {picked && <CheckOutlined style={{ fontSize: 12 }} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ textAlign: 'center', color: '#b0aaa3', fontSize: 12, padding: '18px 0 24px' }}>
          共 {results.length} 道菜
        </div>
      )}
    </div>
  );
}

const iconBtnStyle: CSSProperties = {
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
};

const actionStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#E8743C',
  fontSize: 14,
  fontWeight: 500,
  padding: '0 4px',
  cursor: 'pointer',
  flexShrink: 0,
};
