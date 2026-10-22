import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

/** Lint rules: recommended TypeScript, React hooks and accessibility checks; formatting is Prettier's. */
export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'server/data/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.ts', '*.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      // Unused values are caught by tsc (noUnusedLocals); names starting with _ are deliberate.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // Non-null assertions are allowed where the code checked the value a line earlier.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Effects here start fetches and set their loading state; there is no data library to do it.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
);
