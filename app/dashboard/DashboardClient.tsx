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

type Props = {
  shop: string;
  host: string;
};

const cloneConfig = (): CartDrawerConfigInput => ({
  ...DEFAULT_CART_DRAWER_CONFIG,
  colors: { ...DEFAULT_CART_DRAWER_CONFIG.colors },
  typography: { ...DEFAULT_CART_DRAWER_CONFIG.typography },
  layout: { ...DEFAULT_CART_DRAWER_CONFIG.layout },
});

function numericVariantId(variantGid: string) {
  return variantGid.split("/").pop() ?? variantGid;
}

async function getIdToken() {
  const shopify = window.shopify;
  if (!shopify?.idToken) return null;

  return Promise.race([
    shopify.idToken(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
  ]);
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
  const [status, setStatus] = useState("Defaults ready");
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
                    label="Threshold in cents"
                    type="number"
                    value={String(config.free_shipping_threshold_cents)}
                    onChange={(value) =>
                      updateConfig("free_shipping_threshold_cents", Number(value) || 0)
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
                      <Button onClick={() => addUpsell(variant)}>Add</Button>
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
                        {config.drawer_title}
                      </Text>
                      <Badge>{config.enabled ? "On" : "Off"}</Badge>
                    </InlineStack>
                    <Text as="p" tone="subdued">
                      {config.empty_title}
                    </Text>
                    <Text as="p" tone="subdued">
                      {config.empty_body}
                    </Text>
                    {config.free_shipping_enabled ? (
                      <Box background="bg-fill-success-secondary" borderRadius="200" padding="300">
                        <Text as="p">{config.free_shipping_message}</Text>
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
