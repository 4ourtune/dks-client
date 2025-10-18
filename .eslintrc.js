module.exports = {
  root: true,
  extends: ["@react-native-community", "plugin:prettier/recommended"],
  parserOptions: {
    requireConfigFile: false,
  },
  rules: {
    "prettier/prettier": [
      "error",
      {
        singleQuote: false,
        endOfLine: "lf",
      },
    ],
  },
};
