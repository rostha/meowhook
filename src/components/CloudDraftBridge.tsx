'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { dashboardRequest, DashboardApiError, errorMessage } from '@/lib/dashboardClient';
import { persistEditorMedia, materializeEditorMedia } from '@/lib/platform/editorBridge';
import { parseDiscordPayloadToMessage, uid } from '@/lib/utils';
import { buildPayload } from '@/lib/payload';
import type { SavedMessage } from '@/lib/platform/types';
import { cloudSource, rememberCloudSource } from '@/lib/platform/cloudSources';

export default function CloudDraftBridge() {
  const hydrated = useAppStore(state => state.hydrated);
  const sources = useRef(new Map<string, SavedMessage>());
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const id = new URL(window.location.href).searchParams.get('cloudMessage');
    if (!id) return;
    const controller = new AbortController();
    void (async () => {
      const { item } = await dashboardRequest<{ item: SavedMessage }>(`/api/platform/messages/${encodeURIComponent(id)}`, { signal: controller.signal });
      const store = useAppStore.getState();
      if (store.tabs.length >= 10) throw new Error('There are already ten local drafts. Remove one before opening a dashboard message.');
      const message = await materializeEditorMedia(item.editorMessage || parseDiscordPayloadToMessage(item.payload), controller.signal);
      if (controller.signal.aborted) { for (const attachment of message._attachments || []) URL.revokeObjectURL(attachment.previewUrl); return; }
      message.id = uid();
      sources.current.set(message.id, item);
      const current = useAppStore.getState();
      if (current.tabs.length >= 10) {
        for (const attachment of message._attachments || []) if (attachment.previewUrl.startsWith('blob:')) URL.revokeObjectURL(attachment.previewUrl);
        throw new Error('There are already ten local drafts. Remove one before opening a dashboard message.');
      }
      const index = current.tabs.length;
      current.setTabs([...current.tabs, { id: uid(), name: item.name, messages: [message], webhookUrl: '' }]);
      current.setActiveTabIndex(index);
      rememberCloudSource(message.id, item);
      current.showToast('Dashboard message opened. Your local drafts are still here.', 'success');
      const url = new URL(window.location.href); url.searchParams.delete('cloudMessage'); window.history.replaceState(null, '', url);
    })().catch(error => { if (!controller.signal.aborted) useAppStore.getState().showToast(errorMessage(error), 'error'); });
    return () => controller.abort();
  }, [hydrated]);

  const save = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true);
    try {
      const store = useAppStore.getState();
      const tab = store.tabs[store.activeTabIndex]; const message = tab?.messages[store.activeMessageIndex];
      if (!message) return;
      // Check sign-in before uploading files; local drafts remain available without an account.
      const account = await dashboardRequest<{ user: { id: string } }>('/api/platform/account');
      const mapping = cloudSource(message.id, account.user.id);
      let source = sources.current.get(message.id);
      if (source?.ownerId !== account.user.id) source = undefined;
      if (mapping) {
        try {
          const current = await dashboardRequest<{ item: SavedMessage }>(`/api/platform/messages/${encodeURIComponent(mapping.id)}`);
          if (current.item.revision !== mapping.revision) throw new Error('This dashboard message changed elsewhere. Open its latest copy before saving again.');
          source = current.item;
        } catch (error) { if (error instanceof DashboardApiError && error.status === 404) source = undefined; else throw error; }
      }
      const document = await persistEditorMedia(message);
      const body = { name: tab.name, guildId: source?.guildId || '', channelId: source?.channelId || '',
        actionIds: source?.actionIds || [], editorMessage: document, payload: buildPayload(document), ...(source ? { revision: source.revision } : {}) };
      const result = await dashboardRequest<{ item: SavedMessage }>(`/api/platform/messages${source ? `/${source.id}` : ''}`, { method: source ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      sources.current.set(message.id, result.item);
      const remembered = rememberCloudSource(message.id, result.item);
      store.showToast('Message saved to your dashboard.', 'success');
      if (!remembered) store.showToast('The message was saved. Browser storage is full; reopen it from Dashboard before your next edit.', 'info');
    } catch (error) {
      useAppStore.getState().showToast(error instanceof DashboardApiError && error.status === 401 ? 'Open Dashboard and sign in to save messages to your account.' : errorMessage(error), 'error');
    } finally { busy.current = false; setSaving(false); }
  }, []);
  useEffect(() => { const listener = () => { void save(); }; window.addEventListener('meowhook:save-account', listener); return () => window.removeEventListener('meowhook:save-account', listener); }, [save]);
  return saving ? <span className="cloud-draft-progress" role="status">Saving to dashboard…</span> : null;
}
