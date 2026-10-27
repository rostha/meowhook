import Link from 'next/link';
import LegalHeader from '../LegalHeader';
import LegalSidebar from '../LegalSidebar';
import { createPageMetadata } from '@/lib/seo';
import styles from '../legal.module.css';

export const metadata = createPageMetadata(
  'Terms of Service',
  'Read the Meowhook terms covering Discord webhook usage, acceptable use, your content, and service limitations.',
  '/terms',
);

const updatedLabel = 'September 30, 2026';
const sections = [
  { id: 'service', label: 'Service and eligibility' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'discord', label: 'Discord-specific rules' },
  { id: 'content', label: 'Your content' },
  { id: 'availability', label: 'Availability and changes' },
  { id: 'liability', label: 'Disclaimers and liability' },
  { id: 'contact', label: 'Contact' },
];

export default function TermsPage() {
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#legal-content">Skip to content</a>
      <LegalHeader current="terms" />
      <div className={styles.shell}>
        <div className={styles.layout}>
          <LegalSidebar
            label="Terms"
            sections={sections}
            summary="Use Meowhook responsibly, follow Discord’s rules, and review important messages before you send them."
          />

          <div className={styles.content} id="legal-content">
            <section className={styles.hero}>
              <div className={styles.breadcrumb}><Link href="/docs">Handbook</Link><span aria-hidden="true">/</span><span>Terms</span></div>
              <h1 className={styles.title}>Terms of Service</h1>
              <p className={styles.description}>
                These terms cover the Meowhook message builder, drafts, sharing, and webhook messages.
              </p>
              <div className={styles.meta}>
                <span>Last updated: {updatedLabel}</span>
                <span className={styles.metaSeparator} aria-hidden="true">·</span>
                <span>Applies to meowhook.com</span>
              </div>
            </section>
            <div className={styles.summaryGrid}>
              <article>
                <h2>What Meowhook is</h2>
                <p>
                  Meowhook is a browser-based Discord message builder. It helps you compose webhook
                  messages, embeds, and files.
                </p>
              </article>
              <article>
                <h2>What it is not</h2>
                <p>
                  It is not a guaranteed hosting platform, legal compliance service, or moderation shield
                  for anything you send through Discord.
                </p>
              </article>
            </div>

            <section id="service" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Service and eligibility</h2>
                <p>
                  By using Meowhook, you agree to these terms and confirm that you are allowed to use the
                  service under the laws that apply to you.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Basic access</h3>
                  <ul>
                    <li>You may use Meowhook to build and manage Discord webhook content for lawful purposes.</li>
                    <li>You are responsible for any Discord servers, channels, or webhooks you use with the service.</li>
                    <li>Messages you send are also subject to Discord’s terms and policies.</li>
                  </ul>
                </article>
              </div>
            </section>

            <section id="acceptable-use" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Acceptable use</h2>
                <p>
                  Meowhook is meant for normal message creation and delivery. It may not be used to abuse
                  Discord, other services, or other people.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>You must not</h3>
                  <ul>
                    <li>Use the service to send spam, phishing, malware, scams, harassment, or unlawful content.</li>
                    <li>Attempt to bypass Discord rate limits, permissions, or server restrictions.</li>
                    <li>Probe, scrape, overload, or disrupt Meowhook infrastructure or any connected Discord endpoints.</li>
                    <li>Use webhooks without permission from their owner.</li>
                    <li>Misrepresent authorship, identity, or source in a way that violates Discord rules or applicable law.</li>
                  </ul>
                </article>
                <article>
                  <h3>Enforcement</h3>
                  <p>
                    Access to Meowhook may be limited, suspended, or blocked if the service is used in a way
                    that creates risk, violates these terms, or threatens the security or stability of the app.
                  </p>
                </article>
              </div>
            </section>

            <section id="discord" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Discord-specific rules</h2>
                <p>
                  Meowhook is built around Discord’s webhook API. Those integrations
                  work only as long as Discord allows them and your permissions remain valid.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Webhook delivery</h3>
                  <ul>
                    <li>You are responsible for the webhook URLs you paste into Meowhook.</li>
                    <li>If a webhook is deleted, rotated, revoked, or restricted, sends may fail without warning.</li>
                    <li>Webhook ownership and edit/delete behavior are limited by Discord’s own rules.</li>
                  </ul>
                </article>
              </div>
            </section>

            <section id="content" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Your content and responsibility</h2>
                <p>
                  You keep ownership of the content you create, but you remain fully responsible for what you
                  send through Meowhook.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Ownership</h3>
                  <p>
                    Meowhook does not claim ownership of your draft text, embeds, uploads, or Discord message
                    content. You grant only the limited rights needed to process and transmit that content when
                    you choose to use the service.
                  </p>
                </article>
                <article>
                  <h3>Your responsibility</h3>
                  <ul>
                    <li>You must make sure your content is accurate, lawful, and appropriate for the destination server or channel.</li>
                    <li>You must review generated payloads before sending, especially when using templates or imported JSON.</li>
                    <li>You are responsible for keeping secret data, including webhook URLs, out of places where they do not belong.</li>
                  </ul>
                </article>
              </div>
            </section>

            <section id="availability" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Availability, updates, and changes</h2>
                <p>
                  Meowhook may change over time. Features can be added, removed, renamed, or limited as the
                  product evolves.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>No uninterrupted guarantee</h3>
                  <p>
                    The service is provided on an as-available basis. Downtime, maintenance, Discord API issues,
                    browser storage failures, and third-party outages can affect behavior.
                  </p>
                </article>
                <article>
                  <h3>Changes to these terms</h3>
                  <p>
                    These terms may be updated from time to time. Continued use of Meowhook after an update means
                    you accept the revised terms.
                  </p>
                </article>
              </div>
            </section>

            <section id="liability" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Disclaimers and liability</h2>
                <p>
                  Meowhook is provided without warranties of uninterrupted availability, error-free operation, or
                  fitness for a specific purpose.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Disclaimers</h3>
                  <ul>
                    <li>Discord may reject, alter, throttle, or remove content independently of Meowhook.</li>
                    <li>Browser-local data such as drafts, saved webhooks, and templates can be lost if local storage is cleared or corrupted.</li>
                    <li>You should review anything important before sending or relying on it.</li>
                  </ul>
                </article>
                <article>
                  <h3>Liability cap</h3>
                  <p>
                    To the fullest extent allowed by law, Meowhook and its operator will not be liable for indirect,
                    incidental, special, consequential, or business-interruption damages resulting from your use of
                    the service.
                  </p>
                </article>
              </div>
            </section>

            <section id="contact" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Contact</h2>
                <p>
                  Questions about these terms, the site, or the Discord bot can be directed through the public
                  contact profile below.
                </p>
              </div>
              <div className={styles.contactRow}>
                <span>Operator: Mashiro</span>
                <a href="https://bio.link/heymashiro" target="_blank" rel="noopener noreferrer">
                  bio.link/heymashiro
                </a>
                <Link href="/privacy">View Privacy Policy</Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
