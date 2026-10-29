# 我是大厨

## 这个项目解决什么

**「我是大厨」是一套前后端协同的做饭管理系统**，围绕「今天吃什么」这件事， 是常做饭的小伙伴首选 APP。
把 **菜谱 → 食材 → 价格 → 采购清单 → 家庭共享 ** 串成一条线，主要解决以下日常痛点：

| 痛点               | 怎么解决                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **上班族每天吃啥** | 提前把一周的菜排好，到点打开就照着做，不用临时纠结                                                                          |
| **不会做**         | 每道菜给出完整**用料 + 分步做法**，照着走完一遍就能上桌，不用再去翻视频或搜教程，每道菜还可以根据自己的口味进行微调并记录。 |
| **食材成本不好控** | 每道菜都自动算出**大概成本**，食材库统一登记单价，成本按最新单价折算，买之前就知道这道菜要花多少钱                          |
| **不知道买哪些菜** | 根据你想吃的菜，自动生成采购清单，到菜市场/超市买一样勾一样                                                                 |
| **减肥人群友好**   | 每道菜都有相应的热量、能量的数据 ，不会让你吃胖。                                                                           |

## （TODO）APP 功能简介

- 菜单：收录每道菜的标签、难度、用时、份量、食材用量和分步做法，想找的时候一搜就有。

- 今日菜单：

- 食材库：

- 采购清单：

- 家庭共享：多人共用一份菜单与食材库，采购清单、菜单安排各自独立

- 多平台适配：PC、Pad、移动设备全部适配，体验感无与伦比。

> ⚠️ 项目整体还处在**测试完善阶段**：普通用户注册流程比较简单（暂无验证码），部分功能的边界还没打磨好，  
> 这些属于「能用但不算完善」，不影响日常使用，后面会持续改进。

## 角色与权限

| 角色           | 账号                                                                 | 能力                                            |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| **超级管理员** | `0000` / `000000`（**硬编码，不依赖 users 表**，不可修改、不可删除） | 编辑所有菜谱 / 食材库；用户管理（启停普通账号） |
| **普通用户**   | 自助注册（昵称 2-10字 + 密码 6 位以上）                              | 浏览菜单、看食材价格、用采购清单/今日菜单       |

> **⚠️安全现状（后续会改进，暂不适合放真实重要数据）**
>
> - 超级管理员账号是**硬编码**的（`src/lib/userAdmin.ts` 里的 `ADMIN_UID` / `ADMIN_PASSWORD`），改不了也删不掉，后续要改成可配置 + 强哈希存储
> - 普通用户注册只要昵称 + 密码，**没有邮箱/手机号验证、没有验证码**，谁都能随手注册
> - 登录没有失败次数限制和验证码，密码用 SHA-256 且未加迭代，彩虹表可以爆破
> - 数据库 RLS 目前给 `anon` 全开，生产环境应改成按 uid 的行级隔离
>
> 当前阶段这些不是重点，先把功能跑通；后面会按顺序补齐。

### 超级管理员能做什么

> 管理员必须使用超级管理员账号并在PC 端登录，才能正常操作：

1. **菜单管理:**
   - 点击右上角新增菜品,可以添加菜品
   - 选择某一个菜品 ，点击编辑菜品，可以修改和维护菜品信息。
     - 编辑菜品时：
       1. 点击“完成”，即编辑完成。
       2. 点击“取消”，即编辑取消。
       3. 点击“删除”，删除此菜品。前提是此菜品没有被用户添加到当日的每日菜单中，及当日的采购清单中。
          - 如果用户将此菜品添加到今日以后的菜单中 管理员删除此菜单后 给用户一个弹窗 显示“此菜品已下架” 请用户重新选择其他菜品。
   - 直接点击菜品的图片，可以查看菜品图片大图， 并可以修改和维护菜品图片

2. **食材库管理:**
   - 点击右上角新增食材可以添加食材
   - 选择某一个食材 点击编辑食材 可以修改和维护食材信息。
   - 编辑食材时：
     1. 点击“完成”：即编辑完成。
     2. 点击“取消”：即取消编辑。
     3. 点击“删除”：删除此食材（前提是此食材没有被用在菜品当中）。必须先从被用的菜品中移除此食材 此食材才能被删除。
   - 直接点击食材的图片 可以查看食材图片大图 并可以修改和维护食材图片。
   - 点击下载模板 可以将食材库的 Excel 模板下载下来。
   - 点击导出 excel 可以将食材库的数据导到 excel 中 点击导入 excel 可以将编辑好的 excel 导入到食材库中。

3. **用户管理:**查看全部用户、按昵称/账号搜索、**停用 / 启用某个账号**、查看最近登录信息（设备 / 系统 / 浏览器 / IP / 地区）
4. **系统管理：**云端连通性、14 张表的行数、**操作日志**、**登录日志**、本机浏览器缓存占用

### 删除级联规则

- **删除食材**：如果有任何菜品正在使用它，**禁止删除**，提示列出引用它的菜品数量。
- **删除菜品**：如果有任何用户把它加进了当日采购清单或当日菜单，**禁止删除**，提示使用人数。

---

## 视觉与交互基调

两套 UI：**PC 端用 Ant Design 6**，**移动端用 Ant Design Mobile**，共用同一套品牌色与语义色。
**所有颜色、圆角、图标都必须从下面这套规范里取**——页面里随手写色值是两端视觉跑偏的唯一来源，一律禁止。

### 一、颜色规范（按用途取色，不按色值取色）

#### 品牌色

| 语义名         | 色值      | 用在哪                                                                         |
| -------------- | --------- | ------------------------------------------------------------------------------ |
| `primary`      | `#E8743C` | 主按钮、选中态、价格、品牌 logo。暖橙接近红烧/糖色，比 AntD 默认蓝更「有食欲」 |
| `primary-soft` | `#FFF1E8` | 选中项底色、浅橙胶囊、hover 底                                                 |
| `primary-tint` | `#FDF7F2` | 暖米色区块底（移动端侧边栏等）                                                 |

#### 中性色

| 语义名      | 色值      | 用在哪                                   |
| ----------- | --------- | ---------------------------------------- |
| `text-1`    | `#2D2A26` | 正文、标题。软黑，避免纯黑的生硬感       |
| `text-2`    | `#6B645C` | 次要信息、辅助说明                       |
| `text-3`    | `#9A938C` | 弱化文字、占位符、未选中图标             |
| `border`    | `#F0EEE9` | 分割线、卡片描边                         |
| `bg-pc`     | `#FFFFFF` | **PC 端页面背景（固定纯白）**，见下一节  |
| `bg-mobile` | `#FAF7F2` | **移动端页面背景（燕麦米白）**，见下一节 |

#### 语义色

| 语义名    | 色值      | 说明                             |
| --------- | --------- | -------------------------------- |
| `success` | `#7BB661` | 青菜绿，完成 / 成功态            |
| `warning` | `#F0AD4E` | 暖黄，警示                       |
| `danger`  | `#FF4D4F` | 危险操作（删除），沿用 AntD 默认 |

**为什么这么定**：这是每天都会打开的生活类工具，不是后台管理系统。暖橙唤起食欲，移动端的米白降低长时间阅读疲劳，大圆角削弱「表格感」，目标是让人愿意天天用，而不是觉得在点 OA。

### 二、背景色按端区分（不是全站一个色）

| 端   | 背景色             | 落地点                            | 原因                                                                   |
| ---- | ------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| PC   | `#FFFFFF` 纯白     | `theme.ts` 的 `colorBgLayout`     | 后台表格多，表格默认白底；改成米白要逐个组件适配，成本高收益低         |
| 移动 | `#FAF7F2` 燕麦米白 | `AppLayout` 的 `Layout` body 背景 | 用户端全是卡片流、没有表格，米白铺一层底就够；白卡片浮在米白上层次更好 |

规则只有一条：**看设备，不看页面类型**。不要出现「PC 用户端米白、PC 后台纯白」这种按页面分的规则——那种才真的会乱。

#### 配套规则：内容块必须是「卡片形态」

