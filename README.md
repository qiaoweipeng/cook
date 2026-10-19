# 我是大厨

> 一套**前后端协同**的做饭管理系统，把「菜谱 → 食材 → 价格 → 采购清单 → 家庭共享」串起来，
> 再加上**超级管理员**统一管理菜单、食材库与所有用户。
> 灵感来源：每次想做菜都得翻小红书/抖音找菜谱，买菜时又算不清要花多少钱，家人多口难调——这个工具就是为「想做饭 + 不想动脑 + 要管账」的人准备的。

---

## ✨ 这个项目解决什么

**「我是大厨」是一套前后端协同的做饭管理系统**，围绕「今天吃什么」这件事，
把 **菜谱 → 食材 → 价格 → 采购清单 → 家庭共享** 串成一条线，主要解决四个日常痛点：

| 痛点 | 怎么解决 |
| --- | --- |
| **不知道买哪些菜** | 每道菜都自动算出**大概成本**；勾选想做的菜，直接生成一份采购清单，到菜市场/超市买一样勾一样 |
| **不会做** | 每道菜给出完整**用料 + 分步做法**，照着走完一遍就能上桌，不用再去翻视频或搜教程 |
| **食材成本不好控** | 食材库统一登记单价，成本按最新单价折算，买之前就知道这道菜要花多少钱 |
| **上班族每天吃啥** | 提前把一周的菜排好，到点打开就照着做，不用临时纠结 |

落到具体模块上：

- **菜谱管理**：收录每道菜的标签、难度、用时、份量、食材用量和分步做法，支持新增 / 编辑 / 删除 / 收藏，想找的时候一搜就有。
- **食材库**：集中维护食材的名称、单位、单价与单位换算（支持 Excel 导入导出）。价格随行就市，管理员改一下单价，所有菜的成本立刻跟着更新，所以算出来的成本基本贴近实际买菜价。
- **自动算账**：自动折算每道菜的成本、合并重复食材算总价，并生成一份可以直接照着买的采购清单。
- **家庭共享**：多人共用一份菜单与食材库，采购清单、菜单安排各自独立；家庭相关的功能（邀请加入、成员权限、管理员转让等）也在逐步补完。

> ⚠️ 项目整体还处在**测试完善阶段**：普通用户注册流程比较简单（暂无验证码），部分功能的边界还没打磨好，
> 这些属于「能用但不算完善」，不影响日常使用，后面会持续改进。

---

## 🛡 角色与权限

| 角色           | 账号                                                                 | 能力                                            |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| **超级管理员** | `0000` / `000000`（**硬编码，不依赖 users 表**，不可修改、不可删除） | 编辑所有菜谱 / 食材库；用户管理（启停普通账号） |
| **普通用户**   | 自助注册（昵称 2-20 字 + 密码 6 位以上）                             | 浏览菜单、看食材价格、用采购清单/今日菜单       |

> 登录页会**优先匹配管理员账号**（`0000` / `000000`），再走普通登录/注册流程。
> 普通账号被管理员停用后，再次登录会被拒（提示「该账号已被停用」）。
> 每个用户可以上传自己的头像（顶栏右上角 → 头像下拉 → 上传头像），存在云端 `users.avatar`（dataURL）。

> ⚠️ **安全现状（后续会改进，暂不适合放真实重要数据）**
>
> - 超级管理员账号是**硬编码**的（`src/lib/userAdmin.ts` 里的 `ADMIN_UID` / `ADMIN_PASSWORD`），改不了也删不掉，后续要改成可配置 + 强哈希存储
> - 普通用户注册只要昵称 + 密码，**没有邮箱/手机号验证、没有验证码**，谁都能随手注册
> - 登录没有失败次数限制和验证码，密码用 SHA-256 且未加迭代，彩虹表可以爆破
> - 数据库 RLS 目前给 `anon` 全开，生产环境应改成按 uid 的行级隔离
>
> 当前阶段这些不是重点，先把功能跑通；后面会按顺序补齐。

### 超级管理员能做什么

**管理员没有专属 UI**——看到的还是同一套界面（同样的顶栏导航、同样的菜品卡片），
只是**比普通用户多一些入口和按钮**，用来维护系统里的数据；所有管理操作都在 **PC 端**完成。

按顺序，管理员比普通用户多出来的能力：

- 顶部横向导航栏多出 **「用户管理」** 和 **「系统管理」** 两个入口（仅管理员可见）
- **菜单页**：右上角 **「添加菜品」**
- **菜品详情页**：底部 **「编辑」** 按钮，打开后有 **添加封面图 / 修改信息 / 保存**
- **编辑菜品弹窗**：底部 **「删除菜品」**（有人在采购清单或菜单里用了它 → 拒绝删除）
- **食材库页**：**「新增食材」** + **「编辑食材」**（需先单选某一行），行内没有编辑/删除按钮
- **食材库页**（管理员专属区）：**「下载模板 / 导出 Excel / 导入 Excel」**
- **编辑食材弹窗**：底部 **「删除」**（有任何菜品引用该食材 → 拒绝删除）
- **用户管理页**：查看全部用户、按昵称/账号搜索、**停用 / 启用某个账号**、查看最近登录信息（设备 / 系统 / 浏览器 / IP / 地区）
- **系统管理页**：云端连通性、14 张表的行数、**操作日志**、**登录日志**、本机浏览器缓存占用

### 删除级联规则

