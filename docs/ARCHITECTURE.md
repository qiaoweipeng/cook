# 架构设计

> 本文档记录 v2.0 的架构选型、Provider 抽象设计和图片存储方案。
> 版本迭代历史见 [CHANGELOG.md](./CHANGELOG.md)，数据库细节见 [DATABASE.md](./DATABASE.md)。

---

## 当前架构

```
浏览器 ──fetch──→ Supabase Data API (PostgREST) ──→ PostgreSQL
    │                   ↑
    │                   │  anon key（前端直连）
    │
    ├── fetch → 腾讯 COS CDN（图片直接拉）
    │
    └── fetch → Netlify Function（上传/删除 COS 图片，密钥中转）
```

**核心思路**：前端直连托管服务，没有自建后端服务器。图片存储通过 Provider 抽象层隔离，换平台只改环境变量。

---

## Provider 抽象（图片存储）

### 目标

从 Supabase Storage 换到腾讯 COS、阿里 OSS 或任何 S3 兼容平台，**只加一个适配器文件 + 改一个环境变量**，业务代码零改动。

### 目录结构

```
src/lib/imageStorage/
├── index.ts          ← 唯一入口，决定当前用哪个平台
├── supabase.ts       ← Supabase Storage 适配器
├── cos.ts            ← 腾讯 COS 适配器
├── paths.ts          ← key 归一化、URL 拼/解（纯函数，带单测）
├── domains.ts        ← SW 缓存哪些域名（换平台必须同步）
└── types.ts          ← 适配器接口定义
```

### 接口约定

```ts
// 每个适配器必须实现这三个函数
interface ImageProvider {
  uploadImage(key: string, file: File): Promise<{ key: string; size: number }>;
  resolveImageUrl(key: string): string;           // key → 完整 CDN URL
  deleteImage(key: string): Promise<void>;
}
```

### 业务代码怎么用

```ts
// DishEditor.tsx —— 完全不关心底下是 Supabase 还是 COS
import { uploadImage, deleteImage, resolveImageUrl } from '@/lib/imageStorage';

const result = await uploadImage('dishes/dish_mapo_tofu.webp', file);
// 数据库只存相对 key：'dishes/dish_mapo_tofu.webp'

// 渲染时
const src = resolveImageUrl(dish.coverImage);
// 自动拼成当前平台的完整 CDN URL
```

### 切换平台

```bash
# .env
VITE_IMAGE_PROVIDER=supabase    # Supabase Storage
VITE_IMAGE_PROVIDER=cos         # 腾讯 COS（默认）
# 以后：VITE_IMAGE_PROVIDER=oss  # 阿里 OSS（加个适配器就行）
```

---

## 补偿事务（图片 ↔ 数据库一致性）

跨系统多步操作（上传图片 + 写数据库）没有真正的分布式事务，用**补偿事务**保证一致性：

```tsx
// 1) 上传成功 → 记下桶内 key，标记为「待提交」
pendingUploadRef.current = { path: picked.storagePath };

// 2) 保存成功 → 图正式「有主」
await updateDish(dish.id, patch);
pendingUploadRef.current = null;

// 3) 保存失败 / 用户取消 → 撤销：把刚传的图删掉
catch (e) { await rollbackUpload(); }
```

### 不变式（永远成立）

| 场景 | 对象存储 | 数据库 |
|------|---------|--------|
| 传图 + 保存成功 | 有 | 有 ✅ |
| 传图 + 保存失败 | **无**（已撤销） | 无 ✅ |
| 传图 + 点「清除图片」 | **无**（已撤销） | 无 ✅ |

**「桶里有图、库里没记录」这个状态从此不再存在。**

---

## 数据库只存 key，不存 URL

```
数据库记录: cover_image = 'dishes/dish_mapo_tofu.webp'   ← 相对 key，几十字节
渲染时:   resolveImageUrl() → '<当前平台>/dishes/dish_mapo_tofu.webp'
```

图片文件只存在对象存储里；换平台时，把文件搬到新桶、改一行 `VITE_IMAGE_PROVIDER`，代码和数据库记录一个字都不用动。

老数据（完整 URL / Base64）照常显示，三种形态兼容。

### 存量数据迁移 SQL

```sql
-- 把完整 URL 迁成相对 key
UPDATE dishes SET cover_image = regexp_replace(
  cover_image,
  '^https://[^/]+/storage/v1/object/public/dish-images/',
  ''
) WHERE cover_image LIKE 'https://%';
```

---

## 密钥绝不进前端

云厂商 SecretId/SecretKey 不能带 `VITE_` 前缀（会被打进 bundle），必须放在服务端。

四条铁律（code review 优先检查）：

1. **数据库只存 key**，绝不存完整 URL —— URL 只在 `resolveImageUrl()` 里拼
2. **密钥绝不进前端** —— COS 的 SecretId/SecretKey 放在 `netlify/functions/cos-upload.ts`
3. **上传和删除用同一个 key**，否则会留下没人引用的孤儿图
4. **新增平台必须登记 `domains.ts`**，否则 SW 不缓存它的图片

---

## COS 上传安全边界

`UPLOAD_TOKEN` 是「防路过脚本」级别，不是真认证。函数另有三道硬限制：

- 类型白名单：`webp/jpeg/png`
- 单文件：≤ 5MB
- key 前缀白名单：`dishes/ ingredients/ seeds/ avatars/`（禁路径穿越）

以后加登录体系时换成登录态校验。

---

## 切腾讯 COS 的操作步骤

1. 腾讯云建桶：标准存储、公有读私有写；CORS 放行站点域名 + `http://localhost:5173`
2. 搬数据：用 coscli / rclone 把旧桶对象**按相同 key** 全量复制到新桶
3. Netlify 服务端变量：`COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION` / `UPLOAD_TOKEN`
4. 前端变量（Netlify 环境变量 + 本地 `.env`）：
   - `VITE_IMAGE_PROVIDER=cos`
   - `VITE_COS_PUBLIC_BASE=https://<桶>.cos.<region>.myqcloud.com`
   - `VITE_UPLOAD_TOKEN`（与服务端同值）
5. 部署 → Clear cache → 验证上传、显示、删除

**回滚**：只需把 `VITE_IMAGE_PROVIDER` 改回 `supabase`，部署即可。

### 本地联调

`pnpm dev` 不带 Netlify Functions，要用 `npx netlify dev`（同时拉起 vite 和函数）。

---

## 图片处理流程

```
选择本地图片
  → 等比缩到最长边 1000px
  → 转 WebP(0.82，不支持则退回 JPEG)
  → 上传当前对象存储（cache-control: public, max-age=31536000, immutable）
  → 数据库只存相对 key（如 dishes/xxx.webp）
```

- **没有 Base64 降级**：上传失败会明确报错，绝不偷偷塞进数据库假装成功
- 浏览器第二次起不再下载（immutable + 长缓存）
- 菜品卡片和食材缩略图用 `loading="lazy"` 懒加载

---

## 还可以继续做的优化

1. **列表查询剔除大字段** —— `pgSelect('dishes')` 改成显式指定列，单次同步能再降一个数量级
2. **菜品步骤图 / 食材图** —— 对象存储已就位，加图只是加字段 + UI
3. **先拉缩略图再加载高清图** —— 利用 COS/Supabase 的图像变形能力
