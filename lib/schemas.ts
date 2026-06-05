import { z } from "zod";

const HexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .optional();

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
