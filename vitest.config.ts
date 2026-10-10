import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // 탐색·시뮬레이션 테스트는 몇 초 걸린다
    testTimeout: 30000,
  },
});
