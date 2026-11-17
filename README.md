# 我是大厨

一套围绕「做饭与吃饭」的生活工具。提前安排菜单、自动生成采购清单、记录每次做菜的成本与做法，PC / Pad / 手机全部适配。

> **当前版本：v2.0** · Supabase 数据库 + 腾讯 COS 对象存储
>
> 版本是**演进阶段标记**，和 git tag / npm version 无关，只记录「什么时候在哪件事上做了大的架构调整」。
>
> - [完整版本迭代历史 →](docs/CHANGELOG.md)

***

## 功能

- **菜单首页**：卡片网格浏览所有菜品，菜系筛选 + 属性标签组合筛选 + 关键词搜索
- **菜品详情**：食材清单（含用量 & 成本）+ 分步做法 + 难度/用时
- **食材库 CRUD**：维护名称、分类、计价单位、四平台价格、营养参数 + Excel 导入导出
- **采购清单**：多选菜品 → 自动合并相同食材 → 计算总花费 → 勾选已购买
- **一周菜单计划**：周一\~周日，可查看/编辑
- **收藏 / "我做过"**：红心收藏 + 做菜记录时间轴
- **多人共享菜单**：家庭创建 + 邀请成员，所有人同一份菜单
- **多用户系统**：昵称+密码注册登录，采购清单/菜单按用户隔离
- **超级管理员**：用户管理 + 系统管理 + 种子数据播种
- **PWA**：添加到主屏幕 + 离线可用 + 推送通知

***

## 当前架构

```
浏览器 ──fetch──→ Supabase PostgreSQL（PostgREST REST API）
    │
    ├── fetch → 腾讯 COS（图片 CDN）
    └── fetch → Netlify Function（COS 上传密钥中转）
```

**没有自建后端服务器** —— 前端直连托管服务，图片通过 Provider 抽象层隔离。

### 技术栈

| 分类     | 选型                                                |
| ------ | ------------------------------------------------- |
| 框架     | React 18 + TypeScript 5 + Vite 5                  |
| UI     | Ant Design 5（PC）/ Ant Design Mobile 5（移动）         |
| 状态     | Zustand 4                                         |
| 后端     | **Supabase PostgreSQL**（数据库）                      |
| 图片     | **腾讯 COS**（默认）/ Supabase Storage（备用）· Provider 抽象 |
| 中转     | **Netlify Functions**                             |
| 部署     | Netlify 静态托管（SPA 回退 + 自动部署）                       |
| 表格导入导出 | SheetJS (`xlsx`)                                  |
| 推送     | Supabase Edge Function                            |

### 架构演进（三个版本）

|    | 起始版本        | v1.0             | v2.0（当前）              |
| -- | ----------- | ---------------- | --------------------- |
| 后端 | CloudBase   | Supabase         | Supabase              |
| 图片 | Base64 塞数据库 | Supabase Storage | **Provider 抽象 + COS** |
| 死因 | CU 资源点烧完    | Storage 流量烧完     | —                     |

### 详细设计文档

| 主题                        | 文档                                           |
| ------------------------- | -------------------------------------------- |
| 架构选型 + Provider 抽象 + 补偿事务 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 14 张表 + RLS + 鉴权          | [docs/DATABASE.md](docs/DATABASE.md)         |
| 颜色 / 圆角 / 图标 / 分端适配       | [docs/THEMES.md](docs/THEMES.md)             |
| 三个版本的迭代历史                 | [docs/CHANGELOG.md](docs/CHANGELOG.md)       |
| 踩过的 18 个坑 + 10 条铁律           | [docs/PITFALLS.md](docs/PITFALLS.md)         |

***

## 快速开始

### 前置

- Node.js 20+
- pnpm 9（`corepack enable && corepack prepare pnpm@9.12.3 --activate`）
- Supabase 项目（建表脚本见 `supabase/schema.sql`）

### 本地开发

```bash
pnpm install
cp .env.example .env
# 填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
pnpm dev          # → http://localhost:5173

# COS 本地联调（同时拉起 Netlify Functions）
npx netlify dev
```

### 常用命令

```bash
pnpm seed                    # 只填空表（安全）
pnpm seed -- --force         # 强制同步所有种子
pnpm backup                  # 全量备份到 backups/
pnpm push:netlify            # 构建并部署
pnpm build                   # 打生产包
pnpm test                    # 跑单测
```

### 登录测试

| 角色        | 账号 / 密码                   |
| --------- | ------------------------- |
| **超级管理员** | `0000` / `000000`（硬编码）    |
| **普通用户**  | 自助注册：昵称 2-20 字 + 密码 ≥ 6 位 |

***

## 部署

### 1. Supabase（数据库）

创建项目 → SQL Editor 执行 `supabase/schema.sql` → 拿 **Project URL** 和 **anon public key**。

### 2. Netlify（前端托管 + COS 上传中转）

项目已带 `netlify.toml`，三件事都配好了：

- `pnpm build` → `dist/`
- `/* → /index.html`（SPA 回退）
- `sw.js` 禁缓存（PWA 更新）

