import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildSha = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)
const buildTime = new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, open: true },
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
})
