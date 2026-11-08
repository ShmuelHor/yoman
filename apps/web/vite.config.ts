import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const WEB_PORT = 4710;

export default defineConfig({
  plugins: [react()],
  // Static files are not used yet; turning publicDir off keeps stray files out of dist.
  publicDir: false,
  server: { host: '127.0.0.1', port: WEB_PORT, strictPort: true },
  preview: { host: '127.0.0.1', port: WEB_PORT, strictPort: true },
  build: {
    // Inlined assets would become data: URLs, which the CSP does not allow.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
