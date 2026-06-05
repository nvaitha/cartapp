import { NextRequest, NextResponse } from "next/server";
import { getShopify } from "@/lib/shopify";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_CART_DRAWER_CONFIG } from "@/lib/schemas";

export async function GET(request: NextRequest) {
  const shopify = getShopify();
  const url = request.nextUrl;
  let callbackHeaders: Headers | undefined;
  let session;

  try {
    const callbackResponse = await shopify.auth.callback({ rawRequest: request });
    session = callbackResponse.session;
    if (callbackResponse.headers instanceof Headers) {
      callbackHeaders = callbackResponse.headers;
    }
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json({ error: "OAuth failed" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("cart_drawer_sessions").upsert(
    {
      shop: session.shop,
      access_token: session.accessToken,
      scope: session.scope,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop" }
  );

  await supabase.from("cart_drawer_configs").upsert(
    {
      shop: session.shop,
      ...DEFAULT_CART_DRAWER_CONFIG,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop", ignoreDuplicates: true }
  );

  const host = url.searchParams.get("host") ?? "";
  let redirectUrl: string;

  try {
    redirectUrl = shopify.auth.buildEmbeddedAppUrl(host);
  } catch {
    const storeName = session.shop.replace(".myshopify.com", "");
    redirectUrl = `https://admin.shopify.com/store/${storeName}/apps/${process.env.SHOPIFY_API_KEY?.trim()}`;
  }

  const redirectResponse = NextResponse.redirect(redirectUrl);

  if (callbackHeaders) {
    callbackHeaders.forEach((value, key) => {
      redirectResponse.headers.append(key, value);
    });
  }

  return redirectResponse;
}
