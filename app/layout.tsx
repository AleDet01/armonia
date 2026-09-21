import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProtocol ?? (host?.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(host ? `${protocol}://${host}` : "http://localhost:3000");

  return {
    metadataBase,
    title: {
      default: "Armonia — Repository truth, reconciled",
      template: "%s · Armonia",
    },
    description:
      "An open-source evidence engine that finds contradictions across code, docs, CI, containers, and connected repositories.",
    openGraph: {
      title: "Armonia — Repository truth, reconciled",
      description:
        "Turn scattered repository claims into one verifiable evidence graph.",
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1729,
          height: 910,
          alt: "Armonia — Repository truth, reconciled",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Armonia — Repository truth, reconciled",
      description:
        "Turn scattered repository claims into one verifiable evidence graph.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