米白底遇到**通栏白条**（整宽、无圆角的白色 List）会显得像页面被切成一条条白带——这跟 PC 表格放在米白底上是同一个视觉问题。**解法不是放弃米白，而是让每个内容块都有明确边界。**

| 内容形态                               | 允许 | 说明                                                             |
| -------------------------------------- | ---- | ---------------------------------------------------------------- |
| 白卡片（有圆角 + 外边距）              | ✅   | 白卡片浮在米白上，层次正好，参照 iOS 设置页的浅灰底 + 圆角卡片组 |
| 通栏白条（整宽、无圆角、只有上下细线） | ❌   | 会把页面切碎，和米白底互相打架                                   |

antd-mobile 的 `List` 自带 `mode="card"`，加一个属性就切成圆角卡片形态，不需要自己写 CSS：

```tsx
<List mode="card">   {/* ✅ 卡片形态 */}
<List>               {/* ❌ 通栏形态，移动端米白底上不要用 */}
```

> ✅ 已落地：`Profile` 两处 List 均为 `mode="card"`。`DishDetail` 用的是 **antd** 的 List（`dataSource` / `renderItem` 接口，本身无白底），不存在通栏白条问题，无需改动。

> ✅ 已落地：`AppLayout` 的 Layout 背景按 `showMobileNav` 切换（移动 `#FAF7F2` / PC `#ffffff`）；`index.css` 里 iOS 状态栏衬底渐变同步改为 `#FAF7F2`，之前按纯白算出的接缝色差一并消除。

### 三、圆角与间距

| 项             | 值    | 说明                 |
| -------------- | ----- | -------------------- |
| `borderRadius` | `12`  | 通用圆角             |
| Card 圆角      | `16`  | 卡片更圆，削弱表格感 |
| 圆形图标按钮   | `50%` | `.icon-btn`          |
| 胶囊 / 徽标    | `999` | 标签、Badge          |

### 四、图标规范（主库 + 补充库 + 一个例外）

| 场景               | 用什么                        | 说明                                                    |
| ------------------ | ----------------------------- | ------------------------------------------------------- |
| PC 全部            | `@ant-design/icons`           | 主库。单色、线宽统一；尺寸只用 14 / 16 / 18 三档        |
| 移动 · 页面内      | `@ant-design/icons`           | 与 PC 同一套图形语言，避免两端认知不一致                |
| antd 覆盖不到时    | `lucide-react`                | 补充库（已安装）。纯线性 stroke 风格，仅作替补          |
| 移动 · 底部 TabBar | 自绘多色 SVG（`public/svg/`） | **唯一例外**：选中态的彩色 + 弹跳动效依赖多色图标，保留 |

#### 补充库 `lucide-react` 的使用边界

antd 图标覆盖不全时（例如「锅」「厨师帽」「家庭关系」这类语义），用 lucide 补充。必须守三条：

1. **整组替换，不单点混入**。一排图标里只换一个，线宽和字形比例会立刻露馅；要换就把这一组全部换成 lucide。
2. **线宽固定 `strokeWidth={1.75}`**。lucide 默认 2 偏粗，1.75 更接近 antd Outline 的视觉重量。
3. **尺寸与主库同一套**：14 / 16 / 18，不另造档位。

两套库的风格差异（混排时最明显）：antd 有 Outline / Filled 双套、视觉线宽约 1.5；lucide 全部是纯线性 stroke、圆头端点、几何更规整。

- ❌ 不再引入 `antd-mobile-icons`（目前仅 Profile 一处使用，迁到主库后移除）
- ❌ 同一屏不混用两套图标表达同一含义
- 底部 Tab 的未选中态靠 CSS 降饱和压淡（`.tab-ico`），**不要为「未选中」另做一套灰色图标**——它是产品特色动效，不参与上面的图标统一

### 五、字体

`-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif` —— 中文优先，两端统一（定义在 `theme.ts`）。

### 六、写代码时的硬规则

1. **不写字面色值**。新代码用 CSS 变量或 theme token；改旧代码时顺手替换，不做全量重扫。
2. **同一语义只有一个色值**。不允许再出现 `#999` / `#9A938C` 两种灰并存、`#FFF1E8` / `#FDF7F2` 混用。
3. **改色先改规范**：想加新颜色，先在本文的表里加一行并写明用途，再用。
4. **品牌色只有一个来源**：`theme.ts` 的 token 与 `index.css` 的变量同源，改一处必须同步另一处。

### 七、待落地（现状与规范的差距）

| 项             | 现状                                                       | 目标                                     |
| -------------- | ---------------------------------------------------------- | ---------------------------------------- |
| 移动端背景     | ✅ `#FAF7F2`（`AppLayout` 按端切换）                       | 已完成                                   |
| 灰色系         | `#999` / `#9A938C` / `#6B645C` 并存                        | 收敛到 `text-2` / `text-3` 两级          |
| 移动端图标库   | `antd-mobile-icons` 1 处待迁；`lucide-react` 已装但 0 引用 | 主库 antd + 补充库 lucide + Tab 自绘 SVG |
| 硬编码色值     | 约 240 处 / 22 个文件                                      | 逐步替换为变量，不一次性大改             |
| iOS 状态栏衬底 | ✅ 渐变已改 `#FAF7F2`，接缝色差消除                        | 已完成                                   |

### 八、两端组件选型

**PC · Ant Design 6**：在 `src/theme.ts` 里通过 `ConfigProvider` 覆写 Design Token。除上面的颜色外，PC 特有项：
`Layout` 顶栏白底、高 `64`；`Menu` 选中底色 `primary-soft`、选中文字 `primary`；Card 圆角 `16`。

**Mobile · Ant Design Mobile**：接 `antd-mobile`，用在 `MobileTabBar`、菜谱列表、食材库、个人中心等处（`TabBar` / `SearchBar` / `List` / `Card` / `Switch` / `Input` / `Dialog` / `Toast` / `Empty` / `Badge`）。

- **为什么用 antd-mobile**：它是为**触屏**设计的——组件按手指热区尺寸做的安全区/高度、`PullToRefresh`、`SwipeAction` 等手势类交互都现成，体积也远小于桌面组件；而不是把 PC 组件缩到小屏上（按钮会挤、点击区过小）。
- 交互上采用**底部 TabBar 常驻**（首页 / 今日菜单 / 食材库 / 采购清单 / 个人，带徽标提示），搜索框与标签栏**吸顶**，单列卡片流式展示，减少层级跳转。
- 页面内图标统一用 `@ant-design/icons`（见第四节），底部 Tab 用自绘多色 SVG。

### 九、分端适配规则（PC / Pad / 手机）

**设备判定**：`useIsMobile`（宽度 <768）只分「手机 / 非手机」；Pad 方向细分用 `useIsPadPortrait`（竖屏 + ≥768）；管理员后台的「是不是 PC」用 `isPcDevice()`（UA 级，含 iPadOS 桌面 UA 的触摸点数拆穿），不看宽度——宽度在 Pad 上会漏判。

**菜单卡片墙列数**：

| 场景               | 列数                                       |
| ------------------ | ------------------------------------------ |
| 手机竖屏（<768）   | 2                                          |
| Pad 竖屏           | 3                                          |
| Pad 横屏           | 4                                          |
| PC 全屏 / 窗口缩放 | 4 起，随宽度收窄变 3 / 2                   |
| PC 竖屏            | 3（不做专门适配，命中 Pad 竖屏同一条规则） |

实现要点：iPad Pro 12.9 竖屏和 iPad 9.7 横屏宽度同为 1024，纯宽度断点区分不了「竖 3 横 4」，必须方向 + 宽度联合判定（`Menu/index.tsx` 里 Pad 竖屏时 Col 强制 `span={8}`，不能改 `lg` 断点——iPad 横屏也落在 lg 区间）。

**手机端不支持横屏**（和微信一样）：