- **删除食材**：如果有任何菜品正在使用它，**禁止删除**，提示列出引用它的菜品数量。
- **删除菜品**：如果有任何用户把它加进了采购清单或菜单，**禁止删除**，提示使用人数。

> 📱 **移动端不做管理员适配**：`AppLayout` 里判断条件是 `showMobileNav = isMobile && !isAdmin`，
> 管理员登录后走的就是 PC 端那套界面（横向导航栏），不做移动端适配。
> 会拿手机登录的**都是普通用户**，移动端只需保证普通用户「看得清、点得动」即可。

---

## 🎨 视觉与交互基调

两套 UI：**PC 端用 Ant Design 5**，**移动端用 Ant Design Mobile**，共用同一套品牌色。

### PC 端 · Ant Design 5

在 `src/theme.ts` 里通过 `ConfigProvider` 覆写了 Design Token，做出一层「厨房感」主题：

| Token | 值 | 说明 |
| --- | --- | --- |
| `colorPrimary` / `colorInfo` | `#E8743C` | 暖橙主色，接近红烧/糖色，比 AntD 默认蓝更「有食欲」 |
| `colorSuccess` / `colorWarning` | `#7BB661` / `#F0AD4E` | 青菜绿、暖黄，配合主色形成食材感的配色 |
| `borderRadius` | `12`（Card 用 `16`） | 圆角偏大 + 大留白，像菜谱 App 而不像 OA 后台 |
| `colorBgLayout` | `#FAF7F2` | 燕麦米白，长时间看菜谱不刺眼 |
| `colorTextHeading` | `#2D2A26` | 软黑，避免纯黑的生硬感 |
| Layout | 顶栏白底、高 `64`，选中项底色 `#FFF1E8` | 主次分明，导航位置稳定 |
| 字体 | PingFang SC / 微软雅黑 优先 | 中文显示效果优先 |

**为什么这么定**：这是个每天都会打开的生活类工具，不是后台管理系统。暖橙唤起食欲，米白降低长时间阅读疲劳，大圆角削弱「表格感」，最终目标是让人愿意天天用，而不是让人觉得在点 OA。

### Mobile 端 · Ant Design Mobile

移动端接 `antd-mobile` + `antd-mobile-icons`，用在 `MobileTabBar`、菜谱列表、食材库、个人中心等处（`TabBar` / `SearchBar` / `List` / `Card` / `Switch` / `Input` / `Dialog` / `Toast` / `Empty` / `Badge`）。

- **主色调与 PC 保持一致**（`#E8743C`），品牌色统一；`src/index.css` 里的 `.price-tag` 等价格相关元素复用同一个色，让「成本」在页面里视觉上最跳。
- **为什么用 antd-mobile**：它是为**触屏**设计的——组件按手指热区尺寸做的安全区/高度、`PullToRefresh`、`SwipeAction` 等手势类交互都现成，体积也远小于桌面组件；而不是把 PC 组件缩到小屏上（按钮会挤、点击区过小）。
- 交互上采用**底部 TabBar 常驻**（首页 / 今日菜单 / 食材库 / 采购清单 / 个人，带徽标提示），搜索框与标签栏**吸顶**，单列卡片流式展示，减少层级跳转。

### 📱 状态栏与吸顶栏一体化（iOS 已做 / Android 待做）

**问题**：添加到主屏幕当 App 用之后，手机顶部那条系统状态栏（时间 / 运营商 / 电量）是**纯白底**的，
和首页吸顶那条橙色渐变之间横着一道明显分界，一眼就能看出是「系统一条 + 网页一条」两截。

**目标**：让吸顶的橙色渐变直接铺到状态栏底下，两者连成一片。

#### iOS（已实现，改动在三处）

| 位置 | 改了什么 | 作用 |
| --- | --- | --- |
| `index.html` | `apple-mobile-web-app-status-bar-style` → `black-translucent` | 状态栏背景变透明，网页从屏幕最顶端 `(0,0)` 开始绘制，状态栏浮在内容之上 |
| `index.html` | viewport 带 `viewport-fit=cover`（原来就有） | 配合上一条，`env(safe-area-inset-top)` 才会等于状态栏高度 |
| `src/components/AppLayout` | Content 的 `paddingTop: calc(16px + env(safe-area-inset-top))` | 给状态栏让出高度，否则各页面顶部会被它压住 |
| `src/pages/Menu` | 吸顶栏 `marginTop: calc(-16px - env(safe-area-inset-top))` | 把上面让出来的高度抵消掉，让吸顶栏顶到 `(0,0)`，渐变顺势盖住状态栏 |

吸顶栏内部仍保留 `padding: calc(10px + env(safe-area-inset-top)) 12px 10px`，
所以搜索框、分类标签都还在状态栏下方，不会被压住。

**要点与已知取舍**：

- **只在「添加到主屏幕」的 standalone 模式生效**。用 Safari 打开时 `apple-mobile-web-app-status-bar-style` 会被忽略，状态栏仍然是白底 —— 那种形态下本来就有地址栏，谈不上突兀。
- `black-translucent` 下 **iOS 会把状态栏文字强制改成白色**，这是我们改不了的。现在铺的是很淡的橙（`rgba(232,116,60,0.16)`），白字在上面对比度偏低；如果后面觉得看不清，只有一个办法：把状态栏那一条的橙加深（比如压到 `#D9622F` 一档），代价是和下面淡橙的吸顶栏之间会出现一道新的分界。
- `env(safe-area-inset-top)` 在普通浏览器和 Android 上是 `0`，所以上面这些 calc 不会把 Android / PC 的布局撑变形。
- 改完 **manifest / meta 后要重新 build 部署，并在手机上删掉旧的桌面图标重新添加**，否则 standalone 的旧配置还在。

