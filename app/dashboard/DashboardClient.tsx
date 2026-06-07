"use client";

import "@shopify/polaris/build/esm/styles.css";

import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import type {
  AdminConfigPayload,
  CartDrawerConfigInput,
} from "@/lib/schemas";
import { DEFAULT_CART_DRAWER_CONFIG } from "@/lib/schemas";

type ProductVariantOption = {
  productGid: string;
  productTitle: string;
  productHandle: string | null;
  productStatus?: string | null;
  variantGid: string;
  variantTitle: string | null;
  price: string | null;
  compareAtPrice: string | null;
  imageUrl: string | null;
  available?: boolean;
  inventoryQuantity?: number | null;
  inventoryPolicy?: string | null;
  inventoryManagement?: string | null;
};

type ProductSearchVariant = {
  id: number;
  title: string;
  price: string;
  compare_at_price?: string | null;
  inventory_management?: string | null;
  inventory_policy?: string | null;
  inventory_quantity?: number | null;
};

type ProductSearchProduct = {
  id: number;
  title: string;
  status: string | null;
  images: Array<{ src: string }>;
  variants: ProductSearchVariant[];
};

type ProductSearchPayload = {
  products?: ProductSearchProduct[];
  variants?: ProductVariantOption[];
};

type DrawerLayout = CartDrawerConfigInput["layout"];
type GamificationConfig = NonNullable<DrawerLayout["gamification"]>;
type GamifiedRewardConfig = GamificationConfig["rewards"][number];
type FrequentlyBoughtTogetherConfig = NonNullable<DrawerLayout["frequentlyBoughtTogether"]>;
type FbtProductConfig = FrequentlyBoughtTogetherConfig["products"][number];
type CountryTargetingConfig = GamificationConfig["country_targeting"];

type Props = {
  shop: string;
  host: string;
};

const cloneConfig = (): CartDrawerConfigInput =>
  JSON.parse(JSON.stringify(DEFAULT_CART_DRAWER_CONFIG)) as CartDrawerConfigInput;

function numericVariantId(variantGid: string) {
  return variantGid.split("/").pop() ?? variantGid;
}

