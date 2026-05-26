import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __WS_URL__: JSON.stringify(process.env.VITE_WS_URL ?? 'ws://localhost:3001'),
    __APP_VERSION__: JSON.stringify(version),
  },
});
