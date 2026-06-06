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
  CartDrawerUpsellInput,
} from "@/lib/schemas";
import { DEFAULT_CART_DRAWER_CONFIG } from "@/lib/schemas";

type ProductVariantOption = {
  productGid: string;
  productTitle: string;
  variantGid: string;
  variantTitle: string | null;
  price: string | null;
  imageUrl: string | null;
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
    compare_at_cents: null,
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

export default function DashboardClient({ shop }: Props) {
  const [config, setConfig] = useState<CartDrawerConfigInput>(() => cloneConfig());
  const [upsells, setUpsells] = useState<CartDrawerUpsellInput[]>([]);
  const [status, setStatus] = useState("Waiting for Shopify Admin session");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductVariantOption[]>([]);

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
        setUpsells(payload.upsells ?? []);
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

  const searchProducts = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setStatus("Searching products");

    try {
      const response = await adminFetch(`/api/admin/products/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);
      const payload = (await response.json()) as { variants: ProductVariantOption[] };
      setSearchResults(payload.variants);
      setStatus(`${payload.variants.length} variants found`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [query]);

  const addUpsell = useCallback((variant: ProductVariantOption) => {
    setUpsells((current) => [
      ...current,
      {
        sort_order: current.length,
        product_gid: variant.productGid,
        variant_gid: variant.variantGid,
        title_override: variant.productTitle,
        badge_text: "Add-on",
        enabled: true,
      },
    ]);
  }, []);

  const moveUpsell = useCallback((index: number, direction: -1 | 1) => {
    setUpsells((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy.map((upsell, sort_order) => ({ ...upsell, sort_order }));
    });
  }, []);

  const removeUpsell = useCallback((index: number) => {
    setUpsells((current) =>
      current
        .filter((_, itemIndex) => itemIndex !== index)
        .map((upsell, sort_order) => ({ ...upsell, sort_order }))
    );
  }, []);

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setStatus("Saving");

    try {
      const response = await adminFetch("/api/admin/config", {
        method: "POST",
        body: JSON.stringify({
          config,
          upsells: upsells.map((upsell, sort_order) => ({ ...upsell, sort_order })),
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
  }, [config, upsells]);

  const previewItems = useMemo(
    () =>
      upsells
        .filter((upsell) => upsell.enabled)
        .map((upsell) => ({
          title: upsell.title_override || "Selected product",
          variant: numericVariantId(upsell.variant_gid),
          badge: upsell.badge_text,
        })),
    [upsells]
  );

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
          price_cents: priceToCents(variant.price),
          compare_at_cents: priceToCents(variant.price),
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
                  {gamification.rewards.map((reward, index) => (
                    <div
                      key={reward.id}
                      style={{
                        border: "1px solid #dfe3e8",
                        borderRadius: 8,
                        padding: 16,
                      }}
                    >
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm">
                            {`Reward ${index + 1} - ${reward.title}`}
                          </Text>
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
                                updateReward(index, "type", value as GamifiedRewardConfig["type"])
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
                                updateReward(index, "threshold_cents", dollarsToCents(value))
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
                              onChange={(value) => updateReward(index, "before_text", value)}
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
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="p" variant="bodyMd">
                                {reward.product_title
                                  ? `Gift: ${reward.product_title}`
                                  : "No gift product selected"}
                              </Text>
                              <Badge tone={reward.variant_id ? "success" : "attention"}>
                                {reward.variant_id ? "Gift selected" : "Needs gift"}
                              </Badge>
                            </InlineStack>
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
                            onChange={(value) => updateReward(index, "discount_code", value)}
                            autoComplete="off"
                          />
                        ) : null}
                        {reward.type === "custom" ? (
                          <TextField
                            label="Custom reward label"
                            value={reward.custom_label ?? ""}
                            onChange={(value) => updateReward(index, "custom_label", value)}
                            autoComplete="off"
                          />
                        ) : null}
                      </BlockStack>
                    </div>
                  ))}
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
                      Upsells
                    </Text>
                    <Checkbox
                      label="Enable"
                      checked={config.upsells_enabled}
                      onChange={(value) => updateConfig("upsells_enabled", value)}
                    />
                  </InlineStack>
                  <TextField
                    label="Upsell heading"
                    value={config.upsell_heading}
                    onChange={(value) => updateConfig("upsell_heading", value)}
                    autoComplete="off"
                  />
                  <InlineStack gap="300" blockAlign="end">
                    <Box width="70%">
                      <TextField
                        label="Search products"
                        value={query}
                        onChange={setQuery}
                        autoComplete="off"
                      />
                    </Box>
                    <Button onClick={searchProducts} loading={searching}>
                      Search
                    </Button>
                  </InlineStack>
                  {searchResults.map((variant) => (
                    <InlineStack
                      key={variant.variantGid}
                      align="space-between"
                      blockAlign="center"
                    >
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          alt={variant.productTitle}
                          source={variant.imageUrl || ""}
                          size="small"
                        />
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd">
                            {variant.productTitle}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {variant.variantTitle || "Default variant"} · {variant.price ?? ""}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="200">
                        <Button onClick={() => addUpsell(variant)}>Add upsell</Button>
                        <Button onClick={() => addFbtProduct(variant)}>Add FBT</Button>
                        {gamification.rewards.map((reward, rewardIndex) =>
                          reward.type === "free_gift" ? (
                            <Button
                              key={`${reward.id}-${variant.variantGid}`}
                              onClick={() => selectVariantAsRewardGift(rewardIndex, variant)}
                            >
                              {`Gift R${rewardIndex + 1}`}
                            </Button>
                          ) : null
                        )}
                      </InlineStack>
                    </InlineStack>
                  ))}
                  <Divider />
                  {upsells.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No upsells selected.
                    </Text>
                  ) : (
                    upsells.map((upsell, index) => (
                      <InlineStack key={`${upsell.variant_gid}-${index}`} align="space-between">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd">
                            {upsell.title_override || upsell.product_gid}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Variant {numericVariantId(upsell.variant_gid)}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200">
                          <Select
                            label="Enabled"
                            labelHidden
                            value={upsell.enabled ? "true" : "false"}
                            options={[
                              { label: "Enabled", value: "true" },
                              { label: "Disabled", value: "false" },
                            ]}
                            onChange={(value) =>
                              setUpsells((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, enabled: value === "true" }
                                    : item
                                )
                              )
                            }
                          />
                          <Button onClick={() => moveUpsell(index, -1)}>Up</Button>
                          <Button onClick={() => moveUpsell(index, 1)}>Down</Button>
                          <Button tone="critical" onClick={() => removeUpsell(index)}>
                            Remove
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    ))
                  )}
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
                  <Divider />
                  {frequentlyBoughtTogether.products.length === 0 ? (
                    <Text as="p" tone="subdued">
                      Search products above, then choose Add FBT.
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
                    {config.upsells_enabled && previewItems.length ? (
                      <BlockStack gap="200">
                        <Text as="p" variant="headingSm">
                          {config.upsell_heading}
                        </Text>
                        {previewItems.map((item) => (
                          <InlineStack key={item.variant} align="space-between">
                            <Text as="p">{item.title}</Text>
                            {item.badge ? <Badge>{item.badge}</Badge> : null}
                          </InlineStack>
                        ))}
                      </BlockStack>
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
