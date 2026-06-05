import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LavocDerma Cart Drawer",
  description: "Embedded Shopify admin for the LavocDerma cart drawer app.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const shopifyApiKey =
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY?.trim() ||
    process.env.SHOPIFY_API_KEY?.trim() ||
    "";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {shopifyApiKey ? <meta name="shopify-api-key" content={shopifyApiKey} /> : null}
        {/* Shopify App Bridge docs require this CDN script in the document head. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
