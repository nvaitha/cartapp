import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";
import { getSupabaseAdmin } from "@/lib/supabase";

type DashboardProps = {
  searchParams: Promise<{ shop?: string; host?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const params = await searchParams;

  if (params.shop) {
    const supabase = getSupabaseAdmin();
    const { data: session } = await supabase
      .from("cart_drawer_sessions")
      .select("shop")
      .eq("shop", params.shop)
      .maybeSingle();

    if (!session) {
      redirect(`/api/auth?shop=${encodeURIComponent(params.shop)}`);
    }
  }

  return <DashboardClient shop={params.shop ?? ""} host={params.host ?? ""} />;
}
