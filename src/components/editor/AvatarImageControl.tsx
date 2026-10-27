'use client';
import { useRef } from 'react';
import MediaSourceControl from '@/components/MediaSourceControl';
import type { Message, FileAttachment } from '@/lib/types';
import { avatarUploadError, avatarUploadPath, AVATAR_IMAGE_TYPES } from '@/lib/avatarUpload';

export default function AvatarImageControl({ message, webhookUrl, onChange }: { message: Message; webhookUrl: string; onChange: (url: string, attachment?: FileAttachment) => void }) {
  const currentChange = useRef(onChange);
  currentChange.current = onChange;
  const selected = message._attachments?.find(file => file.fieldKey === 'avatar' && file.previewUrl === message.avatar_url);
  return <MediaSourceControl label="Avatar URL" value={message.avatar_url} previewUrl={message.avatar_url} roundPreview selected={selected?.name ? { name: selected.name, size: selected.size } : undefined}
    accept={AVATAR_IMAGE_TYPES.join(',')} hint="PNG, JPG, GIF, WebP · Up to 8 MB. Uploads are hosted publicly for Discord."
    uploadDisabledReason={webhookUrl ? undefined : 'Connect a webhook above to upload an avatar. You can also paste an image URL.'}
    onChange={url => onChange(url)} onUpload={async (file, progress, signal) => {
      const error = avatarUploadError(file); if (error) throw new Error(error);
      const uploadSignal = AbortSignal.any([signal, AbortSignal.timeout(90_000)]);
      const pathname = avatarUploadPath(file.type, crypto.randomUUID());
      const response = await fetch('/api/avatar/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: uploadSignal,
        body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload: JSON.stringify({ webhookUrl, contentType: file.type, size: file.size }) } }),
      });
      const result = await response.json();
      if (!response.ok || !result.clientToken) throw new Error(result.error || 'The avatar could not be uploaded. Please try again.');
      const { put } = await import('@vercel/blob/client');
      const blob = await put(pathname, file, {
        access: 'public', token: result.clientToken, contentType: file.type, abortSignal: uploadSignal,
        onUploadProgress: event => progress(event.percentage),
      });
      if (!signal.aborted) currentChange.current(blob.url, { fieldKey: 'avatar', previewUrl: blob.url, name: file.name, size: file.size, mimeType: file.type });
    }} />;
}
