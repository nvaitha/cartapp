import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getShopSession } from "@/lib/auth-helper";
import { adminGraphqlClient } from "@/lib/shopify";

type ProductSearchResponse = {
  data?: {
    products?: {
      nodes?: Array<{
        id: string;
        title: string;
        featuredImage?: { url?: string | null } | null;
        variants?: {
          nodes?: Array<{
            id: string;
            title: string;
            price: string;
          }>;
        };
      }>;
    };
  };
};

const PRODUCT_SEARCH_QUERY = `#graphql
  query CartDrawerProductSearch($query: String!) {
    products(first: 10, query: $query) {
      nodes {
        id
        title
        featuredImage {
          url
        }
        variants(first: 20) {
          nodes {
            id
            title
            price
          }
        }
      }
    }
  }
`;

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ variants: [] });

  const session = await getShopSession(auth.shop);
  if (!session) {
    return NextResponse.json({ error: "Shop session not found" }, { status: 401 });
  }

  try {
    const client = adminGraphqlClient(session);
    const response = (await client.query({
      data: {
        query: PRODUCT_SEARCH_QUERY,
        variables: { query: `title:*${query}*` },
      },
    })) as ProductSearchResponse;

    const variants =
      response.data?.products?.nodes?.flatMap((product) =>
        (product.variants?.nodes ?? []).map((variant) => ({
          productGid: product.id,
          productTitle: product.title,
          variantGid: variant.id,
          variantTitle: variant.title === "Default Title" ? null : variant.title,
          price: variant.price,
          imageUrl: product.featuredImage?.url ?? null,
        }))
      ) ?? [];

    return NextResponse.json({ variants });
  } catch (error) {
    console.error("Product search failed:", error);
    return NextResponse.json({ error: "Product search failed" }, { status: 500 });
  }
}