**推荐方式**：Netlify → Import repo → 直接 Deploy → 环境变量里加：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- （可选）`VITE_IMAGE_PROVIDER=cos`、`VITE_COS_PUBLIC_BASE`、`VITE_UPLOAD_TOKEN`

改完环境变量要 **Clear cache and deploy site**。

***

## 目录结构

```
cook/
├── public/                 # 静态资源（PWA 图标、TabBar SVG）
├── src/
│   ├── components/         # 通用组件（DishCard、DishEditor、AppLayout…）
│   ├── pages/              # 页面（Menu、DishDetail、Ingredients、Shopping、Admin…）
│   ├── store/              # Zustand stores（菜品/食材/采购/菜单/家庭/认证）
│   ├── lib/
│   │   ├── imageStorage/   # 图片存储 Provider 抽象（index / supabase / cos / paths）
│   │   ├── cloudSync.ts   # 云端 CRUD 封装
│   │   ├── supabase.ts    # Supabase 客户端
│   │   ├── rowMapper.ts   # 云端 ↔ 前端字段转换
│   │   └── userAuth.ts    # 自建账号体系
│   ├── data/              # 种子数据（seedDishes.ts、seedIngredients.ts）
│   ├── hooks/              # useIsMobile、useIsPadPortrait、usePasteImage
│   ├── utils/              # 价格 / 合并 / 日期 / Excel 工具
│   ├── types/              # TypeScript 类型定义
│   ├── theme.ts            # AntD ConfigProvider 主题
│   ├── App.tsx
│   ├── main.tsx
│   └── sw.ts               # Service Worker（PWA）
├── supabase/
│   ├── schema.sql          # 建表脚本（14 张表 + RLS）
│   ├── storage.sql         # 图片 bucket 策略
│   ├── push.sql
│   └── functions/send-push/
├── netlify/functions/
│   └── cos-upload.ts       # COS 上传/删除中转（密钥只在服务端）
├── scripts/
│   ├── seed.ts             # 种子数据播种
│   └── backup.mjs          # 全量备份 / 恢复
├── docs/                   # 详细设计文档
│   ├── ARCHITECTURE.md     # 架构选型 + Provider 抽象
│   ├── DATABASE.md         # 数据库结构 + RLS
│   ├── THEMES.md           # 视觉规范
│   ├── CHANGELOG.md        # 版本迭代历史
│   └── PITFALLS.md         # 踩过的坑 + 铁律
├── .env.example
├── netlify.toml
├── vite.config.ts
├── package.json
└── README.md
```

***

## 待解决（离生产级还差）

| # | 项目                                                         | 优先级  |
| - | ---------------------------------------------------------- | ---- |
| 1 | 错误监控（Sentry 或自建 error\_logs 表）                             | 🔴 高 |
| 2 | 权限收紧（RLS 按 uid 行级隔离 + 管理员移出前端 bundle）                      | 🔴 高 |
| 3 | 性能预算（拆 chunk + `import('xlsx')` 动态加载）                      | 🟠 中 |
| 4 | 测试（store 单测优先：useShoppingStore / useMenuPlanStore）         | 🟠 中 |
| 5 | CI（`.github/workflows/ci.yml`：tsc → test → build → deploy） | 🟠 中 |

**建议顺序**：①错误监控 → ②CI verify → ③性能预算 → ④store 单测 → ⑤RLS 收紧。

前三步做完就能从「MVP」升级到「有人用也不会半夜被电话叫醒」；第五步没做完，**不要让不认识的人注册**。

***

## 安全说明

- 🔒 管理员密码当前**硬编码在前端**（`src/lib/userAdmin.ts`），会被打进 JS bundle
- 🔒 RLS 给 `anon` 全开，任何拿到 anon key 的人都能读写所有表
- 🔒 密码用 SHA-256 单向（无迭代、非 bcrypt）
- 🔒 COS 的 `UPLOAD_TOKEN` 在前端 bundle 里，是防路过脚本级别
- ✅ COS SecretId/SecretKey 在 Netlify Function（服务端），不进 bundle
- ✅ 数据库只存图片 key，不存完整 URL

**家用场景够用，不要存重要密码或开放注册给陌生人。**

***

## 种子数据

57 道家常菜 + 83 种常见食材（食材按斤/L 计价，带四平台价格、营养参数）。

- 菜单：川菜/粤菜/湘菜/鲁菜/江浙/家常/其他 七类
- 标签：汤羹/凉菜/烘焙/减脂/快手/下饭/素食/宴客…
- 封面图：对象存储相对路径（`dishes/xxx.webp`）

播种命令：

```bash
pnpm seed              # 只填空表
pnpm seed -- --force   # 强制同步
```

***

## 备份

```bash
pnpm backup                                      # 全量 14 张表 → backups/<时间戳>.json
pnpm backup -- --restore=xxx.json --force      # 从备份恢复
```

Supabase 后台每日自动备份保留 7 天（最后一道兜底）。

**建议**：动表结构、批量导入食材、升级依赖前先跑一次 `pnpm backup`。
