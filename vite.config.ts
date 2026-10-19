import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * 构建时把当前 git 提交号写进前端，方便确认线上跑的是哪一次提交。
 * 有些构建环境（如不带 .git 的打包机）取不到，这时退回 unknown，不让构建失败。
 */
function readGitCommit(): { hash: string; time: string } {
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const time = execSync('git log -1 --format=%cd --date=iso', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return { hash, time: time.slice(0, 16) }; // 只要 YYYY-MM-DD HH:mm
  } catch {
    return { hash: 'unknown', time: '' };
  }
}

const git = readGitCommit();
const buildTime = new Date().toISOString();

export default defineConfig({
  // 注入版本信息常量（类型声明见 src/vite-env.d.ts）
  define: {
    __APP_COMMIT__: JSON.stringify(git.hash),
    __APP_COMMIT_TIME__: JSON.stringify(git.time),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 关掉自动注入，改由 src/components/PwaUpdate 手动注册，这样才能拿到「有新版本」的回调
      injectRegister: null,
      includeAssets: ['icon/192*192.png', 'icon/512*512.png'],
      manifest: {
        name: '大厨房',
        short_name: '大厨房',
        description: '菜单、每周菜单、食材库、采购清单一站式管理',
        theme_color: '#ffffff',
        background_color: '#FAF7F2',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon/192*192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon/512*512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon/1024*1024.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      // 改成 injectManifest：SW 由我们自己写（src/sw.ts）。
      // 原因是要在 SW 里加 push / notificationclick 监听 ——
      // 默认的 generateSW 是自动生成的，没法往里插自定义代码。
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
