# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Arcade Vault — an online gaming platform where users play and compete for points. Uses **Spec Driven Design** via the `/spec` and `/spec-impl` skills from `npx skills@latest add Klerith/fernando-skills`.

## Stack

- **Next.js 16.2.6** with App Router (`app/` directory) — read `node_modules/next/dist/docs/` before writing Next.js code; APIs differ from training data
- **React 19.2.4**
- **Tailwind CSS v4** (PostCSS plugin via `@tailwindcss/postcss`)
- **TypeScript**

No test runner is configured yet.

## Skills

Usa siempre /frontend-design para diseñar la interfaz de usuario.

## Architecture

Uses Next.js **App Router** exclusively — no `pages/` directory. Entry points:

- `app/layout.tsx` — root layout with Geist font variables and global CSS
- `app/globals.css` — Tailwind base styles
- `app/page.tsx` — home route (`/`)

New routes go under `app/` as folders with `page.tsx`. Shared UI goes in `components/` (not yet created). Server Components are the default; mark client components with `"use client"` only when needed.
