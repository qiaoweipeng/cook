/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase 项目地址，形如 https://xxxxx.supabase.co；留空则跑纯本地模式 */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase 的 anon key（前端可公开，配合表级 RLS 使用） */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
