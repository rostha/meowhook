import Link from 'next/link';
import LegalHeader from '../LegalHeader';
import LegalSidebar from '../LegalSidebar';
import { createPageMetadata } from '@/lib/seo';
import styles from '../legal.module.css';

export const metadata = createPageMetadata(
  'Privacy Policy',
  'Learn how Meowhook handles browser drafts, accounts, bot messages, form responses, uploads, share links, analytics, and feedback.',
  '/privacy',
);

const updatedLabel = 'October 26, 2026';
const sections = [
  { id: 'collect', label: 'What we collect' },
  { id: 'use', label: 'How we use it' },
  { id: 'storage', label: 'Browser and server storage' },
  { id: 'sharing', label: 'Sharing and third parties' },
  { id: 'choices', label: 'Your choices' },
  { id: 'contact', label: 'Contact' },
];

export default function PrivacyPage() {
  return (
    <main className={styles.page}>
      <a className={styles.skip} href="#legal-content">Skip to content</a>
      <LegalHeader current="privacy" />
      <div className={styles.shell}>
        <div className={styles.layout}>
          <LegalSidebar
            label="Privacy"
            sections={sections}
            summary="The webhook editor keeps local drafts in your browser. Account workspaces, bot features, uploads, share links, and feedback use server services."
          />

          <div className={styles.content} id="legal-content">
            <section className={styles.hero}>
              <div className={styles.breadcrumb}><Link href="/docs">Handbook</Link><span aria-hidden="true">/</span><span>Privacy</span></div>
              <h1 className={styles.title}>Privacy Policy</h1>
              <p className={styles.description}>
                This policy explains how Meowhook handles local drafts, accounts, Discord bot features, uploads, shared messages, and feedback.
              </p>
              <div className={styles.meta}>
                <span>Last updated: {updatedLabel}</span>
                <span className={styles.metaSeparator} aria-hidden="true">·</span>
                <span>Applies to meowhook.com</span>
              </div>
            </section>
            <div className={styles.summaryGrid}>
              <article>
                <h2>Stored locally</h2>
                <p>
                  Drafts, templates, saved webhooks, and builder preferences in the webhook editor stay in your browser unless you save or submit them to a server feature.
                </p>
              </article>
              <article>
                <h2>Saved to your account</h2>
                <p>
                  Dashboard messages, actions, forms, responses, schedules, and commands are stored on the server. Uploaded media can have public URLs so Discord can display it.
                </p>
              </article>
            </div>

            <section id="collect" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>What Meowhook may collect or process</h2>
                <p>
                  You can use the webhook editor without an account. Account and bot features process the information needed to provide those features.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Information stored in your browser</h3>
                  <ul>
                    <li>Draft tabs, message content, embeds, uploaded files in local IndexedDB, file references, send results, and builder state.</li>
                    <li>Saved webhooks, custom templates, backups, theme choice, and recent local workspace preferences.</li>
                    <li>These items are generally stored on your device in browser-managed storage.</li>
                  </ul>
                </article>
                <article>
                  <h3>Discord sign-in and account sessions</h3>
                  <ul>
                    <li>Discord supplies your account identifier, profile name, username, and avatar. Session and abuse-prevention records may include an IP address and browser information.</li>
                    <li>Discord sign-in requests profile information and the list of servers you can manage. It does not request access to your email address. Provider tokens are used to check server access.</li>
                    <li>Sign-in is handled by Discord. Meowhook does not ask for a separate account password. Discord provider tokens are encrypted in account storage and used by the server.</li>
                  </ul>
                </article>
                <article>
                  <h3>Dashboard and bot information</h3>
                  <ul>
                    <li>Saved message and embed content, interactive actions, role choices, form definitions, schedules, application commands, and their Discord server and channel identifiers.</li>
                    <li>Delivery results and message identifiers used to manage messages and scheduled deliveries.</li>
                    <li>Form submissions: the respondent’s Discord identifier and name, answers, submission time, and metadata or links for files submitted through Discord.</li>
                  </ul>
                </article>
                <article>
                  <h3>Information you explicitly submit</h3>
                  <ul>
                    <li>Webhook URLs and payload content when you choose to send through a webhook.</li>
                    <li>Feedback form submissions when you contact the site through its feedback flow.</li>
                    <li>Avatar images you upload, and your connected webhook URL to authorize that upload. The server checks the webhook with Discord without storing its credentials.</li>
                  </ul>
                </article>
              </div>
            </section>

            <section id="use" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>How the information is used</h2>
                <p>
                  Data is used to provide the features you ask for, not to build an unrelated profile about you.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Core product functions</h3>
                  <ul>
                    <li>To restore your local drafts, templates, saved webhooks, and visual preferences.</li>
                    <li>To check your webhook and send messages you choose to send.</li>
                    <li>To create and open share links when you use Share.</li>
                    <li>To host uploaded avatars at public image URLs that Discord can display.</li>
                    <li>To save your dashboard workspace, verify server permissions, publish bot messages, and run the actions or application commands you configure.</li>
                    <li>To deliver scheduled message snapshots, including while your browser is closed, and retain their delivery status.</li>
                    <li>To store Discord form responses for the form owner and, when configured, post a response summary to the selected Discord channel.</li>
                  </ul>
                </article>
                <article>
                  <h3>Support and maintenance</h3>
                  <ul>
                    <li>To respond to feedback or troubleshoot product issues.</li>
                    <li>To monitor reliability, prevent abuse, and understand basic site usage patterns.</li>
                  </ul>
                </article>
              </div>
            </section>

            <section id="storage" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Browser storage and server-side processing</h2>
                <p>
                  Meowhook uses a mix of browser-local storage and limited server-side processing depending on the feature.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Local browser data</h3>
                  <p>
                    Drafts and related workspace data are designed to stay local to the browser profile you are using.
                    If you clear local storage, switch browsers, or use a different device, those local items may not follow you.
                  </p>
                </article>
                <article>
                  <h3>Account workspace data</h3>
                  <p>
                    Account records, sessions, saved dashboard content, form responses, and scheduling state are stored in the configured server database.
                    Clearing your browser storage or signing out does not delete these server records. Saved dashboard items remain until they are deleted;
                    use the contact below for account-data removal requests.
                  </p>
                </article>
                <article>
                  <h3>Uploaded avatars and account media</h3>
                  <p>
                    Hosted avatar and account uploads use public file URLs or opaque file links that anyone with the link can access.
                    Production uploads use Vercel Blob. Files remain hosted so existing Discord messages can display them;
                    clearing a draft, removing a file from a message, or replacing an avatar does not delete the hosted file.
                    Use the contact below to request removal. Files attached only to local webhook drafts stay in your browser until you send or upload them.
                    Avatar upload limits use short-lived counters in Cloudflare, including a hashed IP identifier retained for up to two hours.
                  </p>
                </article>
              </div>
            </section>

            <section id="sharing" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Sharing and third parties</h2>
                <p>
                  Meowhook works with third-party services that are necessary for the product to function.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>Third-party services in use</h3>
                  <ul>
                    <li>Discord, for account connections, server permission checks, webhook and bot messages, self-role changes, forms, application commands, and feedback submissions.</li>
                    <li>Vercel, which hosts the site and production uploads, the configured account database provider, and Cloudflare, which stores expiring shared drafts and avatar upload rate-limit counters when configured.</li>
                    <li>Umami, for site usage analytics.</li>
                  </ul>
                </article>
                <article>
                  <h3>No sale of personal data</h3>
                  <p>
                    Meowhook does not sell your personal information. Information is shared only as needed to run the product,
                    comply with law, or protect the service and its users.
                  </p>
                </article>
              </div>
            </section>

            <section id="choices" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Your choices and controls</h2>
                <p>
                  You can control a meaningful amount of what Meowhook stores or processes by how you use the app.
                </p>
              </div>
              <div className={styles.stack}>
                <article>
                  <h3>You can</h3>
                  <ul>
                    <li>Export your drafts before clearing browser storage.</li>
                    <li>Clear or replace local drafts, saved webhooks, templates, and backups from your own browser.</li>
                    <li>Choose not to create share links or submit feedback.</li>
                    <li>Use the webhook editor without creating an account or connecting Discord.</li>
                    <li>Delete saved dashboard items and form responses, and pause or cancel schedules. Referenced items may need to be removed from their messages or actions first.</li>
                    <li>Sign out to end your current account session. Contact the operator for account or hosted-file removal.</li>
                  </ul>
                </article>
                <article>
                  <h3>Things to keep in mind</h3>
                  <ul>
                    <li>Webhook URLs are sensitive credentials. Treat them like secrets and avoid sharing them carelessly.</li>
                    <li>If you submit content to Discord through Meowhook, that content is also subject to Discord’s own retention and policy rules.</li>
                    <li>Deleting a saved dashboard item does not remove messages already sent to Discord, roles already assigned, public upload copies, or previously exported data.</li>
                    <li>Form owners can view responses in their dashboard. A configured response channel can also receive a summary, so avoid submitting information you do not want to share with that server.</li>
                  </ul>
                </article>
              </div>
            </section>

            <section id="contact" className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Contact</h2>
                <p>
                  If you have privacy questions about Meowhook or its Discord integration, use the public contact profile below.
                </p>
              </div>
              <div className={styles.contactRow}>
                <span>Operator: Mashiro</span>
                <a href="https://bio.link/heymashiro" target="_blank" rel="noopener noreferrer">
                  bio.link/heymashiro
                </a>
                <Link href="/terms">View Terms of Service</Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
