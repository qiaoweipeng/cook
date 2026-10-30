/**
 * 管理员版菜品列表（ProTable 表格形式）—— 只在「PC 端 + 管理员」时替代 DishCard 卡片墙。
 *
 * 每行一道菜，常用字段直接摊开。ProTable 负责生成独立查询控件（菜名 Input、
 * 分类/标签/难度 Select 多选），工具栏右侧放添加菜品、编辑菜品按钮（编辑需要先选中）。
 *
 * 移动端 / 非管理员仍然是原来的卡片墙（Menu/index.tsx 里按 isMobile + isAdmin 分流）。
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button, Space, Typography, Image, Avatar, Tag } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { Dish, DishCategory } from '@/types';
import { BUILTIN_TAGS } from '@/types';
import { calcDishCost, calcDishNutrition, type DishNutrition } from '@/utils/price';
import { usePriceStore } from '@/store/usePriceStore';
import type { Ingredient } from '@/types';
import { resolveImageUrl } from '@/lib/supabase';

const { Text } = Typography;

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: '简单',
  2: '中等',
  3: '较难',
};

const DIFFICULTY_COLOR: Record<1 | 2 | 3, string> = {
  1: 'green',
  2: 'orange',
  3: 'volcano',
};

const CATEGORY_OPTIONS: DishCategory[] = ['家常', '川菜', '粤菜', '湘菜', '鲁菜', '江浙', '其他'];

/** 7 个菜系各一种颜色，表格里一眼区分 */
const CATEGORY_COLOR: Record<DishCategory, string> = {
  家常: 'orange',
  川菜: 'volcano',
  粤菜: 'cyan',
  湘菜: 'red',
  鲁菜: 'blue',
  江浙: 'green',
  其他: 'purple',
};

interface Props {
  dishes: Dish[];
  ingredients: Ingredient[];
  selectedRowKey: string | undefined;
  onSelectedRowKeyChange: (key: string | undefined) => void;
  onEdit: (d: Dish) => void;
  onCreate: () => void;
}

