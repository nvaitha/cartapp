# LavocDerma Cart Drawer

Standalone Shopify cart drawer app for LavocDerma.

## Local setup

1. Create a new Shopify app named `LavocDerma Cart Drawer` in the `LavocDerma` org.
2. Reuse the BundleApp Supabase project as requested.
3. Copy `.env.example` to `.env.local` and fill in the Shopify and BundleApp Supabase credentials.
4. Run `supabase/migrations/001_initial_schema.sql` in the BundleApp Supabase SQL Editor. The cart app uses namespaced `cart_drawer_*` tables so it does not overwrite BundleApp sessions.
5. Replace `client_id` in `shopify.app.toml`.
6. Run:

```bash
npm run dev
shopify app dev
```

Dev store: `bundleappstore-2.myshopify.com`.

GitHub remote: `https://github.com/nvaitha/cartapp.git`.

## Deploy

Vercel hosts the Next.js admin/API app. Shopify hosts theme app extension assets after:

```bash
shopify app deploy --allow-updates
```
