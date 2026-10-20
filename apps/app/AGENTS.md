# App rules

本目录是独立 Expo / React Native 客户端，包名 `@selah/app`。

- 采用按功能组织的 Clean Architecture：`app/` 仅路由，`features/` 放 UI 和用例编排，`domain/` 放纯 TypeScript 模型和业务规则，`data/` 放数据适配器，`state/` 放状态，`shared/` 仅通用界面基础设施。
- 依赖指向领域：domain 不导入 React、Expo、存储、HTTP 或页面；通过 AudioPort 等边界接口隔离平台能力。
- 跨端差异通过 `.native` / `.web` 或明确适配器隔离，避免在领域层判断平台。
- 离线内容从 `@selah/content/*.json` 导入；不得复制数据集、导入服务端源代码或读 `storage/`。
- 只允许 `EXPO_PUBLIC_*` 客户端配置，禁止把管理员凭据或服务器路径传入 bundle。
- 本目录有独立 package.json、tsconfig、lint、test 和 build。修改后在根目录执行 `npm run typecheck --workspace @selah/app`、`npm run lint --workspace @selah/app`、`npm test --workspace @selah/app`；涉及打包、资源或路由时执行 `npm run build:app`。

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
