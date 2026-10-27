import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/share/route';
import { GET } from '@/app/api/share/[id]/route';
import { createDefaultEmbed, createDefaultMessage, messagesForSharePayload, parseImportedDraftData } from './utils';
import { decodeMessagesFromUrlHash, encodeMessagesForUrlHash } from './shareHash';
import { COMPONENTS_V2_FLAG, newBlock } from './messageComponents';

const request = (messages: unknown) => new NextRequest('http://localhost/api/share', {
  method: 'POST', body: JSON.stringify({ messages, expiresIn: 604800 }),
  headers: { 'Content-Type': 'application/json' },
});

describe('share API draft round trips', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test-account');
    vi.stubEnv('CLOUDFLARE_KV_NAMESPACE_ID', 'test-namespace');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'test-token');
    const storage = new Map<string, string>();
    vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
      const key = new URL(input).pathname;
      if (options?.method === 'PUT') {
        storage.set(key, String(options.body));
        return new Response('ok');
      }
      return storage.has(key) ? new Response(storage.get(key)) : new Response('', { status: 404 });
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each(['standard', 'v2'] as const)('creates and reopens a %s draft with editable components', async (componentMode) => {
    const embed = { ...createDefaultEmbed(), description: 'A shared description', thumbnail: { url: 'https://example.com/thumb.png' } };
    const message = {
      ...createDefaultMessage(), content: 'Hello 🐱', embeds: [embed], componentMode,
      flags: componentMode === 'v2' ? COMPONENTS_V2_FLAG : 0,
      linkButtons: [{ id: 'link', label: 'Visit', url: 'https://example.com' }],
      componentBlocks: [newBlock('container'), newBlock('gallery')],
      loadedFromMessageId: 'private-message-id', loadedAttachmentIds: ['attachment-id'],
    };
    const payload = messagesForSharePayload([message]);
    expect(payload[0]).not.toHaveProperty('loadedFromMessageId');
    expect(payload[0]).not.toHaveProperty('loadedAttachmentIds');
    const created = await POST(request(payload));
    expect(created.status).toBe(200);
    const { id } = await created.json();
    const opened = await GET(new NextRequest(`http://localhost/api/share/${id}`), { params: Promise.resolve({ id }) });
    expect(opened.status).toBe(200);
    const imported = parseImportedDraftData(await opened.json())[0].messages[0];
    expect(imported).toMatchObject({
      content: message.content, componentMode, componentBlocks: message.componentBlocks,
      linkButtons: message.linkButtons, embeds: [{ description: embed.description, thumbnail: embed.thumbnail }],
    });
  });

  it('supports the local hash fallback with V2 blocks', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', '');
    const messages = messagesForSharePayload([{ ...createDefaultMessage(), componentMode: 'v2', componentBlocks: [newBlock('container')] }]);
    const response = await POST(request(messages));
    expect(await response.json()).toEqual({ fallback: true });
    const restored = parseImportedDraftData(decodeMessagesFromUrlHash(encodeMessagesForUrlHash(messages)));
    expect(restored[0].messages[0].componentBlocks).toEqual(messages[0].componentBlocks);
  });

  it.each([
    { componentMode: 'invalid' }, { componentBlocks: {} }, { linkButtons: 'invalid' }, { webhookUrl: 'private' },
  ])('rejects malformed or private message fields: %j', async (extra) => {
    const response = await POST(request([{ ...createDefaultMessage(), ...extra }]));
    expect(response.status).toBe(400);
  });

  it('continues accepting older messages without editor component fields', async () => {
    const response = await POST(request([{ content: 'Legacy shared message', embeds: [] }]));
    expect(response.status).toBe(200);
  });
});
