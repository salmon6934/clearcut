# Clearcut Documentation

Welcome to the **Clearcut** project documentation. Clearcut is an online-first, mobile-native expense sharing and ledger platform (Splitwise alternative) with offline resilience, built with Next.js static export, Capacitor 8, and Supabase.

---

## 📚 Documentation Index

| Document | Description |
| :--- | :--- |
| **[Architecture & Invariants](./architecture.md)** | Core system design, database schema, math invariants (integer minor units, zero-sum balances), and OCC concurrency. |
| **[Getting Started & Development](./getting-started.md)** | Prerequisites, local setup, environment variables, web development, and testing. |
| **[Mobile & Native Shells](./mobile-native.md)** | Capacitor 8 architecture, Android building, iOS Xcode compilation, native plugins, and permissions. |
| **[Sync Engine & Offline Resilience](./sync-engine.md)** | Online-first synchronization, offline fallback queue, automatic reconnect drain, and Supabase RPCs. |
| **[Database & Migrations](./database-migrations.md)** | Postgres schema, RLS policies, RPC functions (`upsert_expense_v1`, `pull_changes_v1`), and Supabase CLI workflow. |
| **[Testing & CI/CD](./testing-cicd.md)** | Test strategy (unit, property-based tests with fast-check), Vitest, and GitHub Actions CI pipeline. |
| **[Contributing Guidelines](./CONTRIBUTING.md)** | Git conventions, PR standards, issue templates, code style, and architectural invariants. |

---

## 📁 Historical Specifications & Research References

Original specifications and architectural research docs have been indexed into [`docs/specs/`](./specs/):
- **[Technical Specification v1.0](./specs/technical-specification-v1.0.md)**: Baseline 10-phase specification, invariants, and database design.
- **[Capacitor Native WebView Guide](./specs/capacitor-native-webview.md)**: Safe area insets, keyboard handling, back button, and deep linking spikes.
- **[Implementation Reference Guide](./specs/implementation-reference.md)**: Algorithm designs for balance simplification and Splitwise clone guides.
- **[Engineering Progress Log](./specs/progress-log.md)**: Complete chronological engineering trajectory and changelog.
