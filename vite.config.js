import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
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
            workbox: {
                // 不缓存带 hash 的静态资源，让浏览器自然处理
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                runtimeCaching: [
                    {
                        // 字体
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 年
                            },
                            cacheableResponse: {
                                statuses: [0, 200],
                            },
                        },
                    },
                    {
                        // CloudBase API 请求：网络优先，失败再读缓存
                        urlPattern: /^https:\/\/.*\.api\.tcloudbasegateway\.com\/.*/i,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-cache',
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 60 * 5, // 5 分钟
                            },
                        },
                    },
                ],
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
