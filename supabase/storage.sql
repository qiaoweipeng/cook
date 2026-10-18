-- 菜品图片对象存储（Supabase Storage，免费版含 1 GB）
-- 用法：Supabase 控制台 → SQL Editor → 整段粘贴执行（幂等，可重复执行）
--
-- 说明：SQL Editor 是以 postgres 超级用户身份执行的，所以能建 bucket 和写 storage.objects 的策略；
--       换成前端的 anon key 是做不到的（storage.buckets 有 RLS）。

-- 1) 建公开 bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dish-images',
  'dish-images',
  true,
  5242880,                                   -- 单文件上限 5 MB（压缩后远小于此）
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) 策略：允许公开读（anon 也能拿图）
drop policy if exists "dish_images_public_read" on storage.objects;
create policy "dish_images_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'dish-images');

-- 3) 策略：允许上传 / 覆盖 / 删除
--    本项目现有表的 RLS 也是给 anon 全开（见 schema.sql），这里保持一致；
--    等以后做了真正的多用户隔离，这里也要同步收紧成「只能改自己目录下」。
drop policy if exists "dish_images_write" on storage.objects;
create policy "dish_images_write"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'dish-images');

drop policy if exists "dish_images_update" on storage.objects;
create policy "dish_images_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'dish-images');

drop policy if exists "dish_images_delete" on storage.objects;
create policy "dish_images_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'dish-images');

-- 4) 权限兜底（个别项目初始化时缺 grant，会导致上传 403）
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- 执行完后验证（应返回 dish-images 一行）：
-- select id, public, file_size_limit from storage.buckets where id = 'dish-images';
