import type { NextConfig } from "next";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const githubPagesAssetPrefix =
  process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}`
    : undefined;

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