- PWA 层面：`manifest.orientation = 'portrait'`，安卓加到主屏幕后系统级锁竖屏；
- 浏览器层面（锁不住的兜底）：`LandscapeGuard` 在「手机 + 横屏」时盖全屏毛玻璃遮罩，转回竖屏自动消失；
- 手机判定用 UA，不能用宽度——横过来宽度超 768 会被误判成 PC，遮罩刚出来就消失；
- iPad / 安卓平板放行，横屏正常用。

**Pad 端 UI 方向（已定，待做）**：Pad 目前暂用 PC 端 UI，**后续专门做一套 Pad 专属 UI**——侧边栏导航 + 内容区（类似管理后台 ProLayout 骨架），控件按触摸尺寸设计；PC UI 的 hover 交互和小控件不适合触屏，移动 UI 的底部 TabBar 又不适合宽屏。动工前维持现状，不再对 Pad 做零碎调整。

### 用户与 UI 的关系

首先 UI 适配了三种系统：PC 端 pad 端和移动端。其次 用户分两类 一类是普通用户 一类是管理员。UI 跟用户的关系是：

- 使用普通用户账号、登录 PC 端显示 PC 端页面
- 使用普通用户账号、登录 Pad端显示 Pad端页面

- 使用普通用户账号、登录 移动端显示 移动端页面
- 使用管理员账号登录 PC 端 显示 PC 端页面
- 使用管理员账号登录 pad 端和移动端 弹框显示“请使用 PC 端登录！”

### TODO📱 状态栏与吸顶栏一体化（iOS 已做 / Android 待做）

**问题**：添加到主屏幕当 App 用之后，手机顶部那条系统状态栏（时间 / 运营商 / 电量）是**纯白底**的，  
和首页吸顶那条橙色渐变之间横着一道明显分界，一眼就能看出是「系统一条 + 网页一条」两截。

**目标**：让吸顶的橙色渐变直接铺到状态栏底下，两者连成一片。

#### iOS（已实现，改动在三处）

| 位置                       | 改了什么                                                       | 作用                                                                    |
| -------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `index.html`               | `apple-mobile-web-app-status-bar-style` → `black-translucent`  | 状态栏背景变透明，网页从屏幕最顶端 `(0,0)` 开始绘制，状态栏浮在内容之上 |
| `index.html`               | viewport 带 `viewport-fit=cover`（原来就有）                   | 配合上一条，`env(safe-area-inset-top)` 才会等于状态栏高度               |
| `src/components/AppLayout` | Content 的 `paddingTop: calc(16px + env(safe-area-inset-top))` | 给状态栏让出高度，否则各页面顶部会被它压住                              |
| `src/pages/Menu`           | 吸顶栏 `marginTop: calc(-16px - env(safe-area-inset-top))`     | 把上面让出来的高度抵消掉，让吸顶栏顶到 `(0,0)`，渐变顺势盖住状态栏      |

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

| 分类         | 选型                               | 理由                                                                   |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------- |
| 框架         | **React 18 + TypeScript 5**        | 主流、类型安全                                                         |
| 构建         | **Vite 5**                         | 启动快、HMR 舒服                                                       |
| UI           | **Ant Design 5**                   | 组件全（Card/Table/Form/Drawer/Statistic…都现成）                      |
| 路由         | **React Router v6**                | 单页多视图                                                             |
| 状态         | **Zustand 4** + `persist`          | 比 Redux 轻很多，菜品/食材/采购清单/菜单各自独立持久化                 |
| 日期         | **dayjs**                          | AntD 内置日期库，用于格式化与"做菜记录"时间戳                          |
| 表格导入导出 | **SheetJS (`xlsx`)**               | 食材库支持 Excel 导入 / 导出 / 下载模板                                |
| 后端         | **Supabase PostgreSQL**            | 免费额度够用；之前 CloudBase 体验版 3000 资源点 4 天耗尽并触发资源隔离 |
| 数据库访问   | **Supabase Data API（PostgREST）** | 前端 `fetch` 直接调 REST，无中间层                                     |
| 鉴权         | **anon key + 表级 RLS**            | 前端可公开的 JWT，靠 RLS 策略兜底；用户只用昵称+密码，无需邮箱手机     |
| 工程         | **TS 路径别名 `@/*`**              | `@/types`、`@/lib/...` 引用更短（见 `tsconfig.json`）                  |
| 部署         | **CloudBase 静态网站托管**         | 免备案，CDN 加速                                                       |

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

| 表名                | 用途                                  | 关键字段                                                                                                                              |
| ------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `dishes`            | 菜品主表                              | `id` (text PK), `name`, `category`, `difficulty`, `cook_time_min`, `servings`, `cover_image`, `favorite`, `created_at`, `tips` |
| `ingredients`       | 食材库                                | `id` (text PK), `name`, `category`, `price_per_unit`, `unit`, `spec`, `note`, `unit_grams`, `unit_ml`                                 |
| `dish_tags`         | 菜-标签（多对多）                     | `dish_id`, `tag`（联合主键）                                                                                                          |
| `dish_ingredients`  | 菜-食材（含用量）                     | `id` (bigserial PK), `dish_id`, `ingredient_id`, `amount`, `unit`                                                                     |
| `dish_steps`        | 烹饪步骤                              | `dish_id`, `step_order`, `step_text`（联合主键）                                                                                      |
| `users`             | 用户账号                              | `id` (text PK, 归一化昵称), `nick`, `display_name`, `salt`, `password_hash`, `avatar`, `disabled`, `created_at`                       |
| `shopping_lists`    | 采购清单（按用户隔离）                | `id` (text PK, =uid), `data` (jsonb), `updated_at`                                                                                    |
| `weekly_menus`      | 菜单安排（按日期存，按用户/家庭隔离） | `id` (text PK, =uid 或家庭 id), `data` (jsonb, `{ 日期key: 菜品id[] }`), `updated_at`                                                 |
| `families`          | 家庭                                  | `id` (text PK, `fam_<创建者uid>`), `admin_uid`, `created_at`                                                                          |
| `family_members`    | 家庭成员                              | `id` (text PK, `<famId>__<uid>`), `family_id`, `uid`, `name`, `role`, `permission`, `joined_at`                                       |
| `family_invites`    | 家庭邀请 / 管理员转让                 | `id` (uuid PK), `family_id`, `from_uid`, `to_uid`, `to_name`, `status`, `type`, `created_at`                                          |
| `family_menu_audit` | 家庭菜单修改历史                      | `id` (uuid PK), `family_id`, `actor_uid`, `actor_name`, `action`, `day`, `detail`, `created_at`                                       |
| `login_logs`        | 登录日志                              | `id` (text PK), `uid`, `nick`, `login_at`, `ip`, `region`, `device`, `os`, `browser`, `ua`, `screen`, `language`                      |
| `op_logs`           | 操作日志（审计）                      | `id` (text PK), `actor_uid`, `actor_name`, `action`, `target`, `detail`, `created_at`                                                 |

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

1. **App 启动只读，播种靠人工**（2026-10 起改为人工控制）：
   App 打开时只从云端**拉取展示，绝不自动写入**。拉取失败也不会再被误判成空表去播种
   （那正是图片被种子覆盖的事故根源，见「图片消失第二回」）。
   播种入口：**管理端 → 系统管理 → 种子数据播种**：
   - **检查缺失 / 补缺失种子**：把「种子里有、云端没有」的菜补进去（只新增，不覆盖任何已有菜）
   - **种子覆盖…**：用代码里的种子版本整体替换所选菜品（危险操作，带红色警告；
     用于种子配方更新后的同步、恢复被覆盖的图地址）
2. **命令行补种**：批量操作或数据库被清空时也可以跑脚本

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

#### 🖼 图片怎么跟着种子播（相对路径方案）

种子菜的封面图**不放代码里**（图片太大），也**不写完整 URL**（会绑死某台服务器）。
数据库里存的是相对路径，URL 前缀由运行环境拼接：

- `seedDishes.ts` 里写：`coverImage: '/seeds/dish_mapo_tofu.webp'`
- 渲染时 `resolveImageUrl()`（`src/lib/supabase.ts`）自动拼成
  `<当前环境 SUPABASE_URL>/storage/v1/object/public/dish-images/seeds/dish_mapo_tofu.webp`

