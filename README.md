# 大厨房

> 一套**前后端协同**的做饭管理系统，把「菜谱 → 食材 → 价格 → 采购清单 → 家庭共享」串起来，
> 再加上**超级管理员**统一管理菜单、食材库与所有用户。
> 灵感来源：每次想做菜都得翻小红书/抖音找菜谱，买菜时又算不清要花多少钱，家人多口难调——这个工具就是为「想做饭 + 不想动脑 + 要管账」的人准备的。

---

## ✨ 这个项目解决什么

1. **菜谱管理**：收藏喜欢的菜，写下做法、标签、用时、难度，不用再翻收藏夹里沉睡的链接。
2. **食材库**：所有食材集中管理，每条都有单价（比如「五花肉 ¥28/斤」「鸡蛋 ¥1.2/个」），数据可随时改。
3. **自动算账**：点开一道菜，立刻看到这份菜**大概要花多少钱**；勾选几道想做的菜，自动合并出一份**带总价的采购清单**。
4. **购买清单**：多选菜品 → 自动合并相同食材 → 计算总花费 → 单条勾选已购买。
5. **家庭共享**：支持多用户（昵称+密码），家人登录后看到同一份菜单/食材库；采购清单、每周菜单各自独立。

---

## 🛡 角色与权限

| 角色           | 账号                                                                 | 能力                                            |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| **超级管理员** | `0000` / `000000`（**硬编码，不依赖 users 表**，不可修改、不可删除） | 编辑所有菜谱 / 食材库；用户管理（启停普通账号） |
| **普通用户**   | 自助注册（昵称 2-20 字 + 密码 6 位以上）                             | 浏览菜单、看食材价格、用采购清单/每周菜单       |

> 登录页会**优先匹配管理员账号**（`0000` / `000000`），再走普通登录/注册流程。
> 普通账号被管理员停用后，再次登录会被拒（提示「该账号已被停用」）。
> 每个用户可以上传自己的头像（顶栏右上角 → 头像下拉 → 上传头像），存在云端 `users.avatar`（dataURL）。

### 管理员专属 UI

- 横向导航栏多一个 **「用户管理」** 入口（仅管理员可见）
- 菜单页右上角 **「添加菜品」** 按钮（仅管理员）
- 菜品详情页底部多一个 **「编辑」** 按钮（仅管理员），编辑弹窗里还能 **「删除菜品」**（被引用时会被拒）
- 食材库页行内**没有**编辑/删除按钮；右上角 **「新增食材」** + **「编辑食材」** 按钮（仅管理员，编辑食材需先单选某一行）
- 食材编辑弹窗底部有 **「删除」** 按钮（被任何菜品引用时会被拒）

### 删除级联规则

- **删除食材**：如果有任何菜品正在使用它，**禁止删除**，提示列出引用它的菜品数量。
- **删除菜品**：如果有任何用户把它加进了采购清单或每周菜单，**禁止删除**，提示使用人数。

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
- [x] **采购清单**：多选菜品 → 自动合并相同食材 → 计算总花费 → 单条勾选已购买。
- [x] **数据持久化**：从 localStorage 升级到 **腾讯云 CloudBase PostgreSQL**（PostgREST + Publishable Key）。
- [x] **种子数据**：内置 **57 道家常菜** + **83 种常见食材**。
- [x] **多用户系统**：昵称+密码注册登录，会话持久化，采购清单按用户隔离。

### V2（已实现部分）

- [x] 收藏 / 取消收藏（红心按钮）
- [x] "我做过" 标记 + 做菜记录时间轴
- [x] 菜品封面图（`public/dishes/` 静态文件 + 云端 `dishes.cover_image` 字段，未设置时显示占位图）
- [x] 多人共享菜单（家人加菜，所有人都能看到）
- [x] 一周菜单计划（周一~周日，默认定位今天，可查看/编辑本周任意一天，每天可加 2-3 道菜）
- [x] 食材库 Excel 导入/导出/模板下载（`xlsx`）
- [x] 超级管理员 + 用户启停管理
- [x] 用户头像上传（dataURL 存 `users.avatar`）

