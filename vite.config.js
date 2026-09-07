import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi chạy `npm run dev`, frontend gọi API bằng đường dẫn tương đối (/api, /auth, ...)
// nên cần proxy sang Cloudflare Worker. Mặc định trỏ về production; muốn test Worker
// chạy local (`npx wrangler dev --port 8787`) thì:
//   VITE_DEV_API_TARGET=http://127.0.0.1:8787 npm run dev
const API_TARGET = process.env.VITE_DEV_API_TARGET || 'https://play.ankb.qzz.io';
const API_PREFIXES = ['/api', '/auth', '/user', '/admin', '/ws'];

const proxy = Object.fromEntries(
  API_PREFIXES.map((prefix) => [
    prefix,
    {
      target: API_TARGET,
      changeOrigin: true,
      secure: false,
      ws: prefix === '/ws',
    },
  ])
);
// Lịch bóng đá: gọi cùng origin để tránh CORS/CSP chặn TheSportsDB + ESPN.
proxy['/tsdb'] = {
  target: 'https://www.thesportsdb.com',
  changeOrigin: true,
  secure: false,
  rewrite: (p) => p.replace(/^\/tsdb/, '/api/v1/json/3'),
};
proxy['/espn'] = {
  target: 'https://site.api.espn.com',
  changeOrigin: true,
  secure: false,
  rewrite: (p) => p.replace(/^\/espn/, '/apis/site/v2'),
};
// F1 (Jolpica/Ergast) + BXH Bundesliga (OpenLigaDB): không có trong CSP connect-src
// nên dev cũng proxy cho khỏi dính CORS, giống /tsdb và /espn.
proxy['/ergast'] = {
  target: 'https://api.jolpi.ca',
  changeOrigin: true,
  secure: false,
  rewrite: (p) => p.replace(/^\/ergast/, '/ergast/f1'),
};
proxy['/olb'] = {
  target: 'https://api.openligadb.de',
  changeOrigin: true,
  secure: false,
  rewrite: (p) => p.replace(/^\/olb/, ''),
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    cors: true,
    allowedHosts: true,
    proxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  }
});