export default function DishManageTable({
  dishes,
  ingredients,
  selectedRowKey,
  onSelectedRowKeyChange,
  onEdit,
  onCreate,
}: Props) {
  // 订阅当前平台：切换平台后成本列要跟着重算 → params 变化触发 ProTable 刷新
  const platform = usePriceStore((s) => s.platform);
  const navigate = useNavigate();
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const selectedDish = dishes.find((d) => d.id === selectedRowKey);

  // 从现有菜品里提取所有实际用过的标签，加上 BUILTIN_TAGS 兜底
  const allTags = useMemo(() => {
    const set = new Set<string>();
    dishes.forEach((d) => d.tags.forEach((t) => set.add(t)));
    BUILTIN_TAGS.forEach((t) => set.add(t));
    return Array.from(set);
  }, [dishes]);

  const columns: ProColumns<Dish>[] = [
    {
      title: '菜品',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      fixed: 'left',
      fieldProps: { style: { width: 225 } },
      render: (_, d) => {
        const cover = resolveImageUrl(d.coverImage);
        return (
          <Space size={10}>
            {cover ? (
              <img
                src={cover}
                alt=""
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewSrc(cover);
                }}
                style={{
                  width: 36, height: 36, objectFit: 'cover', borderRadius: 8,
                  display: 'block', flexShrink: 0, cursor: 'zoom-in',
                }}
              />
            ) : (
              <Avatar shape="square" size={36} style={{ background: '#f0ece5', flexShrink: 0 }}>
                {(d.name || '?').slice(0, 1)}
              </Avatar>
            )}
            <span style={{ fontWeight: 500, color: '#2D2A26' }}>{d.name}</span>
          </Space>
        );
      },
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      valueType: 'select',
      fieldProps: { mode: 'multiple', style: { width: 225 } },
      valueEnum: () => CATEGORY_OPTIONS.reduce((acc, c) => ({ ...acc, [c]: { text: c } }), {}),
      render: (_, d) => (
        <Tag color={CATEGORY_COLOR[d.category]} style={{ marginInlineEnd: 0 }}>
          {d.category}
        </Tag>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 200,
      // tags 是数组，valueType select multiple 让用户选标签，request 里自己做包含匹配
      valueType: 'select',
      fieldProps: { mode: 'multiple', style: { width: 225 } },
      valueEnum: () => allTags.reduce((acc, t) => ({ ...acc, [t]: { text: t } }), {}),
      render: (_, d) =>
        d.tags.length ? (
          <Space size={4} wrap>
            {d.tags.map((t) => (
              <Tag key={t} style={{ marginInlineEnd: 0 }}>
                {t}
              </Tag>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      key: 'difficulty',
      width: 80,
      sorter: true,
      valueType: 'select',
      fieldProps: { mode: 'multiple', style: { width: 225 } },
      valueEnum: {
        1: { text: '简单' },
        2: { text: '中等' },
        3: { text: '较难' },
      },
      render: (_, d) => (
        <Tag color={DIFFICULTY_COLOR[d.difficulty]} style={{ marginInlineEnd: 0 }}>
          {DIFFICULTY_LABEL[d.difficulty]}
        </Tag>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'cookTimeMin',
      key: 'cookTimeMin',
      width: 90,
      sorter: true,
      render: (_, d) => (d.cookTimeMin > 0 ? `${d.cookTimeMin} 分钟` : '—'),
      search: false,
    },
    {
      title: '份量',
      dataIndex: 'servings',
      key: 'servings',
      width: 70,
      render: (_, d) => (d.servings > 0 ? `${d.servings} 人份` : '—'),
      search: false,
    },
    {
      title: '配料数',
      key: 'ingCount',
      width: 80,
      sorter: (a, b) => a.ingredients.length - b.ingredients.length,
      render: (_, d) => `${d.ingredients.length} 项`,
      search: false,
    },
    {
      title: '预估成本',
      key: 'cost',
      width: 100,
      sorter: (a, b) => calcDishCost(a, ingredients) - calcDishCost(b, ingredients),
      render: (_, d) => {
        const c = calcDishCost(d, ingredients);
        return (
          <span style={{ color: c > 0 ? '#E8743C' : '#bbb', fontWeight: c > 0 ? 500 : 400 }}>
            {c > 0 ? `¥${c.toFixed(1)}` : '—'}
          </span>
        );
      },
      search: false,
    },
    {
      // 营养成分：表头分组（营养成分 下面挂 6 个子列），每项单独成一列，不再用悬浮提示
      title: '营养成分',
      key: 'nutrition',
      search: false,
      children: (
        [
          { title: '热量(kcal)', field: 'calories' },
          { title: '蛋白质(g)', field: 'protein' },
          { title: '脂肪(g)', field: 'fat' },
          { title: '碳水(g)', field: 'carbs' },
          { title: '钠(mg)', field: 'sodium' },
          { title: '膳食纤维(g)', field: 'fiber' },
        ] as { title: string; field: keyof DishNutrition }[]
      ).map((c) => ({
        title: c.title,
        key: 'n_' + c.field,
        width: 84,
        search: false,
        sorter: true,
        align: 'right' as const,
        render: (_: unknown, d: Dish) => {
          const n = calcDishNutrition(d, ingredients);
          if (!n) return <Text type="secondary">—</Text>;
          return <span style={{ color: '#2D2A26' }}>{n[c.field]}</span>;
        },
      })),
    },
    {
      // 每行一个入口：点击进入这道菜的详情页（和用户在卡片墙上点进去看到的是同一个页面）
      title: '操作',
      key: 'actions',
      width: 100,
      search: false,
      fixed: 'right',
      render: (_, d) => (
        <Typography.Link
          onClick={(e) => {
            // 别让点击冒泡到行上 -- 否则会顺手把这一行选中
            e.stopPropagation();
            navigate('/menu/' + d.id);
          }}
        >
          菜品详情
        </Typography.Link>
      ),
    },
  ];

  /**
   * ProTable 的 request：接收查询参数，自己过滤 + 排序 + 分页。
   * ProTable 不会自动处理 tags 数组的"包含任意一个"逻辑，这里手动做。
   */
  const request = async (params: Record<string, any>, sort: Record<string, any>) => {
    const { current = 1, pageSize = 20, name, category, tags, difficulty } = params;
    let list = [...dishes];

    if (name) list = list.filter((d) => d.name.toLowerCase().includes(name.toLowerCase()));
    if (category?.length) list = list.filter((d) => category.includes(d.category));
    if (tags?.length) list = list.filter((d) => tags.some((t: string) => d.tags.includes(t)));
    if (difficulty?.length) list = list.filter((d) => difficulty.includes(d.difficulty));

    // 排序：ProTable 传进来的 sort 对象形如 { cookTimeMin: 'ascend' }
    const sortKey = Object.keys(sort)[0];
    const sortDir = Object.values(sort)[0] as 'ascend' | 'descend';
    if (sortKey && sortDir) {
      list.sort((a, b) => {
        let va: number | string;
        let vb: number | string;
        if (sortKey === 'ingCount') { va = a.ingredients.length; vb = b.ingredients.length; }
        else if (sortKey === 'cost') { va = calcDishCost(a, ingredients); vb = calcDishCost(b, ingredients); }
        else if (sortKey.startsWith('n_')) {
          // 营养成分的子列（n_calories / n_protein …）按对应字段排
          const field = sortKey.slice(2) as keyof DishNutrition;
          va = calcDishNutrition(a, ingredients)?.[field] ?? -1;
          vb = calcDishNutrition(b, ingredients)?.[field] ?? -1;
        }
        else { va = (a as any)[sortKey]; vb = (b as any)[sortKey]; }
        if (typeof va === 'string') return sortDir === 'ascend' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
        return sortDir === 'ascend' ? (va as number) - (vb as number) : (vb as number) - (va as number);
      });
    }

    const total = list.length;
    const paged = list.slice((current - 1) * pageSize, current * pageSize);
    return { data: paged, total, success: true };
  };

  return (
    <>
      <ProTable<Dish>
        rowKey="id"
        bordered
        size="small"
        search={{
          labelWidth: 'auto',
          defaultCollapsed: false,
          span: 6,
          optionRender: (searchConfig, formProps, dom) => [
            // 默认的 查询/重置 按钮保留
            ...dom.reverse(),
          ],
        }}
        columns={columns}
        request={request}
        // ingredients/platform 变化时让 ProTable 重新拉（重算成本）
        params={{ ingredientsVersion: ingredients.length, platform }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRowKey ? [selectedRowKey] : [],
          onChange: (keys) => onSelectedRowKeyChange(keys[0] as string | undefined),
          preserveSelectedRowKeys: true,
          columnWidth: 48,
        }}
        onRow={(record) => ({
          onClick: () => {
            // 单选模式再次点击已选中行 = 取消选中
            onSelectedRowKeyChange(selectedRowKey === record.id ? undefined : record.id);
          },
          style: { cursor: 'pointer' },
        })}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (t) => `共 ${t} 道菜`,
        }}
        // 表头固定 + 菜品列固定在左侧：scroll.y 让表体独立滚动，表头始终可见
        // 管理台已去掉顶部栏，高度按「视口 - 搜索区/工具栏/分页」预留
        scroll={{ x: 1700, y: 'calc(100vh - 290px)' }}
        toolBarRender={() => [
          <Button
            key="edit"
            icon={<EditOutlined />}
            type="default"
            disabled={!selectedRowKey}
            onClick={() => selectedDish && onEdit(selectedDish)}
          >
            编辑菜品{selectedDish ? `（${selectedDish.name}）` : ''}
          </Button>,
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            添加菜品
          </Button>,
        ]}
      />

      {/* 封面大图预览（跟原来一样：放在表格外部手动控制，避免和行选中事件打架） */}
      <Image
        style={{ display: 'none' }}
        preview={{
          visible: previewSrc !== null,
          src: previewSrc ?? undefined,
          onVisibleChange: (open) => { if (!open) setPreviewSrc(null); },
        }}
      />
    </>
  );
}