#### Android（没做，做法记录在这）

Android 的状态栏颜色由 **`theme_color`** 控制，规则和 iOS 完全不同：

- **只认纯色，不支持渐变**。写 `linear-gradient(...)` 进去会被直接忽略。
- 取值建议 `#F7E2D5`（就是首页渐变左上角那一小块的实际合成色：品牌橙 16% 叠在米白 `#FAF7F2` 上）。
  用它当状态栏底色，和吸顶栏最浓的那一端能对上，接缝不明显。

要动的话是这两处，改完重新部署 + 重装 PWA：

```html
<!-- index.html -->
<meta name="theme-color" content="#f7e2d5" />
```

```ts
// vite.config.ts → VitePWA({ manifest: { ... } })
manifest: {
  theme_color: '#F7E2D5',   // 现在是 #ffffff
  background_color: '#FAF7F2',
}
```

> standalone 模式下 **manifest 的 `theme_color` 优先级高于 `<meta name="theme-color">`**，两个都要改，只改一个不生效。
> 状态栏文字颜色 Android 是**按背景深浅自动适配**的（浅底 → 深色字），所以不用管对比度，这点比 iOS 省心。

---

## 🧩 已完成功能

### V1（全部完成 ✅）

- [x] **菜单首页**：卡片网格浏览所有菜品，支持分类筛选（家常 / 川菜 / 粤菜 / 快手…）和关键词搜索。
- [x] **菜品详情**：展示食材清单（含用量 & 单份成本）、分步做法、难度/用时/标签。
- [x] **食材库 CRUD**：新增 / 编辑 / 删除食材，维护名称、单位、单价、备注。
- [x] **采购清单**：多选菜品 → 自动合并相同食材 → 计算总花费 → 单条勾选已购买。
- [x] **数据持久化**：从 localStorage 升级到 **Supabase PostgreSQL**（经 CloudBase PG 迁移而来）。
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
- [ ] 食材价格自动更新（对接外部行情或后台定时任务），让成本始终贴近市场价
- [ ] 食材价格随时间变化（历史曲线 / 涨跌提示）
- [ ] 菜品封面改存 Supabase Storage（免费 1 GB），数据库只留 URL
- [ ] 列表查询剔除大字段，避免每次同步都把全部封面图拉下来
- [ ] 步骤图 / 食材图（**前提：先完成上面的对象存储迁移**，否则 Base64 会撑爆免费额度）
- [ ] 超级管理员账号改造：去掉硬编码，入库管理 + 强哈希存储
- [ ] 注册 / 登录加验证码与失败次数限制，密码哈希升级到 bcrypt
- [ ] RLS 改用 `authenticated` 角色 + JWT 携带 uid 做行级隔离

---

## 🏗 技术栈

| 分类         | 选型                            | 理由                                                       |
| ------------ | ------------------------------- | ---------------------------------------------------------- |
| 框架         | **React 18 + TypeScript 5**     | 主流、类型安全                                             |
| 构建         | **Vite 5**                      | 启动快、HMR 舒服                                           |
| UI           | **Ant Design 5**                | 组件全（Card/Table/Form/Drawer/Statistic…都现成）          |
| 路由         | **React Router v6**             | 单页多视图                                                 |
| 状态         | **Zustand 4** + `persist`       | 比 Redux 轻很多，菜品/食材/采购清单/菜单各自独立持久化 |
| 日期         | **dayjs**                       | AntD 内置日期库，用于格式化与"做菜记录"时间戳              |
| 表格导入导出 | **SheetJS (`xlsx`)**            | 食材库支持 Excel 导入 / 导出 / 下载模板                    |
| 后端         | **Supabase PostgreSQL**         | 免费额度够用；之前 CloudBase 体验版 3000 资源点 4 天耗尽并触发资源隔离 |
| 数据库访问   | **Supabase Data API（PostgREST）** | 前端 `fetch` 直接调 REST，无中间层                                    |
| 鉴权         | **anon key + 表级 RLS**         | 前端可公开的 JWT，靠 RLS 策略兜底；用户只用昵称+密码，无需邮箱手机    |
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
│   │   ├── MenuPlan/               # 今日菜单（默认今日 / 本周 / 本月 三视图，路由 /menu-plan，周月可翻页）
│   │   ├── Admin/Users/            # 用户管理（仅超级管理员）
│   │   └── Login/                  # 登录/注册页
│   ├── store/
│   │   ├── useAuthStore.ts         # 当前用户会话（含 role/avatar）
│   │   ├── useDishStore.ts         # 菜品 CRUD（云端，删除前检查占用）
│   │   ├── useIngredientStore.ts   # 食材 CRUD（云端，删除前检查占用）
│   │   ├── useShoppingStore.ts     # 当前采购清单（按用户隔离）
│   │   └── useWeeklyStore.ts       # 菜单（按日期存，按用户隔离）
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

后端是 **Supabase 的 PostgreSQL**，前端通过它的 **Data API（标准 PostgREST）** 直接调 REST。

**全新项目一键建表**：Supabase 控制台 → **SQL Editor** → 粘贴 `supabase/schema.sql` 全文执行即可（幂等，可重复执行）。