这样图片文件只存在 Storage 的 `seeds/` 目录里；换服务器 / 换 Supabase 项目时，
把文件传到新桶、改一行环境变量即可，代码和数据库记录一个字都不用动 —— **图片独立于载体**。

新增一颗带图种子菜的固定流程：

1. 图片（webp，压缩后）上传到 Storage 的 `dish-images/seeds/` 目录，**文件名用菜谱 id**（如 `dish_mapo_tofu.webp`）
2. `seedDishes.ts` 给对应菜加 `coverImage: '/seeds/<id>.webp'`
3. 完事 —— 播种时图地址随种子一起写入，图文件躺在桶里谁也不依赖

#### ⏳ 待办：存量完整 URL 迁移成相对路径（还没做，不急）

数据库里现在是两种格式混存：以前上传的 60+ 道菜存的是**完整 URL**
（`https://ixixmxoeugzkbtljxubx.supabase.co/storage/v1/...`），种子菜存的是相对路径。
两种 `resolveImageUrl()` 都兼容，**显示上没有问题**。

隐患在于完整 URL 绑死当前服务器：换 Supabase 项目 / 迁服务器时，
这些菜要逐条改 URL，而相对路径的菜一个字都不用动。统一方案（两步）：

1. **改上传逻辑**：DishEditor 上传成功后，把返回的完整 URL 剥掉前缀再存
   （参照 `storageUpload` 的返回值 + `resolveImageUrl` 的前缀拼接规则），
   以后新上传的菜自动存相对路径；
2. **一次性迁移**（Supabase SQL Editor 执行，跑之前先 `pnpm backup`）：

   ```sql
   UPDATE dishes
   SET cover_image = regexp_replace(
     cover_image,
     '^https://[^/]+/storage/v1/object/public/dish-images/',
     ''
   )
   WHERE cover_image LIKE 'https://%';
   ```

跑完所有菜的图地址都是相对路径，彻底和载体解耦。
`ingredients` 表的 `image` 列如果有同样问题，照此办理。

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

| 项目              | 免费版额度                   | 本项目现状 / 结论                                         |
| ----------------- | ---------------------------- | --------------------------------------------------------- |
| **数据库容量**    | **500 MB**                   | 现在 57 道菜 + 83 食材**不到 1 MB**，占比可忽略           |
| 行数上限          | **无限制**（只看容量）       | 随便加，行数不是瓶颈                                      |
| 表数量            | **无硬性限制**               | 现在 14 张；再翻倍到 30 张也没问题                        |
| API 请求          | 不限次数，但有公平使用软阈值 | 前端每次刷新约拉 5~10 个请求，家用远达不到                |
| 每月出口流量      | 5 GB                         | 首包（含 image/JPEG 封面）约 2 MB，够几千次首屏           |
| 文件存储          | 1 GB                         | 本项目没用到（封面图走 dataURL 存库，没走 Storage）       |
| 空闲 7 天自动暂停 | 连续 7 天无任何请求会暂停    | 控制台点 Restore 即可恢复；长期用建议每周访问一次或升 Pro |

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

| 环节                 | 大小                    |
| -------------------- | ----------------------- |
| 压缩后的 JPEG 二进制 | 约 **120~250 KB**       |
| Base64 膨胀（×1.37） | 约 **160~340 KB**       |
| **落库后每张封面**   | 取中位估算 **≈ 200 KB** |

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

| 场景                               | 每张占用          | 300 道菜    | 500 道菜    | 占 500 MB 额度        |
| ---------------------------------- | ----------------- | ----------- | ----------- | --------------------- |
| **A. 只给每道菜一张封面**（当前）  | ~200 KB           | **~60 MB**  | **~100 MB** | 12% ~ 20% ✅ 很安全   |
| **B. 再加步骤图**（每道菜约 3 张） | 4×200 KB = 800 KB | **~240 MB** | **~400 MB** | 48% ~ 80% ⚠️ 接近上限 |
| **C. 再加食材图**（100~300 种）    | +20~60 MB         | ~300 MB     | ~460 MB     | 60% ~ 92% ❌ 已经危险 |

> 表格里的「支出」是**纯磁盘**。结论很直接：
> **A 可以放心用 Base64；B 就要谨慎了；C 加上去基本就触顶了。**

#### ⚠️ 但真正先爆的不是磁盘，是流量和首屏

这一点比上面的表格更重要：

`src/lib/cloudSync.ts` 里拉菜单是 `pgSelect('dishes')`，**没有指定列**，所以

> **每次全量同步，会把所有菜的 Base64 封面一起拉下来。**

| 菜品数           | 单次全量同步要下载 | 5 GB/月流量够撑几次 |
| ---------------- | ------------------ | ------------------- |
| 100 道（都有图） | ~20 MB             | ~250 次             |
| 300 道           | ~60 MB             | ~80 次              |
| 500 道           | ~100 MB            | **~50 次**          |

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

| 红线                  | 阈值                                                          | 去哪里看                                                          |
| --------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 数据库体积            | **> 300 MB**（500 MB 的 60%）——要给 autovacuum 和表膨胀留余地 | Dashboard → Settings → Usage；或上面那条 `pg_database_size()` SQL |
| 月流量                | **> 3 GB**（5 GB 的 60%）                                     | Dashboard → Settings → Usage → Egress                             |
| 单次同步              | **> 5 MB** 或首屏超过 3 秒                                    | DevTools → Network 看 `rest/v1/dishes` 那一条的 size              |
| 准备加步骤图 / 食材图 | **一开始就要迁**，别先塞进去再想着救                          | ——                                                                |

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

> 没跑第 1 条的话，图片会**上传失败并明确报错**（Base64 降级已按决策移除，
> 详见下方「图片『传了却显示不出来』完整排查实录」）。想要图片功能就必须先建桶。

#### 还可以继续做的优化

1. **列表查询剔除大字段**——`pgSelect('dishes')` 目前会把 `cover_image` 一起拉下来。
   改成显式指定列、图片单独按 id 取，单次同步能再降一个数量级（这是更根本的一步，尚未做）
2. **菜品步骤图 / 食材图**——对象存储已经就位，加图只是加字段 + UI 的事
3. **懒加载**——菜品卡片和食材缩略图已加 `loading="lazy"`，只加载滚到的图

---

## 🖼 图片「传了却显示不出来」完整排查实录

> 这个问题在腾讯云和 Supabase 上**各犯过一次**，两次现象一模一样：
> 图片确实传了、Storage 桶里也确实有文件、界面也提示「已保存」，
> 但换个设备 / 清一次缓存，图片全部消失。
> 下面把根因、排查过程和最终修法完整记下来 —— **它不会再复发，但原理值得记住。**

### 📌 结论先说：现在还会不会复发

| 问的问题                                       | 答                                                      |
| ---------------------------------------------- | ------------------------------------------------------- |
| 上传失败还会假装成功吗                         | **不会** —— 上传失败直接抛错，界面弹红色提示            |
| 数据库列缺失还会静默跳过吗                     | **不会** —— 检测到列缺失直接报错，并给出修复 SQL        |
| 别的写入路径还会丢 `cover_image` 吗            | **不会** —— 保存后立即回读比对，对不上当场报错          |
| **桶里有图、库里没记录**这种不一致状态还会有吗 | **不会** —— 保存失败 / 反悔清除时自动撤销上传，见第五节 |
| Storage 本身会挂吗                             | 桶是 `public` 的，策略允许 anon 读，实测匿名可直连 200  |

也就是说：**从「上传 → 落库 → 渲染」这条链路上，所有会静默失败的点都已变成显式报错，
并且跨系统的多步操作具备了撤销能力 —— 要么两边都有，要么两边都没有。**

### 一、三个真正的根因

#### 根因 1：`cover_image` 列缺失时的「永久静默跳过」（主凶）

