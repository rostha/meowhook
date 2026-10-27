'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useState, useEffect, useRef } from 'react';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useAppStore } from '@/stores/useAppStore';
import { builtinTemplates, templateCategories } from '@/lib/templates';
import { loadCustomTemplates, saveCustomTemplates } from '@/lib/storage';
import type { SavedTemplate } from '@/lib/types';
import { IconX, IconTrash, IconSaveDisk, IconCheck } from '@/components/MeowIcons';
import { motion } from 'framer-motion';
import { stripTransientAttachmentsFromMessages } from '@/lib/draftState';
import { TemplateMessagePreview } from './PreviewPanel';
import { restoreLocalFiles } from '@/lib/localFiles';
import { uid } from '@/lib/utils';

interface TemplateModalProps {
  onClose: () => void;
}

export default function TemplateModal({ onClose }: TemplateModalProps) {
  const uiMotion = useUiMotion();
  const dialogRef = useDialogFocus(onClose);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const updateActiveTab = useAppStore((s) => s.updateActiveTab);
  const messages = tabs[activeTabIndex]?.messages || [];
  const showToast = useAppStore((s) => s.showToast);
  const [selected, setSelected] = useState<{ name: string; messages: typeof messages; customize?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [tab, setTab] = useState<'builtin' | 'custom'>('builtin');
  const [customs, setCustoms] = useState<SavedTemplate[]>(() => loadCustomTemplates());
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveEmoji, setSaveEmoji] = useState('📋');

  useBodyScrollLock(true);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [selected, tab]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const applyTemplate = async (asNew: boolean) => {
    if (!selected || busy) return;
    setBusy(true);
    const state = useAppStore.getState();
    if (asNew && state.tabs.length >= 10) { showToast('Draft limit reached (10 drafts maximum)', 'error'); setBusy(false); return; }
    const restored = await restoreLocalFiles([{ id: uid(), name: selected.name, messages: selected.messages, webhookUrl: '' }]).catch(() => [{ id: uid(), name: selected.name, messages: selected.messages, webhookUrl: '' }]);
    const templateMessages = restored[0].messages.map(message => ({ ...message, id: uid(), embeds: message.embeds.map(embed => ({ ...embed, id: uid(), fields: embed.fields.map(field => ({ ...field, id: uid() })) })) }));
    if (asNew) {
      const current = useAppStore.getState();
      current.setTabs([...current.tabs, { id: uid(), name: selected.name, messages: templateMessages, webhookUrl: '' }]);
      current.setActiveTabIndex(current.tabs.length);
    } else updateActiveTab(t => ({ ...t, messages: templateMessages }));
    showToast(asNew ? 'Template opened as a new draft' : 'Template applied. Undo restores your previous draft.', 'success');
    onClose();
  };

  const confirmSave = async () => {
    if (busy) return;
    setSaveError('');
    if (!saveName.trim()) return;
    const newTemplate: SavedTemplate = {
      id: uid(), // Generate stable ID for new templates
      name: saveName.trim(),
      emoji: saveEmoji || '📋',
      messages: stripTransientAttachmentsFromMessages(messages)
    };
    const updated = [...customs, newTemplate];
    setBusy(true);
    const saved = await saveCustomTemplates(updated, messages);
    setBusy(false);
    if (!saved) { setSaveError('Template could not be saved. Free browser storage and try again.'); return; }
    setCustoms(updated);
    showToast(`Template "${saveName.trim()}" saved!`, 'success');
    setShowSaveForm(false);
    setSaveName('');
    setSaveEmoji('📋');
  };

  const deleteCustom = async (templateId: string | undefined, index: number) => {
    // Use ID if available, otherwise use index
    const updated = templateId
      ? customs.filter((t) => t.id !== templateId)
      : customs.filter((_, i) => i !== index);
    if (!await saveCustomTemplates(updated)) { showToast('Template could not be deleted. Try again.', 'error'); return; }
    setCustoms(updated);
    showToast('Template deleted', 'info');
  };

  return (
    <motion.div className="modal-overlay" onClick={onClose} {...uiMotion.overlay}>
      <motion.div className="modal-content" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="template-modal-title" onClick={(e) => e.stopPropagation()} style={{ padding: 0 }} {...uiMotion.dialog}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid color-mix(in srgb, var(--border) 75%, transparent)', background: 'color-mix(in srgb, var(--bg-secondary) 40%, transparent)' }}>
          <h2 id="template-modal-title" className="font-display" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Templates</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close"><IconX size={20} /></button>
        </div>

        <div className="template-modal-tabs" role="tablist" aria-label="Template source">
          <button type="button" role="tab" aria-selected={tab === 'builtin'} onClick={() => { setTab('builtin'); setSelected(null); }} className={`template-modal-tab ${tab === 'builtin' ? 'is-active' : ''}`}>
            Built-in ({builtinTemplates.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'custom'}
            onClick={() => { setTab('custom'); setSelected(null); }}
            title="Save layouts from your editor: Templates → Custom → Save Current as Template"
            className={`template-modal-tab ${tab === 'custom' ? 'is-active' : ''}`}
          >
            Custom ({customs.length})
          </button>
        </div>

        <div className="template-modal-body" ref={bodyRef}>
          {selected && <section className="template-preview-panel">
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)} disabled={busy}>Back to templates</button>
            <h3>{selected.name}</h3>
            <TemplateMessagePreview messages={selected.messages} />
            {selected.customize && <p className="template-customize-note"><strong>Make it yours</strong> {selected.customize}</p>}
            <p>Applying replaces the current draft’s messages. You can Undo afterward.</p>
            <div className="template-preview-actions">
              <button className="btn btn-secondary" disabled={busy} onClick={() => void applyTemplate(false)}>Apply to current draft</button>
              <button className="btn btn-primary" disabled={busy || tabs.length >= 10} onClick={() => void applyTemplate(true)}>Open as new draft</button>
            </div>
          </section>}
          {saveError && <p role="alert">{saveError}</p>}
          {!selected && tab === 'builtin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {templateCategories.map((category) => {
                const items = builtinTemplates.filter((t) => t.category === category);
                if (items.length === 0) return null;
                return (
                  <div key={category}>
                    <div className="template-modal-category-label">
                      {category}
                    </div>
                    <div className="template-card-grid">
                      {items.map((t) => (
                        <button key={t.name} onClick={() => setSelected(t)} className="builtin-template-card">
                          <span className="builtin-template-card__meta">
                            <span className="builtin-template-card__palette" aria-hidden="true">
                              {t.messages.flatMap(m => m.embeds).map(e => <i key={e.id} style={{ background: '#' + e.color.toString(16).padStart(6, '0') }} />)}
                            </span>
                            <span>{t.messages.reduce((count, m) => count + m.embeds.length, 0)} embed{t.messages.reduce((count, m) => count + m.embeds.length, 0) === 1 ? '' : 's'}</span>
                          </span>
                          <span className="builtin-template-card__name">{t.name}</span>
                          <span className="builtin-template-card__description">{t.description}</span>
                          <span className="builtin-template-card__preview">Preview template <span aria-hidden="true">→</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!selected && tab === 'custom' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Inline Save Form */}
              {showSaveForm ? (
                <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Save Current as Template</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input value={saveEmoji} onChange={(e) => setSaveEmoji(e.target.value)} placeholder="📋" aria-label="Template emoji" style={{ width: 48, textAlign: 'center', fontSize: 18, padding: '4px' }} maxLength={4} />
                    <input value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmSave()} placeholder="Template name" aria-label="Template name" style={{ flex: 1, fontSize: 13 }} autoFocus />
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-success btn-sm" onClick={confirmSave} disabled={busy || !saveName.trim()} style={{ flex: 1, justifyContent: 'center' }}>
                      <IconCheck size={14} /> Save
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowSaveForm(false)} style={{ padding: '5px 10px' }}>
                      <IconX size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => { setShowSaveForm(true); setSaveName(''); }} style={{ alignSelf: 'flex-start' }}>
                  <IconSaveDisk size={14} /> Save Current as Template
                </button>
              )}

              {customs.length === 0 && !showSaveForm && (
                <div
                  className="template-custom-empty"
                  style={{
                    padding: '18px 16px',
                    textAlign: 'center',
                    background: 'color-mix(in srgb, var(--bg-tertiary) 90%, transparent)',
                    borderRadius: 12,
                    border: '1px dashed color-mix(in srgb, var(--border) 85%, var(--accent))',
                  }}
                >
                  <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 10 }} aria-hidden>📂</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No custom templates yet</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, margin: '0 0 14px' }}>
                    Build a message in the editor, open <strong style={{ color: 'var(--text-secondary)' }}>Templates</strong>, stay on this tab, then tap <strong style={{ color: 'var(--text-secondary)' }}>Save Current as Template</strong>. Your layouts are stored only in this browser.
                  </p>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { setShowSaveForm(true); setSaveName(''); }} style={{ justifyContent: 'center' }}>
                    <IconSaveDisk size={14} /> Save your first template
                  </button>
                </div>
              )}
              {customs.map((t, i) => (
                <div key={t.id || `${t.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--accent)', fontSize: 20, lineHeight: 1 }} aria-hidden>{t.emoji}</span>
                  <button onClick={() => setSelected({ name: t.name, messages: t.messages })} style={{ flex: 1, background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                    {t.name}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteCustom(t.id, i)} style={{ color: 'var(--danger)' }} aria-label="Delete template"><IconTrash size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
