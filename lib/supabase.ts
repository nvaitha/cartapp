import { createClient } from "@supabase/supabase-js";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function getSupabaseAdmin() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export type SessionRow = {
  shop: string;
  access_token: string;
  scope: string | null;
};
