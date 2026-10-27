import type { Message } from '@/lib/types';
import type { BotAction, BotCommand, BotForm, BotFormSubmission } from '@/lib/bot/types';
import type { ScheduledJob } from '@/lib/scheduling/types';

export interface RecordMetadata { id: string; ownerId: string; createdAt: string; updatedAt: string; revision: number }
export interface SavedMessage extends RecordMetadata {
  name: string;
  guildId: string;
  channelId: string;
  payload: Record<string, unknown>;
  actionIds: string[];
  /** The original visual document preserves every editable property across the editor round trip. */
  editorMessage?: Message;
  lastMessageId?: string;
  lastSentAt?: string;
  lastChannelId?: string;
}
export type SavedAction = BotAction & RecordMetadata;
export type SavedForm = BotForm & RecordMetadata;
export type SavedCommand = BotCommand & RecordMetadata;
export type SavedResponse = BotFormSubmission & RecordMetadata;
export type SavedSchedule = ScheduledJob;
export interface ResourceMap {
  messages: SavedMessage;
  actions: SavedAction;
  forms: SavedForm;
  commands: SavedCommand;
  responses: SavedResponse;
  schedules: SavedSchedule;
}
export type ResourceName = keyof ResourceMap;
export const RESOURCE_NAMES: ResourceName[] = ['messages', 'actions', 'forms', 'commands', 'responses', 'schedules'];
export interface GuildSummary { id: string; name: string; icon: string | null; botPresent: boolean; permissions: string }
export interface ChannelSummary { id: string; name: string; type: number }
export interface RoleSummary { id: string; name: string; position: number; managed?: boolean; permissions: string; assignable: boolean }
export interface PlatformStatus {
  authAvailable: boolean;
  discordConfigured: boolean;
  discordLogin: boolean;
  botConfigured: boolean;
  schedulerConfigured: boolean;
}
