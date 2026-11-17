# 数据库结构

> 后端是 **Supabase PostgreSQL**（免费 500 MB，按磁盘计费），前端通过 **PostgREST** REST API 直连。
> 版本迭代历史见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 快速开始

### 全新项目一键建表

Supabase 控制台 → **SQL Editor** → 粘贴 `supabase/schema.sql` 全文执行即可（幂等，可重复执行）。

> ⚠️ 建表脚本**刻意没有加外键**：种子数据写入顺序不受控（菜品可能先于食材写入），加了外键会在初始化阶段冲突。

---

## ER 关系概览

```
┌──────────┐     ┌─────────────────┐     ┌────────────┐
│  dishes  │────<│ dish_ingredients │>────│ ingredients │
└────┬─────┘     └─────────────────┘     └────────────┘
     │
     ├────< dish_tags        (多对多：菜 ↔ 标签)
     │
     └────< dish_steps       (一对多：菜 ↔ 烹饪步骤)

┌──────────┐     ┌──────────────────┐     ┌────────────────┐
│ families │────<│ family_members   │>────│     users      │
└────┬─────┘     └──────────────────┘     └───────┬────────┘
     │                                             │
     ├──── family_invites                          ├──── shopping_lists  (id = uid，按用户隔离)
     ├──── family_menu_audit                       └──── weekly_menus    (id = uid 或 家庭id)

users（自建账号，不走 Supabase Auth）
```

---

## 14 张表详情

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `dishes` | 菜品主表 | `id` (text PK), `name`, `category`, `difficulty`, `cook_time_min`, `servings`, `cover_image` (相对 key), `favorite`, `tips` |
| `ingredients` | 食材库 | `id` (text PK), `name`, `category`, `unit`, `prices` (jsonb 多平台价格), `note`, `image`, `calories`, `protein`, `fat`, `carbs`, `sodium`, `fiber` |
| `dish_tags` | 菜-标签（多对多） | `dish_id`, `tag`（联合主键） |
| `dish_ingredients` | 菜-食材（含用量） | `id` (bigserial PK), `dish_id`, `ingredient_id`, `amount`, `unit` |
| `dish_steps` | 烹饪步骤 | `dish_id`, `step_order`, `step_text`（联合主键） |
| `users` | 用户账号 | `id` (text PK, 归一化昵称), `nick`, `display_name`, `salt`, `password_hash`, `avatar`, `disabled` |
| `shopping_lists` | 采购清单（按用户隔离） | `id` (text PK, =uid), `data` (jsonb), `updated_at` |
| `weekly_menus` | 菜单安排 | `id` (text PK, =uid 或家庭 id), `data` (jsonb, `{ 日期key: 菜品id[] }`) |
| `families` | 家庭 | `id` (text PK, `fam_<创建者uid>`), `admin_uid` |
| `family_members` | 家庭成员 | `id` (`<famId>__<uid>`), `family_id`, `uid`, `name`, `role`, `permission` |
| `family_invites` | 家庭邀请 / 管理员转让 | `id` (uuid PK), `family_id`, `from_uid`, `to_uid`, `status`, `type` |
| `family_menu_audit` | 家庭菜单修改历史 | `id` (uuid PK), `family_id`, `actor_uid`, `action`, `day`, `detail` |
| `login_logs` | 登录日志 | `id`, `uid`, `nick`, `login_at`, `ip`, `region`, `device`, `os`, `browser`, `ua` |
| `op_logs` | 操作日志（审计） | `id`, `actor_uid`, `action`, `target`, `detail`, `created_at` |

---

## RLS（行级安全）

### 当前配置（MVP 阶段，全开）

```sql
ALTER TABLE <表名> ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_anon_all ON <表名> FOR ALL TO anon USING (true) WITH CHECK (true);
GRANT USAGE ON SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
```

> ⚠️ 这是个人/自用的「全开」配置，**不适合公开多人共用**。RLS 一旦开启却不建 policy，前端读到的是**空数组**（不是报错），容易误判成「没数据」。

