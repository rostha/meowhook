'use client';
import { IconPlus, IconSidebar, IconX } from '@/components/MeowIcons';

export default function SidebarHeader({ tabsLength, isMobile, onClose, onCollapse, onAdd }: {
  tabsLength: number; isMobile: boolean; onClose: () => void; onCollapse: () => void; onAdd: () => void;
}) {
  return <header className="drafts-heading">
    <div className="drafts-heading__row">
      <h2>Drafts <span className="drafts-heading__count">{tabsLength}</span></h2>
      <div className="drafts-heading__controls">
        <button type="button" onClick={onAdd} disabled={tabsLength >= 10} className="drafts-add" aria-label="New draft" title={tabsLength >= 10 ? 'You can keep up to 10 drafts' : 'New draft'}><IconPlus size={14} /><span>New</span></button>
        <button type="button" className="drafts-close" onClick={isMobile ? onClose : onCollapse} aria-label={isMobile ? 'Close drafts panel' : 'Hide sidebar'} title={isMobile ? 'Close drafts panel' : 'Hide sidebar'}>{isMobile ? <IconX size={18} /> : <IconSidebar size={16} />}</button>
      </div>
    </div>
  </header>;
}
