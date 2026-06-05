import { redirect } from "next/navigation";

type HomeProps = {
  searchParams: Promise<{ shop?: string; host?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const query = new URLSearchParams();

  if (params.shop) query.set("shop", params.shop);
  if (params.host) query.set("host", params.host);

  if (params.shop && params.host) {
    redirect(`/dashboard?${query.toString()}`);
  }

  if (params.shop) {
    redirect(`/api/auth?shop=${encodeURIComponent(params.shop)}`);
  }

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-6 py-16 text-[#1f2933]">
      <section className="mx-auto flex max-w-3xl flex-col gap-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8b6f4f]">
          LavocDerma
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Cart Drawer App
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-[#55606d]">
          Install this app from Shopify Admin with a shop parameter to manage
          the storefront cart drawer experience.
        </p>
      </section>
    </main>
  );
}