### 未来想加（V3 候选）

- [ ] 食材营养成分（卡路里 / 三大营养素）—— 给减脂/控糖场景配菜建议
- [ ] 食材价格随时间变化（历史曲线）
- [ ] 批量导入解析小红书 / 抖音菜谱文本
- [ ] 打印 / 导出采购清单为图片 / PDF
- [ ] RLS 改用 `authenticated` 角色 + JWT 携带 uid 做行级隔离
- [ ] 密码哈希升级到 bcrypt

---

## 🏗 技术栈

| 分类         | 选型                            | 理由                                                       |
| ------------ | ------------------------------- | ---------------------------------------------------------- |
| 框架         | **React 18 + TypeScript 5**     | 主流、类型安全                                             |
| 构建         | **Vite 5**                      | 启动快、HMR 舒服                                           |
| UI           | **Ant Design 5**                | 组件全（Card/Table/Form/Drawer/Statistic…都现成）          |
| 路由         | **React Router v6**             | 单页多视图                                                 |
| 状态         | **Zustand 4** + `persist`       | 比 Redux 轻很多，菜品/食材/采购清单/每周菜单各自独立持久化 |
| 日期         | **dayjs**                       | AntD 内置日期库，用于格式化与"做菜记录"时间戳              |
| 表格导入导出 | **SheetJS (`xlsx`)**            | 食材库支持 Excel 导入 / 导出 / 下载模板                    |
| 后端         | **腾讯云 CloudBase PostgreSQL** | 文档数据库坑太多，PG 模式 + PostgREST 更稳                 |
| 数据库访问   | **PostgREST** (REST API)        | 前端 `fetch` 直接调，不用 `@cloudbase/js-sdk` 中间层       |
| 鉴权         | **Publishable Key** (匿名 JWT)  | 前端可公开，无密码也能注册                                 |
| 工程         | **TS 路径别名 `@/*`**           | `@/types`、`@/lib/...` 引用更短（见 `tsconfig.json`）      |
| 部署         | **CloudBase 静态网站托管**      | 免备案，CDN 加速                                           |

---

## 📂 目录结构

