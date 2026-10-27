'use client';

import { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from '@/components/MeowIcons';
import styles from './legal.module.css';

type LegalSection = { id: string; label: string };

export default function LegalSidebar({
  label,
  sections,
  summary,
  eyebrow = 'Legal guide',
}: {
  label: string;
  sections: LegalSection[];
  summary: string;
  eyebrow?: string;
}) {
  const sidebarRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const scrollRoot = sidebarRef.current?.closest('main');
    if (!scrollRoot) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let current = sections[0]?.id ?? '';
        for (const section of sections) {
          const element = document.getElementById(section.id);
          if (element && element.getBoundingClientRect().top <= 154) current = section.id;
        }
        setActive(current);
      });
    };
    update();
    scrollRoot.addEventListener('scroll', update, { passive: true });
    window.addEventListener('hashchange', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      scrollRoot.removeEventListener('scroll', update);
      window.removeEventListener('hashchange', update);
      window.removeEventListener('resize', update);
    };
  }, [sections]);

  const activeLabel = sections.find((section) => section.id === active)?.label ?? sections[0]?.label;

  return (
    <aside ref={sidebarRef} className={styles.sidebar} aria-label={`${label} navigation`}>
      <button
        type="button"
        className={styles.mobileSideToggle}
        aria-expanded={open}
        aria-controls="legal-section-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span>On this page</span>
        <span className={styles.mobileCurrent}>{activeLabel}</span>
        <IconChevronDown size={15} className={open ? styles.rotated : undefined} />
      </button>
      <div className={`${styles.navigation} ${open ? styles.navigationOpen : ''}`} id="legal-section-navigation">
        <div className={styles.sidebarHead}>
          <span className={styles.sideEyebrow}>{eyebrow}</span>
          <h2>On this page</h2>
        </div>
        <nav className={styles.sideList} aria-label={`${label} sections`}>
          {sections.map((section, index) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={active === section.id ? styles.activeLink : undefined}
              aria-current={active === section.id ? 'location' : undefined}
              onClick={() => {
                setActive(section.id);
                setOpen(false);
              }}
            >
              <span className={styles.sectionNumber}>{String(index + 1).padStart(2, '0')}</span>
              <span>{section.label}</span>
            </a>
          ))}
        </nav>
        <div className={styles.sideSummary}>
          <span>In brief</span>
          <p>{summary}</p>
        </div>
      </div>
    </aside>
  );
}
