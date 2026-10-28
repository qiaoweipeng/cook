// 超级管理员专属：起始页（后台首页）
// 目前只是占位，后续在这里放报表概览（菜品/食材/用户/近七天登录等）

import { Card, Empty } from 'antd';

export default function AdminHome() {
  return (
    <Card>
      <Empty description="起始页建设中，这里之后会放各类报表概览" />
    </Card>
  );
}