```ts
// ❌ 修复前的代码（cloudSync.ts）
let coverImageColumnMissing = false; // ← 模块级标志，全局共享

async function insertDishRow(d: Dish): Promise<void> {
  const row = dishToRow(d);
  if (coverImageColumnMissing) delete row.cover_image; // ← 静默删掉图片字段
  try {
    await pgInsert("dishes", row);
  } catch (e) {
    if (!coverImageColumnMissing && msg.includes("cover_image")) {
      coverImageColumnMissing = true; // ← 一旦置真，这个页面会话内
      delete row.cover_image; //    之后所有写入都不再存图片
      await pgInsert("dishes", row); //    菜名/配料/步骤照存，界面照样弹「已保存」
      return;
    }
  }
}
```

**它为什么致命**，三个特性叠在一起：

1. **静默** —— `delete row.cover_image` 之后写入照样成功，不抛任何错
2. **永久** —— `coverImageColumnMissing` 是**模块级变量**，不是一次性的；
   一次误判后，整个页面生命周期内所有菜品都不再存图片地址
3. **不可见** —— 界面收到的是「保存成功」，用户没有任何察觉的途径

`ingredients.image` 当时是这段代码的**逐字复制版**，同样的问题（现已一并修掉）。

> **修复**：列缺失直接抛错，并把该执行哪条 SQL 写在错误信息里。
> 宁可让保存失败，也不能假装成功。

```ts
// ✅ 修复后
function isMissingCoverImageColumn(e: unknown): boolean {
  return (e instanceof Error ? e.message : "").includes("cover_image");
}
// 命中就抛错，不再降级
throw new Error(
  "数据库的 dishes 表缺少 cover_image 列…ALTER TABLE dishes ADD COLUMN cover_image text;",
);
```

#### 根因 2：上传失败自动降级成 Base64

```ts
// ❌ 修复前
try {
  return await uploadToStorage(file, folder);
} catch (e) {
  console.warn("[image] 上传失败，退回 Base64：", e); // ← 只是 warn，界面上完全静默
  const dataUrl = await compressToDataUrl(file);
  return { url: dataUrl, viaStorage: false }; // ← 用户以为成功了
}
```

**问题在于降级本身也救不了场**：Base64 一条图占几十 KB 到几 MB，
写进数据库这一步同样会超时或撑爆请求 —— 于是「存了但没存上」，
而用户看到的仍是「保存成功」。

**修复**：删掉整个降级分支，上传失败就抛错。

```ts
// ✅ 修复后
if (!isCloudEnabled()) {
  throw new Error("未配置云端…无法上传图片"); // 不再偷偷转 Base64
}
try {
  return await uploadToStorage(file, folder);
} catch (e) {
  throw new Error(`图片上传失败：${detail}`); // 原样抛给界面
}
```

#### 根因 3：相对路径被当成完整 URL 用

```ts
// ❌ 修复前（6 处渲染点都是这样）
<img src={dish.coverImage} />
```

数据库里 `cover_image` 混着**三种形态**：

| 形态         | 样例                                            | 直接当 src 会怎样                               |
| ------------ | ----------------------------------------------- | ----------------------------------------------- |
| 完整 URL     | `https://xxx.supabase.co/storage/v1/.../a.webp` | ✅ 正常                                         |
| **相对路径** | `/dishes/a.jpg`                                 | ❌ 请求**你自己域名下**的 `/dishes/a.jpg` → 404 |
| Base64       | `data:image/webp;base64,...`                    | ✅ 正常（但见根因 2）                           |

**修复**：渲染前一律过 `resolveImageUrl()`。

```ts
export function resolveImageUrl(value?: string | null): string {
  const v = value?.trim() ?? "";
  if (!v) return "";
  if (v.startsWith("data:") || v.startsWith("blob:")) return v; // Base64 / 本地预览
  if (/^https?:\/\//i.test(v)) return v; // 已是完整地址
  return storagePublicUrl(v.replace(/^\/+/, "")); // 相对路径 → 拼到 bucket 后
}
```

已应用到全部 6 个渲染点：`DishCard`、`DishDetail`、`MenuPlan`、`Ingredients`（列表 + 预览）、
`DishEditor`（预览）。

### 二、为什么是「突然」出现的（以及我的责任）

真相是：**图片地址从来没进过数据库，一直躺在浏览器的 IndexedDB 本地缓存里。**

```
本地缓存有 cover_image  →  能显示（假象）
        ↓
清掉 IndexedDB 缓存      →  只能从云端拉
        ↓
云端 cover_image 是 null →  全部显示占位符
```

「突然」的时间点就是**清缓存那一刻**。而清缓存是我建议的 —— 我当时没想到
本地缓存里存着一份「能用的假数据」，清掉就把问题暴露出来了。
**这个锅在我**：应该在让你清缓存之前先查数据库。

### 三、怎么排查的（可复用的方法）

分三步二分，每步都有明确的判据：

**第 1 步：图片到底有没有在数据库里？** 别看界面，直接查 API：

```bash
curl -sS "$VITE_SUPABASE_URL/rest/v1/dishes?select=name,cover_image&cover_image=not.is.null" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY"
```

- 返回空数组 → 数据层就没有，问题不在渲染
- 有数据 → 继续第 2 步

**第 2 步：文件到底在不在 Storage 里？**

```bash
curl -sS "$VITE_SUPABASE_URL/storage/v1/object/public/dish-images/dishes/<文件名>" \
  -w "\nHTTP=%{http_code}\n"
```

| 返回                 | 含义                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `200` + `image/webp` | 文件完好，继续第 3 步                                                |
| `400` + `NoSuchKey`  | 文件不在桶里（**注意**：400 是 Supabase 包装过的 404，不是权限问题） |
| `400` + 其他         | bucket / 策略问题                                                    |

**第 3 步：前端拿到的和渲染的分别是什么？** 在卡片组件里打两段日志：

```tsx
// 第 1 段：数据层
console.log("coverImage 原始值:", dish.coverImage);

// 第 2 段：渲染层（区分「请求失败」和「压根没地址」）
<img
  onLoad={() => console.log("渲染出来了")}
  onError={() => console.log("拿到了但没渲染")}
/>;
```

| 第 1 段     | 第 2 段        | 结论                                     |
| ----------- | -------------- | ---------------------------------------- |
| `undefined` | 不触发         | 数据库里就没有地址 → 查第 1 步           |
| 有值        | 「没渲染」     | 地址能拼但请求失败 → 查路径拼接 / 桶策略 |
| 有值        | 「渲染出来了」 | 正常，问题在样式或缓存                   |

### 四、最后一道保险：保存后回读校验

前面堵的是「已知漏洞」，这个防的是「未来任何新的漏洞」——
哪怕以后有人又加了一条新的写入分支，只要它悄悄丢字段，这里就能兜住：

```ts
// useDishStore.ts · writeCloud 末尾
if (dish.coverImage && isCloudEnabled()) {
  const [row] = await pgSelect("dishes", {
    id: `eq.${dish.id}`,
    select: "cover_image",
    limit: 1,
  });
  if (!row || row.cover_image !== dish.coverImage) {
    throw new Error(
      "图片没有存进数据库：写入后回读发现地址不一致，请重新上传一次",
    );
  }
}
```

代价是每次保存多一次 GET（只在写入时发生），收益是
**「几天后才发现图没了」变成「保存当场就看到红色报错」**。

### 五、图片与数据库的一致性（补偿事务）

> 前面三个根因修完，「不会再静默丢图」已经成立。
> 但用户提了一个更根本的问题：
>
> **「上传成功但数据库没存住」本身就是一种不一致状态。**
> 光保证「不报错」不够，应该保证**桶和数据库始终同步**。
> 也就是：要么两边都有，要么两边都没有。

#### 技术边界：为什么不是真正的「原子性」

严格的原子性要求跨系统事务，但 **Supabase Storage 和 PostgreSQL 是两个独立服务，
没有分布式事务**（也不打算为此引入两阶段提交那种复杂度）。

能做到的是**补偿事务**（Compensating Transaction）：

> 先做第一步，第二步失败时**撤销**第一步的效果，让系统回到操作前的状态。

效果上和用户期望的一致，代价只是「失败路径要多一次删除请求」。

#### 原来的流程为什么会漏

关键在于**上传和保存是分开的两步**，中间隔着用户的思考时间：

