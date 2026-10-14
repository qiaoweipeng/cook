# 🍳 Cook · 我的厨房笔记

> 一套**纯前端**的单页面做饭系统，把「菜谱 → 食材 → 价格」三件事串起来。  
> 灵感来源：每次想做菜都得翻小红书/抖音找菜谱，买菜时又算不清要花多少钱，这个工具就是为「想做饭 + 不想动脑」的人准备的。

---

## ✨ 这个项目解决什么

1. **菜谱管理**：收藏喜欢的菜，写下做法，不用再翻收藏夹里沉睡的链接。
2. **食材库**：所有食材集中管理，每条都有单价（比如「五花肉 ¥28/斤」「鸡蛋 ¥1.2/个」），数据可随时改。
3. **自动算账**：点开一道菜，能立刻看到这份菜**大概要花多少钱**；勾选几道想做的菜，自动合并出一份**带总价的购物清单**。
4. **完全本地**：数据存在浏览器 `localStorage`，刷新不丢、清缓存即重置，不依赖任何后端。

> 后续如果想加云同步、登录、多人协作，再把数据层抽出来换成 API 即可，UI 和 store 不动。

---

## 🎨 视觉与交互基调

基于 **Ant Design 5** 的 Design Token，但自定义一层「厨房感」主题：

- 主色 `色值 = #E8743C`（暖橙，接近炒锅/红烧的颜色），比 AntD 默认蓝更生活化。
- 圆角偏大（`borderRadius: 12`），配大留白，像菜谱 App 而不像 OA 后台。
- 食材/价格类用 **Statistic** + **Tag** 组合展示，信息密度高但不凌乱。
- 详情页用 **Drawer** 或 **Modal** 流式呈现，不强制跳转，移动端友好。

---

## 🧩 功能清单

### V1（首版必须）
- [ ] **菜单首页**：卡片网格浏览所有菜品，支持分类筛选（家常 / 川菜 / 粤菜 / 快手…）和关键词搜索。
- [ ] **菜品详情**：展示食材清单（含用量 & 单份成本）、分步做法、难度/用时/标签。
- [ ] **食材库 CRUD**：新增 / 编辑 / 删除食材，维护名称、单位、单价、备注。
- [ ] **购物清单**：多选菜品 → 自动合并相同食材 → 计算总花费 → 单条勾选已购买。
- [ ] **数据持久化**：用 `localStorage` 存，刷新不丢。
- [ ] **种子数据**：内置 ~10 道家常菜 + ~30 种常见食材，开箱即用。

### V2（进阶）
- [ ] 收藏 & "我做过" 标记，按时间轴展示做菜记录。
- [ ] 一周菜单计划：拖拽排菜，自动汇总一周食材采购单。
- [ ] 价格波动记录：同一食材可记多个时点的价格，画折线图。
- [ ] 菜谱导入：粘贴一段文本（抖音/小红书常见格式），用规则解析成结构化数据。
- [ ] 打印 / 导出购物清单为图片 / PDF。

### V3（想法，可能不做）
- [ ] 接入食材电商 API，实时拉价格（贵且不必要，列出供参考）。
- [ ] 多用户分享菜谱（这时候确实要后端了）。

---

## 🏗 技术栈

| 分类 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | **React 18 + TypeScript** | 主流、类型安全 |
| 构建 | **Vite** | 启动快、HMR 舒服 |
| UI | **Ant Design 5** | 组件全（Card/Table/Form/Drawer/Statistic…都现成） |
| 路由 | **React Router v6** | 单页多视图 |
| 状态 | **Zustand** | 比 Redux 轻很多，配 `persist` 中间件直接对接 `localStorage` |
| 工具 | Day.js（AntD 内置） | 日期处理 |

> 不用 Next.js（不需要 SSR）、不用 UI 路由库、状态也用不上 Redux Toolkit。一个 Vite 工程即可。

---

## 📂 目录结构

