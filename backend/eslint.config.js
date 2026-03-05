import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  // ── Source files ──────────────────────────────────────────────────────────
  {
    files: ["src/**/*.js"],
    ignores: ["src/tests/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", }],
      "no-undef": "error",
      "no-console": "off",
      "eqeqeq": ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-duplicate-imports": "error",
      "no-async-promise-executor": "error",
      "no-await-in-loop": "warn",
      "require-await": "warn",
    },
  },
  // ── Test files ────────────────────────────────────────────────────────────
  {
    files: ["src/tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.jest, // ← adds describe, test, expect, beforeEach, afterAll etc.
      },
    },
    rules: {
      "no-unused-vars": ["error", { 
        argsIgnorePattern: "^_", 
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-undef": "error",
      "no-console": "off",
    },
  },
  // ── Ignored folders ───────────────────────────────────────────────────────
  {
    ignores: ["node_modules/**", "coverage/**", "dist/**"],
  },
];