### 表（14 张）

| 表名                 | 用途                      | 关键字段                                                                                                                              |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `dishes`             | 菜品主表                  | `id` (text PK), `name`, `category`, `difficulty`, `cook_time_min`, `servings`, `cover_image`, `cover_color`, `favorite`, `created_at` |
| `ingredients`        | 食材库                    | `id` (text PK), `name`, `category`, `price_per_unit`, `unit`, `spec`, `note`, `unit_grams`, `unit_ml`                                 |
| `dish_tags`          | 菜-标签（多对多）         | `dish_id`, `tag`（联合主键）                                                                                                          |
| `dish_ingredients`   | 菜-食材（含用量）         | `id` (bigserial PK), `dish_id`, `ingredient_id`, `amount`, `unit`                                                                     |
| `dish_steps`         | 烹饪步骤                  | `dish_id`, `step_order`, `step_text`（联合主键）                                                                                      |
| `users`              | 用户账号                  | `id` (text PK, 归一化昵称), `nick`, `display_name`, `salt`, `password_hash`, `avatar`, `disabled`, `created_at`                       |
| `shopping_lists`     | 采购清单（按用户隔离）    | `id` (text PK, =uid), `data` (jsonb), `updated_at`                                                                                    |
| `weekly_menus`       | 菜单安排（按日期存，按用户/家庭隔离）| `id` (text PK, =uid 或家庭 id), `data` (jsonb, `{ 日期key: 菜品id[] }`), `updated_at`                                                |
| `families`           | 家庭                      | `id` (text PK, `fam_<创建者uid>`), `admin_uid`, `created_at`                                                                          |
| `family_members`     | 家庭成员                  | `id` (text PK, `<famId>__<uid>`), `family_id`, `uid`, `name`, `role`, `permission`, `joined_at`                                       |
| `family_invites`     | 家庭邀请 / 管理员转让     | `id` (uuid PK), `family_id`, `from_uid`, `to_uid`, `to_name`, `status`, `type`, `created_at`                                          |
| `family_menu_audit`  | 家庭菜单修改历史          | `id` (uuid PK), `family_id`, `actor_uid`, `actor_name`, `action`, `day`, `detail`, `created_at`                                       |
| `login_logs`         | 登录日志                  | `id` (text PK), `uid`, `nick`, `login_at`, `ip`, `region`, `device`, `os`, `browser`, `ua`, `screen`, `language`                      |
| `op_logs`            | 操作日志（审计）          | `id` (text PK), `actor_uid`, `actor_name`, `action`, `target`, `detail`, `created_at`                                                 |

> 建表脚本刻意**没有加外键**：种子数据的写入顺序不受控（菜品可能先于食材写入），加了外键会在初始化阶段冲突。

### RLS（行级安全）

所有表启用 RLS，给 `anon` / `authenticated` 全开（`supabase/schema.sql` 末尾会自动建 policy）：

```sql
ALTER TABLE <表名> ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_anon_all ON <表名> FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
```

> ⚠️ 这是个人/自用的「全开」配置，**不适合公开多人共用**。生产场景应该用 `authenticated` 角色 + JWT 携带 uid 做行级隔离。
> Supabase 的表一旦开启 RLS 却不建 policy，前端读到的会是**空数组**（不是报错），很容易误判成「没数据」。

### 鉴权

- 前端请求头必须带 **`apikey`**；旧版 `eyJ...` 的 JWT key 会额外再带一个 `Authorization: Bearer`
  （代码按 key 前缀自动判断，见 `src/lib/supabase.ts` 的 `authHeaders`）
- Supabase 用 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 两个环境变量配置
- key 有两代，**填哪个都能跑**：新版 **Publishable key**（`sb_publishable_...`，推荐）／旧版 **anon public key**（`eyJ...`，2026 年底弃用）
- ⚠️ **绝对不要用 Secret key / service_role key**：它会绕过全部 RLS，等于把整个数据库交给外人
- 账号体系是自建的昵称+密码，**不走 Supabase Auth**，所以不需要邮箱/手机号

### 🌱 种子数据（内置菜谱 / 食材）

数据源只有一个：`src/data/seedDishes.ts`（**57 道家常菜**）和 `src/data/seedIngredients.ts`（**83 种常见食材**）。
它承担两件事：

1. **App 自动播种**：首次打开时如果 `dishes` / `ingredients` 是空表，前端会自动把它们写进去
2. **手动补种**：数据库被清空、或想恢复出厂菜谱时，直接在命令行重跑

```bash
pnpm seed                    # 只填空表：已有数据的表会跳过（默认，安全）
pnpm seed -- --dry           # 只打印将要做的事，不写库
pnpm seed -- --force         # 强制同步：按 id 更新已存在的行，缺失的补上（不会删除你自己加的菜）
pnpm seed -- --only=dishes   # 只补菜单（--only=ingredients 同理）
```

> ⚠️ **种子脚本只写数据，不建表**。建表必须在 Supabase 控制台 → SQL Editor 执行 `supabase/schema.sql`
> （PostgREST 不支持 DDL，前端/脚本无权 `CREATE TABLE`）。顺序永远是：**先建表 → 再灌数据**。
>
> 脚本和运行时共用同一份字段转换（`src/lib/rowMapper.ts`），改了表结构只需要改那一处。
> `--force` 不会删掉你自己新增的菜或食材，只会把内置种子同步进去。