```
cook/
├── public/
├── src/
│   ├── assets/              # 图片/logo
│   ├── components/          # 通用组件（菜品卡片、食材单价输入框等）
│   │   ├── DishCard/
│   │   ├── IngredientTag/
│   │   └── PriceTag/
│   ├── pages/
│   │   ├── Menu/            # 菜单首页（卡片网格 + 筛选）
│   │   ├── DishDetail/      # 菜品详情（drawer 或独立路由）
│   │   ├── Ingredients/     # 食材库管理（Table + Form）
│   │   └── ShoppingList/    # 购物清单
│   ├── store/
│   │   ├── useDishStore.ts       # 菜品 CRUD
│   │   ├── useIngredientStore.ts # 食材 CRUD + 价格
│   │   └── useShoppingStore.ts   # 当前购物清单（多页面共享）
│   ├── data/
│   │   ├── seedDishes.ts         # 内置 ~10 道菜
│   │   └── seedIngredients.ts    # 内置 ~30 种食材
│   ├── types/
│   │   └── index.ts              # Dish / Ingredient / Step 类型定义
│   ├── utils/
│   │   ├── price.ts              # 单价计算、单位换算
│   │   └── merge.ts              # 购物清单合并
│   ├── theme.ts                  # AntD ConfigProvider 主题
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 📐 数据模型（核心）

> 这一层定好，后续加后端时几乎不用改 UI，只换数据源。

```ts
// 一道菜
interface Dish {
  id: string;
  name: string;                    // "番茄炒蛋"
  category: '家常' | '川菜' | '粤菜' | '快手' | '烘焙' | '其他';
  cover?: string;                  // 封面图
  tags: string[];                  // ["下饭", "10 分钟", "新手"]
  difficulty: 1 | 2 | 3;           // 难度
  cookTimeMin: number;             // 烹饪用时
  servings: number;                // 几人份
  ingredients: DishIngredient[];   // 用到的食材 + 用量
  steps: Step[];                   // 烹饪步骤
  tips?: string;                   // 小贴士
  favorite: boolean;
  createdAt: number;
}

interface DishIngredient {
  ingredientId: string;            // 关联食材库
  amount: number;                  // 用量（数字，配合 unit）
  unit: string;                    // "g" / "个" / "勺" / "ml"
}

interface Step {
  order: number;
  text: string;
  image?: string;
}

// 食材库
interface Ingredient {
  id: string;
  name: string;                    // "五花肉"
  category: '蔬菜' | '肉类' | '调料' | '主食' | '蛋奶' | '其他';
  pricePerUnit: number;            // 单价
  unit: string;                    // "斤" / "个" / "g" / "ml"
  spec?: string;                   // 规格备注，如 "土鸡蛋，盒装"
  note?: string;
}

// 一份菜的成本 = Σ (amount 换算到 pricePerUnit 同一单位后 × price)
```

**购物清单合并逻辑**：
按 `ingredientId` 分组，相同食材的 `amount` 按统一单位累加，再乘以 `pricePerUnit`，得到总价。

---

## 💾 数据存储方案

- **首屏**：读取 `localStorage`，没有则写入 `seedDishes.ts` + `seedIngredients.ts` 的内置数据。
- **更新**：Zustand `persist` 中间件自动同步 `localStorage`，组件通过 hook 读取，不会出现脏数据。
- **重置**：导航栏一个「恢复示例数据」按钮，清空 `localStorage` 后重新加载 seed。
- **导入导出**：设置页支持下载/上传一份 JSON 备份（避免换浏览器数据丢失）。

---

## 🚀 本地开发

代码已经全部生成，按以下命令运行即可。

需要使用 **pnpm**（项目已声明 `packageManager: pnpm@9.12.3`）。如果还没装：

```bash
# 方式一：corepack（Node 16.13+ 自带，推荐）
corepack enable
corepack prepare pnpm@9.12.3 --activate

# 方式二：直接用 npm 全局装
npm i -g pnpm@9
```

日常开发：

```bash
# 1. 安装依赖（首次需要，自动写 pnpm-lock.yaml）
pnpm install

# 2. 启动开发服务器
pnpm dev
# → 访问 http://localhost:5173

# 3. 打生产包
pnpm build && pnpm preview
```

> 项目根目录的 `.npmrc` 已经设置 `shamefully-hoist=true`，避免 AntD 在 pnpm 严格模式下找不到子依赖的问题。

---

## 🗺 迭代路线

1. **Day 1**：脚手架 + 主题 + 类型定义 + seed 数据，跑通「浏览菜品 → 看详情」闭环。
2. **Day 2**：食材库 CRUD + 价格维护；菜品详情里显示成本。
3. **Day 3**：购物清单（多选菜品 → 合并 → 总价 → 勾选）。
4. **Day 4**：打磨样式、搜索/筛选、做菜记录、空状态。
5. **后续**：按 V2 清单挑感兴趣的做。

---

## 🤔 几个待你拍板的点

| # | 问题 | 我的默认选择 |
| --- | --- | --- |
| 1 | 项目名 | `cook`（简单直接） |
| 2 | 是否用 TypeScript | ✅ 用（数据模型多，类型能省很多 bug） |
| 3 | 路由方案 | React Router v6（菜单 / 详情 / 食材库 / 清单各占一个路由） |
| 4 | 主色调 | 暖橙 `#E8743C`（接近厨房氛围） |
| 5 | 是否需要登录/同步 | V1 不做，纯本地 |

你看完 Idea 后告诉我：
- 想不想调名字 / 配色 / 功能？
- V1 那 6 项里有没有要砍掉或加的？
- 要不要我**直接开始干**（按 Day 1 → Day 3 的顺序把代码写出来）？
