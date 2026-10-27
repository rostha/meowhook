import { describe, expect, it } from 'vitest';
import { retryMessageIds, sendDestination, type SendRun } from './sendHistory';
import { validationTarget } from './validationTarget';
import { createDefaultMessage, createDefaultEmbed, createDefaultField } from './utils';
import type { ComponentBlock } from './types';

describe('safe send retries and validation navigation', () => {
  it('retries only unsuccessful messages at the same destination', () => {
    const run: SendRun = { draftId: 'draft', at: 1, destination: 'target', rows: [
      { localId: 'a', position: 1, status: 'sent', discordId: '123' },
      { localId: 'b', position: 2, status: 'failed' },
      { localId: 'c', position: 3, status: 'not-sent' },
    ] };
    expect(retryMessageIds(run, 'target')).toEqual(['b', 'c']);
    expect(retryMessageIds(run, 'other')).toEqual([]);
  });
  it('stores a destination identity without the webhook token, separating threads', () => {
    const url = 'https://discord.com/api/webhooks/123/private-token?thread_id=456';
    expect(sendDestination(url)).not.toContain('private-token');
    expect(sendDestination(url)).not.toBe(sendDestination(url.replace('456', '789')));
  });
  it('targets the affected embed field rather than the first message', () => {
    const field = { ...createDefaultField(), name: 'Only a name' };
    const embed = { ...createDefaultEmbed(), fields: [field] };
    const messages = [createDefaultMessage(), { ...createDefaultMessage(), embeds: [embed] }];
    expect(validationTarget(messages, 'Field row incomplete\nMessage 2, embed 1: field 1 needs both a name and a value.')).toMatchObject({ messageIndex: 1, section: 'embeds', embedId: embed.id, fieldId: field.id, embedSection: 'fields' });
  });
  it('targets text inside a container and optional gallery descriptions', () => {
    const componentBlocks: ComponentBlock[] = [{ id: 'container', type: 'container', color: 0xa9b9b4, blocks: [
      { id: 'text', type: 'text', content: '' },
      { id: 'gallery', type: 'gallery', items: [{ id: 'image', url: '', description: '' }] },
    ] }];
    const messages = [{ ...createDefaultMessage(), componentMode: 'v2' as const, componentBlocks }];
    expect(validationTarget(messages, 'Check components\nMessage 1, block 1, block 1: add text.')).toMatchObject({ section: 'components', componentId: 'text', inputLabel: 'Component text' });
    expect(validationTarget(messages, 'Check components\nMessage 1, block 1, block 2: image 1 description must be 1,024 characters or less.')).toMatchObject({ section: 'components', componentId: 'gallery', inputLabel: 'Gallery image 1 description' });
  });
});
