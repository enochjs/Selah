const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  { ignores: ["dist/**", "dist-native/**", "coverage/**", ".expo/**"] },
  {
    rules: {
      "react/display-name": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@selah/server",
                "@selah/server/*",
                "@nestjs/*",
                "node:*",
                "**/server/**",
              ],
              message:
                "App code must not depend on server or Node.js runtime modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-native",
                "react-native-*",
                "expo",
                "expo-*",
                "node:*",
                "**/features/**",
                "**/state/**",
                "**/data/**",
                "@/features/*",
                "@/state/*",
                "@/data/*",
              ],
              message:
                "Domain rules must stay independent of UI, platforms and data adapters.",
            },
          ],
        },
      ],
    },
  },
]);
