import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PGlite поднимается как WASM в каждом тесте: при параллельном прогоне
    // файлов инициализация и миграции выходят за дефолтные 5 и 10 секунд.
    // Таймауты не скрывают зависания, а дают медленной машине и CI шанс.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
