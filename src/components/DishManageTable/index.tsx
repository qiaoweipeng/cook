/**
 * 管理员版菜品列表（表格形式）—— 只在「PC 端 + 管理员」时替代 DishCard 卡片墙。
 *
 * 为什么要另做一张表：
 * 管理员进 /menu 是来**维护**菜品的（改名、改分类、调难度、改耗时、删掉不要的），
 * 卡片墙适合「浏览和挑选」，不适合「逐条核对与编辑」—— 卡片上没有可点击的字段，
 * 想改一道菜的分类得先点进详情页再退出来。所以管理端改用表格：一行一道菜，
 * 常用字段直接摊开，选中一行后点工具栏「编辑菜品」打开编辑器（删除也在编辑器里）。
 *
 * 移动端 / 非管理员仍然是原来的卡片墙（Menu/index.tsx 里按 isMobile + isAdmin 分流）。
 *
 * 交互跟食材库管理完全一致：表格单选 → 工具栏「编辑菜品」→ 编辑器内可改可删。
 */

import { useMemo, useState } from 'react';
import { Table, Tag, Button, Space, Avatar, Input, Alert, Typography, Image } from 'antd';
import type { TableColumnsType } from 'antd';
import { EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { Dish } from '@/types';
import { calcDishCost } from '@/utils/price';
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
  2: 'blue',
  3: 'orange',
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
  // 表格自带搜索框，这里只管高亮匹配的那一行
  const [kw, setKw] = useState('');
  // 正在预览大图的菜品封面地址；null = 没在预览。
  // 预览弹层放在表格「外面」手动控制，避免跟行选中的点击事件打架
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

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

  const selectedDish = dishes.find((d) => d.id === selectedRowKey);

  const columns: TableColumnsType<Dish> = [
    {
      title: '菜品',
      dataIndex: 'name',
      key: 'name',
      // 名字列给足宽度：这是扫一眼最需要的信息
      width: 220,
      fixed: 'left',
      render: (_, d) => {
        const cover = resolveImageUrl(d.coverImage);
        return (
          <Space size={10}>
            {cover ? (
              // 有封面图：可点击放大。stopPropagation 保证点图不触发行选中；
              // 大图预览由表格「外面」的受控 Image 弹层负责
              <img
                src={cover}
                alt=""
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewSrc(cover);
                }}
                style={{
                  width: 36,
                  height: 36,
                  objectFit: 'cover',
                  borderRadius: 8,
                  display: 'block',
                  flexShrink: 0,
                  cursor: 'zoom-in',
                }}
              />
            ) : (
              <Avatar
                shape="square"
                size={36}
                style={{ background: '#f0ece5', flexShrink: 0 }}
              >
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
  ];

  const handleEdit = () => {
    if (!selectedDish) return;
    onEdit(selectedDish);
  };

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
        <Button
          icon={<EditOutlined />}
          onClick={handleEdit}
          disabled={!selectedRowKey}
        >
          编辑菜品
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          添加菜品
        </Button>
      </div>

      {selectedRowKey && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => onSelectedRowKeyChange(undefined)}
          style={{ marginBottom: 12 }}
          message={
            <span>
              已选中：
              <Text strong>{selectedDish?.name}</Text>
              ，点右上角「编辑菜品」可修改或删除它，点右侧 × 或再次点击该行可取消选中
            </span>
          }
        />
      )}

      <Table<Dish>
        rowKey="id"
        size="small"
        bordered
        columns={columns}
        dataSource={rows}
        scroll={{ x: 1080 }}
        onRow={(record) => ({
          onClick: () => {
            // 单选模式下无法直接取消选中：再次点击已选中的行就取消选中
            onSelectedRowKeyChange(
              selectedRowKey === record.id ? undefined : record.id
            );
          },
          style: { cursor: 'pointer' },
        })}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selectedRowKey ? [selectedRowKey] : [],
          onChange: (keys) => onSelectedRowKeyChange(keys[0] as string | undefined),
          preserveSelectedRowKeys: true,
          columnWidth: 48,
        }}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100],
          showTotal: (t) => `共 ${t} 道菜`,
        }}
      />

      {/*
        封面大图预览：放在 Table 外面、自身隐藏，只靠 previewSrc 手动开合，
        跟食材库表格同一套方案 —— 预览弹层的事件跟表格行不在一条链上，
        点封面 = 只开预览，点行其他位置 = 只切换选中。
      */}
      <Image
        style={{ display: 'none' }}
        preview={{
          visible: previewSrc !== null,
          src: previewSrc ?? undefined,
          onVisibleChange: (open) => {
            if (!open) setPreviewSrc(null);
          },
        }}
      />
    </>
  );
}
