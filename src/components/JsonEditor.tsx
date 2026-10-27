'use client';
import { useUiMotion } from '@/lib/useUiMotion';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useState, useEffect } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { pruneUnusedMessageAttachments } from '@/lib/embedTransfers';
import { buildPayload } from '@/lib/payload';
import { blocksFromDiscord, hasUnsupportedDiscordComponents, COMPONENTS_V2_FLAG } from '@/lib/messageComponents';
import { copyTextToClipboard, createDefaultMessage, createDefaultEmbed, createDefaultField } from '@/lib/utils';
import type { Message } from '@/lib/types';
import { IconX, IconCopy, IconMinimize, IconMaximize, IconCheck, IconAlert, IconJson } from '@/components/MeowIcons';
import JsonCodeEditor from '@/components/JsonCodeEditor';
import { motion } from 'framer-motion';

interface JsonEditorProps {
  onClose: () => void;
}

export default function JsonEditor({ onClose }: JsonEditorProps) {
  const uiMotion = useUiMotion();
  const dialogRef = useDialogFocus(onClose);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabIndex = useAppStore((s) => s.activeTabIndex);
  const updateActiveTab = useAppStore((s) => s.updateActiveTab);
  const showToast = useAppStore((s) => s.showToast);

  const messages = tabs[activeTabIndex]?.messages || [];

  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    const payloads = messages.map(buildPayload);
    setJson(JSON.stringify(payloads.length === 1 ? payloads[0] : payloads, null, 2));
  }, [messages]);

  const format = () => {
    try {
      setJson(JSON.stringify(JSON.parse(json), null, 2));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  const minify = () => {
    try {
      setJson(JSON.stringify(JSON.parse(json)));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  const handleCopy = async () => {
    const copied = await copyTextToClipboard(json);
    showToast(copied ? 'JSON copied' : 'Could not copy. Select the text and copy it manually.', copied ? 'success' : 'error');
  };

  const handleApply = () => {
    try {
      const data = JSON.parse(json) as unknown;
      if (typeof data !== 'object' || data === null) {
        setError('JSON must be an object or array of objects');
        return;
      }
      const arr = Array.isArray(data) ? data : [data];
      if (arr.length === 0 || arr.length > 10) {
        setError('Must have between 1 and 10 messages');
        return;
      }
      const msgs: Message[] = arr.map((d: unknown, messageIndex: number) => {
        if (typeof d !== 'object' || d === null || Array.isArray(d)) {
          throw new Error('Each message must be a JSON object');
        }
        const obj = d as Record<string, unknown>;
        if (hasUnsupportedDiscordComponents(obj.components)) throw new Error('This message contains interactive or unsupported components. Use webhook-compatible components only.');
        const componentBlocks = blocksFromDiscord(obj.components);
        const flags = typeof obj.flags === 'number' ? obj.flags : 0;
        const base = createDefaultMessage();
        const safeString = (v: unknown, fallback: string) => typeof v === 'string' ? v : fallback;
        return {
          ...base,
          id: messages[messageIndex]?.id ?? base.id,
          _attachments: messages[messageIndex]?._attachments,
          thread_name: typeof obj.thread_name === 'string' ? obj.thread_name : undefined,
          content: safeString(obj.content, base.content),
          username: safeString(obj.username, base.username),
          avatar_url: safeString(obj.avatar_url, base.avatar_url),
          tts: typeof obj.tts === 'boolean' ? obj.tts : base.tts,
          flags,
          componentMode: (flags & COMPONENTS_V2_FLAG) !== 0 ? 'v2' : 'standard',
          componentBlocks: (flags & COMPONENTS_V2_FLAG) !== 0 ? componentBlocks : [],
          linkButtons: (flags & COMPONENTS_V2_FLAG) === 0 ? componentBlocks.filter(block => block.type === 'links').flatMap(block => block.type === 'links' ? block.buttons : []) : [],
          embeds: Array.isArray(obj.embeds) ? obj.embeds.map((e: unknown, embedIndex: number) => {
            if (typeof e !== 'object' || e === null || Array.isArray(e)) {
              throw new Error('Each embed must be a JSON object');
            }
            const embedObj = e as Record<string, unknown>;
            const baseE = createDefaultEmbed();
            const authorRaw = typeof embedObj.author === 'object' && embedObj.author && !Array.isArray(embedObj.author) ? embedObj.author as Record<string, unknown> : {};
            const thumbRaw = typeof embedObj.thumbnail === 'object' && embedObj.thumbnail && !Array.isArray(embedObj.thumbnail) ? embedObj.thumbnail as Record<string, unknown> : {};
            const imageRaw = typeof embedObj.image === 'object' && embedObj.image && !Array.isArray(embedObj.image) ? embedObj.image as Record<string, unknown> : {};
            const footerRaw = typeof embedObj.footer === 'object' && embedObj.footer && !Array.isArray(embedObj.footer) ? embedObj.footer as Record<string, unknown> : {};
            return {
              ...baseE,
              id: messages[messageIndex]?.embeds[embedIndex]?.id ?? baseE.id,
              title: safeString(embedObj.title, baseE.title),
              url: safeString(embedObj.url, baseE.url),
              description: safeString(embedObj.description, baseE.description),
              color: typeof embedObj.color === 'number' ? embedObj.color : baseE.color,
              timestamp: safeString(embedObj.timestamp, baseE.timestamp),
              author: {
                name: safeString(authorRaw.name, baseE.author.name),
                url: safeString(authorRaw.url, baseE.author.url),
                icon_url: safeString(authorRaw.icon_url, baseE.author.icon_url),
              },
              thumbnail: { url: safeString(thumbRaw.url, baseE.thumbnail.url) },
              image: { url: safeString(imageRaw.url, baseE.image.url) },
              footer: {
                text: safeString(footerRaw.text, baseE.footer.text),
                icon_url: safeString(footerRaw.icon_url, baseE.footer.icon_url),
              },
              fields: Array.isArray(embedObj.fields) ? embedObj.fields.map((f: unknown) => {
                if (typeof f !== 'object' || f === null || Array.isArray(f)) return createDefaultField();
                const fObj = f as Record<string, unknown>;
                return { ...createDefaultField(), name: safeString(fObj.name, ''), value: safeString(fObj.value, ''), inline: !!fObj.inline };
              }) : [],
            };
          }) : [],
        };
      });
      updateActiveTab((t) => ({ ...t, messages: msgs.map(pruneUnusedMessageAttachments) }));
      showToast('Message updated from JSON', 'success');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <motion.div className="modal-overlay" onClick={onClose} {...uiMotion.overlay}>
      <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="json-editor-title" onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--modal-bg)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--modal-stack)',
        overflow: 'hidden',
        width: expanded ? 'calc(100vw - 32px)' : 'min(90vw, 850px)',
        height: expanded ? 'calc(100dvh - 32px)' : 'min(85dvh, 720px)',
      }} {...uiMotion.dialog}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid color-mix(in srgb, var(--border) 75%, transparent)', flexShrink: 0, background: 'color-mix(in srgb, var(--bg-secondary) 40%, transparent)' }}>
          <h2 id="json-editor-title" style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-primary)', margin: 0 }}>
            <IconJson size={22} strokeWidth={1.75} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} aria-hidden />
            JSON Editor
          </h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close JSON editor" style={{ padding: 4 }}><IconX size={20} strokeWidth={1.75} /></button>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 6, padding: '12px 20px', borderBottom: '1px solid color-mix(in srgb, var(--border) 75%, transparent)', flexShrink: 0, flexWrap: 'wrap', background: 'var(--modal-bg)' }}>
          <button className="btn btn-secondary btn-sm" onClick={format}>Format JSON</button>
          <button className="btn btn-secondary btn-sm" onClick={minify}>Minify JSON</button>
          <button className="btn btn-secondary btn-sm" onClick={handleCopy}><IconCopy size={14} /> Copy</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Restore JSON window' : 'Expand JSON window'} title={expanded ? 'Restore JSON window' : 'Expand JSON window'}>{expanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />}</button>
          <button className="btn btn-success btn-sm" onClick={handleApply} style={{ fontWeight: 600 }}><IconCheck size={14} /> Apply to Editor</button>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, padding: '12px 20px 16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <JsonCodeEditor value={json} onChange={(next) => {
              setJson(next);
              try {
                JSON.parse(next);
                setError('');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Invalid JSON');
              }
            }} />

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 12px', background: 'rgba(242, 63, 67, 0.08)', border: '1px solid rgba(242, 63, 67, 0.3)', borderRadius: 8, fontSize: 13, color: 'var(--danger)' }}>
              <IconAlert size={16} /> {error}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
