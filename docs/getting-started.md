# Getting Started & Development Guide

## 1. Prerequisites

Before setting up Clearcut, ensure you have the following installed on your machine:
- **Node.js**: v18.18.0 or newer (v20+ recommended)
- **Package Manager**: `npm` (v9+)
- **Git**
- **Mobile Development** (Optional for web-only testing):
  - **Android**: Android Studio Hedgehog+ with SDK 34+ and JDK 17+
  - **iOS**: macOS Sonoma+ with Xcode 15+ and CocoaPods / Swift Package Manager

---

## 2. Environment Configuration

Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

For native Android/iOS Firebase Push Notifications, ensure:
- `android/app/google-services.json` is present.
- `ios/App/App/GoogleService-Info.plist` is present.

---

## 3. Installation & Local Web Development

```bash
# 1. Clone repository
git clone https://github.com/your-username/clearcut.git
cd clearcut

# 2. Install dependencies
npm install

# 3. Start local development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 4. Key NPM Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Launch local Next.js dev server with hot reload |
| `npm run build` | Compile Next.js and produce static output in `out/` |
| `npm test` | Run Vitest test suites (140+ unit and property tests) |
| `npx cap sync` | Sync `out/` static web build to both Android and iOS projects |
| `npx cap open android` | Open Android Studio with the `android/` project |
| `npx cap open ios` | Open Xcode with the `ios/` project (macOS only) |
| `npx @capacitor/assets generate` | Regenerate app icons and splash screens across platforms |

---

## 5. Code Style & Pre-PR Checks

Before submitting any code, always ensure:
```bash
# 1. Typecheck without errors
npx tsc --noEmit

# 2. Run all tests
npm test

# 3. Build static export cleanly
npm run build
```
