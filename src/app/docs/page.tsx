import DocsHandbook from './DocsHandbook';
import { createPageMetadata } from '@/lib/seo';

export const metadata = createPageMetadata(
  'Discord Webhook Guides & Examples',
  'Learn to build Discord webhook messages in Meowhook. Try interactive examples for embeds, images, V2 containers, drafts, and sending.',
  '/docs',
);
export default function DocsPage() {
  return <DocsHandbook />;
}
