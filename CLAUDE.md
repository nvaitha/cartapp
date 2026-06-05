# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
# Development (run both concurrently)
npm run dev          # Next.js dev server
shopify app dev      # Shopify CLI tunnel + extension hot-reload

# Build & lint
npm run build
npm run lint

# Deploy
shopify app deploy --allow-updates   # push theme app extension to Shopify
# Vercel deploys automatically on push to main
```

Dev store: `bundleappstore-2.myshopify.com`  
Production: `https://cartapp-ten.vercel.app`

## Architecture

This is a **Shopify embedded app** — a Next.js 16 app (React 19, TypeScript, Tailwind v4) serving as the admin UI and API backend for a **Theme App Extension** (the actual storefront cart drawer).

### Two-layer system

**1. Next.js app** — admin UI + API  
- `app/dashboard/` — embedded Polaris admin UI (rendered inside Shopify admin via App Bridge). `page.tsx` passes `shop`/`host` query params to `DashboardClient.tsx` (client component), and client API calls use App Bridge session tokens.
- `app/api/admin/` — protected routes; use `requireAuth` from `lib/auth-helper.ts` which validates a Shopify session token and checks `cart_drawer_sessions` in Supabase.
- `app/api/public/config/` — unprotected; called by the theme extension JS at storefront runtime to load drawer config.
- `app/api/auth/` and `app/api/auth/callback/` — Shopify OAuth flow (offline tokens).
- `app/api/webhooks/app-uninstalled/` — HMAC-verified webhook; deletes the session row.

**2. Theme App Extension** (`extensions/cart-drawer/`)  
- `blocks/cart-drawer-embed.liquid` — app embed block injected into the theme.
- `assets/cart-drawer.js` + `assets/cart-drawer.css` — vanilla JS/CSS that fetches `/api/public/config` and renders the drawer on the storefront.
- Deployed via `shopify app deploy`; Shopify CDN hosts the assets (not Vercel).

### Data layer (Supabase)

Shared BundleApp Supabase project. All tables are prefixed `cart_drawer_*` to avoid collisions:

| Table | Purpose |
|---|---|
| `cart_drawer_sessions` | OAuth tokens, one row per shop |
| `cart_drawer_configs` | Drawer settings (1:1 with sessions) |
| `cart_drawer_upsells` | Ordered upsell products (many per shop, max 12) |

All tables have RLS enabled; anon access is blocked. Server-side code uses the service role key via `getSupabaseAdmin()`. Run `supabase/migrations/001_initial_schema.sql` to set up a fresh project.

### Auth pattern

API routes call `requireAuth(request)` which:
1. Decodes the `Authorization: Bearer <session-token>` header using the Shopify SDK.
2. Confirms the shop exists in `cart_drawer_sessions`.
3. Returns `{ shop }` on success or a `NextResponse` 401 on failure.

The dashboard client calls `window.shopify.idToken()` (injected by App Bridge) to obtain a fresh token for each request.

### Key config

- `lib/schemas.ts` — Zod schemas + TypeScript types for all config/upsell data; also holds `DEFAULT_CART_DRAWER_CONFIG` (the fallback when no DB row exists yet).
- `lib/shopify.ts` — lazy singleton Shopify API client; also exports `verifyWebhookHmac` and `decodeSessionToken`.
- `shopify.app.toml` — replace `client_id` placeholder before running `shopify app dev`.
- `.env.local` — copy from `.env.example`; requires both Shopify and Supabase credentials.
