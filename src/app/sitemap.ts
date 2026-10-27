import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/about', '/docs', '/terms', '/privacy'].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
}
