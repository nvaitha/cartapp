import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_CART_DRAWER_CONFIG, type CartDrawerConfigInput } from "@/lib/schemas";

const PUBLIC_CONFIG_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type ConfigRow = CartDrawerConfigInput & {
  colors: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
  layout: Record<string, unknown> | null;
};

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop")?.trim();
  if (!shop) {
    return NextResponse.json(
      { error: "Missing shop" },
      { status: 400, headers: PUBLIC_CONFIG_HEADERS }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from("cart_drawer_sessions")
    .select("shop")
    .eq("shop", shop)
    .single();

  if (!session) {
    return NextResponse.json(
      { error: "Shop not found" },
      { status: 404, headers: PUBLIC_CONFIG_HEADERS }
    );
  }

  const { data: configData } = await supabase
    .from("cart_drawer_configs")
    .select("*")
    .eq("shop", shop)
    .single();

  const config = configData as ConfigRow | null;
  const defaultLayout = DEFAULT_CART_DRAWER_CONFIG.layout;
  const configLayout = (config?.layout ?? {}) as Partial<typeof defaultLayout>;
  const mergedLayout = {
    ...defaultLayout,
    ...configLayout,
    gamification: {
      ...defaultLayout.gamification,
      ...(configLayout.gamification ?? {}),
      country_targeting: {
        ...defaultLayout.gamification.country_targeting,
        ...(configLayout.gamification?.country_targeting ?? {}),
      },
      rewards: configLayout.gamification?.rewards?.length
        ? configLayout.gamification.rewards
        : defaultLayout.gamification.rewards,
    },
    frequentlyBoughtTogether: {
      ...defaultLayout.frequentlyBoughtTogether,
      ...(configLayout.frequentlyBoughtTogether ?? {}),
      country_targeting: {
        ...defaultLayout.frequentlyBoughtTogether.country_targeting,
        ...(configLayout.frequentlyBoughtTogether?.country_targeting ?? {}),
      },
      products: configLayout.frequentlyBoughtTogether?.products ?? [],
    },
  };
  const mergedConfig = {
    ...DEFAULT_CART_DRAWER_CONFIG,
    ...(config ?? {}),
    colors: { ...DEFAULT_CART_DRAWER_CONFIG.colors, ...(config?.colors ?? {}) },
    typography: {
      ...DEFAULT_CART_DRAWER_CONFIG.typography,
      ...(config?.typography ?? {}),
    },
    layout: mergedLayout,
  };

  return NextResponse.json(
    {
      enabled: mergedConfig.enabled,
      copy: {
        drawerTitle: mergedConfig.drawer_title,
        emptyTitle: mergedConfig.empty_title,
        emptyBody: mergedConfig.empty_body,
        checkoutButtonText: mergedConfig.checkout_button_text,
        continueShoppingText: mergedConfig.continue_shopping_text,
      },
      gamification: mergedConfig.layout.gamification,
      freeShipping: {
        enabled: mergedConfig.free_shipping_enabled,
        thresholdCents: mergedConfig.free_shipping_threshold_cents,
        message: mergedConfig.free_shipping_message,
        successMessage: mergedConfig.free_shipping_success_message,
      },
      frequentlyBoughtTogether: mergedConfig.layout.frequentlyBoughtTogether,
      upsellsHeading: "",
      upsells: [],
      colors: mergedConfig.colors,
      typography: mergedConfig.typography,
      layout: mergedConfig.layout,
    },
    {
      headers: {
        ...PUBLIC_CONFIG_HEADERS,
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: PUBLIC_CONFIG_HEADERS,
  });
}