```
cook/
├── public/                         # 静态资源（菜品封面图、logo）
│   └── dishes/                     # 菜品封面图（按菜 id 命名，如 dish_fanqie_chao_egg.jpg）
├── src/
│   ├── assets/                     # 图片/logo
│   ├── components/                 # 通用组件
│   │   ├── DishCard/               # 菜品卡片
│   │   ├── DishEditor/             # 菜品编辑弹窗（管理员的「添加菜品」/「编辑」共用）
│   │   ├── IngredientTag/          # 食材标签
│   │   ├── PriceTag/               # 价格展示
│   │   ├── AppLayout/              # 全局布局
│   │   └── ShoppingListPanel/      # 采购清单侧栏
│   ├── pages/
│   │   ├── Menu/                   # 菜单首页（卡片网格 + 筛选）
│   │   ├── DishDetail/             # 菜品详情
│   │   ├── Ingredients/            # 食材库管理（Table + Form）
│   │   ├── Weekly/                 # 每周菜单（周一~周日计划，默认今天）
│   │   ├── Admin/Users/            # 用户管理（仅超级管理员）
│   │   └── Login/                  # 登录/注册页
│   ├── store/
│   │   ├── useAuthStore.ts         # 当前用户会话（含 role/avatar）
│   │   ├── useDishStore.ts         # 菜品 CRUD（云端，删除前检查占用）
│   │   ├── useIngredientStore.ts   # 食材 CRUD（云端，删除前检查占用）
│   │   ├── useShoppingStore.ts     # 当前采购清单（按用户隔离）
│   │   └── useWeeklyStore.ts       # 每周菜单（按用户隔离）
│   ├── data/
│   │   ├── seedDishes.ts           # 57 道种子菜（含 RETIRED_DISH_IDS）
│   │   └── seedIngredients.ts      # 83 种种子食材
│   ├── lib/
│   │   ├── cloudbase.ts            # PostgREST 客户端（fetch 封装）
│   │   ├── cloudSync.ts            # 嵌套结构 ↔ 多表 互转
│   │   ├── userAdmin.ts            # 超级管理员约定 + users 表云端读写
│   │   ├── usage.ts                # 删除前的占用检查（食材/菜品）
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

| 表名               | 用途                      | 关键字段                                                                                                                              |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `dishes`           | 菜品主表                  | `id` (text PK), `name`, `category`, `difficulty`, `cook_time_min`, `servings`, `cover_image`, `cover_color`, `favorite`, `created_at` |
| `ingredients`      | 食材库                    | `id` (text PK), `name`, `category`, `price_per_unit`, `unit`, `spec`                                                                  |
| `dish_tags`        | 菜-标签（多对多）         | `dish_id`, `tag`（联合主键）                                                                                                          |
| `dish_ingredients` | 菜-食材（多对多，含用量） | `dish_id`, `ingredient_id`, `amount`, `unit`                                                                                          |
| `dish_steps`       | 烹饪步骤                  | `dish_id`, `step_order`, `step_text`（联合主键）                                                                                      |
| `users`            | 用户账号                  | `id` (text PK, 归一化昵称), `nick`, `display_name`, `salt`, `password_hash`, `avatar`, `disabled`, `created_at`                       |
| `shopping_lists`   | 采购清单（按用户隔离）    | `id` (text PK, =uid), `data` (jsonb), `updated_at`                                                                                    |
| `weekly_menus`     | 每周菜单（按用户隔离）    | `id` (text PK, =uid), `data` (jsonb, `{ 日期key: 菜品id[] }`), `updated_at`                                                           |

### 增量 SQL（老库迁移用）

```sql
-- 1) 菜品封面图
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS cover_image text;
UPDATE dishes SET cover_image = '/dishes/dish_fanqie_chao_egg.jpg'
  WHERE id = 'dish_fanqie_chao_egg';