### 💾 备份与恢复

```bash
pnpm backup                                      # 备份到 backups/<时间戳>.json
pnpm backup -- --dir=~/Documents/cook-backup     # 指定目录（建议放到网盘同步文件夹）
pnpm backup -- --restore=backups/xxx.json --force # 从备份恢复（会先清空目标表，必须显式 --force）
```

- 导出的是**全量 14 张表**的 JSON（`scripts/backup.mjs`），自动分页（绕过 Supabase 单次 1000 行上限）
- 用的是前端同一个 anon key，**不需要额外密钥**
- 恢复时因为表之间没有外键，顺序无所谓；脚本会先清空目标表再写入
- 恢复完建议**清掉浏览器缓存**（DevTools → Application → IndexedDB 删掉）再看，本地缓存会覆盖云端的表现

**建议的备份节奏**：日常不用管；**动表结构、批量导入食材、升级依赖前**先跑一次 `pnpm backup`。
另外 Supabase 后台本身也有每日自动备份：Dashboard → Database → **Backups**（免费版保留 7 天），它是最后一道兜底。

### 💰 Supabase 免费版容量（能装多少东西）

| 项目 | 免费版额度 | 本项目现状 / 结论 |
| --- | --- | --- |
| **数据库容量** | **500 MB** | 现在 57 道菜 + 83 食材**不到 1 MB**，占比可忽略 |
| 行数上限 | **无限制**（只看容量） | 随便加，行数不是瓶颈 |
| 表数量 | **无硬性限制** | 现在 14 张；再翻倍到 30 张也没问题 |
| API 请求 | 不限次数，但有公平使用软阈值 | 前端每次刷新约拉 5~10 个请求，家用远达不到 |
| 每月出口流量 | 5 GB | 首包（含 image/JPEG 封面）约 2 MB，够几千次首屏 |
| 文件存储 | 1 GB | 本项目没用到（封面图走 dataURL 存库，没走 Storage） |
| 空闲 7 天自动暂停 | 连续 7 天无任何请求会暂停 | 控制台点 Restore 即可恢复；长期用建议每周访问一次或升 Pro |

**换算成实际能加多少**：

- 一个**不含图片**的菜品（主表 1 行 + 标签 2~3 行 + 食材 5~8 行 + 步骤 3~6 行）大约 **0.5~1 KB**
- 500 MB 理论可以放 **50 万~100 万道菜**，纯文本数据**完全不用考虑容量**
- 之所以强调图片，是因为上一次崩掉就是「超额」：腾讯云 CloudBase 体验版只有 3000 资源点，PG 数据库 **4 天耗尽并被资源隔离**（接口直接返回 503 `DATABASE_RESOURCE_ISOLATED`）。
  Supabase 免费版**只按磁盘容量给额度，不按读写次数**，不存在这个问题
- 📌 **图片怎么存、能用多久、什么时候必须换成对象存储**——这是本项目唯一的容量变量，单独写在下一节

> 纯用量层面的付费时机：数据库过 400 MB、需要每日自动备份保留超过 7 天、
> 或要做真正的多人行级隔离（RLS 按 uid 拆分）时。

### 🖼 图片存储方案（Base64 能用多久）

#### 现状

封面图是通过菜品编辑弹窗上传的，压缩参数是 `src/components/DishEditor/index.tsx` 里的
`fileToCompressedDataUrl(file, maxW = 900, quality = 0.82)`：

1. 原图等比缩到**最长边 900px**
2. 压成 JPEG（质量 0.82）
3. 转成 Base64 dataURL，**直接存在 `dishes.cover_image` 这个 text 列里**

| 环节 | 大小 |
| --- | --- |
| 压缩后的 JPEG 二进制 | 约 **120~250 KB** |
| Base64 膨胀（×1.37） | 约 **160~340 KB** |
| **落库后每张封面** | 取中位估算 **≈ 200 KB** |

想看自己库里的真实数字，在 Supabase SQL Editor 跑：

```sql
-- 平均每张封面多大（KB）
select round(avg(pg_column_size(cover_image)) / 1024) as avg_kb,
       count(*) as with_image
from dishes where cover_image is not null;

-- dishes 表总占用（含索引和 TOAST）
select pg_size_pretty(pg_total_relation_size('dishes'));

-- 整个库多大
select pg_size_pretty(pg_database_size(current_database()));
```

#### 三种场景测算（按你的目标量：300~500 道菜）

| 场景 | 每张占用 | 300 道菜 | 500 道菜 | 占 500 MB 额度 |
| --- | --- | --- | --- | --- |
| **A. 只给每道菜一张封面**（当前） | ~200 KB | **~60 MB** | **~100 MB** | 12% ~ 20% ✅ 很安全 |
| **B. 再加步骤图**（每道菜约 3 张） | 4×200 KB = 800 KB | **~240 MB** | **~400 MB** | 48% ~ 80% ⚠️ 接近上限 |
| **C. 再加食材图**（100~300 种） | +20~60 MB | ~300 MB | ~460 MB | 60% ~ 92% ❌ 已经危险 |

> 表格里的「支出」是**纯磁盘**。结论很直接：
> **A 可以放心用 Base64；B 就要谨慎了；C 加上去基本就触顶了。**

#### ⚠️ 但真正先爆的不是磁盘，是流量和首屏

这一点比上面的表格更重要：

`src/lib/cloudSync.ts` 里拉菜单是 `pgSelect('dishes')`，**没有指定列**，所以