function centsToDollarInput(cents: number) {
  const dollars = cents / 100;
  if (!Number.isFinite(dollars)) return "0";
  return Number.isInteger(dollars)
    ? String(dollars)
    : dollars.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function dollarsToCents(value: string) {
  const dollars = Number(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(dollars)) return 0;
  return Math.max(0, Math.round(dollars * 100));
}

function priceToCents(price: string | null) {
  if (!price) return null;
  const amount = Number(price);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function formatProductSearchVariantPrice(variant: ProductSearchVariant) {
  const priceCents = priceToCents(variant.price);
  if (priceCents == null) return "No price";
  return `$${centsToDollarInput(priceCents)}`;
}

function productSearchVariantAvailable(variant: ProductSearchVariant) {
  return (
    !variant.inventory_management ||
    variant.inventory_policy === "continue" ||
    Number(variant.inventory_quantity ?? 0) > 0
  );
}

function variantOptionFromProduct(
  product: ProductSearchProduct,
  variant: ProductSearchVariant
): ProductVariantOption {
  return {
    productGid: `gid://shopify/Product/${product.id}`,
    productTitle: product.title,
    productHandle: null,
    productStatus: product.status,
    variantGid: `gid://shopify/ProductVariant/${variant.id}`,
    variantTitle: variant.title === "Default Title" ? null : variant.title,
    price: variant.price ?? null,
    compareAtPrice: variant.compare_at_price ?? null,
    imageUrl: product.images[0]?.src ?? null,
    available: productSearchVariantAvailable(variant),
    inventoryQuantity: variant.inventory_quantity ?? null,
    inventoryPolicy: variant.inventory_policy ?? null,
    inventoryManagement: variant.inventory_management ?? null,
  };
}

function countryCodesToInput(countries: string[]) {
  return countries.join(", ");
}

function parseCountryCodes(value: string) {
  return value
    .split(/[,\s]+/)
    .map((country) => country.trim().toUpperCase())
    .filter((country) => /^[A-Z]{2}$/.test(country))
    .slice(0, 40);
}

function buildFbtProduct(variant: ProductVariantOption): FbtProductConfig {
  return {
    product_gid: variant.productGid,
    variant_gid: variant.variantGid,
    variant_id: numericVariantId(variant.variantGid),
    title: variant.productTitle,
    variant_title: variant.variantTitle,
    image_url: variant.imageUrl,
    price_cents: priceToCents(variant.price),
    compare_at_cents: priceToCents(variant.compareAtPrice),
    badge_text: null,
    enabled: true,
  };
}

async function getIdToken() {
  const startedAt = Date.now();

  while (!window.shopify?.idToken && Date.now() - startedAt < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const shopify = window.shopify;
  if (!shopify?.idToken) return null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = await Promise.race([
      shopify.idToken(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
    ]);

    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return null;
}

async function adminFetch(path: string, init?: RequestInit) {
  const token = await getIdToken();
  if (!token) throw new Error("Unable to get Shopify session token");

  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

type ProductPickerDropdownProps = {
  label: string;
  helpText: string;
  triggerLabel: string;
  actionLabel: string;
  productType?: string;
  emptyText?: string;
  selectedCount?: number;
  closeOnSelect?: boolean;
  onSelect: (variant: ProductVariantOption) => void;
};

function ProductPickerDropdown({
  label,
  helpText,
  triggerLabel,
  actionLabel,
  productType,
  emptyText = "No products found.",
  selectedCount,
  closeOnSelect = false,
  onSelect,
}: ProductPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState<ProductSearchProduct[]>([]);

  const searchProducts = useCallback(
    async (queryOverride?: string) => {
      const searchQuery = (queryOverride ?? query).trim();
      setSearching(true);
      setHasLoaded(true);
      setError("");

      try {
        const params = new URLSearchParams({
          q: searchQuery,
          limit: "20",
          status: "all",
        });
        if (productType) params.set("product_type", productType);

        const response = await adminFetch(`/api/admin/products/search?${params.toString()}`);
        if (!response.ok) throw new Error(`Product search failed: HTTP ${response.status}`);
        const payload = (await response.json()) as ProductSearchPayload;
        setProducts(payload.products ?? []);
      } catch (searchError) {
        setProducts([]);
        setError(
          searchError instanceof Error ? searchError.message : "Product search failed."
        );
      } finally {
        setSearching(false);
      }
    },
    [productType, query]
  );

  const toggleOpen = useCallback(() => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !hasLoaded && !searching) void searchProducts("");
  }, [hasLoaded, open, searchProducts, searching]);

  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <Text as="h3" variant="headingSm">
            {label}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {helpText}
          </Text>
        </BlockStack>
        <InlineStack gap="200" blockAlign="center">
          {selectedCount != null ? <Badge>{`${selectedCount} selected`}</Badge> : null}
          <Button onClick={toggleOpen}>
            {open ? "Hide" : triggerLabel}
          </Button>
        </InlineStack>
      </InlineStack>

      {open ? (
        <div
          style={{
            border: "1px solid #dfe3e8",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="end">
              <Box width="75%">
                <TextField
                  label="Search products"
                  placeholder="Search products..."
                  value={query}
                  onChange={setQuery}
                  onFocus={() => {
                    if (!hasLoaded && !searching) void searchProducts("");
                  }}
                  autoComplete="off"
                />
              </Box>
              <Button onClick={() => searchProducts()} loading={searching}>
                Search
              </Button>
            </InlineStack>

            {error ? (
              <Text as="p" tone="critical" variant="bodySm">
                {error}
              </Text>
            ) : null}

            {hasLoaded && products.length === 0 && !searching && !error ? (
              <Text as="p" tone="subdued">
                {emptyText}
              </Text>
            ) : null}

            {products.length > 0 ? (
              <BlockStack gap="200">
                {products.map((product) => (
                  <div
                    key={product.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <BlockStack gap="300">
                      <InlineStack gap="300" blockAlign="center">
                        {product.images[0] ? (
                          <Thumbnail
                            alt={product.title}
                            source={product.images[0].src}
                            size="small"
                          />
                        ) : (
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 4,
                              background: "#f1f1f1",
                            }}
                          />
                        )}
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {product.title}
                            </Text>
                            {product.status ? (
                              <Badge tone={product.status === "active" ? "success" : "attention"}>
                                {product.status}
                              </Badge>
                            ) : null}
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Choose the exact variant.
                          </Text>
                        </BlockStack>
                      </InlineStack>

                      {product.variants.length ? (
                        product.variants.map((productVariant) => {
                          const variant = variantOptionFromProduct(product, productVariant);
                          const variantAvailable = productSearchVariantAvailable(productVariant);

                          return (
                            <InlineStack
                              key={productVariant.id}
                              align="space-between"
                              blockAlign="center"
                              gap="300"
                            >
                              <Text as="span" variant="bodySm">
                                {productVariant.title === "Default Title"
                                  ? "Default variant"
                                  : productVariant.title}{" "}
                                - {formatProductSearchVariantPrice(productVariant)}
                              </Text>
                              {!variantAvailable ? <Badge tone="critical">Sold out</Badge> : null}
                              <Button
                                size="slim"
                                disabled={!variantAvailable}
                                onClick={() => {
                                  onSelect(variant);
                                  if (closeOnSelect) setOpen(false);
                                }}
                              >
                                {variantAvailable ? actionLabel : "Unavailable"}
                              </Button>
                            </InlineStack>
                          );
                        })
                      ) : (
                        <Text as="p" tone="subdued" variant="bodySm">
                          No variants found for this product.
                        </Text>
                      )}
                    </BlockStack>
                  </div>
                ))}
              </BlockStack>
            ) : null}
          </BlockStack>
        </div>
      ) : null}
    </BlockStack>
  );
}

export default function DashboardClient({ shop }: Props) {
  const [config, setConfig] = useState<CartDrawerConfigInput>(() => cloneConfig());
  const [status, setStatus] = useState("Waiting for Shopify Admin session");
  const [saving, setSaving] = useState(false);
  const [openRewardIds, setOpenRewardIds] = useState<string[]>(["reward-free-gift"]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    adminFetch("/api/admin/config", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Config load failed: ${response.status}`);
        return response.json() as Promise<AdminConfigPayload>;
      })
      .then((payload) => {
        setConfig({ ...cloneConfig(), ...(payload.config ?? {}) });
        setStatus("Saved settings loaded");
      })
      .catch((error) => {
        if (error.name === "AbortError") setStatus("Config load timed out; using defaults");
        else setStatus(error.message || "Using defaults");
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const updateConfig = useCallback(
    <K extends keyof CartDrawerConfigInput>(key: K, value: CartDrawerConfigInput[K]) => {
      setConfig((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const updateColors = useCallback((key: string, value: string) => {
    setConfig((current) => ({
      ...current,
      colors: { ...current.colors, [key]: value },
    }));
  }, []);

  const updateLayout = useCallback((key: string, value: number) => {
    setConfig((current) => ({
      ...current,
      layout: { ...current.layout, [key]: value },
    }));
  }, []);

  const toggleRewardOpen = useCallback((rewardId: string) => {
    setOpenRewardIds((current) =>
      current.includes(rewardId)
        ? current.filter((id) => id !== rewardId)
        : [...current, rewardId]
    );
  }, []);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setStatus("Saving");

    try {
      const response = await adminFetch("/api/admin/config", {
        method: "POST",
        body: JSON.stringify({
          config: {
            ...config,
            upsells_enabled: false,
          },
          upsells: [],
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? `Save failed: ${response.status}`);
      }
      setStatus("Saved");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [config]);

  const gamification = useMemo<GamificationConfig>(
    () => ({
      ...(DEFAULT_CART_DRAWER_CONFIG.layout.gamification as GamificationConfig),
      ...((config.layout.gamification as Partial<GamificationConfig> | undefined) ?? {}),
      country_targeting: {
        ...(DEFAULT_CART_DRAWER_CONFIG.layout.gamification
          .country_targeting as CountryTargetingConfig),
        ...((config.layout.gamification?.country_targeting as
          | Partial<CountryTargetingConfig>
          | undefined) ?? {}),
      },
      rewards:
        config.layout.gamification?.rewards?.length
          ? (config.layout.gamification.rewards as GamifiedRewardConfig[])
          : (DEFAULT_CART_DRAWER_CONFIG.layout.gamification
              .rewards as GamifiedRewardConfig[]),
    }),
    [config.layout.gamification]
  );

  const frequentlyBoughtTogether = useMemo<FrequentlyBoughtTogetherConfig>(
    () => ({
      ...(DEFAULT_CART_DRAWER_CONFIG.layout
        .frequentlyBoughtTogether as FrequentlyBoughtTogetherConfig),
      ...((config.layout.frequentlyBoughtTogether as
        | Partial<FrequentlyBoughtTogetherConfig>
        | undefined) ?? {}),
      country_targeting: {
        ...(DEFAULT_CART_DRAWER_CONFIG.layout.frequentlyBoughtTogether
          .country_targeting as CountryTargetingConfig),
        ...((config.layout.frequentlyBoughtTogether?.country_targeting as
          | Partial<CountryTargetingConfig>
          | undefined) ?? {}),
      },
      products: config.layout.frequentlyBoughtTogether?.products ?? [],
    }),
    [config.layout.frequentlyBoughtTogether]
  );

  const updateGamification = useCallback((next: Partial<GamificationConfig>) => {
    setConfig((current) => ({
      ...current,
      layout: {
        ...current.layout,
        gamification: {
          ...(DEFAULT_CART_DRAWER_CONFIG.layout.gamification as GamificationConfig),
          ...current.layout.gamification,
          ...next,
        },
      },
    }));
  }, []);

  const updateReward = useCallback(
    <K extends keyof GamifiedRewardConfig>(
      index: number,
      key: K,
      value: GamifiedRewardConfig[K]
    ) => {
      setConfig((current) => {
        const currentGamification = {
          ...(DEFAULT_CART_DRAWER_CONFIG.layout.gamification as GamificationConfig),
          ...current.layout.gamification,
        };
        const rewards =
          currentGamification.rewards?.length
            ? [...currentGamification.rewards]
            : [...DEFAULT_CART_DRAWER_CONFIG.layout.gamification.rewards];
        rewards[index] = { ...rewards[index], [key]: value };

        return {
          ...current,
          layout: {
            ...current.layout,
            gamification: { ...currentGamification, rewards },
          },
        };
      });
    },
    []
  );

  const selectVariantAsRewardGift = useCallback(
    (index: number, variant: ProductVariantOption) => {
      setConfig((current) => {
        const currentGamification = {
          ...(DEFAULT_CART_DRAWER_CONFIG.layout.gamification as GamificationConfig),
          ...current.layout.gamification,
        };
        const rewards =
          currentGamification.rewards?.length
            ? [...currentGamification.rewards]
            : [...DEFAULT_CART_DRAWER_CONFIG.layout.gamification.rewards];

        rewards[index] = {
          ...rewards[index],
          type: "free_gift",
          product_gid: variant.productGid,
          variant_gid: variant.variantGid,
          variant_id: numericVariantId(variant.variantGid),
          product_title: variant.productTitle,
          image_url: variant.imageUrl ?? undefined,
          available: variant.available,
          inventory_quantity: variant.inventoryQuantity,
          inventory_policy: variant.inventoryPolicy,
          inventory_management: variant.inventoryManagement,
          price_cents: priceToCents(variant.price),
          compare_at_cents: priceToCents(variant.compareAtPrice),
          teaser_enabled: true,
        };

        return {
          ...current,
          layout: {
            ...current.layout,
            gamification: { ...currentGamification, rewards },
          },
        };
      });
    },
    []
  );

  const clearRewardGift = useCallback((index: number) => {
    setConfig((current) => {
      const currentGamification = {
        ...(DEFAULT_CART_DRAWER_CONFIG.layout.gamification as GamificationConfig),
        ...current.layout.gamification,
      };
      const rewards =
        currentGamification.rewards?.length
          ? [...currentGamification.rewards]
          : [...DEFAULT_CART_DRAWER_CONFIG.layout.gamification.rewards];

      rewards[index] = {
        ...rewards[index],
        product_gid: undefined,
        variant_gid: undefined,
        variant_id: undefined,
        product_title: undefined,
        image_url: undefined,
        available: undefined,
        inventory_quantity: undefined,
        inventory_policy: undefined,
        inventory_management: undefined,
        price_cents: null,
        compare_at_cents: null,
      };

      return {
        ...current,
        layout: {
          ...current.layout,
          gamification: { ...currentGamification, rewards },
        },
      };
    });
  }, []);

  const updateFrequentlyBoughtTogether = useCallback(
    (next: Partial<FrequentlyBoughtTogetherConfig>) => {
      setConfig((current) => ({
        ...current,
        layout: {
          ...current.layout,
          frequentlyBoughtTogether: {
            ...(DEFAULT_CART_DRAWER_CONFIG.layout
              .frequentlyBoughtTogether as FrequentlyBoughtTogetherConfig),
            ...current.layout.frequentlyBoughtTogether,
            ...next,
          },
        },
      }));
    },
    []
  );

  const addFbtProduct = useCallback((variant: ProductVariantOption) => {
    setConfig((current) => {
      const currentFbt = {
        ...(DEFAULT_CART_DRAWER_CONFIG.layout
          .frequentlyBoughtTogether as FrequentlyBoughtTogetherConfig),
        ...current.layout.frequentlyBoughtTogether,
      };
      const exists = currentFbt.products.some((item) => item.variant_gid === variant.variantGid);
      const products = exists
        ? currentFbt.products
        : [...currentFbt.products, buildFbtProduct(variant)].slice(0, 12);

      return {
        ...current,
        layout: {
          ...current.layout,
          frequentlyBoughtTogether: { ...currentFbt, products, enabled: true },
        },
      };
    });
  }, []);

  const removeFbtProduct = useCallback((index: number) => {
    setConfig((current) => {
      const currentFbt = {
        ...(DEFAULT_CART_DRAWER_CONFIG.layout
          .frequentlyBoughtTogether as FrequentlyBoughtTogetherConfig),
        ...current.layout.frequentlyBoughtTogether,
      };

      return {
        ...current,
        layout: {
          ...current.layout,
          frequentlyBoughtTogether: {
            ...currentFbt,
            products: currentFbt.products.filter((_, itemIndex) => itemIndex !== index),
          },
        },
      };
    });
  }, []);

  return (
    <AppProvider i18n={enTranslations}>
      <Page
        title="LavocDerma Cart Drawer"
        subtitle={shop ? `Managing ${shop}` : "Embedded Shopify admin"}
        primaryAction={{ content: "Save", onAction: saveConfig, loading: saving }}
      >
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Status
                    </Text>
                    <Badge tone={config.enabled ? "success" : "critical"}>
                      {config.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </InlineStack>
                  <Checkbox
                    label="Enable storefront drawer"
                    checked={config.enabled}
                    onChange={(value) => updateConfig("enabled", value)}
                  />
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {status}
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Copy
                  </Text>
                  <TextField
                    label="Drawer title"
                    value={config.drawer_title}
                    onChange={(value) => updateConfig("drawer_title", value)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Empty title"
                    value={config.empty_title}
                    onChange={(value) => updateConfig("empty_title", value)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Empty body"
                    value={config.empty_body}
                    onChange={(value) => updateConfig("empty_body", value)}
                    autoComplete="off"
                    multiline={3}
                  />
                  <InlineStack gap="400">
                    <Box width="48%">
                      <TextField
                        label="Checkout button"
                        value={config.checkout_button_text}
                        onChange={(value) => updateConfig("checkout_button_text", value)}
                        autoComplete="off"
                      />
                    </Box>
                    <Box width="48%">
                      <TextField
                        label="Continue shopping"
                        value={config.continue_shopping_text}
                        onChange={(value) => updateConfig("continue_shopping_text", value)}
                        autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Free shipping
                  </Text>
                  <Checkbox
                    label="Show free shipping progress"
                    checked={config.free_shipping_enabled}
                    onChange={(value) => updateConfig("free_shipping_enabled", value)}
                  />
                  <TextField
                    label="Free shipping threshold"
                    prefix="$"
                    type="number"
                    value={centsToDollarInput(config.free_shipping_threshold_cents)}
                    onChange={(value) =>
                      updateConfig("free_shipping_threshold_cents", dollarsToCents(value))
                    }
                    autoComplete="off"
                  />
                  <TextField
                    label="Progress message"
                    value={config.free_shipping_message}
                    onChange={(value) => updateConfig("free_shipping_message", value)}
                    autoComplete="off"
                  />
                  <TextField
                    label="Success message"
                    value={config.free_shipping_success_message}
                    onChange={(value) => updateConfig("free_shipping_success_message", value)}
                    autoComplete="off"
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Gamified rewards
                    </Text>
                    <Checkbox
                      label="Enable"
                      checked={gamification.enabled}
                      onChange={(value) => updateGamification({ enabled: value })}
                    />
                  </InlineStack>
                  <TextField
                    label="Cart header text"
                    value={gamification.header_text}
                    onChange={(value) => updateGamification({ header_text: value })}
                    autoComplete="off"
                  />
                  <InlineStack gap="400" blockAlign="end">
                    <Box width="48%">
                      <TextField
                        label="Timer text"
                        value={gamification.timer_text}
                        onChange={(value) => updateGamification({ timer_text: value })}
                        autoComplete="off"
                      />
                    </Box>
                    <Box width="24%">
                      <TextField
                        label="Timer minutes"
                        type="number"
                        value={String(gamification.timer_minutes)}
                        onChange={(value) =>
                          updateGamification({ timer_minutes: Number(value) || 5 })
                        }
                        autoComplete="off"
                      />
                    </Box>
                    <Checkbox
                      label="Show timer"
                      checked={gamification.timer_enabled}
                      onChange={(value) => updateGamification({ timer_enabled: value })}
                    />
                  </InlineStack>
                  <Checkbox
                    label="Treat subscription carts as already having free shipping and gifts"
                    checked={gamification.subscription_perks_included}
                    onChange={(value) =>
                      updateGamification({ subscription_perks_included: value })
                    }
                  />
                  <TextField
                    label="Subscription perk message"
                    value={gamification.subscription_message}
                    onChange={(value) => updateGamification({ subscription_message: value })}
                    autoComplete="off"
                  />
                  <Divider />
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Country targeting
                    </Text>
                    <InlineStack gap="400" blockAlign="end">
                      <Checkbox
                        label="Target specific countries"
                        checked={gamification.country_targeting.enabled}
                        onChange={(value) =>
                          updateGamification({
                            country_targeting: {
                              ...gamification.country_targeting,
                              enabled: value,
                            },
                          })
                        }
                      />
                      <Select
                        label="Mode"
                        value={gamification.country_targeting.mode}
                        options={[
                          { label: "Show only these countries", value: "include" },
                          { label: "Hide from these countries", value: "exclude" },
                        ]}
                        onChange={(value) =>
                          updateGamification({
                            country_targeting: {
                              ...gamification.country_targeting,
                              mode: value as CountryTargetingConfig["mode"],
                            },
                          })
                        }
                      />
                    </InlineStack>
                    <TextField
                      label="Country codes"
                      value={countryCodesToInput(gamification.country_targeting.countries)}
                      onChange={(value) =>
                        updateGamification({
                          country_targeting: {
                            ...gamification.country_targeting,
                            countries: parseCountryCodes(value),
                          },
                        })
                      }
                      helpText="Use ISO country codes, for example AU, US, NZ. Leave empty to show everywhere."
                      autoComplete="off"
                    />
                  </BlockStack>
                  <Divider />
                  {gamification.rewards.map((reward, index) => {
                    const rewardOpen = openRewardIds.includes(reward.id);
                    const rewardTypeLabel =
                      reward.type === "free_gift"
                        ? "Free gift"
                        : reward.type === "free_shipping"
                          ? "Free shipping"
                          : reward.type === "discount"
                            ? "Discount"
                            : "Custom reward";

                    return (
                      <div
                        key={reward.id}
                        style={{
                          border: "1px solid #dfe3e8",
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleRewardOpen(reward.id)}
                          style={{
                            width: "100%",
                            border: 0,
                            background: "#fff",
                            cursor: "pointer",
                            padding: 16,
                            textAlign: "left",
                          }}
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="300" blockAlign="center">
                              <Text as="span" variant="headingSm">
                                {`Reward ${index + 1} - ${reward.title}`}
                              </Text>
                              <Badge>{rewardTypeLabel}</Badge>
                              <Badge>{`$${centsToDollarInput(reward.threshold_cents)}`}</Badge>
                              {reward.type === "free_gift" ? (
                                <Badge tone={reward.variant_id ? "success" : "attention"}>
                                  {reward.variant_id ? "Gift selected" : "Needs gift"}
                                </Badge>
                              ) : null}
                              <Badge tone={reward.enabled ? "success" : "attention"}>
                                {reward.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                            </InlineStack>
                            <Text as="span" tone="subdued">
                              {rewardOpen ? "Hide" : "Edit"}
                            </Text>
                          </InlineStack>
                        </button>

                        {rewardOpen ? (
                          <div style={{ borderTop: "1px solid #dfe3e8", padding: 16 }}>
                            <BlockStack gap="300">
                              <InlineStack align="space-between" blockAlign="center">
                                <Checkbox
                                  label="Enabled"
                                  checked={reward.enabled}
                                  onChange={(value) => updateReward(index, "enabled", value)}
                                />
                              </InlineStack>
                              <InlineStack gap="300">
                                <Box width="30%">
                                  <Select
                                    label="Reward type"
                                    value={reward.type}
                                    options={[
                                      { label: "Free gift", value: "free_gift" },
                                      { label: "Free shipping", value: "free_shipping" },
                                      { label: "Discount", value: "discount" },
                                      { label: "Custom reward", value: "custom" },
                                    ]}
                                    onChange={(value) =>
                                      updateReward(
                                        index,
                                        "type",
                                        value as GamifiedRewardConfig["type"]
                                      )
                                    }
                                  />
                                </Box>
                                <Box width="30%">
                                  <TextField
                                    label="Spend goal"
                                    prefix="$"
                                    type="number"
                                    value={centsToDollarInput(reward.threshold_cents)}
                                    onChange={(value) =>
                                      updateReward(
                                        index,
                                        "threshold_cents",
                                        dollarsToCents(value)
                                      )
                                    }
                                    autoComplete="off"
                                  />
                                </Box>
                                <Box width="30%">
                                  <TextField
                                    label="Reward title"
                                    value={reward.title}
                                    onChange={(value) => updateReward(index, "title", value)}
                                    autoComplete="off"
                                  />
                                </Box>
                              </InlineStack>
                              <InlineStack gap="300">
                                <Box width="20%">
                                  <TextField
                                    label="Icon"
                                    value={reward.icon ?? ""}
                                    onChange={(value) => updateReward(index, "icon", value)}
                                    autoComplete="off"
                                  />
                                </Box>
                                <Box width="38%">
                                  <TextField
                                    label="Before goal text"
                                    value={reward.before_text}
                                    onChange={(value) =>
                                      updateReward(index, "before_text", value)
                                    }
                                    autoComplete="off"
                                  />
                                </Box>
                                <Box width="38%">
                                  <TextField
                                    label="After goal text"
                                    value={reward.after_text}
                                    onChange={(value) => updateReward(index, "after_text", value)}
                                    autoComplete="off"
                                  />
                                </Box>
                              </InlineStack>
                              {reward.type === "free_gift" ? (
                                <BlockStack gap="300">
                                  {reward.product_title ? (
                                    <InlineStack align="space-between" blockAlign="center">
                                      <InlineStack gap="300" blockAlign="center">
                                        <Thumbnail
                                          alt={reward.product_title}
                                          source={reward.image_url || ""}
                                          size="small"
                                        />
                                        <BlockStack gap="100">
                                          <Text as="p" variant="bodyMd">
                                            {reward.product_title}
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            Variant {reward.variant_id}
                                          </Text>
                                          <InlineStack gap="200">
                                            {reward.available === false ? (
                                              <Badge tone="critical">Sold out</Badge>
                                            ) : null}
                                            {reward.price_cents && reward.price_cents > 0 ? (
                                              <Badge tone="attention">
                                                {`Price $${centsToDollarInput(reward.price_cents)}`}
                                              </Badge>
                                            ) : (
                                              <Badge tone="success">$0 variant</Badge>
                                            )}
                                          </InlineStack>
                                        </BlockStack>
                                      </InlineStack>
                                      <Button
                                        tone="critical"
                                        onClick={() => {
                                          clearRewardGift(index);
                                          setStatus(`Gift R${index + 1} removed`);
                                        }}
                                      >
                                        Remove gift
                                      </Button>
                                    </InlineStack>
                                  ) : null}

                                  <ProductPickerDropdown
                                    label="Select free gifts"
                                    helpText="Only Shopify products with Product type free_gift appear here. Use a dedicated $0 gift variant."
                                    triggerLabel={
                                      reward.variant_id ? "Change gift" : "Select free products"
                                    }
                                    actionLabel="Select gift"
                                    productType="free_gift"
                                    closeOnSelect
                                    emptyText="No gift products found. Set the Shopify product Type to free_gift, keep it active, and make sure the gift variant is available."
                                    onSelect={(variant) => {
                                      selectVariantAsRewardGift(index, variant);
                                      setStatus(`Gift R${index + 1} selected`);
                                    }}
                                  />
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Checkout will only price the gift at $0 if the selected
                                    variant is priced at $0, or an automatic discount/Shopify
                                    Function makes that variant free.
                                  </Text>
                                  <TextField
                                    label="Gift discount code"
                                    value={reward.discount_code ?? ""}
                                    onChange={(value) =>
                                      updateReward(index, "discount_code", value)
                                    }
                                    helpText="Create a Shopify discount that makes this gift variant free, then enter its code here. The drawer will apply it when checkout starts."
                                    autoComplete="off"
                                  />

                                  <InlineStack gap="300">
                                    <Box width="48%">
                                      <TextField
                                        label="Teaser heading"
                                        value={reward.teaser_heading ?? ""}
                                        onChange={(value) =>
                                          updateReward(index, "teaser_heading", value)
                                        }
                                        autoComplete="off"
                                      />
                                    </Box>
                                    <Box width="48%">
                                      <TextField
                                        label="Teaser subheading"
                                        value={reward.teaser_subheading ?? ""}
                                        onChange={(value) =>
                                          updateReward(index, "teaser_subheading", value)
                                        }
                                        autoComplete="off"
                                      />
                                    </Box>
                                  </InlineStack>
                                </BlockStack>
                              ) : null}
                              {reward.type === "discount" ? (
                                <TextField
                                  label="Discount code or label"
                                  value={reward.discount_code ?? ""}
                                  onChange={(value) =>
                                    updateReward(index, "discount_code", value)
                                  }
                                  autoComplete="off"
                                />
                              ) : null}
                              {reward.type === "custom" ? (
                                <TextField
                                  label="Custom reward label"
                                  value={reward.custom_label ?? ""}
                                  onChange={(value) =>
                                    updateReward(index, "custom_label", value)
                                  }
                                  autoComplete="off"
                                />
                              ) : null}
                            </BlockStack>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Design
                  </Text>
                  <InlineStack gap="400">
                    <Box width="30%">
                      <TextField
                        label="Accent"
                        value={String(config.colors.accent ?? "#7c6243")}
                        onChange={(value) => updateColors("accent", value)}
                        autoComplete="off"
                      />
                    </Box>
                    <Box width="30%">
                      <TextField
                        label="Background"
                        value={String(config.colors.background ?? "#fffaf4")}
                        onChange={(value) => updateColors("background", value)}
                        autoComplete="off"
                      />
                    </Box>
                    <Box width="30%">
                      <TextField
                        label="Text"
                        value={String(config.colors.text ?? "#1f2933")}
                        onChange={(value) => updateColors("text", value)}
                        autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                  <InlineStack gap="400">
                    <Box width="30%">
                      <TextField
                        label="Border radius"
                        type="number"
                        value={String(config.layout.borderRadius ?? 8)}
                        onChange={(value) => updateLayout("borderRadius", Number(value) || 0)}
                        autoComplete="off"
                      />
                    </Box>
                    <Box width="30%">
                      <TextField
                        label="Drawer width"
                        type="number"
                        value={String(config.layout.drawerWidth ?? 440)}
                        onChange={(value) => updateLayout("drawerWidth", Number(value) || 440)}
                        autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Frequently bought together
                    </Text>
                    <Checkbox
                      label="Enable"
                      checked={frequentlyBoughtTogether.enabled}
                      onChange={(value) => updateFrequentlyBoughtTogether({ enabled: value })}
                    />
                  </InlineStack>
                  <TextField
                    label="Section heading"
                    value={frequentlyBoughtTogether.heading}
                    onChange={(value) => updateFrequentlyBoughtTogether({ heading: value })}
                    autoComplete="off"
                  />
                  <InlineStack gap="400">
                    <Box width="30%">
                      <TextField
                        label="Products displayed"
                        type="number"
                        value={String(frequentlyBoughtTogether.display_limit)}
                        onChange={(value) =>
                          updateFrequentlyBoughtTogether({
                            display_limit: Number(value) || 4,
                          })
                        }
                        autoComplete="off"
                      />
                    </Box>
                    <Box width="30%">
                      <TextField
                        label="Add button text"
                        value={frequentlyBoughtTogether.add_button_text}
                        onChange={(value) =>
                          updateFrequentlyBoughtTogether({ add_button_text: value })
                        }
                        autoComplete="off"
                      />
                    </Box>
                    <Box width="30%">
                      <TextField
                        label="Details text"
                        value={frequentlyBoughtTogether.details_text}
                        onChange={(value) =>
                          updateFrequentlyBoughtTogether({ details_text: value })
                        }
                        autoComplete="off"
                      />
                    </Box>
                  </InlineStack>
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingSm">
                      Country targeting
                    </Text>
                    <InlineStack gap="400" blockAlign="end">
                      <Checkbox
                        label="Target specific countries"
                        checked={frequentlyBoughtTogether.country_targeting.enabled}
                        onChange={(value) =>
                          updateFrequentlyBoughtTogether({
                            country_targeting: {
                              ...frequentlyBoughtTogether.country_targeting,
                              enabled: value,
                            },
                          })
                        }
                      />
                      <Select
                        label="Mode"
                        value={frequentlyBoughtTogether.country_targeting.mode}
                        options={[
                          { label: "Show only these countries", value: "include" },
                          { label: "Hide from these countries", value: "exclude" },
                        ]}
                        onChange={(value) =>
                          updateFrequentlyBoughtTogether({
                            country_targeting: {
                              ...frequentlyBoughtTogether.country_targeting,
                              mode: value as CountryTargetingConfig["mode"],
                            },
                          })
                        }
                      />
                    </InlineStack>
                    <TextField
                      label="Country codes"
                      value={countryCodesToInput(
                        frequentlyBoughtTogether.country_targeting.countries
                      )}
                      onChange={(value) =>
                        updateFrequentlyBoughtTogether({
                          country_targeting: {
                            ...frequentlyBoughtTogether.country_targeting,
                            countries: parseCountryCodes(value),
                          },
                        })
                      }
                      helpText="Use ISO country codes, for example AU, US, NZ. Leave empty to show everywhere."
                      autoComplete="off"
                    />
                  </BlockStack>
                  <ProductPickerDropdown
                    label="Add recommendation"
                    helpText="Search products and choose the exact variant to recommend in the cart drawer."
                    triggerLabel="Add product"
                    actionLabel="Add product"
                    selectedCount={frequentlyBoughtTogether.products.length}
                    onSelect={(variant) => {
                      addFbtProduct(variant);
                      setStatus(`${variant.productTitle} added to frequently bought together`);
                    }}
                  />
                  <Divider />
                  {frequentlyBoughtTogether.products.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No frequently bought together products selected.
                    </Text>
                  ) : (
                    frequentlyBoughtTogether.products.map((item, index) => (
                      <InlineStack key={`${item.variant_gid}-${index}`} align="space-between">
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail alt={item.title} source={item.image_url || ""} size="small" />
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd">
                              {item.title}
                            </Text>
                            <Text as="p" tone="subdued">
                              {item.price_cents == null
                                ? "No price saved"
                                : `$${centsToDollarInput(item.price_cents)}`}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button tone="critical" onClick={() => removeFbtProduct(index)}>
                          Remove
                        </Button>
                      </InlineStack>
                    ))
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Live preview
                </Text>
                <Box
                  background="bg-surface-secondary"
                  borderRadius="300"
                  padding="400"
                >
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="h3" variant="headingMd">
                        {gamification.enabled ? gamification.header_text : config.drawer_title}
                      </Text>
                      <Badge>{config.enabled ? "On" : "Off"}</Badge>
                    </InlineStack>
                    {gamification.enabled && gamification.timer_enabled ? (
                      <Box background="bg-fill-success-secondary" borderRadius="200" padding="200">
                        <Text as="p">
                          {`${gamification.timer_text} ${gamification.timer_minutes}:00`}
                        </Text>
                      </Box>
                    ) : null}
                    {gamification.enabled ? (
                      <BlockStack gap="100">
                        <Text as="p" variant="headingSm">
                          Reward ladder
                        </Text>
                        {gamification.rewards
                          .filter((reward) => reward.enabled)
                          .slice(0, 4)
                          .map((reward) => (
                            <InlineStack key={reward.id} align="space-between">
                              <Text as="p">{`${reward.icon ?? ""} ${reward.title}`}</Text>
                              <Badge>{`$${centsToDollarInput(reward.threshold_cents)}`}</Badge>
                            </InlineStack>
                          ))}
                      </BlockStack>
                    ) : null}
                    <Text as="p" tone="subdued">
                      {config.empty_title}
                    </Text>
                    <Text as="p" tone="subdued">
                      {config.empty_body}
                    </Text>
                    {config.free_shipping_enabled ? (
                      <Box background="bg-fill-success-secondary" borderRadius="200" padding="300">
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone="success">✓</Badge>
                            <Text as="p" variant="bodyMd">
                              {config.free_shipping_success_message}
                            </Text>
                          </InlineStack>
                          <Text as="p" tone="subdued">
                            {`Spend $${centsToDollarInput(
                              config.free_shipping_threshold_cents
                            )} to unlock free shipping`}
                          </Text>
                          <div
                            aria-hidden="true"
                            style={{
                              background: "rgba(22, 163, 74, 0.18)",
                              borderRadius: 999,
                              height: 8,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                background: "#16a34a",
                                height: "100%",
                                width: "100%",
                              }}
                            />
                          </div>
                        </BlockStack>
                      </Box>
                    ) : null}
                    {frequentlyBoughtTogether.enabled &&
                    frequentlyBoughtTogether.products.length ? (
                      <BlockStack gap="200">
                        <Text as="p" variant="headingSm">
                          {frequentlyBoughtTogether.heading}
                        </Text>
                        {frequentlyBoughtTogether.products
                          .slice(0, frequentlyBoughtTogether.display_limit)
                          .map((item) => (
                            <InlineStack key={item.variant_gid} align="space-between">
                              <Text as="p">{item.title}</Text>
                              <Badge>{frequentlyBoughtTogether.add_button_text}</Badge>
                            </InlineStack>
                          ))}
                      </BlockStack>
                    ) : null}
                    <Button fullWidth>{config.checkout_button_text}</Button>
                  </BlockStack>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
    };
  }
}
