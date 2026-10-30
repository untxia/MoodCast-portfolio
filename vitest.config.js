import { defineConfig } from 'vitest/config';

// Vitest ne lance que les tests unitaires et d'intégration ; Playwright gère e2e/ et visual/.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'] }
});
