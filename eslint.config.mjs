// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    // Longgarkan rule "no-unsafe-*" KHUSUS untuk file test (src/ TETAP
    // strict, tidak berubah). Alasan: supertest men-tipe-kan
    // `Response.body` sebagai `any` (bukan generic per-request) --
    // assertion E2E lewat `res.body.data.xxx` SECARA INHEREN "unsafe"
    // menurut rule ini, terlepas seberapa hati-hati kode test-nya
    // ditulis. Menambah interface/type-guard manual di ratusan titik
    // assertion test cuma untuk memuaskan linter tidak menambah jaminan
    // korektnes nyata (kalau shape response berubah, test-nya sendiri
    // yang bakal gagal saat dijalankan -- itu jaring pengaman
    // sebenarnya di sini, bukan compile-time type check).
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
);
