import Link from 'next/link';
import { IconBookOpen } from '@/components/MeowIcons';
import styles from './legal.module.css';

export default function LegalHeader({ current }: { current: 'about' | 'terms' | 'privacy' }) {
  return (
    <header className={styles.header}>
      <Link href="/docs" className={styles.brand} aria-label="Meowhook Handbook">
        <IconBookOpen size={21} />
        <strong>Meowhook</strong>
        <span>Handbook</span>
      </Link>
      <nav className={styles.headerActions} aria-label="Handbook and legal pages">
        <Link href="/docs" className={styles.headerLink}>Docs</Link>
        <Link href="/about" className={styles.headerLink} aria-current={current === 'about' ? 'page' : undefined}>About</Link>
        <Link href="/terms" className={styles.headerLink} aria-current={current === 'terms' ? 'page' : undefined}>Terms</Link>
        <Link href="/privacy" className={styles.headerLink} aria-current={current === 'privacy' ? 'page' : undefined}>Privacy</Link>
        <Link href="/" className={styles.builderLink}>Open builder <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
  );
}
