import js from '@eslint/js';
import react from 'eslint-plugin-react';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'docs/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        globalThis: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // Browser globals for the React PWA / staff portal
        localStorage: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly'
      }
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-vars': 'error'
    }
  }
];
