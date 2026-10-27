import { buildActionRows, buildFormModal } from './components';
import { assertSelfRolePermissions, hasPermission, permissionBits, PERMISSIONS } from './permissions';
import { DiscordRestClient, DiscordRestError } from './rest';
import type { BotAction, BotAnswer, BotConnection, BotForm, BotFormSubmission, BotRepository, DiscordInteraction, DiscordObject, InteractionPlan, InteractionResponse } from './types';
import { ENTITY_ID, SNOWFLAKE, validateBotAction, validateBotCommand, validateBotForm } from './validation';

const ephemeral = (content: string, components?: DiscordObject[]): InteractionResponse => ({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] }, ...(components?.length ? { components } : {}) } });
const unavailable = () => ({ response: ephemeral('This action is no longer available. Ask a server administrator to update it.') });

function scoped<T extends { botId: string; guildId: string; enabled: boolean }>(value: T | null, botId: string, guildId: string): T | null {
  return value?.enabled && value.botId === botId && value.guildId === guildId ? value : null;
}

function readSubmittedFields(components: unknown): Map<string, DiscordObject> {
  const fields = new Map<string, DiscordObject>();
  const visit = (values: unknown, depth: number) => {
    if (!Array.isArray(values) || depth > 3) throw new Error('The form response is invalid.');
    for (const value of values) {
      if (!value || typeof value !== 'object') throw new Error('The form response is invalid.');
      const node = value as DiscordObject;
      if (node.type === 18) visit([node.component], depth + 1);
      else if (node.type === 1) visit(node.components, depth + 1);
      else {
        if (typeof node.custom_id !== 'string' || fields.has(node.custom_id)) throw new Error('The form response has duplicate or missing questions.');
        fields.set(node.custom_id, node);
      }
    }
  };
  visit(components, 0);
  return fields;
}

/** Discord validates its modal, but validate again against our stored version before persisting. */
export function parseFormSubmission(form: BotForm, interaction: DiscordInteraction, now = new Date()): BotFormSubmission {
  const issue = validateBotForm(form);
  if (issue) throw new Error(issue);
  const fields = readSubmittedFields(interaction.data?.components);
  if (fields.size !== form.fields.length) throw new Error('This form changed while it was open. Close it and open the updated form.');
  const answers: Record<string, BotAnswer> = Object.create(null) as Record<string, BotAnswer>;
  const attachments: NonNullable<BotFormSubmission['attachments']> = [];
  const expectedTypes = { short: 4, paragraph: 4, select: 3, user: 5, role: 6, mentionable: 7, channel: 8, file: 19, radio: 21, checkboxes: 22, checkbox: 23 };
  for (const field of form.fields) {
    const submitted = fields.get(field.id);
    if (!submitted || submitted.type !== expectedTypes[field.type]) throw new Error('This form changed while it was open. Close it and open the updated form.');
    if (field.type === 'checkbox') {
      if (typeof submitted.value !== 'boolean') throw new Error(`${field.label}: the checkbox value is invalid.`);
      answers[field.id] = submitted.value;
    } else if (field.type === 'short' || field.type === 'paragraph') {
      const value = submitted.value;
      if (typeof value !== 'string' || value.length > (field.maxLength ?? 4000) || (value.length > 0 && value.length < (field.minLength ?? 0)) || (field.required && !value.trim())) throw new Error(`${field.label}: check the text length and required answer.`);
      answers[field.id] = value;
    } else if (field.type === 'radio') {
      const value = submitted.value;
      if ((value !== null && typeof value !== 'string') || (field.required && !value) || (value && !field.options?.some(option => option.value === value))) throw new Error(`${field.label}: choose one of the available options.`);
      answers[field.id] = typeof value === 'string' ? value : '';
    } else {
      const values = submitted.values;
      const minimum = field.required ? Math.max(1, field.minValues ?? 1) : field.minValues ?? 0;
      const maximum = field.maxValues ?? 1;
      if (!Array.isArray(values) || values.some(value => typeof value !== 'string') || values.length < minimum || values.length > maximum || new Set(values).size !== values.length) throw new Error(`${field.label}: check the number of selected answers.`);
      if ((field.type === 'select' || field.type === 'checkboxes') && values.some(value => !field.options?.some(option => option.value === value))) throw new Error(`${field.label}: choose only the available options.`);
      if (['user', 'role', 'mentionable', 'channel', 'file'].includes(field.type) && values.some(value => !SNOWFLAKE.test(value))) throw new Error(`${field.label}: the selected item is invalid.`);
      answers[field.id] = values as string[];
      if (field.type === 'file') for (const value of values) {
        const attachment = interaction.data?.resolved?.attachments?.[value];
        if (!attachment || attachment.id !== value || typeof attachment.filename !== 'string' || attachment.filename.length > 1024 || !Number.isSafeInteger(attachment.size) || attachment.size < 0) throw new Error('One of the form uploads could not be resolved.');
        let url: URL;
        try { url = new URL(attachment.url); } catch { throw new Error('One of the form upload URLs is invalid.'); }
        if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) || url.username || url.password || url.port) throw new Error('One of the form upload URLs is invalid.');
        attachments.push({ id: value, filename: attachment.filename, url: attachment.url, size: attachment.size, ...(attachment.content_type ? { contentType: attachment.content_type } : {}) });
      }
    }
  }
  const user = interaction.member?.user ?? interaction.user;
  if (!user || !SNOWFLAKE.test(user.id) || !interaction.guild_id || interaction.guild_id !== form.guildId) throw new Error('A server member is required to submit this form.');
  return { id: interaction.id, botId: form.botId, guildId: form.guildId, channelId: interaction.channel_id ?? '', formId: form.id, formTitle: form.title, userId: user.id, username: user.global_name || user.username || user.id, submittedAt: now.toISOString(), answers, ...(attachments.length ? { attachments } : {}) };
}

