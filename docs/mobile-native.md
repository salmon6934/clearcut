# Mobile & Native Shells (Capacitor 8)

Clearcut runs as a native mobile application using **Capacitor 8**, wrapping the Next.js static HTML/JS export into native WebViews with deep OS integrations.

---

## 1. Directory Structure

- `android/`: Native Android Studio Gradle project.
  - Package: `com.clearcut.mobile`
  - Output: Debug/Release APK and Android App Bundle (`.aab`).
- `ios/`: Native Xcode workspace.
  - Bundle Identifier: `com.clearcut.mobile`
  - Output: `.xcarchive` / `.ipa`.
- `assets/`: Master source graphic assets (`icon.png`, `splash.png`).
- `capacitor.config.ts`: Master configuration for runtime behavior.

---

## 2. Native Plugins Integrated

| Plugin | Purpose |
| :--- | :--- |
| `@capacitor-firebase/messaging` | Native push notifications (FCM v1 background tokens and alerts) |
| `@capacitor/splash-screen` | Native hardware splash screen before WebView render |
| `@capacitor/haptics` | Neo-Brutalist tactile feedback on buttons and transactions |
| `@capacitor/camera` | Receipt capture and camera photo uploads |
| `@capacitor/filesystem` | Local receipt cache and export generation |
| `@capacitor/local-notifications` | Scheduled reminder notifications for unsettled debts |
| `@capacitor/share` | Native OS share sheet for group invite links |
| `@capacitor/app` | Deep link interception (`splitapp://join`) and hardware back-button handling |
| `@codetrix-studio/capacitor-google-auth` | Native Google Sign-In sheet |

---

## 3. Android Workflow (Windows / macOS / Linux)

### Building & Running:
```bash
# 1. Compile Next.js and sync web assets to Android
npm run build
npx cap sync android

# 2. Open in Android Studio
npx cap open android
```

### Direct CLI Debug APK Build:
```bash
cd android
./gradlew assembleDebug
# APK is located at: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. iOS Workflow (macOS / Xcode Required)

Apple requires macOS and Xcode to compile iOS apps:
```bash
# 1. Compile and sync assets to iOS project
npm run build
npx cap sync ios

# 2. Open Xcode
npx cap open ios
```
In Xcode:
1. Select the **App** project in the navigator.
2. In **Signing & Capabilities**, select your Apple Developer Team.
3. Choose a Simulator or plugged-in iPhone and hit **Play (▶)**.

---

## 5. Asset Generation & Optimization

All native mipmaps, drawables, and iOS `.appiconset` / `.imageset` folders are generated from `assets/`:

```bash
# Generate all icons and splash screens
npx @capacitor/assets generate
```

> **Note on Asset Sizes:** Master assets in `assets/icon.png` and `assets/splash.png` are optimized via `sharp` to ensure that generated Android drawables and iOS imagesets remain under ~2 MB total, avoiding APK size bloat.
