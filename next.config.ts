import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  compress: true,
  poweredByHeader: false,
  // Native filesystem tracing must never package local accounts, upload bytes, or development secrets.
  outputFileTracingExcludes: {
    '/*': ['./.data/**/*', './.env*', './output/**/*', './.playwright*/**/*'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
    ],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        {
          key: 'Content-Security-Policy',
          value:
            "default-src 'self'; " +
            `script-src 'self' https://cloud.umami.is 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; ` +
            "style-src 'self' 'unsafe-inline' https://use.typekit.net; " +
            "img-src 'self' https: data: blob:; " +
            "media-src 'self' https: blob:; " +
            "connect-src 'self' https://discord.com https://cdn.discordapp.com https://media.discordapp.net https://api.cloudflare.com https://vercel.com/api/blob/ https://*.vercel-storage.com https://api-gateway.umami.dev https://gateway.umami.is; " +
            "font-src 'self' https://fonts.gstatic.com https://use.typekit.net; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self';",
        },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    },
    {
      source: '/meowhook-social.png',
      headers: [
        { key: 'Cache-Control', value: 'public, max-age=86400' },
      ],
    },
  ],
};

export default nextConfig;
