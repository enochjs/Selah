# Selah 真机打包与换机指南

适用于从 Git 检出 Selah 后，在新电脑构建 Android APK 或可安装到 iPhone 的 iOS Release。包名和 Bundle ID 都是 `app.selah.bible`。显示版本与原生构建号取自 `apps/app/app.json`。公开发布需按 [App 更新流程](app-updates.md) 使用更高的构建号。

## 两个平台共用

安装 `.nvmrc` 指定的 Node.js 22（至少 22.13），使用根目录的锁文件安装所有 workspace。`npm ci` 会自动应用 Expo Audio 和 Pager View 的原生补丁。换机检出带上 `packages/content/` 和 `apps/app/assets/` 即可使用仓库内置内容，线上资源直接使用 Selah 的 HTTPS 服务。

```bash
# 在仓库根目录执行，以下示例使用 Bash / Zsh
nvm install
nvm use
npm ci
export EXPO_PUBLIC_BIBLE_SERVER_URL=https://www.enochjs.top
curl -fsS "$EXPO_PUBLIC_BIBLE_SERVER_URL/api/health"
```

原生预生成和 Release 打包应使用同一个服务地址。`apps/app/.env.example` 的 `127.0.0.1` 用于电脑上的本地开发。`apps/app/android/`、`apps/app/ios/` 都由 Expo 根据 `app.json`、插件和依赖生成。新电脑从检出重建即可，所需工具链或凭据按下文配置。

## Android Release APK

在 macOS 上安装 JDK 17，以及 Android Studio 的 Android SDK。当前 Expo SDK 58 / React Native 0.88 构建使用 SDK Platform 37（SDK 包标识 `platforms;android-37.0`）、Build Tools `37.0.0`、NDK `27.1.12297006`、CMake `3.22.1` 和 Platform-Tools（ADB）。Gradle Wrapper 自动下载 Gradle `9.4.1`。升级 Expo 或 React Native 后查当前版本目录 `node_modules/react-native/gradle/libs.versions.toml` 和重新生成的 Gradle Wrapper。

```bash
# macOS Android Studio 默认 SDK 路径，按电脑上的实际安装位置调整
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export EXPO_PUBLIC_BIBLE_SERVER_URL=https://www.enochjs.top
npm run build:android --workspace @selah/app
```

产物为 `apps/app/android/app/build/outputs/apk/release/app-release.apk`，支持 `arm64-v8a`、Android 7.0 及以上，启动无需 Metro。先验证 APK 的签名、包名和版本。

```bash
apk=apps/app/android/app/build/outputs/apk/release/app-release.apk
build_tools="$ANDROID_HOME/build-tools/37.0.0"
"$build_tools/apksigner" verify --print-certs "$apk"
"$build_tools/aapt" dump badging "$apk" | sed -n '1p; /^native-code:/p'
shasum -a 256 "$apk"
```

