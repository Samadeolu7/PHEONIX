/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/link': path.resolve(__dirname, 'src/next-compat/Link.jsx'),
      'next/router': path.resolve(__dirname, 'src/next-compat/useRouter.js'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/setupTests.ts',
        '**/*.d.ts',
        '**/*.config.*',
        'build/',
        'cypress/',
        'src/__tests__/testUtils.tsx',
      ],
      include: [
        'src/services/procurementService.ts',
        'src/services/procurementIntegrationService.ts',
        'src/hooks/useProcurement.ts',
        'src/hooks/useProcurementIntegration.ts',
        'src/pages/procurement/**/*.tsx',
        'src/components/procurement/**/*.tsx',
        'src/types/procurement.ts',
        // Quality Assurance Test Coverage
        'src/components/auth/**/*.tsx',
        'src/components/dashboard/**/*.tsx',
        'src/hooks/usePermissions.ts',
        'src/services/roleService.ts',
        'src/services/dashboardTemplateEngine.ts',
        'src/services/statsCalculationEngine.ts',
        'src/services/statsAggregationService.ts',
        'src/services/statsPerformanceMonitor.ts',
        'src/utils/errorHandler.ts',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        'src/services/procurementService.ts': {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
        'src/hooks/useProcurement.ts': {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75,
        },
      },
    },
    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules/', 'build/', 'cypress/'],
    // Test timeout
    testTimeout: 10000,
    hookTimeout: 10000,
    // Reporter configuration
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './test-results/vitest-results.json',
      html: './test-results/vitest-report.html',
    },
  },
});
