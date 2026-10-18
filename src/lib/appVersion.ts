// 版本信息：来源是 vite.config.ts 在构建时注入的 git 提交号

export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';
export const APP_COMMIT_TIME: string =
  typeof __APP_COMMIT_TIME__ === 'string' ? __APP_COMMIT_TIME__ : '';
export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : '';

/** 「我的」页面上显示的版本串，如：#87edb33 · 10-19 20:30 */
export function versionLabel(): string {
  if (APP_COMMIT === 'dev' || APP_COMMIT === 'unknown') return APP_COMMIT;
  // 2026-10-19 20:30 → 10-19 20:30
  const short = APP_COMMIT_TIME ? APP_COMMIT_TIME.slice(5) : '';
  return short ? `#${APP_COMMIT} · ${short}` : `#${APP_COMMIT}`;
}

/** 反馈问题时用得上：提交号 + 提交时间 + 打包时间 */
export function versionDetail(): string {
  return [
    `提交 ${APP_COMMIT}`,
    APP_COMMIT_TIME ? `提交时间 ${APP_COMMIT_TIME}` : '',
    APP_BUILD_TIME ? `打包时间 ${APP_BUILD_TIME}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
