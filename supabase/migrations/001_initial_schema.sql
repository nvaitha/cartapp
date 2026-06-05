-- LavocDerma Cart Drawer App - Initial Schema

CREATE TABLE IF NOT EXISTS cart_drawer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  scope TEXT,
  installed_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_drawer_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT UNIQUE NOT NULL REFERENCES cart_drawer_sessions(shop) ON DELETE CASCADE,

  enabled BOOLEAN NOT NULL DEFAULT true,

  drawer_title TEXT NOT NULL DEFAULT 'Your cart',
  empty_title TEXT NOT NULL DEFAULT 'Your cart is empty',
  empty_body TEXT NOT NULL DEFAULT 'Build your barrier routine with calm, steady care.',
  checkout_button_text TEXT NOT NULL DEFAULT 'Check out',
  continue_shopping_text TEXT NOT NULL DEFAULT 'Continue shopping',

  free_shipping_enabled BOOLEAN NOT NULL DEFAULT true,
  free_shipping_threshold_cents INT NOT NULL DEFAULT 0,
  free_shipping_message TEXT NOT NULL DEFAULT 'You are close to free shipping',
  free_shipping_success_message TEXT NOT NULL DEFAULT 'Free shipping unlocked',

  upsells_enabled BOOLEAN NOT NULL DEFAULT false,
  upsell_heading TEXT NOT NULL DEFAULT 'Complete your routine',

  colors JSONB NOT NULL DEFAULT '{}',
  typography JSONB NOT NULL DEFAULT '{}',
  layout JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_drawer_upsells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT NOT NULL REFERENCES cart_drawer_sessions(shop) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  product_gid TEXT NOT NULL,
  variant_gid TEXT NOT NULL,
  title_override TEXT,
  badge_text TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cart_drawer_upsells_shop_idx
  ON cart_drawer_upsells (shop, sort_order);

ALTER TABLE cart_drawer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_drawer_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_drawer_upsells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "block_anon" ON cart_drawer_sessions;
DROP POLICY IF EXISTS "block_anon" ON cart_drawer_configs;
DROP POLICY IF EXISTS "block_anon" ON cart_drawer_upsells;

CREATE POLICY "block_anon" ON cart_drawer_sessions FOR ALL TO anon USING (false);
CREATE POLICY "block_anon" ON cart_drawer_configs FOR ALL TO anon USING (false);
CREATE POLICY "block_anon" ON cart_drawer_upsells FOR ALL TO anon USING (false);
