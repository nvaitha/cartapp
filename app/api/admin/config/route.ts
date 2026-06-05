import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helper";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  AdminConfigPayloadSchema,
  DEFAULT_CART_DRAWER_CONFIG,
  type CartDrawerConfigInput,
} from "@/lib/schemas";

type ConfigRow = CartDrawerConfigInput & {
  colors: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
  layout: Record<string, unknown> | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = getSupabaseAdmin();
  const [{ data: config }, { data: upsells }] = await Promise.all([
    supabase.from("cart_drawer_configs").select("*").eq("shop", auth.shop).single(),
    supabase
      .from("cart_drawer_upsells")
      .select("id, sort_order, product_gid, variant_gid, title_override, badge_text, enabled")
      .eq("shop", auth.shop)
      .order("sort_order"),
  ]);

  const mergedConfig = {
    ...DEFAULT_CART_DRAWER_CONFIG,
    ...(config as ConfigRow | null),
    colors: {
      ...DEFAULT_CART_DRAWER_CONFIG.colors,
      ...((config as ConfigRow | null)?.colors ?? {}),
    },
    typography: {
      ...DEFAULT_CART_DRAWER_CONFIG.typography,
      ...((config as ConfigRow | null)?.typography ?? {}),
    },
    layout: {
      ...DEFAULT_CART_DRAWER_CONFIG.layout,
      ...((config as ConfigRow | null)?.layout ?? {}),
    },
  };

  return NextResponse.json({
    config: mergedConfig,
    upsells: upsells ?? [],
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const parsed = AdminConfigPayloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { config, upsells } = parsed.data;
  const { error: configError } = await supabase.from("cart_drawer_configs").upsert(
    {
      shop: auth.shop,
      ...config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop" }
  );

  if (configError) {
    console.error("Config save error:", configError);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("cart_drawer_upsells")
    .delete()
    .eq("shop", auth.shop);

  if (deleteError) {
    console.error("Upsell delete error:", deleteError);
    return NextResponse.json({ error: "Failed to replace upsells" }, { status: 500 });
  }

  if (upsells.length) {
    const { error: upsellError } = await supabase.from("cart_drawer_upsells").insert(
      upsells.map((upsell, sort_order) => ({
        shop: auth.shop,
        sort_order,
        product_gid: upsell.product_gid,
        variant_gid: upsell.variant_gid,
        title_override: upsell.title_override ?? null,
        badge_text: upsell.badge_text ?? null,
        enabled: upsell.enabled,
      }))
    );

    if (upsellError) {
      console.error("Upsell save error:", upsellError);
      return NextResponse.json({ error: "Failed to save upsells" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
