import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import { tutorApi } from './server/vitePlugin.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // These have no VITE_ prefix, so they stay on the server and never reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      wasm(),
      topLevelAwait(),
      tutorApi({ apiKey: env.ANTHROPIC_API_KEY, model: env.TUTOR_MODEL }),
    ],
    server: {
      fs: {
        // Allow serving files from one level up to the project root
        allow: ['..'],
      },
    },
    build: {
      chunkSizeWarningLimit: 2000
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      css: true,
    },
  }
})
