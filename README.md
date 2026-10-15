# Clearcut

> Next-generation offline-first balance ledger and group expense sharing app built with Next.js, Capacitor 8, and Supabase.

[![CI](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF)](https://capacitorjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E)](https://supabase.com/)
[![Tests](https://img.shields.io/badge/Tests-140%20passing-success)](https://vitest.dev/)

---

## ⚡ Highlights

- **Zero-Sum Ledger**: Invariant-enforced mathematical precision using integer minor units (no floating-point rounding errors).
- **Online-First with Offline Resilience**: Direct real-time Supabase writes when online; automatic offline queueing with auto-drain upon reconnection.
- **Mobile-Native (Android & iOS)**: Hardware back button handling, safe-area insets, camera receipt uploads, push notifications, and native Google Auth.
- **Neo-Brutalist Design**: High-contrast, tactile, fast, and accessible user interface.
- **Soft-Delete Restoration**: Reversible expense deletions with full restoration directly from the Activity log.

---

## 📖 Documentation

Comprehensive guides and architecture documentation are located in the [`docs/`](./docs) folder:

- [Architecture & Invariants](./docs/architecture.md)
- [Getting Started & Development](./docs/getting-started.md)
- [Mobile & Native Shells (Android / iOS)](./docs/mobile-native.md)
- [Sync Engine & Offline Architecture](./docs/sync-engine.md)
- [Database & Migrations](./docs/database-migrations.md)
- [Testing & CI/CD](./docs/testing-cicd.md)
- [Contributing Guidelines](./docs/CONTRIBUTING.md)
- [Specifications & Research](./docs/specs/)

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start local web development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the web client.

### Building for Mobile
```bash
# Compile static export & sync to native Android/iOS
npm run build
npx cap sync

# Open in Android Studio or Xcode
npx cap open android
npx cap open ios
```

---

## 🧪 Testing

```bash
# Run 140+ unit and fast-check property tests
npm test
```

---

## 📜 License

Private & Proprietary. All rights reserved.