```
T+0s    点「选择图片」 → 压缩 → 传桶 ✅ → URL 填进表单框
        ⋯⋯⋯ 用户可能在看图、改名字、写配料，十几秒到几分钟 ⋯⋯⋯
T+10s   点「保存」     → 写数据库   ← 这一步完全可能失败
```

第二步失败时，第一步的成果（桶里的图）**就留在那里没人管了**。
更糟的是第三、四条路径同样泄漏：

| 路径                      | 原来的结果                        |
| ------------------------- | --------------------------------- |
| 传图 → 保存失败           | 桶里有图，库里没地址 → **孤儿图** |
| 传图 → 点「清除图片」反悔 | 桶里有图，库里没地址 → **孤儿图** |
| 传图 → 直接关掉弹窗       | 桶里有图，库里没地址 → **孤儿图** |
| 传图 → 保存成功           | ✅ 正常                           |

**本项目那 19 张孤儿图就是这么攒出来的** —— 每一个都对应一次
「传了图，但这次编辑没走到最后一步」。

#### 修法：记住「待提交」的图，失败就撤销

```tsx
// 1) 上传成功 → 记下桶内路径，标记为「待提交」
pendingUploadRef.current = { url: picked.url, path: picked.storagePath };

// 2) 保存成功 → 图正式「有主」，清标记
await updateDish(dish.id, patch);
pendingUploadRef.current = null;

// 3) 保存失败 → 撤销：把刚传的图删掉
catch (e) {
  await rollbackUpload();     // ← 关键
  message.error((e as Error).message);
}

// 4) 传完又点「清除图片」→ 同样撤销
onClick={() => { form.setFieldsValue({ coverImage: '' }); void rollbackUpload(); }}
```

修完之后的不变式：

| 场景                  | 桶                 | 数据库 |
| --------------------- | ------------------ | ------ |
| 传图 + 保存成功       | 有                 | 有 ✅  |
| 传图 + 保存失败       | **无**（已撤销）   | 无 ✅  |
| 传图 + 点「清除图片」 | **无**（已撤销）   | 无 ✅  |
| 传图 + 关掉弹窗       | 无（本来就没写库） | 无 ✅  |

**「桶里有图、库里没记录」这个状态从此不再存在。**

#### 撤销要认准目标，不能乱删

`storageDelete` 需要桶内的**对象路径**，但表单里存的是**完整 URL**，
所以需要反推。`storagePathFromUrl` 覆盖五种输入（已实测）：

| 输入                                                                         | 反推结果        | 说明                     |
| ---------------------------------------------------------------------------- | --------------- | ------------------------ |
| `https://xxx.supabase.co/storage/v1/object/public/dish-images/dishes/a.webp` | `dishes/a.webp` | 标准 Storage URL         |
| `/dishes/a.webp`                                                             | `dishes/a.webp` | 相对路径                 |
| `dishes/a.webp`                                                              | `dishes/a.webp` | 裸路径                   |
| `data:image/webp;base64,...`                                                 | `null`          | 不是桶里的文件，**不删** |
| `https://example.com/x.png`                                                  | `null`          | 外部图片，**绝对不能删** |

后两条是安全底线：**撤销只能删「本次会话自己刚传的」那张图**，
绝不能因为用户换了一张图就把旧图或外链图误删。

撤销本身失败（比如断网）时**不阻断保存**，但会打 `console.error`
留下痕迹 —— 否则又是一张查不到来源的孤儿图。

#### 两层防护的分工

| 层           | 防什么                             | 触发时机           |
| ------------ | ---------------------------------- | ------------------ |
| **补偿撤销** | 状态不一致（桶里有、库里没有）     | 失败当下，自动回滚 |
| **回读校验** | 静默丢字段（写入成功但字段没进去） | 保存后立刻比对     |

两层是互补的：撤销保证「失败不留痕」，回读保证「问题当场可见」。

### 六、⚠️ 四条纪律

1. **不要为了「不报错」而静默降级**。Base64 降级看起来是兜底，实际是把
   「明确失败」变成「假装成功」，这才是图片丢失的根源。
2. **模块级标志位做降级开关极其危险**。`coverImageColumnMissing` 这种
   「一次误判、永久生效」的逻辑，任何时候都该优先选择「让错误暴露出来」。
3. **清本地缓存前先确认云端数据是对的**。本地缓存会掩盖云端的数据缺失，
   在没查清云端之前清缓存，等于主动拆掉遮羞布。
4. **跨系统的多步操作要有撤销路径**。上传 + 写库这种「分两步、中间还会失败」
   的流程，必须为每条失败/取消路径准备补偿动作，不能只实现成功路径。

### 七、遗留待办

Storage 桶里目前有 **19 张孤儿图**（文件名是 `mve4mj8q-rwimix.webp` 这类随机名，
2026-10-18 / 19 两天上传，共约 2.8 MB），没有任何数据库记录引用它们。
这是补偿机制上线**之前**的历史遗留；新流程不会再产生孤儿图。
需要做个图库页面把它们列出来手动挂到菜品上，或直接清理掉。

---

## 🖼 图片消失第二回：「拉取失败被当成空表」种子覆盖实录

> 上一篇解决的是「传了却显示不出来」（上传/落库链路的静默失败）。
> 这一篇是另一类事故：**图片当初传得好好的，数据库里的地址却被代码悄悄覆盖成 null**。
> 用户确认上传过、手机电脑一直显示正常，某天突然全没了。
> 两篇合起来才是图片链路的完整防护史。

### 📌 事故现象

种子菜里的前 9 道（蒜蓉炒青菜、酸辣土豆丝、糖醋里脊、红烧排骨、麻婆豆腐、
蒜蓉蒸虾、清蒸鲈鱼、椒盐排骨、番茄牛肉面）在数据库里 `cover_image` 全部变成了 `null`。
操作日志显示 2026-10-21 晚上确实编辑过其中 7 道，但用户**没有动过图片字段**。

### 一、根因：三个 bug 的连环相撞

#### 主凶：`cloudList` 吞错 + `load()` 把「拉取失败」误判为「云端空表」

```ts
// ❌ 修复前（cloudSync.ts）
export async function cloudList(collection: string) {
  try {
    /* ... 四张表查询 ... */
  } catch (e) {
    swallow(e);
    return []; // ← 网络抖动 / RLS 拒绝 / 超时，全被吞成「空数组」
  }
}

// ❌ 修复前（useDishStore.ts → load()）
const remote = await cloudList<Dish>("dishes");
const valid = remote.filter(/* ... */);
if (valid.length === 0) {
  // 云端是空表 → 上传种子
  for (const dish of seedDishes) await writeCloud(dish); // ← 51 道种子全量覆盖云端！
}
```

**它为什么致命**：`[]` 在这里有两个完全不同的含义——「云端真的是空表」和
「我根本没读到云端」。前者该补种子，后者**什么都该做，唯独不该写云端**。
合并处理的结果是：某次拉取失败，51 道种子菜被逐个 PATCH 覆盖到云端，
`dishToRow` 把种子里不存在的 `cover_image` 写成 `null`，用户上传的图地址被抹掉。

**为什么恰好丢 9 道**：覆盖循环写到第 9 道时写入失败，循环中止。
丢失的 9 道菜与 `seedDishes.ts` 数组的前 9 条**顺序完全一致**——这就是实锤，
不是巧合。后面 60+ 道用户自建菜没轮到，幸免。

#### 帮凶 1：`update()` 的 spread 合并不区分「未提供」和「提供为 undefined」

```ts
// ❌ 修复前（useDishStore.ts）
update: async (id, patch) => {
  const old = get().items.find((it) => it.id === id);
  const next = { ...old, ...patch };   // patch.coverImage === undefined 也会覆盖 old 的有效值！
```

编辑器保存时 patch **总是带着** `coverImage` 这个 key。表单值为空时它是
`undefined`，spread 后把 `old.coverImage` 覆盖成 `undefined`，`dishToRow`
再转成 `null` 落库——**编辑一次丢一次图**。

