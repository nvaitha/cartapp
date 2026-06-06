import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getShopSession } from "@/lib/auth-helper";
import { adminGraphqlClient } from "@/lib/shopify";

type ProductSearchResponse = {
  data?: {
    products?: {
      nodes?: Array<{
        id: string;
        title: string;
        handle?: string | null;
        featuredImage?: { url?: string | null } | null;
        variants?: {
          nodes?: Array<{
            id: string;
            title: string;
            price?: string | null;
            compareAtPrice?: string | null;
          }>;
        };
      }>;
    };
  };
};

const PRODUCT_SEARCH_QUERY = `#graphql
  query CartDrawerProductSearch($query: String) {
    products(first: 20, query: $query, sortKey: TITLE) {
      nodes {
        id
        title
        handle
        featuredImage {
          url
        }
        variants(first: 20) {
          nodes {
            id
            title
            price
            compareAtPrice
          }
        }
      }
    }
  }
`;

function sanitizeProductSearchQuery(query: string) {
  return query.replace(/[\\"]/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchProductVariants(
  session: NonNullable<Awaited<ReturnType<typeof getShopSession>>>,
  query: string | null
) {
  const client = adminGraphqlClient(session);
  const response = (await client.query({
    data: {
      query: PRODUCT_SEARCH_QUERY,
      variables: { query },
    },
  })) as ProductSearchResponse;

  return (
    response.data?.products?.nodes?.flatMap((product) =>
      (product.variants?.nodes ?? []).map((variant) => ({
        productGid: product.id,
        productTitle: product.title,
        productHandle: product.handle ?? null,
        variantGid: variant.id,
        variantTitle: variant.title === "Default Title" ? null : variant.title,
        price: variant.price ?? null,
        compareAtPrice: variant.compareAtPrice ?? null,
        imageUrl: product.featuredImage?.url ?? null,
      }))
    ) ?? []
  );
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const query = sanitizeProductSearchQuery(request.nextUrl.searchParams.get("q") ?? "");

  const session = await getShopSession(auth.shop);
  if (!session) {
    return NextResponse.json({ error: "Shop session not found" }, { status: 401 });
  }

  try {
    let variants = await fetchProductVariants(session, query || null);

    if (query && variants.length === 0) {
      variants = await fetchProductVariants(session, null);
    }

    return NextResponse.json({ variants });
  } catch (error) {
    console.error("Product search failed:", error);
    return NextResponse.json({ error: "Product search failed" }, { status: 500 });
  }
}
