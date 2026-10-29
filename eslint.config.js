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
      "semi": ["warn", "always"],
      "quotes": ["warn", "single"],
      "indent": ["warn", 2],
      "comma-dangle": ["warn", "never"],
      "eqeqeq": ["warn", "always"],
      "curly": ["warn", "all"]
    }
  }
];
