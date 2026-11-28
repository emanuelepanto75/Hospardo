import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// versione dell'interfaccia: la prima voce dell'elenco dei rilasci (backend/src/releases.json)
const [latest] = JSON.parse(readFileSync(new URL('../backend/src/releases.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(latest.version),
    __APP_DATE__: JSON.stringify(latest.date),
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4100' },
  },
});
