// 采购清单页面（移动端专用路由，PC 端仍用抽屉）

import { useEffect } from 'react';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ShoppingListPanel from '@/components/ShoppingListPanel';

export default function Shopping() {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* 顶部返回栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ padding: '4px 8px' }}
        >
          返回
        </Button>
        <span style={{ fontSize: 17, fontWeight: 600 }}>采购清单</span>
      </div>

      {/* 清单内容：复用 PC 端抽屉里的同一个组件 */}
      <ShoppingListPanel />
    </div>
  );
}
