/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export -> app/out, served by the API in the packaged app.
  output: "export",
  // Relative asset paths so it works when served under any host/port.
  assetPrefix: "",
  images: { unoptimized: true },
  trailingSlash: true,
};

module.exports = nextConfig;
