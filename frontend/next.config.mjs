/** @type {import('next').NextConfig} */
const apiBaseUrl = [
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NEXT_PUBLIC_API_BASE,
  process.env.API_BASE_URL,
]
  .find((value) => value?.trim())
  ?.replace(/\/+$/, "");

const nextConfig = {
  env: {
    NEXT_PUBLIC_API_BASE_URL: apiBaseUrl ?? "",
  },
  async rewrites() {
    if (!apiBaseUrl) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
