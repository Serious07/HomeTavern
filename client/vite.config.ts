import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Общий прокси на API: нужен и dev-серверу, и preview — иначе прод-сборку
// невозможно проверить с телефона (запросы /api уходят в никуда).
const apiProxy = {
  '/api': {
    target: 'http://localhost:4000',
    changeOrigin: true,
  },
};

// https://vitejs.dev/config/
// Функция вместо объекта нужна, чтобы отличать dev от build: логи в dev
// сохраняем (они нужны для отладки), а в прод-сборку не тащим.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // В прод-сборке вырезаем console.* и debugger на уровне транспиляции.
  // Chrome держит в памяти всё выведенное в консоль, поэтому ~80 логов клиента
  // на длинной сессии сами по себе занимают место в куче.
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: apiProxy,
  },
  // Прод-сборка на том же порту и с тем же прокси: чтобы с телефона проверять
  // именно production-режим (без StrictMode, без двойного рендера и без
  // дев-оверхеда React) — на слабом устройстве он заметно легче.
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy: apiProxy,
  },
}))
