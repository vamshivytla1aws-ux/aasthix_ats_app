/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf.js-extract pulls pdf.js with an optional `canvas` peer; bundling fails without it.
  experimental: {
    serverComponentsExternalPackages: ["pdf.js-extract"],
  },
};

export default nextConfig;
