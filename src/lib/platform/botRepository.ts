import type { BotConnection, BotRepository, BotFormSubmission } from '@/lib/bot/types';
import { applicationId, platformStatus } from './config';
import { getAuth } from '@/lib/auth';
import { getDatabase } from './database';
import { PlatformRepository } from './repository';
import type { SavedAction, SavedForm, SavedCommand } from './types';

/** Drafts created before app configuration belong to this deployment's eventual bot. */
function bindConfiguredBot<T extends { botId: string }>(value: T | null, botId: string): T | null {
  if (value?.botId === botId) return value;
  if (value?.botId === 'meowhook' && botId === applicationId() && botId !== 'meowhook') return { ...value, botId };
  return null;
}

export async function getConfiguredBot(id: string): Promise<BotConnection | null> {
  if (!platformStatus().authAvailable || !platformStatus().botConfigured || id !== applicationId()) return null;
  await getAuth();
  return { id, applicationId: id, ownerId: 'system', name: 'Meowhook', publicKey: process.env.DISCORD_PUBLIC_KEY!, token: process.env.DISCORD_BOT_TOKEN! };
}
async function lookup<T extends { botId: string }>(kind: string, botId: string, guildId: string, id: string): Promise<T | null> {
  const row = await getDatabase().selectFrom('platform_resource').select('data').where('id', '=', id).where('kind', '=', kind).where('guild_id', '=', guildId).executeTakeFirst();
  const value = row ? JSON.parse(row.data) as T : null;
  return bindConfiguredBot(value, botId);
}
export const platformBotRepository: BotRepository = {
  getAction: (botId, guildId, id) => lookup<SavedAction>('actions', botId, guildId, id),
  getForm: (botId, guildId, id) => lookup<SavedForm>('forms', botId, guildId, id),
  async getCommand(botId, guildId, name, type) {
    const rows = await getDatabase().selectFrom('platform_resource').select('data').where('kind', '=', 'commands').where('guild_id', '=', guildId).execute();
    return rows.map(row => bindConfiguredBot(JSON.parse(row.data) as SavedCommand, botId))
      .find(command => command?.name === name && command.type === type) || null;
  },
  async claimInteraction(botId, interactionId) {
    const row = await getDatabase().insertInto('platform_interaction').values({ key: `${botId}:${interactionId}`, created_at: new Date().toISOString() })
      .onConflict(conflict => conflict.column('key').doNothing()).returning('key').executeTakeFirst();
    return Boolean(row);
  },
  async saveSubmission(submission: BotFormSubmission) {
    const form = await lookup<SavedForm>('forms', submission.botId, submission.guildId, submission.formId);
    if (!form) throw new Error('The form is no longer available.');
    const existing = await new PlatformRepository().get('responses', form.ownerId, submission.id);
    if (existing) return;
    const now = new Date().toISOString();
    const value = { ...submission, ownerId: form.ownerId, revision: 1, createdAt: now, updatedAt: now };
    await getDatabase().insertInto('platform_resource').values({ id: submission.id, owner_id: form.ownerId, guild_id: submission.guildId,
      kind: 'responses', data: JSON.stringify(value), revision: 1, created_at: now, updated_at: now })
      .onConflict(conflict => conflict.column('id').doNothing()).execute();
  },
};