#### 帮凶 2：`DishEditor` 把空串转 undefined，丢掉了「清空」的语义

```ts
// ❌ 修复前
const coverImage = values.coverImage?.trim() || undefined; // '' → undefined
```

用户主动清空图片输入框（表单值 `''`）和「从来没传过图」被压成了同一个值。
修完帮凶 1 后这个 bug 反而会显形：清空图片保存，`undefined` 被 update 跳过，
图清不掉了。

#### 帮凶 3：启动窗口期，store 里是种子数据

zustand 初始 state 是 `items: seedDishes`，云端数据要等 `load()` 完成才替换。
在窗口期打开编辑器，表单回填的是种子菜（没有图地址），保存时全量 PATCH
就会覆盖云端的有效数据——和主凶是同一种伤害，只是触发条件不同。

### 二、修复：四道闸门

| 闸门                      | 位置                                                             | 防什么                                                                                                |
| ------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **拉取失败绝不写云端**    | `cloudList(…, { throwOnError: true })` + `load()` try/catch 中止 | 主凶。拉取失败直接 return，永远走不到「空表→传种子」                                                  |
| **update 跳过 undefined** | `useDishStore.update()` 过滤 patch 里的 undefined 字段           | 帮凶 1。编辑器没动图就不覆盖                                                                          |
| **三档语义**              | `DishEditor` 用 `openedCoverRef` 记住打开时刻的图状态            | 帮凶 2+3。有图照存 / 打开时有图+表单空=真清空 / 打开时就没图+表单空=数据没就位，传 undefined 保护旧值 |
| **空串归一化**            | `dishToRow` 的 `cover_image: d.coverImage \|\| null`             | 落库统一存 null，不在库里留 `''`                                                                      |

#### 用户视角：现在图片什么时候在、什么时候没

| 你的操作                   | 结果                             |
| -------------------------- | -------------------------------- |
| 编辑菜品其他字段（不动图） | 图地址原样保留                   |
| 主动清空图片输入框保存     | 图没了（你主动删的，唯一途径）   |
| 换一张新图                 | 换成新的                         |
| 网络失败时打开系统         | 什么都不写，等网络好了正常拉     |
| 管理端人工播种（补缺失）   | 只新增缺失的菜，不碰已有的任何菜 |

一句话：**只要你没有人为删图，图永远在。** 图片的「没」只有两个合法来源：
你主动清空，或管理端「种子覆盖」时你明确勾选了这道菜。

### 三、排查方法（可复用）

1. **丢了什么，先看「丢的集合」有没有规律**。9 道菜 = 种子数组前 9 条且顺序一致，
   一眼锁定「按种子顺序的批量写入」。如果是用户随机编辑造成，集合不会有这种连续性。
2. **op_logs 只存 `action / target / detail` 三个字符串，没有数据快照**——
   日志能证明「谁在什么时候碰过它」，救不回数据本身。
3. **PostgreSQL 没有行级历史**，被覆盖的值在数据库层面找不回来。
   Supabase 免费版也没有 PITR。所以防护只能做在**写入之前**，不能指望事后恢复。
4. anon key 查 Storage 桶列表返回 `[]` / "Bucket not found" **不代表桶没了**，
   只是 anon 无权 list。判断桶是否健在，看库里已有的 Storage URL 能不能 200。

### 四、⚠️ 三条新纪律（接上一篇的四条）

5. **`[]` / 空结果 ≠ 数据不存在**。吞错降级后的返回值，绝不能作为「触发写入」
   的依据。要写云端的地方，读取必须显式失败（throwOnError）。
6. **spread 合并 patch 前先想清楚语义**。「字段没提供」和「字段提供为空」
   是两回事，合并逻辑必须区分，否则未改动的字段会被静默覆盖。
7. **全量覆盖类操作（补种子、批量 upsert）是最高危操作**。它假设「我手里的
   数据是完整的最新版」——这个假设在启动窗口期、拉取失败时都不成立。
   写之前要么校验，要么不做。

### 五、遗留待办（2026-10-22 更新：恢复方案已落地）

被覆盖成 null 的图地址无法从数据层恢复，但图片文件都还在 Storage 桶里。
恢复方案已随「图片播种」机制落地（见「种子数据」章节的相对路径方案）：

1. 在 Supabase Dashboard → Storage → dish-images 里把这些图找到，
   移入 `seeds/` 目录并按菜谱 id 重命名（如 `dish_mapo_tofu.webp`）；
2. `seedDishes.ts` 已给对应 14 道菜挂上 `/seeds/<id>.webp` 相对路径；
3. 管理端 → 系统管理 → **种子覆盖** 勾选这几道菜执行，图地址随种子整体写回；
   或者逐道在编辑器的「图片链接」输入框粘贴 `/seeds/<id>.webp`
   （更精准，只动图字段，不碰你改过的其他内容）。

⚠️ 注意：这些图在 Storage 里的文件名还是随机串（`mvi9tn27-...`），
上面的第 1 步做完之前，种子路径指向的文件还不存在，卡片会显示裂图 —— 属预期现象。

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

| 配置                                          | 作用                                               |
| --------------------------------------------- | -------------------------------------------------- |
| `command = "pnpm build"` / `publish = "dist"` | 检测到 `pnpm-lock.yaml` 会自动用 pnpm 构建         |
| `/* → /index.html` (200)                      | **SPA 回退**，解决访问 `/menu-plan` 或刷新页面 404 |
| `sw.js` 禁缓存                                | 避免 PWA 让用户卡在旧版本                          |

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

| 坑                                           | 症状                                                                 | 解法                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 静态托管没在控制台开通                       | 部署"成功"但什么也访问不到                                           | 控制台手动点「开通」                                                                                                |
| `VITE_TCB_ENV_ID` 没注入                     | 页面打开白屏                                                         | `.env` 填了之后**重新 `pnpm build`**                                                                                |
| RLS 开了但没建 policy                        | 页面数据是空的但不报错                                               | 跑 `supabase/schema.sql` 末尾 policy 那段                                                                           |
| key 填成了 Secret / service_role             | 一切正常但数据库裸奔（绕过 RLS）                                     | 前端只能用 Publishable / anon public key                                                                            |
| 新版 `sb_publishable_` key 报 JWT 无效       | `Invalid JWT` / 401                                                  | 非 JWT 的 key 只能走 `apikey` 头（代码已自动处理）                                                                  |
| Supabase 单次返回上限                        | 表超过 1000 行时后面读不到                                           | 日志类大表用 `limit` + 分页，别一次性全拉                                                                           |
| 免费项目 7 天无活动                          | 项目被自动暂停，API 全部不可用                                       | 控制台点 Restore；长期用建议定期访问或升 Pro                                                                        |
| Exposed schemas 不含 `public`                | 所有请求 404                                                         | Settings → API → 把 `public` 加进 Exposed schemas                                                                   |
| SPA 刷新 404                                 | F5 报 404                                                            | 控制台 → 静态托管 → 设置 → 错误页面 → 404 用 `/index.html` 兜底                                                     |
| PostgREST 0 行返回 406                       | `pgSelectOne` 改成 `pgSelect`（数组）                                | 已修                                                                                                                |
| 默认域名访问偶尔 418                         | 边缘节点风控，**用无痕窗口**打开                                     | 不要带 `?v=xxx` 查询参数                                                                                            |
| 静态页面 `VM169:1 cls is not defined`        | CloudBase CDN 注入的引导脚本                                         | 配 404 → index.html 兜底后自动消失                                                                                  |
| `cover_image` / `users.avatar` 列不存在      | PostgREST 报 42703                                                   | 跑增量 SQL 里的 `ALTER TABLE`                                                                                       |
| 头像 base64 **原图**直存 users 表            | 用户管理每次进都 loading 5~10 秒（列表要跨境拉 1.4MB 头像，实测 9s） | 上传一律压缩成 192px WebP 再存（约 10KB）；`listUsers` 拉到超 60KB 的旧头像会自动压缩写回（存量自愈，无需手动重传） |
| 管理页请求串行 await                         | 几个跨境往返的时间相加，页面 loading 久                              | 互不依赖的请求并行发出；连通性探测并入批量统计，不单独跑一轮                                                        |
| 全站响应带 `Content-Disposition: attachment` | 站点变成「下载页面」（地址栏出现 `download.html`）                   | 见下面「站点被当成下载」一节                                                                                        |

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

