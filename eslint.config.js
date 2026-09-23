/**
 * Minimal typescript-eslint flat config for monorepo lint bootstrap (test-gate).
 * Location: eslint.config.js
 */

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-ext/**",
      "**/node_modules/**",
      "**/coverage/**",
      "scripts/**",
      "packages/extension/scripts/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/src/**/*.{ts,tsx}", "packages/**/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        crypto: "readonly",
        document: "readonly",
        window: "readonly",
        HTMLElement: "readonly",
        HTMLStyleElement: "readonly",
        Element: "readonly",
        getComputedStyle: "readonly",
        WebSocket: "readonly",
        chrome: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Bootstrap: keep stylistic noise out of the gate; typed-strict covers escape hatches.
      "prefer-const": "off",
      "@typescript-eslint/prefer-as-const": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
);