> **每次全量同步，会把所有菜的 Base64 封面一起拉下来。**

| 菜品数 | 单次全量同步要下载 | 5 GB/月流量够撑几次 |
| --- | --- | --- |
| 100 道（都有图） | ~20 MB | ~250 次 |
| 300 道 | ~60 MB | ~80 次 |
| 500 道 | ~100 MB | **~50 次** |

也就是说：**500 道带图菜品时，家里两个人每天各开两三次，一个月就能把 5 GB 出口流量刷穿**
（虽然 Supabase 另有 5 GB「缓存外发」额度，API 结果未必算缓存，别指望它）。
在 4G/5G 下一次拉 60~100 MB 也要等几十秒，体验先崩。

所以判断顺序应该是：**先看流量和加载速度，再看磁盘**。磁盘还剩一半时，你可能早就因为卡而受够了。

#### 🆓 不花钱也能做的优化（按效果排序）

1. **别在列表查询里带图片**（效果最大）

   把封面挪到独立的表，比如 `dish_covers(dish_id primary key, image text)`，
   列表只查 `dishes`（不含图），进详情页或者卡片要显示了再按 id 取这一张。
   再把 `pgSelect('dishes')` 改成显式指定列（`select=id,name,...`，排除 `cover_image`）。
   → 单次同步从 60~100 MB 降到 **1 MB 以内**，这一项就解决了上面的流量问题。

2. **降低压缩规格**：`maxW` 900 → 720，或者继续用 900 但把质量降到 0.72~0.75。
   菜谱缩略图在手机上最多显示三四百像素宽，900px 是明显过剩的。
   → 单张从 ~200 KB 降到 **~100 KB**，等于所有指标直接减半。

3. **换 WebP 格式**：`canvas.toDataURL('image/webp', 0.78)`，同样观感下比 JPEG 小 25~35%。
   现代浏览器（含 iOS 14+）都支持，可以和第 2 步叠加，单张能压到 **~70 KB**。

4. **用 Supabase 自带的对象存储（免费 1 GB）**

   这点要纠正一个常见误解：**对象存储不一定非要花钱**。
   Supabase 免费版本身就带 **1 GB Storage**，图片传上去得到一个 HTTPS 地址，
   数据库里只存这个 URL（几十字节）。好处是：

   - 磁盘占用从几百 MB 降到几 MB，`dishes.cover_image` 变成一个短字符串
   - 图片是**静态文件 URL**，浏览器和 CDN 都能缓存，不像 API 响应每次都要重新拉
   - 下一次全量同步不再带着几十 MB 图片，回到毫秒级

   约束：免费版**没有**图像变形（Image Transformation，自动缩略图是 Pro 功能），
   需要自己在上传时压好图；图片的实际下载也算外发流量（但走 CDN 缓存友好）。

#### 🚦 什么情况下必须放弃 Base64

满足**任意一条**就该迁到对象存储了（不用等到爆）：

| 红线 | 阈值 | 去哪里看 |
| --- | --- | --- |
| 数据库体积 | **> 300 MB**（500 MB 的 60%）——要给 autovacuum 和表膨胀留余地 | Dashboard → Settings → Usage；或上面那条 `pg_database_size()` SQL |
| 月流量 | **> 3 GB**（5 GB 的 60%） | Dashboard → Settings → Usage → Egress |
| 单次同步 | **> 5 MB** 或首屏超过 3 秒 | DevTools → Network 看 `rest/v1/dishes` 那一条的 size |
| 准备加步骤图 / 食材图 | **一开始就要迁**，别先塞进去再想着救 | —— |

**一句话版本**：只给菜品封面用，几百张 Base64 完全够用；
一旦想给**步骤**加图（图片数量直接翻 3~5 倍），或者数据库超过 300 MB / 月流量超过 3 GB，
就必须换成对象存储——优先用 Supabase 自带的 1 GB Storage，免费，不必付费。

#### ✅ 已实现：WebP 压缩 + 上传 Storage

链路在 `src/lib/imageUpload.ts`，统一入口是 `pickImage(file, folder)`：

```
选择本地图片 → 等比缩到最长边 1000px → 转 WebP(0.82，不支持则退回 JPEG)
            → POST 到 Supabase Storage → 数据库只存返回的 URL
```

- 上传时带 `cache-control: public, max-age=31536000, immutable`，**浏览器第二次起不再下载**
- **降级**：bucket 没建、没权限或网络失败时，自动退回「压缩后存 Base64」并提示用户，
  保证任何时候都能传图，只是没享受到对象存储的好处
- 数据库列类型**没变**（还是 text），所以老数据（Base64 / `/dishes/xxx.jpg`）照常显示，换图不影响

**启用前要先执行两条 SQL**（Supabase 控制台 → SQL Editor）：

```sql
-- 1) 建图片 bucket + 读写策略（文件：supabase/storage.sql）
--    前端的 anon key 有 RLS 限制，建不了 bucket，必须在 SQL Editor 里跑

-- 2) 食材图片列（新库已在 schema.sql 里；老库补这一行）
alter table public.ingredients add column if not exists image text;
```

> 没跑第 1 条也能用：图片会退回 Base64 存库，只是又会回到「占数据库 + 每次同步都带图」的老问题。

#### 还可以继续做的优化