现有官网直接安装渠道沿用 Expo 模板附带的 `android/app/debug.keystore`。已核对它与公开版 `1.1.4 (6)` 的签名证书 SHA-256 一致，值为 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`。换电脑时由当前锁定的 Expo 模板恢复，`~/.android/debug.keystore` 属于各电脑自己的调试签名。模板密钥公开可得，指纹用于检查已有设备的覆盖安装兼容性。模板升级后如发现指纹改变，先查证原签名来源，再处理覆盖安装。可从 [官网下载区](https://www.enochjs.top/#download) 获取当前公开 APK，重新执行同样的证书核对。

手机开启开发者选项和 USB 调试，解锁并接受新电脑的 USB 调试授权。用 `adb devices -l` 选出状态为 `device` 的实体手机。已有安装时，先保存 `dumpsys package` 的版本、首次安装时间和数据目录，回读旧 APK 并核对新旧签名。新包构建号须大于或等于设备内版本，公开更新需严格递增。出现签名不匹配或版本倒退时停止安装，保留设备上的学习资料。

```bash
adb devices -l
serial='<实体手机的 ADB 序列号>'
adb -s "$serial" shell dumpsys package app.selah.bible
# 已有安装时，先以 pm path 查到的 base.apk 路径执行 adb pull，再核对签名
adb -s "$serial" shell pm path app.selah.bible
adb -s "$serial" install -r "$apk"
adb -s "$serial" shell monkey -p app.selah.bible -c android.intent.category.LAUNCHER 1
adb -s "$serial" shell dumpsys package app.selah.bible
```

安装后回读 `pm path` 指向的 APK，确认 SHA-256 与本次构建一致。覆盖安装前后核对首次安装时间和数据目录，并在手机上打开已有学习资料或离线下载。保留数据使用 `install -r`，禁止通过卸载或清数据解决签名、版本冲突。

## iPhone Release 本地安装

使用 Mac 和支持目标 iOS 版本的完整 Xcode，完成首次启动并安装 iOS 平台支持。参考环境为 Xcode `26.6` 和 CocoaPods `1.16.2`。新机在 Xcode → Settings → Accounts 登录有项目团队权限的 Apple 账号。已有本地签名用 Team ID `8N56LH46Z3`，同一 Bundle ID 的覆盖安装需核对团队和 provisioning profile。用 Xcode 准备该团队的 Apple Development 签名，或经私密渠道从旧机迁移证书及对应私钥，并确认描述文件覆盖目标设备。Apple 账号、私钥和设备序列号留在各自的授权环境。

手机解锁、信任 Mac，开启开发者模式。在 Xcode → Window → Devices and Simulators 完成配对，确认 `xcrun devicectl list devices` 能识别该设备。新设备首次签名时，选择对应团队并启用自动签名，允许 Xcode 为获准的设备配置描述文件。

```bash
export EXPO_PUBLIC_BIBLE_SERVER_URL=https://www.enochjs.top
export NODE_ENV=production
(cd apps/app && npx --no-install expo prebuild --platform ios --no-install)
(cd apps/app/ios && pod install)
printf 'export NODE_BINARY="%s"\n' "$(command -v node)" > apps/app/ios/.xcode.env.local
security find-identity -v -p codesigning

ios_out=storage/builds/ios-device
xcodebuild -workspace apps/app/ios/Selah.xcworkspace -scheme Selah \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath "$ios_out" DEVELOPMENT_TEAM=8N56LH46Z3 \
  CODE_SIGN_STYLE=Automatic 'CODE_SIGN_IDENTITY=Apple Development' build

ios_app="$ios_out/Build/Products/Release-iphoneos/Selah.app"
codesign --verify --deep --strict "$ios_app"
xcrun devicectl list devices
device='<实体 iPhone 在 devicectl 中的标识>'
xcrun devicectl device install app --device "$device" "$ios_app"
xcrun devicectl device process launch --device "$device" app.selah.bible
```

`.xcode.env.local` 记录此 Mac 的 Node 路径，切换 Node 安装后重新生成。若缺少描述文件，先在 Xcode 确认所选团队、设备注册和账号权限，签名就绪后再重跑构建。上述 `.app` 使用开发签名，供描述文件覆盖的设备安装。TestFlight 和 App Store 分发通过该项目有权限的 Apple 团队另走正式发布流程。

首次 `pod install` 需要访问 CocoaPods 和 React Native / Hermes 的二进制下载源。若卡在 `Installing React-Core-prebuilt` 或 `hermes-engine`，用 `pod install --verbose` 查看实际 URL，确认能访问 `repo.reactnative.dev` 及 Maven Central 的重定向目标。已有可用 Maven 镜像时，可按 React Native 约定设置 `ENTERPRISE_REPOSITORY` 为具有相同 Maven 路径的镜像地址，再重跑 `pod install`。

## 验收与留档

分别记录构建、安装、启动和业务验收的实际结果。构建与签名通过后，真机上还需检查无 Metro 启动、联网获取资源、实际播放和本次修改的交互，并保留相关截图。设备断开或锁屏时，把没能操作的环节标为待验收。APK、设备回读和构建日志可放在 Git 忽略的 `storage/builds/`，公开发布的历史回读见 [部署记录](deployment.md)。