### 后续要做（收紧）

```sql
-- 读：登录用户都能看
create policy "read_all" on dishes for select to authenticated using (true);
-- 写：只有管理员
create policy "admin_write" on dishes for all to authenticated
  using (auth.jwt() ->> 'role' = 'admin');
```

验收：拿普通用户 token 直接调 `PATCH /rest/v1/dishes?id=eq.xxx`，返回 403 而不是 204。

---

## 鉴权

| 项 | 说明 |
|----|------|
| 请求头 | 必须带 `apikey`；旧版 JWT key 额外带 `Authorization: Bearer` |
| 环境变量 | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| key 选择 | 新版 **Publishable key**（`sb_publishable_...`）或旧版 anon public key（`eyJ...`，2026 年底弃用）都能跑 |
| ❌ 绝对不要 | 用 Secret key / service_role key（绕过全部 RLS） |

---

## 账号体系（自建，不走 Supabase Auth）

| 环节 | 实现 |
|------|------|
| 注册 | `uid = 昵称归一化（小写、去空格）`，密码 `SHA-256(随机盐 + 密码)` 存 |
| 登录 | 查 users 表，比对 hash；`disabled = true` 拒 |
| 会话 | `localStorage('cook.auth.session')` 存 uid + role + avatar |
| 隔离 | 采购清单 / 菜单 `id = uid`，天然隔离 |
| 超管 | 账号 `0000` / 密码 `000000` **硬编码校验**，不查 users 表 |

> ⚠️ 当前是「防君子不防小人」—— SHA-256 单向无迭代，他人拿到 hash 配合彩虹表可以爆破。家用场景够用，不要存重要密码。

---

## 删除级联规则

| 操作 | 规则 |
|------|------|
| 删除食材 | 如果有任何菜品正在使用 → **禁止删除**，提示引用数量 |
| 删除菜品 | 如果有任何用户加进了采购清单或菜单 → **禁止删除**，提示使用人数 |

---

## Supabase 免费版容量

| 项目 | 免费版额度 | 本项目现状 |
|------|------------|-----------|
| 数据库容量 | **500 MB** | 不到 1 MB，可忽略 |
| 行数上限 | 无限制 | — |
| API 请求 | 不限次数 | 家用远达不到 |
| 空闲 7 天 | 连续无请求自动暂停 | 控制台点 Restore 即可 |

> 付费时机：数据库过 400 MB、需要超过 7 天的自动备份、或做真正的多人行级隔离时。

---

## 种子数据播种

播种脚本只管数据，不管表结构。顺序永远是：**先建表 → 再灌数据**。

```bash
pnpm seed                    # 只填空表（默认，安全）
pnpm seed -- --dry           # 只打印，不写库
pnpm seed -- --force         # 强制同步：按 id 更新已存在的行
pnpm seed -- --only=dishes   # 只补菜单
```

### 种子图片（相对路径方案）

种子菜封面图**不放代码里**，数据库存相对路径，URL 前缀由运行环境拼接：

- `seedDishes.ts` 里写：`coverImage: '/seeds/dish_mapo_tofu.webp'`
- 渲染时 `resolveImageUrl()` 自动拼成完整地址

新增流程：图片（webp）上传对象存储 `seeds/` 目录 → `seedDishes.ts` 加一行 coverImage → 完事。

---

## 备份与恢复

```bash
pnpm backup                                          # 备份到 backups/<时间戳>.json
pnpm backup -- --restore=backups/xxx.json --force   # 从备份恢复
```

- 导出全量 14 张表的 JSON（自动分页，绕过 1000 行上限）
- 恢复时表之间没有外键，顺序无所谓；脚本先清空目标表再写入
- Supabase 后台自动备份保留 7 天（最后一道兜底）

**建议**：动表结构、批量导入食材、升级依赖前先跑一次 `pnpm backup`。
