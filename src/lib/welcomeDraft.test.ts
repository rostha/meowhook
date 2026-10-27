import { describe, expect, it } from 'vitest';
import { createDefaultEmbed, createDefaultField, createDefaultMessage } from './utils';
import { createWelcomeDraft, upgradeUntouchedWelcomeDraft } from './welcomeDraft';

function previousWelcomeDraft() {
  const tab = createWelcomeDraft();
  const embed = createDefaultEmbed();
  embed.color = 0x8996a8;
  embed.title = 'A message, shaped your way';
  embed.description = 'Give an update a clear title, a little context, or an image. Change anything on this card and watch the preview respond.';
  embed.fields = [
    { ...createDefaultField(), name: 'Make it yours', value: 'Replace this example with an announcement, a welcome note, or something entirely your own.' },
    { ...createDefaultField(), name: 'Ready to send?', value: 'Paste your Discord webhook URL above, check the preview, then press **Send**.' },
  ];
  embed.footer.text = 'Drafts save in this browser · New starts with a blank page';
  tab.messages = [{ ...createDefaultMessage(), content: '**Welcome to Meowhook.**\nThis is an example draft. Change a word here and see it update in the preview.', embeds: [embed] }];
  return tab;
}

describe('welcome example', () => {
  it('teaches the send flow in the embed description without fields', () => {
    const message = createWelcomeDraft().messages[0];
    const embed = message.embeds[0];
    expect(message.username).toBe('Meowhook');
    expect(message.avatar_url).toBe('https://i.pinimg.com/736x/b4/07/8d/b4078d3649e49e0c193eed09d738f061.jpg');
    expect(embed.fields).toEqual([]);
    expect(embed.title).toBe('');
    expect(embed.description).toContain('Webhook URL');
    expect(embed.description).toContain('Send');
    expect(embed.description).toContain('Advanced V2 components');
    expect(embed.description.length).toBeLessThanOrEqual(4096);
  });

  it('refreshes the untouched old example while preserving IDs', () => {
    const old = previousWelcomeDraft();
    old.name = 'Draft 1';
    const next = upgradeUntouchedWelcomeDraft(old);
    expect(next).not.toBe(old);
    expect(next.id).toBe(old.id);
    expect(next.name).toBe('Draft 1');
    expect(next.messages[0].id).toBe(old.messages[0].id);
    expect(next.messages[0].embeds[0].id).toBe(old.messages[0].embeds[0].id);
    expect(next.messages[0].embeds[0].fields).toEqual([]);
    expect(next.messages[0].username).toBe('Meowhook');
  });

  it('leaves an edited example and a connected webhook untouched', () => {
    const edited = previousWelcomeDraft();
    edited.messages[0].embeds[0].fields[0].value = 'My own guide';
    expect(upgradeUntouchedWelcomeDraft(edited)).toBe(edited);

    const connected = previousWelcomeDraft();
    connected.webhookUrl = 'https://discord.com/api/webhooks/example/token';
    expect(upgradeUntouchedWelcomeDraft(connected)).toBe(connected);
  });

  it('updates only the untouched welcome accent in a saved draft', () => {
    const saved = createWelcomeDraft();
    saved.messages[0].embeds[0].color = 0x8996a8;
    const updated = upgradeUntouchedWelcomeDraft(saved);
    expect(updated.messages[0].embeds[0].color).toBe(0xa9b9b4);
    expect(updated.messages[0].embeds[0].id).toBe(saved.messages[0].embeds[0].id);

    const savedWithoutProfile = createWelcomeDraft();
    savedWithoutProfile.messages[0].username = '';
    savedWithoutProfile.messages[0].avatar_url = '';
    const upgraded = upgradeUntouchedWelcomeDraft(savedWithoutProfile);
    expect(upgraded.messages[0].username).toBe('Meowhook');
    expect(upgraded.messages[0].avatar_url).toContain('i.pinimg.com');

    const customized = createWelcomeDraft();
    customized.messages[0].embeds[0].color = 0xff0000;
    expect(upgradeUntouchedWelcomeDraft(customized)).toBe(customized);
  });
});