1. **列表查询剔除大字段**——`pgSelect('dishes')` 目前会把 `cover_image` 一起拉下来。
   改成显式指定列、图片单独按 id 取，单次同步能再降一个数量级（这是更根本的一步，尚未做）
2. **菜品步骤图 / 食材图**——对象存储已经就位，加图只是加字段 + UI 的事
3. **懒加载**——菜品卡片和食材缩略图已加 `loading="lazy"`，只加载滚到的图

---

## 🔐 账号体系

自建，不依赖任何第三方 Auth（Supabase Auth / CloudBase Auth 都强制要邮箱或手机号）：

1. **注册**：`uid = 昵称归一化（小写、去空格）`，密码用 `SHA-256(随机盐 + 密码)` 存
2. **登录**：查 users 表，比对 hash；如果 `disabled = true` 则拒（提示「该账号已被停用」）
3. **会话**：登录后 `uid` + `role` + `avatar` 存到 `localStorage('cook.auth.session')`，刷新保持
4. **采购清单 / 菜单**：`id = uid`，所以每人清单/菜单天然隔离
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
# 填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
# 取值：Supabase 控制台 → Settings → API → Project URL / anon public key

# 3. 启动开发服务器
pnpm dev          # → http://localhost:5173

# 4. 打生产包
pnpm build
```

常用维护命令（都在「种子数据 / 备份」一节里详细说明）：

```bash
pnpm seed        # 数据库空了、想恢复内置菜单时用（只填空表）
pnpm backup      # 把云端 14 张表导出成 JSON 存档
pnpm push:netlify # 本地构建并部署到 Netlify
```

> ⚠️ 还没建表的话，先去 Supabase 控制台 → SQL Editor 跑一遍 `supabase/schema.sql`，
> 上面的 seed / backup 脚本都**只管数据、不管表结构**。

### 登录测试

- **超级管理员**：账号 `0000`，密码 `000000`（必须完全一致，不带空格）
- **普通用户**：在登录页切到「注册」标签新建，2-20 字昵称 + 6 位以上密码

---

## 🌐 部署

> **数据库在 Supabase，前端托管在 Netlify，两者互不干涉**：
> 前端产物部署到 Netlify，运行时浏览器直连 Supabase 的 Data API。
> 换托管平台不用改一行代码，只要有地方托管 `dist/` 并配好 SPA 回退就行。

### 前置

1. **Supabase**（数据库）：创建项目 → SQL Editor 执行 `supabase/schema.sql` → 把 **Project URL** 和 **anon public key** 填进 `.env`
   - 顺带确认 Settings → API → **Exposed schemas 里包含 `public`**（默认包含，没有的话所有请求会 404）
2. 数据不想重来？App 首次打开时，如果 `dishes` / `ingredients` 是空表，会自动把内置的 57 道菜 + 83 种食材写进去

### 方式一：Netlify（推荐）

项目里已带 `netlify.toml`，三件事都配好了：

| 配置 | 作用 |
| --- | --- |
| `command = "pnpm build"` / `publish = "dist"` | 检测到 `pnpm-lock.yaml` 会自动用 pnpm 构建 |
| `/* → /index.html` (200) | **SPA 回退**，解决访问 `/menu-plan` 或刷新页面 404 |
| `sw.js` 禁缓存 | 避免 PWA 让用户卡在旧版本 |

**A. 连仓库自动部署（推荐，最省事）**

Netlify → **Add new site → Import an existing project** → 选这个 Git 仓库 → 直接 Deploy。
以后 `git push` 就自动发版，不用手动跑命令。

> ⚠️ **环境变量必须在 Netlify 里再配一次**：
> Site configuration → **Environment variables** → 添加
> `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
> （取值和本地 `.env` 一样。**Vite 的变量在 build 时就被内联进 bundle**，没有这步网站能打开但连不上库，数据全空）
> 加完/改完环境变量后要 **Clear cache and deploy site**，否则不生效。

**B. 命令行手动部署**

```bash
pnpm push:netlify          # = pnpm build + npx netlify-cli deploy --prod --dir=dist
```

首次会提示登录授权；之后每次都是这条命令。不走构建、只传已编好的包就用这个。

> 历史遗留：腾讯云静态托管也能用（`pnpm push`），但那个环境目前有 bug——
> 所有响应都带 `Content-Disposition: attachment`，访问站点会变成下载页。已弃用。

### 🔄 日常更新：改完代码怎么同步到云端

> **核心认知**：`pnpm build` 只是在**本地**生成/覆盖 `dist/` 目录，它**不会自动上传**到云端。
> 云端跑的是静态托管的文件，本地 build 一万次，不上传就永远看不到变化。
> 这就是「build 了但没用」的原因——少了第二步「deploy」。

#### 情况一：纯代码改动（加功能 / 修 bug，不动数据库）

**连了 Netlify 仓库**：直接 `git push`，Netlify 自动构建发版，什么都不用跑。

**手动命令行**：

```bash
pnpm push:netlify
```

它等价于两条命令连跑（已写进 `package.json` 的 scripts）：

```bash
pnpm build                                                        # 1) 本地构建出最新 dist/
npx netlify-cli deploy --prod --dir=dist                          # 2) 上传到 Netlify（覆盖旧版）
```

> ⚠️ 脚本名**不能叫 `deploy`**：`deploy` 是 pnpm 自带的内置命令（用于部署 workspace 子包），
> 直接 `pnpm deploy` 会触发它并报 `ERR_PNPM_CANNOT_DEPLOY`，脚本根本不会执行。
> 已改名为 `push`（避开内置命令冲突），想保留原名也可以用 `pnpm run deploy` 显式调用脚本。

注意点：

- **每次都要重新 build**：部署的是 `dist/` 里的产物，不是源码。改了 `src/` 不 build 就 deploy，传上去的还是旧包
- **新增了 `public/` 下的静态文件**（比如菜品封面图）：build 会自动拷进 `dist/`，一起被 deploy 上去，无需单独处理
- **部署完浏览器强刷**：`Cmd + Shift + R`，否则可能命中 CDN/浏览器缓存看到旧页面（项目装了 PWA，`sw.js` 已配禁缓存，但保险起见还是强刷一次）
- 也可以完全不用命令行：Netlify 控制台 → Deploys → 把本地 `dist/` 整个目录**拖进去**即可（首次个人使用够用，但不会有 SPA 回退，刷新子路由会 404，仅建议临时验证）

#### 情况二：涉及数据库结构改动（新增列 / 新建表）

前端代码改不了表结构，必须**先**在 Supabase 的 SQL Editor 手工执行：

```bash
# 顺序：先改库 → 再发代码
1. Supabase 控制台 → SQL Editor → 执行 ALTER TABLE / CREATE TABLE
2. pnpm push                                    # 再构建 + 上传前端
```

> Supabase 改完 DDL 会自动刷新 PostgREST 的 schema 缓存，不像 CloudBase 还要手动 `NOTIFY pgrst, 'reload schema';`。

> 顺序建议**先库后码**：本项目对部分新列做了「探测式降级」（如 `cover_image`、`users.avatar` 列不存在时写入自动跳过），
> 就算顺序反了也不会崩，但功能要等列建好 + 重新部署后才真正可用。
>
> 如果新表/新列忘了建，症状通常是：页面上对应数据一直为空、或控制台报 `PostgREST 42703`（列不存在）。

### 关键坑（已踩过）

| 坑                                      | 症状                                            | 解法                                                            |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| 静态托管没在控制台开通                  | 部署"成功"但什么也访问不到                      | 控制台手动点「开通」                                            |
| `VITE_TCB_ENV_ID` 没注入                | 页面打开白屏                                    | `.env` 填了之后**重新 `pnpm build`**                            |
| RLS 开了但没建 policy                   | 页面数据是空的但不报错                          | 跑 `supabase/schema.sql` 末尾 policy 那段                       |
| key 填成了 Secret / service_role        | 一切正常但数据库裸奔（绕过 RLS）                | 前端只能用 Publishable / anon public key                        |
| 新版 `sb_publishable_` key 报 JWT 无效  | `Invalid JWT` / 401                             | 非 JWT 的 key 只能走 `apikey` 头（代码已自动处理）              |
| Supabase 单次返回上限                   | 表超过 1000 行时后面读不到                      | 日志类大表用 `limit` + 分页，别一次性全拉                       |
| 免费项目 7 天无活动                     | 项目被自动暂停，API 全部不可用                  | 控制台点 Restore；长期用建议定期访问或升 Pro                    |
| Exposed schemas 不含 `public`           | 所有请求 404                                    | Settings → API → 把 `public` 加进 Exposed schemas               |
| SPA 刷新 404                            | F5 报 404                                       | 控制台 → 静态托管 → 设置 → 错误页面 → 404 用 `/index.html` 兜底 |
| PostgREST 0 行返回 406                  | `pgSelectOne` 改成 `pgSelect`（数组）           | 已修                                                            |
| 默认域名访问偶尔 418                    | 边缘节点风控，**用无痕窗口**打开                | 不要带 `?v=xxx` 查询参数                                        |
| 静态页面 `VM169:1 cls is not defined`   | CloudBase CDN 注入的引导脚本                    | 配 404 → index.html 兜底后自动消失                              |
| `cover_image` / `users.avatar` 列不存在 | PostgREST 报 42703                              | 跑增量 SQL 里的 `ALTER TABLE`                                   |
| 全站响应带 `Content-Disposition: attachment` | 站点变成「下载页面」（地址栏出现 `download.html`） | 见下面「站点被当成下载」一节                                  |

### 😱 站点被当成下载（响应头 `Content-Disposition: attachment`）

症状：访问站点不显示页面，而是弹下载 / 跳到 `download.html`。自检：

```bash
curl -sI https://<你的域名>/ | grep -i content-disposition
# 输出 content-disposition: attachment 就是它
```

原因：静态托管（底层存储）给**所有对象**统一加了 `attachment` 响应头，浏览器就把 `index.html`
当附件下载而不是渲染。这是**环境/存储层面**的行为，**重新部署、重传文件都修不掉**（实测重传后头依然在）。

解法（按优先级）：

1. 控制台 → 静态网站托管 → **设置** → 找「HTTP 响应头 / 自定义响应头」，把 `Content-Disposition` 覆盖成 `inline`（或删掉该头）
2. 绑定**自定义域名 + 开启 CDN**，在 CDN 控制台「响应头配置」里删除 / 覆盖该头（默认域名一般管不到）
3. 都不行 → 提腾讯云工单，让后台清掉该存储桶默认的 `Content-Disposition`
4. 兜底：新建 CloudBase 环境（PG 模式）→ 建表 + RLS → 改 `.env` 的 `VITE_TCB_ENV_ID` → 重新 `pnpm push` → 迁移数据

---

## 📜 License

MIT