## 🔔 Web Push 推送（iOS 踩坑实录）

菜单被改动时按 `familyId` 群发（跳过操作者自己）。服务端是 Supabase Edge Function
`send-push`：VAPID 签名 + aes128gcm 加密，纯 WebCrypto 手写、不依赖 npm 包。

### 启用条件

| 条件                                | 说明                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| iOS **16.4+**                       | 更低版本不支持 Web Push                                                                                   |
| **必须「添加到主屏幕」**            | 要从桌面图标打开才能订阅，Safari 里直接访问会被拒                                                         |
| Netlify 配 `VITE_VAPID_PUBLIC_KEY`  | 没配时「菜单通知」开关**不渲染**（`pushEnvReady()` 返回 false），不报错也不影响现有功能                   |
| Supabase 建 `push_subscriptions` 表 | SQL 见 `supabase/push.sql`                                                                                |
| 部署 Edge Function + 三个 Secrets   | `VAPID_PRIVATE_KEY` / `VAPID_PUBLIC_KEY` / `VAPID_SUBJECT`（**不能用 `SUPABASE_` 前缀**，那是平台保留的） |

> 改完环境变量记得 **Clear cache and deploy site** —— Vite 的变量是 build 时内联进 bundle 的。

### 踩过的坑（按被坑程度排序）

#### 1️⃣ 密钥派生必须照**早期草案**，不能照 RFC 8291

这是最隐蔽的一个，卡得最久。Web Push 的加密 2017 年才定稿成 RFC 8291，
但 **Safari / iOS 只认早期草案那套**（`web-push` 库底层的 `http_ece` 实现的就是它）。
两套算法结果完全不同：

|                | ❌ RFC 8291（Safari 解不开）     | ✅ 早期草案（Safari 只认这套）       |
| -------------- | -------------------------------- | ------------------------------------ |
| context 标签   | `"P-256\0"` + **2 字节长度前缀** | `"WebPush: info\0"` + **无长度前缀** |
| HKDF 轮数      | 1 轮，salt = authSecret          | **2 轮**，第二轮 salt 换成随机 salt  |
| Expand 的 info | `"…aes128gcm\0"` **+ context**   | `"…aes128gcm\0"`，**不带 context**   |

```ts
// ✅ 现在的实现（supabase/functions/send-push/index.ts）
const authInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
const intermediate = await crypto.subtle.deriveBits(
  { name: "HKDF", hash: "SHA-256", salt: authSecret, info: authInfo },
  ikmKey,
  256,
);
const prkKey = await crypto.subtle.importKey(
  "raw",
  salt,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const prk = new Uint8Array(
  await crypto.subtle.sign("HMAC", prkKey, intermediate),
);
const cek = await hkdfExpand(
  prk,
  enc.encode("Content-Encoding: aes128gcm\0"),
  16,
);
const nonce = await hkdfExpand(
  prk,
  enc.encode("Content-Encoding: nonce\0"),
  12,
);
```

- **症状**：APNs 回 `201 Created`，手机**毫无反应**，Edge Function 日志**零报错**
- **为什么本地自测查不出来**：自己写的加密/解密闭环测试全部通过 —— 因为两头用的是**同一个（错的）约定**。
  **自洽 ≠ 符合标准**，只有跟成熟库的实现逐字节比对才暴露得出来
- **`hkdfExpand` 为什么要手写**：WebCrypto 只提供「Extract + Expand 一条龙」的 `deriveBits`，
  没法拿一个已经算好的 PRK 单独做 Expand —— 而这里的 PRK 必须由上游 extract 产出

#### 2️⃣ aes128gcm 的 `rs` 必须固定 4096，公钥放 keyid

|                     | ❌ 之前（错）                            | ✅ 现在（对）                            |
| ------------------- | ---------------------------------------- | ---------------------------------------- |
| `rs`（record size） | `ciphertext.length`，随 payload 长度浮动 | **固定 4096**（规范推荐值）              |
| 临时公钥            | 只放 `Crypto-Key: dh=` 头                | **写进 body 的 `keyid` 字段**（65 字节） |

症状跟坑 1 一模一样（APNs 201 + 设备静默），所以单看现象根本分不清是哪一个。

#### 3️⃣ iOS 前台不弹通知

和原生 App 一样：**App 在前台时 iOS 认为你自己看着呢，不会再去通知中心弹一条**。
在 App 里点「发一条测试推送」，App 必然在前台，所以永远看不到。

> **验证必须锁屏或切到别的 App**。横幅只亮几秒就消失，但**会留在通知中心里**，下拉找就行。

#### 4️⃣ iOS PWA 的 Service Worker 未接管窗口期

`navigator.serviceWorker.ready` resolve 只代表 SW 已激活，**不代表它已经 `claim()` 了当前页面**。
在这个窗口期调 `subscribe()` 会「成功」返回 `PushSubscription`，但那是个**空壳** ——
之后的推送浏览器全解不开、静默丢弃。
（Discourse Meta 事故复盘：<https://meta.discourse.org/t/-/402645>）

现在 `subscribePush` 的做法：controller 不存在时**等 `controllerchange` 事件**（最多 5 秒）再检查状态；
另外**优先复用已有订阅**，非要新建时先等 800ms 让 push service 收尾。

#### 5️⃣ 重新订阅后 endpoint 变了 → 按 `uid` 删

iOS 上 `unsubscribe()` 之后再次 `subscribe()` 会生成**新的 endpoint**，
所以「按 endpoint 删旧订阅」删不掉旧的，库里会堆空壳 —— 之后每次推送都**双发**，
调试时还分不清是哪条在起作用。改成按 `uid` 整批清
（前提：同一时间一个用户只在一台设备订阅，家庭场景符合）。

### 🕵️ 诊断方法：以后再遇到「发出去成功但设备没反应」

这类问题的难点在于**失败是静默的**：服务端 `201`、设备零日志。按这两步二分：

**第一步：明文 vs 加密** —— 判断是**加密**问题还是**订阅**问题

```bash
node --env-file=.env scripts/push-test.mjs --raw   # 明文（不带 payload，不加密）
node --env-file=.env scripts/push-test.mjs         # 加密
```

| 结果             | 结论                                             |
| ---------------- | ------------------------------------------------ |
| 明文到、加密不到 | **加密格式有问题**（去查坑 1 / 坑 2）            |
| 两个都到         | 功能正常，之前没收到多半是**手机在前台**（坑 3） |
| 两个都不到       | **订阅/设备/系统设置**的问题（去查坑 4 / 坑 5）  |

**第二步：本地脚本 vs Edge Function 同时发** —— 判断**哪份代码在跑**

同一个 endpoint、同一台设备，两条几乎同时打出去，看哪条到哪条不到：

| 结果             | 结论                                                       |
| ---------------- | ---------------------------------------------------------- |
| 本地到、云端不到 | **线上那份代码和本地不一致**（最常是改了本地忘了同步部署） |
| 两条都到         | 链路通了                                                   |

> 这一步是这次真正定位到根因的关键。之前一直在怀疑订阅、怀疑 iOS 26、怀疑 SW 生命周期，
> 全靠这条对照把范围一下子缩到了「到底哪份代码在跑」。

### ⚠️ 改加密实现时的两条纪律

1. **不要相信自己的闭环自测**。自己加密自己解密必然自洽，格式错了也测不出来。
   改完要跟 `web-push` 库（`npm i web-push`，用 `generateRequestDetails`）逐项比对：
   headers、`rs`、`idlen`、body 长度
2. **改一处要同步两处**：`scripts/push-test.mjs` 和 `supabase/functions/send-push/index.ts`
   是同一套加密逻辑的两份拷贝。这次就是只改了脚本、漏了 Edge Function，
   结果本地能收到、线上收不到，白白多排查了很久

---

## 📜 License

MIT
