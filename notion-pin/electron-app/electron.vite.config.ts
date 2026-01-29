import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    // @notionhq/client 为 CommonJS，打包后 databases.query 会失效，需 external
    build: {
      rollupOptions: {
        external: ['@notionhq/client']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
