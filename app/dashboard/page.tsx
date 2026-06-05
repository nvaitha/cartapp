import DashboardClient from "./DashboardClient";

type DashboardProps = {
  searchParams: Promise<{ shop?: string; host?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardProps) {
  const params = await searchParams;

  return <DashboardClient shop={params.shop ?? ""} host={params.host ?? ""} />;
}
