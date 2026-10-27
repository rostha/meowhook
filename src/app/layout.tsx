import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans, DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import './workspace.css';
import ErrorBoundary from '@/components/ErrorBoundary';
import { DEFAULT_APP_THEME, THEME_BOOT_SCRIPT } from '@/lib/themes';
import { SITE_URL, SOCIAL_IMAGE } from '@/lib/seo';

const inter = Inter({ subsets: ['latin'], variable: '--font-main', preload: false });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', preload: false });
const display = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] });
/** Bundled UI sans when Sohne is unavailable (local / Typekit). Distinct from Inter so typography visibly updates. */
const uiSans = DM_Sans({ subsets: ['latin'], variable: '--font-ui-sans', weight: ['400', '500', '600', '700'] });
/** Bundled UI mono before JetBrains when Sohne Mono is unavailable */
const uiMono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono-ui', weight: ['400', '500', '600'] });

const APP_DESCRIPTION =
  'Build Discord webhook messages and embeds with a live preview. Save drafts in your browser, start from templates, and send when you are ready. Free, with no sign-up.';
const APP_SOCIAL_DESCRIPTION =
  'Write Discord webhook messages, design embeds and V2 components, preview the result, and save drafts in your browser.';
const WEBSITE_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Meowhook',
  url: `${SITE_URL}/`,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Meowhook | Discord Webhook Builder & Embed Editor',
    template: '%s | Meowhook',
  },
  description: APP_DESCRIPTION,
  authors: [{ name: 'Mashiro', url: 'https://bio.link/heymashiro' }],
  creator: 'Mashiro',
  alternates: {
    canonical: `${SITE_URL}/`,
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: { icon: encodeURI('/MEAWHOOK ICON WHITE.svg') },
  openGraph: {
    title: 'Meowhook - Discord Webhook Builder',
    description: APP_SOCIAL_DESCRIPTION,
    url: SITE_URL,
    siteName: 'Meowhook',
    locale: 'en_US',
    images: [{ url: SOCIAL_IMAGE, width: 1200, height: 630, alt: 'Meowhook Discord webhook builder' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Meowhook - Discord Webhook Builder',
    description:
      'Free visual Discord webhook editor for embeds, attachments, live preview, and templates.',
    images: [SOCIAL_IMAGE],
  },
};

/** width=device-width, initial-scale=1 - no maximum-scale or user-scalable=no (accessibility). */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_APP_THEME}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable} ${display.variable} ${uiSans.variable} ${uiMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.discordapp.com" />
        {process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && <script defer src="https://cloud.umami.is/script.js" data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}></script>}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_STRUCTURED_DATA) }} />
        {process.env.NEXT_PUBLIC_ADOBE_FONTS_KIT_ID ? (
          <link
            rel="stylesheet"
            href={`https://use.typekit.net/${process.env.NEXT_PUBLIC_ADOBE_FONTS_KIT_ID}.css`}
          />
        ) : null}
      </head>
      <body>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
