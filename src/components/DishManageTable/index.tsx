/**
 * 管理员版菜品列表（表格形式）—— 只在「PC 端 + 管理员」时替代 DishCard 卡片墙。
 *
 * 为什么要另做一张表：
 * 管理员进 /menu 是来**维护**菜品的（改名、改分类、调难度、改耗时、删掉不要的），
 * 卡片墙适合「浏览和挑选」，不适合「逐条核对与编辑」—— 卡片上没有可点击的字段，
 * 想改一道菜的分类得先点进详情页再退出来。所以管理端改用表格：一行一道菜，
 * 常用字段直接摊开，编辑和删除都在行内完成，不用跳页。
 *
 * 移动端 / 非管理员仍然是原来的卡片墙（Menu/index.tsx 里按 isMobile + isAdmin 分流）。
 */

import { useMemo, useState } from 'react';
import { Table, Tag, Button, Space, Popconfirm, Avatar, Input } from 'antd';
import type { TableColumnsType } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { Dish } from '@/types';
import { calcDishCost } from '@/utils/price';
import type { Ingredient } from '@/types';
import { resolveImageUrl } from '@/lib/supabase';

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: '简单',
  2: '中等',
  3: '较难',
};

const DIFFICULTY_COLOR: Record<1 | 2 | 3, string> = {
  1: 'green',
  2: 'blue',
  3: 'orange',
};

interface Props {
  dishes: Dish[];
  ingredients: Ingredient[];
  onEdit: (d: Dish) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}

export default function DishManageTable({ dishes, ingredients, onEdit, onDelete, onCreate }: Props) {
  // 表格自带搜索框，这里只管高亮匹配的那一行
  const [kw, setKw] = useState('');

  const rows = useMemo(() => {
    const k = kw.trim().toLowerCase();
    if (!k) return dishes;
    return dishes.filter(
      (d) =>
        d.name.toLowerCase().includes(k) ||
        d.category.toLowerCase().includes(k) ||
        d.tags.some((t) => t.toLowerCase().includes(k))
    );
  }, [dishes, kw]);

  const columns: TableColumnsType<Dish> = [
    {
      title: '菜品',
      dataIndex: 'name',
      key: 'name',
      // 名字列给足宽度：这是扫一眼最需要的信息
      width: 220,
      fixed: 'left',
      render: (_, d) => (
        <Space size={10}>
          <Avatar
            shape="square"
            size={36}
            src={resolveImageUrl(d.coverImage) || undefined}
            style={{ background: '#f0ece5', flexShrink: 0 }}
          >
            {(d.name || '?').slice(0, 1)}
          </Avatar>
          <span style={{ fontWeight: 500, color: '#2D2A26' }}>{d.name}</span>
        </Space>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 90,
      filters: [...new Set(dishes.map((d) => d.category))].map((c) => ({ text: c, value: c })),
      onFilter: (value, d) => d.category === value,
      render: (c: string) => <Tag>{c}</Tag>,
    },
    {
      title: '难度',
      dataIndex: 'difficulty',
      key: 'difficulty',
      width: 80,
      sorter: (a, b) => a.difficulty - b.difficulty,
      render: (v: 1 | 2 | 3) => (
        <Tag color={DIFFICULTY_COLOR[v]} style={{ margin: 0 }}>
          {DIFFICULTY_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'cookTimeMin',
      key: 'cookTimeMin',
      width: 90,
      sorter: (a, b) => a.cookTimeMin - b.cookTimeMin,
      render: (v: number) => (v > 0 ? `${v} 分钟` : '—'),
    },
    {
      title: '份量',
      dataIndex: 'servings',
      key: 'servings',
      width: 70,
      render: (v: number) => (v > 0 ? `${v} 人份` : '—'),
    },
    {
      title: '配料数',
      key: 'ingCount',
      width: 80,
      sorter: (a, b) => a.ingredients.length - b.ingredients.length,
      render: (_, d) => `${d.ingredients.length} 项`,
    },
    {
      title: '预估成本',
      key: 'cost',
      width: 100,
      // 成本随食材价格实时变，排序也按实时值排
      sorter: (a, b) => calcDishCost(a, ingredients) - calcDishCost(b, ingredients),
      render: (_, d) => {
        const c = calcDishCost(d, ingredients);
        return (
          <span style={{ color: c > 0 ? '#E8743C' : '#bbb', fontWeight: c > 0 ? 500 : 400 }}>
            {c > 0 ? `¥${c.toFixed(1)}` : '—'}
          </span>
        );
      },
    },
    {
      title: '标签',
      key: 'tags',
      width: 160,
      render: (_, d) =>
        d.tags.length ? (
          <Space size={4} wrap>
            {d.tags.map((t) => (
              <Tag key={t} color="default" style={{ margin: 0 }}>
                {t}
              </Tag>
            ))}
          </Space>
        ) : (
          <span style={{ color: '#ccc' }}>—</span>
        ),
    },
    {
      title: '操作',
      key: 'op',
      width: 140,
      fixed: 'right',
      render: (_, d) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(d)}>
            编辑
          </Button>
          <Popconfirm
            title="删除这道菜？"
            description={`「${d.name}」会从菜品库移除，已排进菜单的历史记录也会少掉这一项。`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(d.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="搜索菜名 / 分类 / 标签"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          style={{ width: 280 }}
        />
        <span style={{ color: '#999', fontSize: 13 }}>
          共 {dishes.length} 道菜{kw ? `，匹配 ${rows.length} 道` : ''}
        </span>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          添加菜品
        </Button>
      </div>

      <Table<Dish>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1080 }}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (t) => `共 ${t} 道菜`,
        }}
      />
    </>
  );
}
