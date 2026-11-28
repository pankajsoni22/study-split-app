import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'supabase', 'scripts', 'public', 'tests/e2e']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      // Vendor SDKs stay behind src/data/ports (see docs §11.4): only the adapter may import Supabase.
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@supabase/*'], message: 'Import Supabase only inside src/data/adapters/supabase.' }]
      }]
    }
  },
  {
    files: ['src/data/adapters/supabase/**'],
    rules: { 'no-restricted-imports': 'off' }
  }
]);
