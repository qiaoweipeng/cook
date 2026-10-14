# 🍳 Cook · 我的厨房笔记

> 一套**纯前端**的单页面做饭系统，把「菜谱 → 食材 → 价格 → 购物清单」四件事串起来。
> 灵感来源：每次想做菜都得翻小红书/抖音找菜谱，买菜时又算不清要花多少钱，这个工具就是为「想做饭 + 不想动脑」的人准备的。

---

## ✨ 这个项目解决什么

1. **菜谱管理**：收藏喜欢的菜，写下做法，不用再翻收藏夹里沉睡的链接。
2. **食材库**：所有食材集中管理，每条都有单价（比如「五花肉 ¥28/斤」「鸡蛋 ¥1.2/个」），数据可随时改。
3. **自动算账**：点开一道菜，能立刻看到这份菜**大概要花多少钱**；勾选几道想做的菜，自动合并出一份**带总价的购物清单**。
4. **家庭共享**：支持多用户（昵称+密码），家人登录后看到同一份菜单/食材库；购物清单各自独立。

---

## 🎨 视觉与交互基调

基于 **Ant Design 5** 的 Design Token，但自定义一层「厨房感」主题：

- 主色 `色值 = #E8743C`（暖橙，接近炒锅/红烧的颜色），比 AntD 默认蓝更生活化。
- 圆角偏大（`borderRadius: 12`），配大留白，像菜谱 App 而不像 OA 后台。
- 食材/价格类用 **Statistic** + **Tag** 组合展示，信息密度高但不凌乱。
- 详情页用 **Drawer** 或 **Modal** 流式呈现，不强制跳转，移动端友好。

---

## 🧩 已完成功能

### V1（全部完成 ✅）
- [x] **菜单首页**：卡片网格浏览所有菜品，支持分类筛选（家常 / 川菜 / 粤菜 / 快手…）和关键词搜索。
- [x] **菜品详情**：展示食材清单（含用量 & 单份成本）、分步做法、难度/用时/标签。
- [x] **食材库 CRUD**：新增 / 编辑 / 删除食材，维护名称、单位、单价、备注。
- [x] **购物清单**：多选菜品 → 自动合并相同食材 → 计算总花费 → 单条勾选已购买。
- [x] **数据持久化**：从 localStorage 升级到 **腾讯云 CloudBase PostgreSQL**（PostgREST + Publishable Key）。
- [x] **种子数据**：内置 **58 道家常菜** + **83 种常见食材**。
- [x] **多用户系统**：昵称+密码注册登录，会话持久化，购物清单按用户隔离。

### V2（已实现部分）
- [x] 收藏 / 取消收藏（红心按钮）
- [x] "我做过" 标记 + 做菜记录时间轴
- [x] 菜品封面图（AI 生成，风格统一）
- [x] 多人共享菜单（家人加菜，所有人都能看到）
- [x] 一周菜单计划（周一~周日，默认定位今天，可查看/编辑本周任意一天，每天可加 2-3 道菜）
- [ ] 价格波动记录
- [ ] 打印 / 导出购物清单为图片 / PDF

---

## 🏗 技术栈

| 分类 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | **React 18 + TypeScript 5** | 主流、类型安全 |
| 构建 | **Vite 5** | 启动快、HMR 舒服 |
| UI | **Ant Design 5** | 组件全（Card/Table/Form/Drawer/Statistic…都现成） |
| 路由 | **React Router v6** | 单页多视图 |
| 状态 | **Zustand 4** + `persist` | 比 Redux 轻很多，菜品/食材/购物清单各自独立持久化 |
| 日期 | **dayjs** | AntD 内置日期库，用于格式化与"做菜记录"时间戳 |
| 表格导入导出 | **SheetJS (`xlsx`)** | 食材库支持 Excel 导入 / 导出 / 下载模板 |
| 后端 | **腾讯云 CloudBase PostgreSQL** | 文档数据库坑太多，PG 模式 + PostgREST 更稳 |
| 数据库访问 | **PostgREST** (REST API) | 前端 `fetch` 直接调，不用 `@cloudbase/js-sdk` 中间层 |
| 鉴权 | **Publishable Key** (匿名 JWT) | 前端可公开，无密码也能注册 |
| 工程 | **TS 路径别名 `@/*`** | `@/types`、`@/lib/...` 引用更短（见 `tsconfig.json`） |
| 部署 | **CloudBase 静态网站托管** | 免备案，CDN 加速 |

