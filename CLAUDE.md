# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

**Arcade Vault** — plataforma para jugar online y competir por la mayor cantidad de puntos.

The repo is currently a fresh `create-next-app` scaffold: `app/page.tsx` and `app/layout.tsx` still hold the default template content, and there is no game, auth, scoring, or data layer yet. Nearly all product code is still to be written.

The README states the project follows **Spec Driven Design** via the `/spec` and `/spec-impl` skills from [Klerith/fernando-skills](https://github.com/Klerith/fernando-skills) (`npx skills@latest add Klerith/fernando-skills`). Those skills are not installed in this checkout — if a feature request arrives without a spec, prefer writing the spec first over improvising the implementation.

## Commands

```bash
npm run dev     # dev server (Turbopack by default in Next 16)
npm run build   # production build (Turbopack by default)
npm run start   # serve the production build
npm run lint    # eslint (NOT `next lint` — that command was removed in Next 16)
npx tsc --noEmit  # typecheck; tsconfig is noEmit-only, Next does the emitting
npx next typegen  # regenerate PageProps/LayoutProps/RouteContext type helpers
```

No test framework is configured. If tests are needed, pick one and add it — don't assume a runner exists.

## Stack

Next.js 16.2.12 (App Router) · React 19.2.4 · TypeScript strict · Tailwind CSS v4 · ESLint 9 flat config.

- Tailwind v4 has **no `tailwind.config.js`**. Design tokens live in `app/globals.css` under `@theme inline`, loaded through a single `@import "tailwindcss"`. Add colors/fonts/spacing there, not in a JS config.
- Path alias `@/*` → repo root.
- Fonts come from `next/font/google` (Geist / Geist_Mono) wired to CSS variables in `app/layout.tsx`; note `globals.css` currently hardcodes `font-family: Arial` on `body`, overriding those variables.

## Next.js 16 gotchas that will bite

`AGENTS.md` says to read `node_modules/next/dist/docs/` before writing code — that is the authoritative reference for this version. The most common traps versus older Next.js:

- **All request APIs are async.** `cookies()`, `headers()`, `draftMode()`, and `params` / `searchParams` must be awaited. The synchronous fallback that existed in 15 was removed. Use `PageProps<'/route/[slug]'>` / `LayoutProps` / `RouteContext` helpers (from `next typegen`) for typing.
- **`middleware.ts` is now `proxy.ts`**, exporting `proxy()`. It runs on the Node.js runtime only — the edge runtime is unsupported in `proxy`. Config flags renamed too (`skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`).
- **Turbopack is the default** for both `dev` and `build`; `--webpack` opts out. Turbopack config goes in `next.config.ts` under `turbopack`, not `experimental.turbo`.
- **Caching APIs changed**: `revalidateTag`, the new `updateTag` / `refresh`, and `cacheLife` / `cacheTag`. `experimental.dynamicIO` and `experimental.useCache` were removed.
- **`next/image`**: stricter defaults (`minimumCacheTTL`, `imageSizes`, `qualities`, local-IP restriction, max redirects), local images with query strings behave differently, `images.domains` and `next/legacy/image` are deprecated.
- Parallel routes now **require** a `default.js`.
