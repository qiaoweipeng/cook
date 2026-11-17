# 版本迭代历史

> 版本是**演进阶段标记**，和 git tag / npm version 无关，只用来记录「什么时候在哪件事上做了大的架构调整」。
>
> 架构细节见 [ARCHITECTURE.md](./ARCHITECTURE.md)，数据库细节见 [DATABASE.md](./DATABASE.md)，视觉规范见 [THEMES.md](./THEMES.md)。

---

## 版本对比总览

| | 起始版本 | v1.0 | v2.0（当前） |
|---|---------|------|-------------|
| **后端** | CloudBase PostgreSQL | Supabase PostgreSQL | Supabase PostgreSQL |
| **图片** | Base64 塞数据库 | Supabase Storage 桶 | **Provider 抽象 + 腾讯 COS** |
| **鉴权** | 无 RLS | anon key + RLS policy | anon key + RLS policy |
| **部署** | CloudBase 静态托管 | Netlify 静态托管 | Netlify 静态托管 + Functions |
| **存活** | 3 天 | ~12 天 | 至今 |
| **死因** | CloudBase CU 资源点烧完 | Supabase Storage 下行流量烧完 | — |

---

## 起始版本 · Initial（腾讯 CloudBase）

**Git**: `9e203c2` ~ `c32ad2b` · **时间**: 2026-10-14 ~ 10-17

### 为什么要做

围绕「今天吃什么」的生活工具：提前安排菜单、自动生成采购清单、记录做菜成本与做法、PC/Pad/手机全适配、多人共享。

### 核心模块（起始版本已有）

- 菜单首页（卡片网格 + 关键词搜索）
- 菜品详情（食材 + 分步做法）
- 食材库 CRUD
- 采购清单（多选菜品 → 自动合并食材）
- 家庭共享
- 种子数据 + PWA
- 分端适配：PC 用 Ant Design，移动端用 Ant Design Mobile

### 技术决策（影响后续版本）

- 图片用 **Base64 dataURL 塞数据库 text 列** —— 这个决定直接导致三天后资源点烧完
- localStorage → IndexedDB（5MB 不够）
- 数据库表基本定型（dishes / ingredients / dish_ingredients / dish_steps / dish_tags 等）
- 品牌色 **`#E8743C`**（暖橙）

### 遇到的问题

#### 致命事故

CloudBase 每月 3000 点资源点，**三天耗尽**。数据库被隔离（503），控制台导出也挂了 —— 种子数据是唯一备份。

#### 事后复盘：CU（CPU）烧完的

上一周期用量明细：

| 项目 | 占比 |
|------|------|
| **PostgreSQL CU 使用量**（8.48 核·时） | **97%** 🔥 |
| 数据库存储容量 | 0.03%（1 点） |
| API 调用次数 | 3% |
| 静态托管存储 | 0.08% |

**凶手是 CPU，不是存储。** 原因：Base64 图片 + 全量加载五张表 + 没指定列。每次查询都在烧 CU 资源点。

#### CloudBase 硬伤（改不动的）

- 体验版无法升级，耗尽即死
- 隔离后不让导出
- 静态托管注入自家 index.html、冒 `Download.html`
- 没有真正的 RLS（数据库面对公网全开）

### 决策：迁 Supabase

免费 500 MB 数据库 + 1 GB 对象存储，按磁盘计费不按读写次数。PostgREST 原生支持 RLS。前端托管换 Netlify，纯 SPA 回退。

---

## v1.0 · Supabase 全栈期（数据库 + Storage 桶）

**Git**: `5eacb96` ~ `efae53f` · **时间**: 2026-10-18 ~ 10-30

### 设计变化

- 后端：CloudBase → **Supabase PostgreSQL + PostgREST**（前端 fetch 直连 REST）
- 图片：Base64 数据库 → **Supabase Storage 桶**
- 鉴权：无 RLS → **anon key + 表级 RLS policy**
- **菜系与标签体系定型**（起始版本没有分类规则）

#### 菜系 vs 标签规则（必须遵守）

**菜系**（`Dish.category`）：一道菜必须且只能属于一个。川菜/粤菜/湘菜/鲁菜/江浙/家常/其他。麻婆豆腐归川菜（虽然家常做法人人会），不属流派的一律进「家常」。

**标签**（`Dish.tags`）：一道菜挂 1~5 个。汤羹、凉菜、烘焙（形态）、减脂、快手（属性）、下饭、素食、宴客… 非流派维度的描述都走 tags。

