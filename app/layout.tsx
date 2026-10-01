import type { Metadata } from "next";
import "./globals.css";

const githubRepository = process.env.GITHUB_REPOSITORY?.split("/");
const githubPagesUrl =
  process.env.GITHUB_ACTIONS === "true" && githubRepository?.[0] && githubRepository[1]
    ? `https://${githubRepository[0]}.github.io/${githubRepository[1]}/`
    : "http://localhost:3000/";

export const metadata: Metadata = {
  metadataBase: new URL(githubPagesUrl),
  title: {
    default: "Armonia — Repository truth, reconciled",
    template: "%s · Armonia",
  },
  description:
    "An open-source evidence engine that finds contradictions across code, docs, CI, containers, and connected repositories.",
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
