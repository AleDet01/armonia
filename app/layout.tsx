import type { Metadata } from "next";
import "./globals.css";
import { pagesDeployment } from "../src/site/pages.mjs";

const { url: githubPagesUrl } = pagesDeployment();

export const metadata: Metadata = {
  metadataBase: new URL(githubPagesUrl),
  title: {
    default: "Armonia — Repository truth, reconciled",
    template: "%s · Armonia",
  },
  description:
    "Local-first consistency checks across documentation, manifests, CI, containers and source code.",
  openGraph: {
    title: "Armonia — Repository truth, reconciled",
    description: "Turn scattered repository claims into one verifiable evidence graph.",
    type: "website",
    images: [
      {
        url: "og.png",
        width: 1729,
        height: 910,
        alt: "Armonia — Repository truth, reconciled",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Armonia — Repository truth, reconciled",
    description: "Turn scattered repository claims into one verifiable evidence graph.",
    images: ["og.png"],
  },
  icons: {
    icon: [{ url: "icon.svg", type: "image/svg+xml" }],
  },
};

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
