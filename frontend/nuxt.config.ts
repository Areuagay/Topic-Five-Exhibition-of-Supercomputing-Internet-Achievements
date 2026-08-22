// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },
  // 关闭匿名数据收集询问，避免首次启动时交互式提示阻塞 dev server 初始化
  telemetry: false,

  // 技术栈对齐：Element Plus + Pinia
  modules: ['@element-plus/nuxt', '@pinia/nuxt'],

  css: ['~/assets/css/main.css'],

  // 前后端分离：/api/v1/* 代理到本地模拟后端（backend/server.js，默认端口 3001）
  // 接入真实后端时，仅需把 target 改为真实 API 网关地址（或配置 runtimeConfig.public.apiBase），
  // 前端页面代码零改动
  routeRules: {
    '/api/v1/**': { proxy: 'http://localhost:3001/api/v1/**' },
  },

  runtimeConfig: {
    public: {
      /**
       * 数据源切换开关：
       * - 留空（默认）：走本服务 /api mock 端点（Nitro 读取 ../mock-data）
       * - 部署接入真实后端时，设为真实 API 网关地址（如 https://api.example.com/api/v1），
       *   前端代码零改动即可切换到真实数据（字段契约与 OpenAPI 保持一致）
       */
      apiBase: ''
    }
  },

  app: {
    head: {
      title: '超算互联网应用成果展',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  },

  typescript: { strict: true }
})
