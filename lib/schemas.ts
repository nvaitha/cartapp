import { z } from "zod";

const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .optional();

const CountryTargetingSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["include", "exclude"]).default("include"),
    countries: z.array(z.string().min(2).max(2)).max(40).default([]),
  })
  .default({ enabled: false, mode: "include", countries: [] });

const GamifiedRewardSchema = z.object({
  id: z.string().min(1).max(40),
  enabled: z.boolean(),
  type: z.enum(["free_shipping", "free_gift", "discount", "custom"]),
  title: z.string().min(1).max(80),
  threshold_cents: z.number().int().min(0).max(10000000),
  icon: z.string().max(12).optional(),
  badge_text: z.string().max(60).optional(),
  before_text: z.string().min(1).max(180),
  after_text: z.string().min(1).max(180),
  subscription_text: z.string().max(180).optional(),
  product_gid: z.string().max(160).optional(),
  variant_gid: z.string().max(160).optional(),
  variant_id: z.string().max(40).optional(),
  product_title: z.string().max(140).optional(),
  image_url: z.string().max(500).optional(),
  available: z.boolean().optional(),
  inventory_quantity: z.number().int().nullable().optional(),
  inventory_policy: z.string().max(40).nullable().optional(),
  inventory_management: z.string().max(80).nullable().optional(),
  price_cents: z.number().int().min(0).max(10000000).nullable().optional(),
  compare_at_cents: z.number().int().min(0).max(10000000).nullable().optional(),
  teaser_enabled: z.boolean().default(true),
  teaser_heading: z.string().max(120).optional(),
  teaser_subheading: z.string().max(120).optional(),
  discount_code: z.string().max(80).optional(),
  custom_label: z.string().max(100).optional(),
});

const GamificationSchema = z
  .object({
    enabled: z.boolean().default(true),
    header_text: z.string().min(1).max(100).default("Your Eczema Relief Kit!"),
    timer_enabled: z.boolean().default(true),
    timer_text: z.string().min(1).max(120).default("These skin savers are yours for..."),
    timer_minutes: z.number().int().min(1).max(120).default(5),
    subscription_perks_included: z.boolean().default(true),
    subscription_message: z
      .string()
      .min(1)
      .max(180)
      .default("Subscription orders already include your gift and free shipping."),
    country_targeting: CountryTargetingSchema,
    rewards: z.array(GamifiedRewardSchema).max(4).default([]),
  })
  .default({
    enabled: true,
    header_text: "Your Eczema Relief Kit!",
    timer_enabled: true,
    timer_text: "These skin savers are yours for...",
    timer_minutes: 5,
    subscription_perks_included: true,
    subscription_message: "Subscription orders already include your gift and free shipping.",
    country_targeting: { enabled: false, mode: "include", countries: [] },
    rewards: [],
  });

const FrequentlyBoughtTogetherSchema = z
  .object({
    enabled: z.boolean().default(false),
    heading: z.string().min(1).max(100).default("Popular Right Now🔥!!"),
    add_button_text: z.string().min(1).max(40).default("Add to cart"),
    details_text: z.string().min(1).max(60).default("Show details"),
    display_limit: z.number().int().min(1).max(8).default(4),
    discount_text: z.string().max(80).default(""),
    country_targeting: CountryTargetingSchema,
    products: z
      .array(
        z.object({
          product_gid: z.string().min(1),
          variant_gid: z.string().min(1),
          variant_id: z.string().min(1),
          title: z.string().min(1).max(140),
          variant_title: z.string().max(100).nullable().optional(),
          image_url: z.string().max(500).nullable().optional(),
          price_cents: z.number().int().min(0).max(10000000).nullable().optional(),
          compare_at_cents: z.number().int().min(0).max(10000000).nullable().optional(),
          badge_text: z.string().max(60).nullable().optional(),
          enabled: z.boolean().default(true),
        })
      )
      .max(12)
      .default([]),
  })
  .default({
    enabled: false,
    heading: "Popular Right Now🔥!!",
    add_button_text: "Add to cart",
    details_text: "Show details",
    display_limit: 4,
    discount_text: "",
    country_targeting: { enabled: false, mode: "include", countries: [] },
    products: [],
  });

