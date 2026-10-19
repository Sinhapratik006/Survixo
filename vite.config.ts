import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/v1': { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](recharts|d3-[^\\/]+|victory-vendor|decimal\.js-light)[\\/]/.test(id)) return 'charts';
          if (/[\\/](zod|react-hook-form|@hookform)[\\/]/.test(id)) return 'forms';
          if (/[\\/](@tanstack)[\\/]/.test(id)) return 'query';
          if (/[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'react';
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'icons';
          return undefined;
        },
      },
    },
  },
});