-- 2) 用户头像 + 启停
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
```

> ⚠️ 前端代码对这两组列做了**探测式降级**：列不存在时写入自动跳过该字段，不会让整个操作失败，只是封面/启停暂时不可用。
> 跑完 SQL 后建议加一句让 PostgREST 刷新缓存：`NOTIFY pgrst, 'reload schema';`

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

## 🔐 账号体系

自建，不依赖 CloudBase Auth（CloudBase Auth 强制要邮箱/手机号）：

1. **注册**：`uid = 昵称归一化（小写、去空格）`，密码用 `SHA-256(随机盐 + 密码)` 存
2. **登录**：查 users 表，比对 hash；如果 `disabled = true` 则拒（提示「该账号已被停用」）
3. **会话**：登录后 `uid` + `role` + `avatar` 存到 `localStorage('cook.auth.session')`，刷新保持
4. **采购清单 / 每周菜单**：`id = uid`，所以每人清单/菜单天然隔离
5. **超级管理员**：账号 `0000` / 密码 `000000` 走**硬编码校验**，不查 users 表（不依赖 `password_hash` 列）。users 表里会保留一行 `0000` 用来存头像

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

### 登录测试

- **超级管理员**：账号 `0000`，密码 `000000`（必须完全一致，不带空格）
- **普通用户**：在登录页切到「注册」标签新建，2-20 字昵称 + 6 位以上密码

---

## ☁️ 部署到 CloudBase

### 前置

1. 腾讯云账号 + CloudBase 环境（创建环境时**选 PostgreSQL 模式**，不是默认的文档数据库）
2. 在 CloudBase 控制台 → 静态网站托管 → **开通**（必须手动点一次，CLI 无法开通）
3. 在控制台 → PostgreSQL → SQL 窗口跑建表 SQL + RLS SQL（见上面「RLS」一节）
4. 跑上面「增量 SQL」一节的两组 ALTER（老库用；新库可以一次性建好带列的表）
5. 用 **Publishable Key**（不是 API Key），在 **环境 → 安全配置 → 客户端密钥** 里复制

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

### 🔄 日常更新：改完代码怎么同步到云端

> **核心认知**：`pnpm build` 只是在**本地**生成/覆盖 `dist/` 目录，它**不会自动上传**到云端。
> 云端跑的是静态托管的文件，本地 build 一万次，不上传就永远看不到变化。
> 这就是「build 了但没用」的原因——少了第二步「deploy」。

#### 情况一：纯代码改动（加功能 / 修 bug，不动数据库）

```bash
pnpm deploy
```

它等价于两条命令连跑（已写进 `package.json` 的 scripts）：

```bash
pnpm build                                                        # 1) 本地构建出最新 dist/
tcb hosting deploy dist -e cook-prod-d6g9njw6g0dadf473            # 2) 上传 dist/ 到静态托管（覆盖旧版）
```

注意点：

- **每次都要重新 build**：部署的是 `dist/` 里的产物，不是源码。改了 `src/` 不 build 就 deploy，传上去的还是旧包
- **新增了 `public/` 下的静态文件**（比如菜品封面图）：build 会自动拷进 `dist/`，一起被 deploy 上去，无需单独处理
- **部署完浏览器强刷**：`Cmd + Shift + R`，否则可能命中 CDN/浏览器缓存看到旧页面
- **前提**：本机已装 CLI 并登录过（`npm i -g @cloudbase/cli` + `tcb login`，只需一次）
- 也可以不用命令行：控制台 → 静态网站托管 → 上传文件，把本地 `dist/` 整个目录拖进去（注意 `dishes` 等子目录要一起传）

#### 情况二：涉及数据库结构改动（新增列 / 新建表）

PostgREST **不支持 DDL**，前端代码改不了表结构，必须**先**在 CloudBase 控制台手工执行 SQL：

```bash
# 顺序：先改库 → 再发代码
1. 控制台 → PostgreSQL → SQL 窗口 → 执行 ALTER TABLE / CREATE TABLE（参考「增量 SQL」一节）
2. 执行 NOTIFY pgrst, 'reload schema';        -- 让 PostgREST 刷新表结构缓存
3. pnpm deploy                                  # 再构建 + 上传前端
```

> 顺序建议**先库后码**：本项目对部分新列做了「探测式降级」（如 `cover_image`、`users.avatar` 列不存在时写入自动跳过），
> 就算顺序反了也不会崩，但功能要等列建好 + 重新部署后才真正可用。
>
> 如果新表/新列忘了建，症状通常是：页面上对应数据一直为空、或控制台报 `PostgREST 42703`（列不存在）。

### 关键坑（已踩过）

| 坑                                      | 症状                                            | 解法                                                            |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| 静态托管没在控制台开通                  | 部署"成功"但什么也访问不到                      | 控制台手动点「开通」                                            |
| `VITE_TCB_ENV_ID` 没注入                | 页面打开白屏                                    | `.env` 填了之后**重新 `pnpm build`**                            |
| RLS 没放行 anon                         | 注册/登录报 `permission denied for table users` | 跑上面 RLS SQL                                                  |
| SPA 刷新 404                            | F5 报 404                                       | 控制台 → 静态托管 → 设置 → 错误页面 → 404 用 `/index.html` 兜底 |
| PostgREST 0 行返回 406                  | `pgSelectOne` 改成 `pgSelect`（数组）           | 已修                                                            |
| 默认域名访问偶尔 418                    | 边缘节点风控，**用无痕窗口**打开                | 不要带 `?v=xxx` 查询参数                                        |
| 静态页面 `VM169:1 cls is not defined`   | CloudBase CDN 注入的引导脚本                    | 配 404 → index.html 兜底后自动消失                              |
| `cover_image` / `users.avatar` 列不存在 | PostgREST 报 42703                              | 跑增量 SQL 里的 `ALTER TABLE`                                   |

---

## 📜 License

MIT
