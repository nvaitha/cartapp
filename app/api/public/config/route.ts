import { NextRequest, NextResponse } from "next/server";
import { getShopSession } from "@/lib/auth-helper";
import { getSupabaseAdmin } from "@/lib/supabase";
import { adminGraphqlClient } from "@/lib/shopify";
import { DEFAULT_CART_DRAWER_CONFIG, type CartDrawerConfigInput } from "@/lib/schemas";

type ConfigRow = CartDrawerConfigInput & {
  colors: Record<string, unknown> | null;
  typography: Record<string, unknown> | null;
  layout: Record<string, unknown> | null;
};

type UpsellRow = {
  product_gid: string;
  variant_gid: string;
  title_override: string | null;
  badge_text: string | null;
  enabled: boolean;
};

type ProductLookupResponse = {
  data?: {
    product?: {
      title: string;
      featuredImage?: { url?: string | null } | null;
    } | null;
  };
};

function gidToNumeric(gid: string) {
  return gid.split("/").pop() ?? gid;
}

async function resolveUpsell(shop: string, upsell: UpsellRow) {
  const fallback = {
    variantId: gidToNumeric(upsell.variant_gid),
    title: upsell.title_override ?? "Recommended add-on",
    variantTitle: null,
    priceCents: null,
    imageUrl: null,
    badgeText: upsell.badge_text,
  };

  const session = await getShopSession(shop);
  if (!session) return fallback;

  try {
    const response = (await adminGraphqlClient(session).query({
      data: {
        query: `#graphql
          query CartDrawerUpsell($productId: ID!) {
            product(id: $productId) {
              title
              featuredImage {
                url
              }
              variants(first: 100) {
                nodes {
                  id
                  title
                  price
                }
              }
            }
          }
        `,
        variables: { productId: upsell.product_gid },
      },
    })) as ProductLookupResponse & {
      data?: {
        product?: {
          variants?: { nodes?: Array<{ id: string; title: string; price: string }> };
        } | null;
      };
    };

    const product = response.data?.product;
    const variant = product?.variants?.nodes?.find((item) => item.id === upsell.variant_gid);
    const priceCents = variant?.price ? Math.round(Number(variant.price) * 100) : null;

    return {
      ...fallback,
      title: upsell.title_override || product?.title || fallback.title,
      variantTitle: variant?.title && variant.title !== "Default Title" ? variant.title : null,
      priceCents,
      imageUrl: product?.featuredImage?.url ?? null,
    };
  } catch (error) {
    console.error("[public/config] Upsell lookup failed:", error);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop")?.trim();
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from("sessions")
    .select("shop")
    .eq("shop", shop)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const [{ data: configData }, { data: upsellsData }] = await Promise.all([
    supabase.from("cart_drawer_configs").select("*").eq("shop", shop).single(),
    supabase
      .from("cart_drawer_upsells")
      .select("product_gid, variant_gid, title_override, badge_text, enabled")
      .eq("shop", shop)
      .eq("enabled", true)
      .order("sort_order"),
  ]);

  const config = configData as ConfigRow | null;
  const mergedConfig = {
    ...DEFAULT_CART_DRAWER_CONFIG,
    ...(config ?? {}),
    colors: { ...DEFAULT_CART_DRAWER_CONFIG.colors, ...(config?.colors ?? {}) },
    typography: {
      ...DEFAULT_CART_DRAWER_CONFIG.typography,
      ...(config?.typography ?? {}),
    },
    layout: { ...DEFAULT_CART_DRAWER_CONFIG.layout, ...(config?.layout ?? {}) },
  };

  const upsells = mergedConfig.upsells_enabled
    ? await Promise.all(((upsellsData ?? []) as UpsellRow[]).map((upsell) => resolveUpsell(shop, upsell)))
    : [];

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
      freeShipping: {
        enabled: mergedConfig.free_shipping_enabled,
        thresholdCents: mergedConfig.free_shipping_threshold_cents,
        message: mergedConfig.free_shipping_message,
        successMessage: mergedConfig.free_shipping_success_message,
      },
      upsellsHeading: mergedConfig.upsell_heading,
      upsells,
      colors: mergedConfig.colors,
      typography: mergedConfig.typography,
      layout: mergedConfig.layout,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
