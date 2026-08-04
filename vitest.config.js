import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use ES modules (project uses <script type="module">)
    environment: 'node',
    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,mjs}'],
    // Coverage configuration
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js'],
      exclude: ['js/views/**/*.js'],
      reporter: ['text', 'html'],
    },
    // Minimum iterations for property-based tests
    testTimeout: 30000,
  },
  resolve: {
    // Allow importing from js/ directory
    alias: {
      '@': '/js',
    },
  },
});
