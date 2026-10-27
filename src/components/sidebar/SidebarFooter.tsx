'use client';
import { IconHelpBubble, IconChevronRight } from '@/components/MeowIcons';
export default function SidebarFooter(_props: { isMobile: boolean; theme: string }) {
  return <footer className="sidebar-footer drafts-footer">
    <a href="/docs" className="drafts-footer__help"><IconHelpBubble size={16} aria-hidden /><span>Help & documentation</span><IconChevronRight size={14} aria-hidden /></a>
    <div className="drafts-footer__bottom">
      <nav aria-label="Site information"><a href="/about">About</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></nav>
      <span className="drafts-footer__credit">Made by <a href="https://bio.link/heymashiro" target="_blank" rel="noopener noreferrer" aria-label="Created by Mashiro">Mashiro</a></span>
    </div>
  </footer>;
}
