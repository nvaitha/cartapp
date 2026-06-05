import { Session } from "@shopify/shopify-api";
import { NextRequest, NextResponse } from "next/server";
import { decodeSessionToken } from "@/lib/shopify";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function requireAuth(request: NextRequest): Promise<{ shop: string } | NextResponse> {
  const payload = await decodeSessionToken(request.headers.get("Authorization"));

  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("cart_drawer_sessions")
    .select("shop")
    .eq("shop", payload.shop)
    .single();

  if (!data) {
    return NextResponse.json({ error: "Shop not found" }, { status: 401 });
  }

  return { shop: payload.shop };
}

export async function getShopSession(shop: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("cart_drawer_sessions")
    .select("shop, access_token, scope")
    .eq("shop", shop)
    .single();

  if (error || !data) return null;

  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state: "",
    isOnline: false,
  });
  session.accessToken = data.access_token;
  session.scope = data.scope ?? "";

  return session;
}