export interface InteractionOptions { fetch?: typeof fetch; now?: () => Date; onError?: (error: unknown) => void }

export async function prepareInteraction(interaction: DiscordInteraction, bot: BotConnection, repository: BotRepository, options: InteractionOptions = {}): Promise<InteractionPlan> {
  if (interaction.application_id !== bot.applicationId) return unavailable();
  if (interaction.type === 1) return { response: { type: 1 } };
  const guildId = interaction.guild_id;
  const user = interaction.member?.user ?? interaction.user;
  if (!guildId || !SNOWFLAKE.test(guildId) || !user || !SNOWFLAKE.test(user.id)) return { response: ephemeral('This action is available inside a server.') };
  const rest = new DiscordRestClient(bot.token ?? '', { fetch: options.fetch });
  const getForm = async (formId: string) => scoped(await repository.getForm(bot.id, guildId, formId), bot.id, guildId);
  const getAction = async (actionId: string) => scoped(await repository.getAction(bot.id, guildId, actionId), bot.id, guildId);

  const deferred = (work: () => Promise<string>): InteractionPlan => ({
    response: { type: 5, data: { flags: 64 } },
    run: async () => {
      try {
        if (!await repository.claimInteraction(bot.id, interaction.id)) return;
        const content = await work();
        await rest.editInteraction(bot.applicationId, interaction.token, { content });
      } catch (error) {
        options.onError?.(error);
        const content = error instanceof DiscordRestError ? error.message : error instanceof Error && !/token|credential|database|sql|fetch|network|ECONN|ENOTFOUND/i.test(error.message) ? error.message : 'This action could not be completed. Ask a server administrator to check the bot connection.';
        await rest.editInteraction(bot.applicationId, interaction.token, { content: content.slice(0, 2000) }).catch(failure => options.onError?.(failure));
      }
    },
  });

  const openForm = async (formId: string): Promise<InteractionPlan> => {
    const form = await getForm(formId);
    if (!form) return unavailable();
    try { return { response: buildFormModal(form) }; } catch { return unavailable(); }
  };

  const respondToAction = async (action: BotAction, roleId?: string, invokedFromCommand = false): Promise<InteractionPlan> => {
    if (validateBotAction(action)) return unavailable();
    if (action.type === 'form') return openForm(action.formId!);
    if (action.type === 'reply') return { response: ephemeral(renderReply(action.response!, interaction)) };
    if (invokedFromCommand) return { response: ephemeral(action.label, buildActionRows([action])) };
    const selection = action.selection ?? 'buttons';
    if (roleId && (selection !== 'buttons' || !action.roleIds!.includes(roleId))) return unavailable();
    if (!roleId && selection === 'buttons') return unavailable();
    const expectedType = roleId ? 2 : selection === 'string-select' ? 3 : 6;
    if (interaction.data?.component_type !== expectedType) return unavailable();
    const selected = roleId ? [roleId] : interaction.data?.values;
    if (!Array.isArray(selected) || selected.some(value => typeof value !== 'string' || !action.roleIds!.includes(value)) || new Set(selected).size !== selected.length) return { response: ephemeral('Choose only the roles configured for this menu.') };
    if (!roleId && (selected.length < (action.minValues ?? 0) || selected.length > (action.maxValues ?? action.roleIds!.length))) return { response: ephemeral('Choose the allowed number of roles in this menu.') };
    return deferred(async () => {
      const [roles, channels, currentBot, member] = await Promise.all([rest.roles(guildId), rest.channels(guildId), rest.currentUser().then(current => rest.member(guildId, current.id)), rest.member(guildId, user.id)]);
      assertSelfRolePermissions(guildId, currentBot, roles, action.roleIds!, channels);
      const desired = roleId ? (member.roles.includes(roleId) ? [] : [roleId]) : selected;
      const managedIds = roleId ? [roleId] : action.roleIds!;
      let added = 0, removed = 0;
      // Individual endpoints preserve all unrelated roles, even if another bot changes them.
      for (const configured of managedIds) {
        if (desired.includes(configured) && !member.roles.includes(configured)) { await rest.addRole(guildId, user.id, configured); added++; }
        else if (!desired.includes(configured) && member.roles.includes(configured)) { await rest.removeRole(guildId, user.id, configured); removed++; }
      }
      return added || removed ? `Your roles were updated.${added ? ` ${added} added.` : ''}${removed ? ` ${removed} removed.` : ''}` : 'Your selected roles are already up to date.';
    });
  };

  if (interaction.type === 2) {
    const command = scoped(await repository.getCommand(bot.id, guildId, interaction.data?.name ?? '', interaction.data?.type ?? 1), bot.id, guildId);
    if (!command || validateBotCommand(command)) return unavailable();
    if (command.defaultMemberPermissions !== undefined) {
      const required = permissionBits(command.defaultMemberPermissions);
      const member = permissionBits(interaction.member?.permissions);
      if (required === BigInt(0) ? !hasPermission(member, PERMISSIONS.ADMINISTRATOR) : !hasPermission(member, required)) return { response: ephemeral('You do not have permission to use this command.') };
    }
    if (command.formId) return openForm(command.formId);
    if (command.actionId) { const action = await getAction(command.actionId); return action ? respondToAction(action, undefined, true) : unavailable(); }
    return { response: ephemeral(renderReply(command.response || 'Done.', interaction)) };
  }

  const customId = interaction.data?.custom_id ?? '';
  const [prefix, kind, entityId, roleId, ...extra] = customId.split(':');
  if (prefix !== 'mh' || !ENTITY_ID.test(entityId ?? '') || extra.length) return unavailable();
  if (interaction.type === 3) {
    if (kind === 'form' && !roleId) return openForm(entityId);
    if ((kind === 'action' && !roleId) || (kind === 'role' && roleId && SNOWFLAKE.test(roleId))) {
      const action = await getAction(entityId);
      return action ? respondToAction(action, kind === 'role' ? roleId : undefined) : unavailable();
    }
  }
  if (interaction.type === 5 && kind === 'form' && !roleId) {
    const form = await getForm(entityId);
    if (!form) return unavailable();
    return deferred(async () => {
      const submission = parseFormSubmission(form, interaction, options.now?.());
      await repository.saveSubmission(submission);
      if (form.responseChannelId) {
        const summary = form.fields.map(field => {
          const value = submission.answers[field.id];
          return `**${field.label}**\n${typeof value === 'boolean' ? value ? 'Yes' : 'No' : Array.isArray(value) ? value.join(', ') || '—' : value || '—'}`;
        }).join('\n\n');
        // Keep the full response in the dashboard. Discord notifications are bounded summaries.
        await (async () => {
          const channel = await rest.channel(form.responseChannelId!);
          if (channel.guild_id !== form.guildId) throw new Error('The form notification channel belongs to a different server.');
          await rest.createMessage(form.responseChannelId!, { content: `**${form.title}** — ${submission.username}\n\n${summary}`.slice(0, 2000) });
        })().catch(error => options.onError?.(error));
      }
      return form.confirmation || 'Thanks! Your response has been saved.';
    });
  }
  return unavailable();
}

/** Context commands can include their selected user/message without enabling unwanted mentions. */
export function renderReply(template: string, interaction: DiscordInteraction): string {
  const user = interaction.member?.user ?? interaction.user;
  return template.replace(/\{\{(user|username|target)\}\}/g, (_match, variable: string) => variable === 'username' ? user?.global_name || user?.username || 'Member' : variable === 'target' ? interaction.data?.target_id || '' : user?.id || '').slice(0, 2000);
}
