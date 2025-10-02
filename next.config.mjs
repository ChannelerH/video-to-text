import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: false,
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*",
      },
    ],
  },
  webpack(config, { isServer }) {
    if (isServer) {
      const externalEntry = {
        "@ffmpeg-installer/ffmpeg": "commonjs @ffmpeg-installer/ffmpeg",
      };
      if (!config.externals) {
        config.externals = [externalEntry];
      } else if (Array.isArray(config.externals)) {
        config.externals.push(externalEntry);
      } else {
        config.externals = [config.externals, externalEntry];
      }
    }
    return config;
  },
  async redirects() {
    return [];
  },
};

// Make sure experimental mdx flag is enabled
const configWithMDX = {
  ...nextConfig,
  experimental: {
    mdxRs: true,
  },
};

export default withBundleAnalyzer(withNextIntl(withMDX(configWithMDX)));
