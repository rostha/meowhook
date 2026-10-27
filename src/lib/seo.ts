import type { Metadata } from 'next';

export const SITE_URL = 'https://www.meowhook.com';
export const SOCIAL_IMAGE = `${SITE_URL}/meowhook-social.png`;

export function createPageMetadata(title: string, description: string, path: string): Metadata {
  const url = `${SITE_URL}${path}`;
  const socialTitle = `${title} | Meowhook`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: 'Meowhook',
      type: 'website',
      images: [{ url: SOCIAL_IMAGE, width: 1200, height: 630, alt: 'Meowhook Discord webhook builder' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [SOCIAL_IMAGE],
    },
  };
}
