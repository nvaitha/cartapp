import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getShopSession } from "@/lib/auth-helper";
import { adminRestClient } from "@/lib/shopify";

type RestVariant = {
  id: number;
  title: string;
  price: string;
  compare_at_price?: string | null;
};

type RestProduct = {
  id: number;
  title: string;
  status?: string;
  images?: Array<{ src: string }>;
  variants?: RestVariant[];
};

type ProductSearchProduct = {
  id: number;
  title: string;
  status: string | null;
  images: Array<{ src: string }>;
  variants: RestVariant[];
};

type RestProductsResponse = {
  products?: RestProduct[];
};

function requestedLimit(request: NextRequest) {
  const parsed = parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : 20;
}

function requestedStatuses(request: NextRequest) {
  const statusParam = request.nextUrl.searchParams.get("status") ?? "all";
  const allowedStatuses = ["active", "draft", "archived"];

  if (statusParam === "all") return allowedStatuses;
  if (allowedStatuses.includes(statusParam)) return [statusParam];
  return allowedStatuses;
}

function productMatchesQuery(product: RestProduct, query: string) {
  if (!query) return true;

  const normalizedQuery = query.toLowerCase();
  const titleMatches = String(product.title ?? "").toLowerCase().includes(normalizedQuery);
  const variantMatches = (product.variants ?? []).some((variant) =>
    String(variant.title ?? "").toLowerCase().includes(normalizedQuery)
  );

  return titleMatches || variantMatches;
}

function normalizeProduct(product: RestProduct): ProductSearchProduct {
  return {
    id: product.id,
    title: product.title,
    status: product.status ?? null,
    images: product.images ?? [],
    variants: product.variants ?? [],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const session = await getShopSession(auth.shop);
  if (!session) {
    return NextResponse.json({ error: "Shop session not found" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = requestedLimit(request);
  const statuses = requestedStatuses(request);
  const fetchLimit = q ? "250" : String(limit);

  try {
    const client = adminRestClient(session);
    const responses = await Promise.all(
      statuses.map((status) =>
        client.get({
          path: "products",
          query: {
            limit: fetchLimit,
            fields: "id,title,variants,images,status",
            status,
          },
        })
      )
    );

    const productsById = new Map<number, RestProduct>();
    for (const response of responses) {
      const products = ((response.body as RestProductsResponse).products ?? []).filter(
        (product) => product.id && product.title
      );
      for (const product of products) {
        productsById.set(product.id, product);
      }
    }

    const products = Array.from(productsById.values())
      .filter((product) => productMatchesQuery(product, q))
      .slice(0, limit)
      .map(normalizeProduct);

    const variants = products.flatMap((product) =>
      product.variants.map((variant) => ({
        productGid: `gid://shopify/Product/${product.id}`,
        productTitle: product.title,
        productHandle: null,
        productStatus: product.status,
        variantGid: `gid://shopify/ProductVariant/${variant.id}`,
        variantTitle: variant.title === "Default Title" ? null : variant.title,
        price: variant.price ?? null,
        compareAtPrice: variant.compare_at_price ?? null,
        imageUrl: product.images[0]?.src ?? null,
      }))
    );

    return NextResponse.json({ products, variants });
  } catch (error) {
    console.error("Product search failed:", error);
    return NextResponse.json({ error: "Product search failed" }, { status: 500 });
  }
}
