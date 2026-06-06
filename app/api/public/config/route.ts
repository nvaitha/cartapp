import { NextRequest, NextResponse } from "next/server";
import { getShopSession } from "@/lib/auth-helper";
import { adminRestClient } from "@/lib/shopify";
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

type RestVariantResponse = {
  variant?: {
    id: number;
    inventory_management?: string | null;
    inventory_policy?: string | null;
    inventory_quantity?: number | null;
    price?: string | null;
    compare_at_price?: string | null;
  };
};

type GamifiedReward = NonNullable<CartDrawerConfigInput["layout"]["gamification"]>["rewards"][number];

function variantNumericId(variantId: string | undefined) {
  const match = String(variantId ?? "").match(/(\d+)$/);
  return match ? Number(match[1]) : NaN;
}

function variantAvailable(variant: RestVariantResponse["variant"]) {
  if (!variant) return undefined;
  return (
    !variant.inventory_management ||
    variant.inventory_policy === "continue" ||
    Number(variant.inventory_quantity ?? 0) > 0
  );
}

function priceToCents(price: string | null | undefined) {
  if (!price) return null;
  const amount = Number(price);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

async function resolveGiftRewardAvailability(shop: string, rewards: GamifiedReward[]) {
  const session = await getShopSession(shop);
  if (!session) return rewards;

  const client = adminRestClient(session);
  return Promise.all(
    rewards.map(async (reward) => {
      if (reward.type !== "free_gift" || !reward.variant_id) return reward;
      const numericId = variantNumericId(reward.variant_id);
      if (!Number.isFinite(numericId)) return reward;

      try {
        const response = await client.get({ path: `variants/${numericId}` });
        const variant = (response.body as RestVariantResponse).variant;
        return {
          ...reward,
          available: variantAvailable(variant),
          inventory_quantity: variant?.inventory_quantity ?? reward.inventory_quantity,
          inventory_policy: variant?.inventory_policy ?? reward.inventory_policy,
          inventory_management: variant?.inventory_management ?? reward.inventory_management,
          price_cents: priceToCents(variant?.price) ?? reward.price_cents,
          compare_at_cents: priceToCents(variant?.compare_at_price) ?? reward.compare_at_cents,
        };
      } catch (error) {
        console.error("[public/config] Gift availability lookup failed:", error);
        return reward;
      }
    })
  );
}

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
  const publicGamification = {
    ...mergedConfig.layout.gamification,
    rewards: await resolveGiftRewardAvailability(
      shop,
      mergedConfig.layout.gamification.rewards
    ),
  };
  const publicLayout = {
    ...mergedConfig.layout,
    gamification: publicGamification,
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
      gamification: publicGamification,
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
      layout: publicLayout,
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