---

## 📂 目录结构

```
cook/
├── public/                         # 静态资源（菜品封面图、logo）
│   └── dishes/                     # 58 张 AI 生成菜品图
├── src/
│   ├── assets/                     # 图片/logo
│   ├── components/                 # 通用组件
│   │   ├── DishCard/               # 菜品卡片
│   │   ├── IngredientTag/          # 食材标签
│   │   ├── PriceTag/               # 价格展示
│   │   ├── AppLayout/              # 全局布局
│   │   └── ShoppingListPanel/      # 购物清单侧栏
│   ├── pages/
│   │   ├── Menu/                   # 菜单首页（卡片网格 + 筛选）
│   │   ├── DishDetail/             # 菜品详情
│   │   ├── Ingredients/            # 食材库管理（Table + Form）
│   │   ├── Weekly/                 # 每周菜单（周一~周日计划，默认今天）
│   │   └── Login/                  # 登录/注册页
│   ├── store/
│   │   ├── useAuthStore.ts         # 当前用户会话
│   │   ├── useDishStore.ts         # 菜品 CRUD（云端）
│   │   ├── useIngredientStore.ts   # 食材 CRUD（云端）
│   │   ├── useShoppingStore.ts     # 当前购物清单（按用户隔离）
│   │   └── useWeeklyStore.ts       # 每周菜单（按用户隔离）
│   ├── data/
│   │   ├── seedDishes.ts           # 58 道种子菜
│   │   └── seedIngredients.ts      # 83 种种子食材
│   ├── lib/
│   │   ├── cloudbase.ts            # PostgREST 客户端（fetch 封装）
│   │   ├── cloudSync.ts            # 嵌套结构 ↔ 多表 互转
│   │   └── userAuth.ts             # 自建账号体系（昵称+密码+盐+SHA-256）
│   ├── types/                      # 类型定义
│   ├── utils/                      # 价格/合并/计算/一周日期工具
│   ├── theme.ts                    # AntD ConfigProvider 主题
│   ├── App.tsx
│   └── main.tsx
├── .env.example                    # 环境变量模板
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 💾 数据库结构（PostgreSQL）

后端是腾讯云 CloudBase 的 **PostgreSQL 模式**（不是文档数据库），前端用 **PostgREST** 直接调 REST API。

### 表（8 张）

| 表名 | 用途 | 关键字段 |
| --- | --- | --- |
| `dishes` | 菜品主表 | `id` (text PK), `name`, `category`, `difficulty`, `cook_time_min`, `servings`, `cover_color`, `favorite`, `created_at` |
| `ingredients` | 食材库 | `id` (text PK), `name`, `category`, `price_per_unit`, `unit`, `spec` |
| `dish_tags` | 菜-标签（多对多） | `dish_id`, `tag`（联合主键） |
| `dish_ingredients` | 菜-食材（多对多，含用量） | `dish_id`, `ingredient_id`, `amount`, `unit` |
| `dish_steps` | 烹饪步骤 | `dish_id`, `step_order`, `step_text`（联合主键） |
| `users` | 用户账号 | `id` (text PK, 归一化昵称), `nick`, `display_name`, `salt`, `password_hash` |
| `shopping_lists` | 购物清单（按用户隔离） | `id` (text PK, =uid), `data` (jsonb), `updated_at` |
| `weekly_menus` | 每周菜单（按用户隔离） | `id` (text PK, =uid), `data` (jsonb, `{ 日期key: 菜品id[] }`), `updated_at` |

> 新增 `weekly_menus` 表的建表 SQL：
>
> ```sql
> CREATE TABLE weekly_menus (
>   id text PRIMARY KEY,
>   data jsonb NOT NULL DEFAULT '{}'::jsonb,
>   updated_at timestamptz NOT NULL DEFAULT now()
> );
> ```
> 建表后记得执行下面的 RLS 放行。

### RLS（行级安全）

所有表都启用 RLS，给 `anon` 角色（对应 Publishable Key）全开：

```sql
ALTER TABLE <表名> ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_anon_all ON <表名> FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon;
```

> ⚠️ 这是个人项目的「全开」配置，**不适合生产多人共用**。生产场景应该用 `authenticated` 角色 + JWT 携带 uid 做行级隔离。

### 鉴权

- 前端用 **Publishable Key**（`VITE_TCB_PUBLISHABLE_KEY`）作为 Bearer Token
- 服务端 PostgREST 把 anon 角色赋给请求，所有 SQL 都按 RLS 规则过滤
- **没有邮箱/手机号要求**，用户只用昵称+密码

---

## 🔐 账号系统

自建，不依赖 CloudBase Auth（CloudBase Auth 强制要邮箱/手机号）：

1. **注册**：`uid = 昵称归一化（小写、去空格）`，密码用 `SHA-256(随机盐 + 密码)` 存
2. **登录**：查 users 表，比对 hash
3. **会话**：登录后 `uid` 存到 `localStorage('cook.auth.session')`，刷新保持
4. **购物清单**：`shopping_lists.id = uid`，所以每人清单天然隔离

> 安全性是「防君子不防小人」—— 密码是 SHA-256 单向（没有迭代、没 bcrypt），他人拿到数据库 hash 配合彩虹表可以爆破。家用场景够用，不要存重要密码。

---

## 🚀 本地开发

```bash
# 1. 安装依赖（pnpm 9）
corepack enable && corepack prepare pnpm@9.12.3 --activate
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 填入 VITE_TCB_ENV_ID 和 VITE_TCB_PUBLISHABLE_KEY

