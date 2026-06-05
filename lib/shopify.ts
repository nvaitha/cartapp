import { shopifyApi, ApiVersion, Session } from "@shopify/shopify-api";
import "@shopify/shopify-api/adapters/web-api";

let shopifyClient: ReturnType<typeof shopifyApi> | null = null;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getShopify() {
  if (!shopifyClient) {
    const hostName = requiredEnv("HOST").replace(/https?:\/\//, "");

    shopifyClient = shopifyApi({
      apiKey: requiredEnv("SHOPIFY_API_KEY"),
      apiSecretKey: requiredEnv("SHOPIFY_API_SECRET"),
      scopes: (process.env.SHOPIFY_SCOPES ?? "read_products")
        .trim()
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean),
      hostName,
      apiVersion: ApiVersion.April26,
      isEmbeddedApp: true,
    });
  }

  return shopifyClient;
}

export function adminGraphqlClient(session: Session) {
  return new (getShopify().clients.Graphql)({ session });
}

export async function verifyWebhookHmac(rawBody: string, hmacHeader: string | null) {
  if (!hmacHeader) return false;

  const crypto = await import("crypto");
  const digest = crypto
    .createHmac("sha256", requiredEnv("SHOPIFY_API_SECRET"))
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function decodeSessionToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const payload = await getShopify().session.decodeSessionToken(authHeader.slice(7));
    return { shop: new URL(payload.dest).hostname, dest: payload.dest };
  } catch {
    return null;
  }
}
