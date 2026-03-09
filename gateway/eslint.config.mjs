import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off",
    },
  },
];
