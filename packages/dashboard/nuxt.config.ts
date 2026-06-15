export default defineNuxtConfig({
  devtools: { enabled: true },

  modules: ['@nuxtjs/tailwindcss'],

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      tokenApiUrl: process.env.NUXT_PUBLIC_TOKEN_API_URL || 'http://localhost:3001',
      extractionApiUrl: process.env.NUXT_PUBLIC_EXTRACTION_API_URL || 'http://localhost:8000',
    },
  },

  app: {
    head: {
      title: 'ScreenSentinel',
      meta: [
        { name: 'description', content: 'Invisible Forensic Attribution Dashboard' },
      ],
    },
  },

  compatibilityDate: '2025-01-01',
});
