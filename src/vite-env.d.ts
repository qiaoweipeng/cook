/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** 构建时的 git 短提交号（vite.config.ts 里注入） */
declare const __APP_COMMIT__: string;
/** 该次提交的时间：YYYY-MM-DD HH:mm（取不到时为空串） */
declare const __APP_COMMIT_TIME__: string;
/** 打包时间（ISO） */
declare const __APP_BUILD_TIME__: string;