# 3. 启动开发服务器
pnpm dev          # → http://localhost:5173

# 4. 打生产包
pnpm build
```

---

## ☁️ 部署到 CloudBase

### 前置

1. 腾讯云账号 + CloudBase 环境（创建环境时**选 PostgreSQL 模式**，不是默认的文档数据库）
2. 在 CloudBase 控制台 → 静态网站托管 → **开通**（必须手动点一次，CLI 无法开通）
3. 在控制台 → PostgreSQL → SQL 窗口跑建表 SQL + RLS SQL（见上面「RLS」一节）
4. 用 **Publishable Key**（不是 API Key），在 **环境 → 安全配置 → 客户端密钥** 里复制

### 一键部署

```bash
# 1) 装 CLI
npm i -g @cloudbase/cli
tcb login                                  # 浏览器扫码

# 2) 部署
pnpm build
tcb hosting deploy dist -e <你的ENV_ID>
```

部署完默认域名：`https://<env-id>-<appid>.tcloudbaseapp.com`

### 关键坑（已踩过）

| 坑 | 症状 | 解法 |
| --- | --- | --- |
| 静态托管没在控制台开通 | 部署"成功"但什么也访问不到 | 控制台手动点「开通」 |
| `VITE_TCB_ENV_ID` 没注入 | 页面打开白屏 | `.env` 填了之后**重新 `pnpm build`** |
| RLS 没放行 anon | 注册/登录报 `permission denied for table users` | 跑上面 RLS SQL |
| SPA 刷新 404 | F5 报 404 | 控制台 → 静态托管 → 设置 → 错误页面 → 404 用 `/index.html` 兜底 |
| PostgREST 0 行返回 406 | `pgSelectOne` 改成 `pgSelect`（数组） | 已修 |
| 默认域名访问偶尔 418 | 边缘节点风控，**用无痕窗口**打开 | 不要带 `?v=xxx` 查询参数 |
| 静态页面 `VM169:1 cls is not defined` | CloudBase CDN 注入的引导脚本 | 配 404 → index.html 兜底后自动消失 |

---

## 📊 迭代日志

- **Day 1**：脚手架 + 主题 + 类型定义 + seed 数据，浏览菜品 → 看详情闭环。
- **Day 2**：食材库 CRUD + 价格维护；菜品详情里显示成本。
- **Day 3**：购物清单（多选菜品 → 合并 → 总价 → 勾选）。
- **Day 4**：打磨样式、搜索/筛选、做菜记录、空状态。
- **Day 5**：从 localStorage 切到 **CloudBase 文档数据库**，再切到 **PostgreSQL + PostgREST**。
- **Day 6**：自建账号体系（昵称+密码），RLS 放行 anon，部署上线。
- **Day 7**：AI 生成 58 张菜品封面图，统一风格。

---

## 🎯 已知限制 / 后续 TODO

- [ ] 食材价格随时间变化（历史曲线）
- [ ] 菜谱导入（解析小红书/抖音文本）
- [ ] 打印 / 导出购物清单为图片
- [ ] 把 anon 全开 RLS 改成 authenticated 角色 + JWT 携带 uid
- [ ] 密码哈希升级到 bcrypt
- [ ] 多人同时编辑菜品时的冲突合并（last-write-wins 暂用）

---

## 📜 License

MIT
