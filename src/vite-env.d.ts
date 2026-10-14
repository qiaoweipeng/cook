/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 腾讯云开发（CloudBase）环境 ID；留空则跑纯前端模式 */
  readonly VITE_TCB_ENV_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
