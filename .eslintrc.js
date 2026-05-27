module.exports = [
  {
    files: ["agents/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs"
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "error",
      "semi": ["error", "always"],
      "quotes": ["error", "single"],
      "indent": ["error", 2],
      "comma-dangle": ["warn", "never"],
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"]
    }
  }
];
