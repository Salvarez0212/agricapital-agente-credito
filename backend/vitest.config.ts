import { defineConfig } from 'vitest/config';

/** Los tests usan una BD aparte (agricapital_test) para no tocar los datos de desarrollo. */
const DATABASE_URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://agricapital:agricapital@localhost:5432/agricapital_test?schema=public';

// También en el proceso principal: lo necesita globalSetup (crear BD y migrar).
process.env.DATABASE_URL = DATABASE_URL_TEST;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/helpers/global-setup.ts'],
    env: { DATABASE_URL: DATABASE_URL_TEST, NODE_ENV: 'test' },
    // Los tests de API comparten la misma BD: se ejecutan en serie.
    fileParallelism: false,
  },
});
