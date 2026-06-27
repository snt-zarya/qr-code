import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Относительные пути к ассетам — работает и на GitHub Pages (подпапка /qr-code/),
  // и при отдаче из любого подкаталога (OSPanel).
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
})