### 视觉规范

颜色（品牌色 `#E8743C`、语义色、中性色）、圆角（12/16）、图标（ant-design-icons 主库 + lucide-react 补充）、字体（PingFang SC 优先）、分端背景（PC 纯白 / 移动燕麦米白）—— 全部定型。

详见 [THEMES.md](./THEMES.md)。

### 功能开发

**V1 全部完成**：菜单首页、菜品详情、食材库 CRUD、采购清单、种子数据、多用户系统。

**V2 在 v1.0 阶段完成**：收藏/我做过、菜品封面图、家庭共享、一周菜单、食材 Excel 导入导出、超级管理员。

### 遇到的问题

#### Supabase Storage 下行流量烧完（v1 → v2 直接原因）

Supabase 免费版 **5 GB 下行流量/月**。每次打开 App 一次性拉所有菜单封面图（几十道 × 每张 ~200KB），流量烧得非常快。烧完不会隔离数据库，但图片全拉不出来（403/限速），整个 App 视觉上就是坏的。

#### 三次图片事故（代码 bug）

| 事故 | 根因 |
|------|------|
| 图片消失第一回 | `coverImageColumnMissing` 模块级标志位（一次误判永久生效）+ 上传失败静默降级成 Base64 + 相对路径被当成完整 URL 用 |
| 图片消失第二回 | `cloudList` 吞错 + 拉取失败被当成空表 → 种子全量覆盖云端 → 用户上传的图地址被抹掉 |
| Base64 撑爆数据库 | 封面图塞 text 列，300 道菜 ~60 MB 磁盘，单次全量同步拉 60 MB，5 GB 流量只够撑 80 次 |

根因修完后加了**回读校验**：保存后立刻回读比对 `cover_image`，「几天后才发现图没了」变成「保存当场就报错」。

#### RLS 全开 + 安全风险

RLS 给 `anon` 全开，管理员判定纯前端（`user.id === '0000'`），密码进 bundle。生产场景必须收紧。

#### 性能预算超标

单 chunk 3 MB（gzip 978KB），precache 3.8 MB。antd + antd-mobile + xlsx 全塞一个 chunk，手机上永远用不到 PC 端组件但照样要下载。

### 决策：图片存储抽象化 + 迁腾讯 COS

数据库留 Supabase（500 MB 用不满），图片 **Provider 抽象层隔离**，默认切腾讯 COS。

---

## v2.0 · Supabase 数据库 + 腾讯 COS 桶（当前线上）

**Git**: `2668529` ~ **HEAD** · **时间**: 2026-11-04 ~ 至今

### 设计变化

#### Provider 抽象（核心）

业务代码只调 `uploadImage` / `resolveImageUrl` / `deleteImage`，不关心底下是 Supabase 还是 COS。换平台只改 `VITE_IMAGE_PROVIDER` 环境变量。

#### 补偿事务

跨系统多步操作（上传 + 写库）没有分布式事务，用补偿事务保证：保存失败 / 用户取消时，刚传的图自动删除。**桶里有图、库里没记录的状态从此不存在。**

#### 数据库只存 key，不存 URL

`cover_image` 只存相对路径（`dishes/xxx.webp`），完整 CDN URL 在 `resolveImageUrl()` 里拼。换平台不用动数据库。

#### 密钥绝不进前端

COS 的 SecretId/SecretKey 放在 Netlify Function 里，前端只拿 `UPLOAD_TOKEN`。

### 图片存储方案

```
选择本地图片 → 缩到 1000px → WebP(0.82) → 上传 COS → 数据库只存 key
```

- `cache-control: immutable`：浏览器第二次起不再下载
- **没有 Base64 降级**：上传失败明确报错
- 懒加载 `loading="lazy"`

### 待解决（离生产级还差）

| # | 项目 | 优先级 |
|---|------|--------|
| 1 | 错误监控（Sentry 或自建） | 🔴 高 |
| 2 | 权限收紧（RLS + 管理员移出前端） | 🔴 高 |
| 3 | 性能预算（拆 chunk + 动态 import） | 🟠 中 |
| 4 | 测试（store 单测优先） | 🟠 中 |
| 5 | CI（类型检查 + 单测 + 构建） | 🟠 中 |

### 未来候选

- **食材搜索优化**：同义词/别名表 + 类目层级 + 打分排序（当前纯字面匹配，搜「辣椒」搜不到「彩椒」）
- **菜品步骤图 / 食材图**：对象存储已就位
- **食材价格自动更新**
