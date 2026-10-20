import js from "@eslint/js";
import tseslint from "typescript-eslint";
const appBoundaries = {
  patterns: [
    {
      group: [
        "@selah/app",
        "@selah/app/**",
        "expo",
        "expo-*",
        "expo/**",
        "expo-*/**",
        "react",
        "react/**",
        "react-native",
        "react-native/**",
      ],
      message:
        "The server must be independent of Expo and the mobile application.",
    },
    {
      group: ["**/apps/app/**", "**/app/src/**"],
      message:
        "Use shared packages instead of importing another application's files.",
    },
  ],
};
export default tseslint.config(
  { ignores: ["dist/**", "public/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-imports": ["error", appBoundaries],
    },
  },
  {
    files: ["src/**/*.service.ts", "src/**/*.controller.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...appBoundaries.patterns,
            {
              group: [
                "node:fs",
                "node:fs/**",
                "fs",
                "fs/**",
                "node:child_process",
                "child_process",
              ],
              message:
                "Keep filesystem and process I/O in infrastructure repositories or adapters.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.service.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...appBoundaries.patterns,
            {
              group: ["express", "express/**"],
              message:
                "Services accept framework-neutral values; keep Express request and response handling in controllers or HTTP helpers.",
            },
            {
              group: [
                "node:fs",
                "node:fs/**",
                "fs",
                "fs/**",
                "node:child_process",
                "child_process",
              ],
              message:
                "Keep filesystem and process I/O in infrastructure repositories or adapters.",
            },
          ],
        },
      ],
    },
  },
);
