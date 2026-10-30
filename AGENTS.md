<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Rules for Capacitor + Next.js (Icons & Mobile WebView Performance)

1. **Never import dynamically via an index catalog**:
   - Avoid patterns like `import * as Icons from 'lucide-react'` or writing a `<DynamicIcon name="{iconName}"/>` helper that indexes into the whole module.
   - Doing this drags the entire 1,500+ SVG catalog into the mobile bundle (~1–2 MB parse overhead) and will visibly degrade mobile cold-start times.
   - Always use direct named imports: `import { Receipt, Check } from 'lucide-react'`.
   - `next.config.ts` maintains `experimental: { optimizePackageImports: ['lucide-react'] }` to guarantee tree-shaking.

2. **Keep icons vector-sized via CSS/Tailwind**:
   - Use Tailwind classes directly (e.g. `className="w-5 h-5 text-[#543A2A]"`) rather than inline heavy styles, keeping DOM nodes lightweight inside the WebView.

3. **Avoid wrapping every icon in excessive wrappers**:
   - WebView DOM traversal on mobile chips is noticeably slower than on desktop CPUs; render `<Icon className="..."/>` directly rather than layering multiple unnecessary `div` or `span` containers around it.
