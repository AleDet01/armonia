import type { NextConfig } from "next";
import { pagesDeployment } from "./src/site/pages.mjs";

const { prefix: githubPagesAssetPrefix } = pagesDeployment();

const nextConfig: NextConfig = {
  // The product has no server dependency: export the same interactive surface
  // as static files so it can be published on GitHub Pages.
  output: "export",
  trailingSlash: true,
  // A project Pages URL already mounts the root route below /<repository>.
  // Only generated assets need the prefix; the document itself stays at /.
  ...(githubPagesAssetPrefix ? { assetPrefix: githubPagesAssetPrefix } : {}),
};

export default nextConfig;
