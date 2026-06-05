import { NextRequest, NextResponse } from "next/server";
import { getShopify } from "@/lib/shopify";

export async function GET(request: NextRequest) {
  const shopify = getShopify();
  const shop = request.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
  }

  const sanitisedShop = shopify.utils.sanitizeShop(shop, true);
  if (!sanitisedShop) {
    return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
  }

  return shopify.auth.begin({
    shop: sanitisedShop,
    callbackPath: "/api/auth/callback",
    isOnline: false,
    rawRequest: request,
  }) as unknown as Response;
}
