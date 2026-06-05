import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookHmac } from "@/lib/shopify";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const hmacHeader = request.headers.get("X-Shopify-Hmac-Sha256");
  const rawBody = await request.text();
  const valid = await verifyWebhookHmac(rawBody, hmacHeader);

  if (!valid) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }

  let payload: { domain?: string; myshopify_domain?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shop = payload.myshopify_domain ?? payload.domain;
  if (!shop) {
    return NextResponse.json({ error: "Missing shop domain" }, { status: 400 });
  }

  await getSupabaseAdmin().from("cart_drawer_sessions").delete().eq("shop", shop);
  return NextResponse.json({ success: true });
}
