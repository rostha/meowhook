import Link from 'next/link';
import LegalHeader from '../LegalHeader';
import LegalSidebar from '../LegalSidebar';
import { createPageMetadata, SITE_URL } from '@/lib/seo';
import styles from '../legal.module.css';

export const metadata = createPageMetadata(
  'Discord Webhook Builder Features',
  'Meet Meowhook: a free, browser-based Discord webhook builder for messages, embeds, live previews, V2 layouts, templates, and local drafts.',
  '/about',
);

const sections = [
  { id: 'build', label: 'What you can build' },
  { id: 'send', label: 'How sending works' },
  { id: 'components', label: 'Embeds and V2 layouts' },
  { id: 'drafts', label: 'Drafts and backups' },
  { id: 'start', label: 'Get started' },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Meowhook',
  url: SITE_URL,
  description: 'A browser-based editor for Discord webhook messages, embeds, and V2 layouts with a live preview.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
};

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <a className={styles.skip} href="#about-content">Skip to content</a>
      <LegalHeader current="about" />
      <div className={styles.shell}>
        <div className={styles.layout}>
          <LegalSidebar
            label="About Meowhook"
            eyebrow="Product overview"
            sections={sections}
            summary="Design a message, check it in the preview, and send it to a Discord webhook when you are ready."
          />
          <article className={styles.content} id="about-content">
            <section className={styles.hero}>
              <div className={styles.breadcrumb}><Link href="/docs">Handbook</Link><span aria-hidden="true">/</span><span>About</span></div>
              <h1 className={styles.title}>Build Discord webhook messages with confidence</h1>
              <p className={styles.description}>
                Meowhook is a free message builder for Discord webhooks. Write your message, shape an embed or a V2 layout,
                and see a live preview before anything reaches your channel.
              </p>
              <div className={styles.meta}><span>Free to use</span><span className={styles.metaSeparator} aria-hidden="true">·</span><span>No Meowhook account needed</span></div>
            </section>

            <div className={styles.summaryGrid}>
              <article><h2>Make it visual</h2><p>Edit message text, images, embeds, and layout blocks while the Discord-style preview updates beside your work.</p></article>
              <article><h2>Keep control</h2><p>Drafts stay in your browser. You choose when to connect a webhook, send a message, or create a share link.</p></article>
            </div>

            <section id="build" className={styles.section}>
              <div className={styles.sectionHeader}><h2>What you can build</h2><p>Start with a simple announcement or put together a richer message without writing JSON by hand.</p></div>
              <div className={styles.stack}>
                <article><h3>Messages and embeds</h3><p>Write text, add links and Discord formatting, attach files, and create embeds with titles, descriptions, fields, colors, and images.</p></article>
                <article><h3>Useful starting points</h3><p>Try a template for a welcome note, update, or event, then change the words and visuals to fit your server. You can also import an existing JSON payload.</p></article>
              </div>
            </section>

            <section id="send" className={styles.section}>
              <div className={styles.sectionHeader}><h2>How sending works</h2><p>A Discord webhook is an address that can post into a channel. You create it in Discord, then paste its URL into Meowhook.</p></div>
              <div className={styles.stack}>
                <article><h3>Preview first, send when ready</h3><p>The preview lets you check your text, embeds, and layout before sending. When you press Send, Meowhook submits the message through your webhook.</p></article>
                <article><h3>Keep your webhook private</h3><p>A webhook URL acts like a credential: anyone with it may be able to post to that channel. Do not put it in public examples or shared drafts.</p></article>
              </div>
            </section>

            <section id="components" className={styles.section}>
              <div className={styles.sectionHeader}><h2>Embeds and V2 layouts</h2><p>Use a familiar message and embed editor for most posts. Switch on Advanced V2 components when you need more control over the layout.</p></div>
              <div className={styles.stack}>
                <article><h3>Rich embeds</h3><p>Add a title, description, fields, thumbnail, image, author, or footer. The preview shows how the pieces fit together as you edit them.</p></article>
                <article><h3>Ordered layout blocks</h3><p>Arrange text, thumbnails, image galleries, separators, and containers. You can move blocks up or down and see the result before sending.</p></article>
              </div>
            </section>

            <section id="drafts" className={styles.section}>
              <div className={styles.sectionHeader}><h2>Drafts and backups</h2><p>Meowhook saves your working drafts in this browser so you can return to them later.</p></div>
              <div className={styles.stack}>
                <article><h3>Move your work</h3><p>Export JSON or save a backup before switching devices or clearing browser data. Import a backup to restore the work in another browser.</p></article>
                <article><h3>Share deliberately</h3><p>When you create a share link, you choose how long it lasts. The shared draft is stored separately from your local workspace.</p></article>
              </div>
            </section>

            <section id="start" className={styles.section}>
              <div className={styles.sectionHeader}><h2>Ready to try it?</h2><p>Open the builder and change the example draft, or follow a short hands-on guide to your first webhook message.</p></div>
              <div className={styles.contactRow}>
                <Link href="/">Open the builder →</Link>
                <Link href="/docs">Explore the interactive guides →</Link>
              </div>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
}
