import { defineConfig } from 'vite'

export default defineConfig({
  base: '/kertiteto/',
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
