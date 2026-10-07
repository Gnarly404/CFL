import js from '@eslint/js';
import globals from 'globals';

const common = {
  ecmaVersion: 2024,
  sourceType: 'module',
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'functions/**', 'archive/**', 'coverage/**', '.firebase/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ...common, globals: { ...globals.browser, Swal: 'readonly', Chart: 'readonly', bootstrap: 'readonly' } },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { ...common, globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  { files: ['scripts/**/*.mjs'], rules: { 'no-console': 'off' } },
];
