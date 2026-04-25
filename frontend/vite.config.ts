import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // SSE 响应禁止缓冲，确保事件实时转发到浏览器
            const ct = proxyRes.headers['content-type'] || '';
            if (ct.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-store';
              proxyRes.headers['x-accel-buffering'] = 'no';
              delete proxyRes.headers['content-encoding'];
              delete proxyRes.headers['content-length'];
            }
          });
        },
      },
    },
  },
})