export const DEFAULT_CART_DRAWER_CONFIG = {
  enabled: true,
  drawer_title: "Your cart",
  empty_title: "Your cart is empty",
  empty_body: "Build your barrier routine with calm, steady care.",
  checkout_button_text: "Check out",
  continue_shopping_text: "Continue shopping",
  free_shipping_enabled: true,
  free_shipping_threshold_cents: 10000,
  free_shipping_message: "You are close to free shipping",
  free_shipping_success_message: "Free shipping unlocked",
  upsells_enabled: false,
  upsell_heading: "Complete your routine",
  colors: {
    accent: "#7c6243",
    background: "#fffaf4",
    text: "#1f2933",
    mutedText: "#667085",
    border: "#e6dccf",
    buttonBackground: "#1f2933",
    buttonText: "#ffffff",
  },
  typography: {
    fontFamily: "inherit",
  },
  layout: {
    drawerWidth: 440,
    borderRadius: 8,
    gamification: {
      enabled: true,
      header_text: "Your Eczema Relief Kit!",
      timer_enabled: true,
      timer_text: "These skin savers are yours for...",
      timer_minutes: 5,
      subscription_perks_included: true,
      subscription_message: "Subscription orders already include your gift and free shipping.",
      country_targeting: { enabled: false, mode: "include", countries: [] },
      rewards: [
        {
          id: "reward-free-gift",
          enabled: true,
          type: "free_gift",
          title: "Free Gift",
          threshold_cents: 5499,
          icon: "🎁",
          before_text: "👉 Add {{amount_left}} to unlock {{reward}}",
          after_text: "🎉 You've unlocked {{reward}}",
          subscription_text: "{{reward}} is already included with subscription.",
          teaser_enabled: true,
          teaser_heading: "Only 5 Gifts Left!",
          teaser_subheading: "$0 Free",
        },
        {
          id: "reward-free-shipping",
          enabled: true,
          type: "free_shipping",
          title: "Free shipping",
          threshold_cents: 6499,
          icon: "🚚",
          before_text: "👉 Add {{amount_left}} to unlock {{reward}}",
          after_text: "🎉 You've unlocked {{reward}}",
          subscription_text: "{{reward}} is already included with subscription.",
          teaser_enabled: false,
        },
        {
          id: "reward-discount",
          enabled: true,
          type: "discount",
          title: "10% Off",
          threshold_cents: 9900,
          icon: "%",
          before_text: "👉 Add {{amount_left}} to unlock {{reward}}",
          after_text: "🎉 You've unlocked {{reward}}",
          teaser_enabled: false,
          discount_code: "",
        },
        {
          id: "reward-custom",
          enabled: true,
          type: "custom",
          title: "Free express shipping",
          threshold_cents: 12000,
          icon: "🚚",
          before_text: "👉 Add {{amount_left}} to unlock {{reward}}",
          after_text: "🎉 You've unlocked {{reward}}",
          teaser_enabled: false,
          custom_label: "Manual reward",
        },
      ],
    },
    frequentlyBoughtTogether: {
      enabled: false,
      heading: "Popular Right Now🔥!!",
      add_button_text: "Add to cart",
      details_text: "Show details",
      display_limit: 4,
      discount_text: "",
      country_targeting: { enabled: false, mode: "include", countries: [] },
      products: [],
    },
  },
} satisfies CartDrawerConfigInput;

export const CartDrawerConfigSchema = z.object({
  enabled: z.boolean(),
  drawer_title: z.string().min(1).max(80),
  empty_title: z.string().min(1).max(120),
  empty_body: z.string().min(1).max(240),
  checkout_button_text: z.string().min(1).max(80),
  continue_shopping_text: z.string().min(1).max(80),
  free_shipping_enabled: z.boolean(),
  free_shipping_threshold_cents: z.number().int().min(0).max(10000000),
  free_shipping_message: z.string().min(1).max(160),
  free_shipping_success_message: z.string().min(1).max(160),
  upsells_enabled: z.boolean(),
  upsell_heading: z.string().min(1).max(120),
  colors: z
    .object({
      accent: HexColorSchema,
      background: HexColorSchema,
      text: HexColorSchema,
      mutedText: HexColorSchema,
      border: HexColorSchema,
      buttonBackground: HexColorSchema,
      buttonText: HexColorSchema,
    })
    .catchall(z.string().max(80))
    .default({}),
  typography: z.record(z.string(), z.unknown()).default({}),
  layout: z
    .object({
      drawerWidth: z.number().int().min(320).max(720).optional(),
      borderRadius: z.number().int().min(0).max(32).optional(),
      gamification: GamificationSchema.optional(),
      frequentlyBoughtTogether: FrequentlyBoughtTogetherSchema.optional(),
    })
    .catchall(z.unknown())
    .default({}),
});

export const CartDrawerUpsellSchema = z.object({
  id: z.string().optional(),
  sort_order: z.number().int().min(0),
  product_gid: z.string().min(1),
  variant_gid: z.string().min(1),
  title_override: z.string().max(120).nullable().optional(),
  badge_text: z.string().max(40).nullable().optional(),
  enabled: z.boolean(),
});

export const AdminConfigPayloadSchema = z.object({
  config: CartDrawerConfigSchema,
  upsells: z.array(CartDrawerUpsellSchema).max(12),
});

export type CartDrawerConfigInput = z.infer<typeof CartDrawerConfigSchema>;
export type CartDrawerUpsellInput = z.infer<typeof CartDrawerUpsellSchema>;
export type AdminConfigPayload = z.infer<typeof AdminConfigPayloadSchema>;
