import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries. Dependencies flow one way:
 *   ui → game → state → core
 * - core:  pure TypeScript game rules + content (no Phaser, React or Zustand) — unit-testable, portable.
 * - state: Zustand stores; may use core only.
 * - game:  Phaser renderer/input; drives the core simulation and writes to state.
 * - ui:    React screens + HUD; reads state, mounts <PhaserGame />, never imports Phaser.
 */
const restrict = (patterns) => ['error', { patterns }];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict([
        {
          group: ['phaser', 'react', 'react-dom', 'zustand', 'zustand/*'],
          message: 'core must stay framework-free.',
        },
        {
          group: ['@game/*', '@state/*', '@ui/*', '**/game/**', '**/state/**', '**/ui/**'],
          message: 'core cannot depend on outer layers.',
        },
      ]),
    },
  },
  {
    files: ['src/game/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['@ui/*', '**/ui/**'], message: 'game cannot depend on ui.' },
      ]),
    },
  },
  {
    files: ['src/state/**/*.ts'],
    rules: {
      'no-restricted-imports': restrict([
        { group: ['phaser'], message: 'state must stay renderer-agnostic.' },
        {
          group: ['@game/*', '@ui/*', '**/game/**', '**/ui/**'],
          message: 'state may only depend on core.',
        },
      ]),
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': restrict([
        {
          group: ['phaser'],
          message: 'ui must not import Phaser; mount <PhaserGame /> from @game instead.',
        },
      ]),
    },
  },
);
