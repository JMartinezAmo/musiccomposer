import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@mlc-ai/web-llm'], // WebLLM needs special handling
  },
  build: {
    target: 'esnext', // Required for WebGPU
  },
})
