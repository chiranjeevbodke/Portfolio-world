import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import imageSizes from './vite-plugins/image-sizes.mjs'

export default defineConfig({
  plugins: [react(), imageSizes()],
  server: { host: true },
})
