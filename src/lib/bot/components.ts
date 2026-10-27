import { buttonEmoji, COMPONENTS_V2_FLAG } from '../messageComponents';
import { buildPayload, getSendBlockingReason } from '../payload';
import type { Message } from '../types';
import type { BotAction, BotForm, BotFormField, DiscordObject, InteractionResponse } from './types';
import { validateBotAction, validateBotForm } from './validation';

export const actionCustomId = (id: string) => `mh:action:${id}`;
export const formCustomId = (id: string) => `mh:form:${id}`;
export const roleCustomId = (actionId: string, roleId: string) => `mh:role:${actionId}:${roleId}`;

export function buildActionRows(actions: BotAction[]): DiscordObject[] {
  const rows: DiscordObject[] = [];
  let buttons: DiscordObject[] = [];
  const flush = () => { if (buttons.length) { rows.push({ type: 1, components: buttons }); buttons = []; } };
  const append = (button: DiscordObject) => { buttons.push(button); if (buttons.length === 5) flush(); };
  for (const action of actions.filter(action => action.enabled)) {
    const issue = validateBotAction(action);
    if (issue) throw new Error(issue);
    const emoji = action.emoji ? { emoji: buttonEmoji(action.emoji) } : {};
    if (action.type !== 'role') {
      append({ type: 2, style: action.style, custom_id: actionCustomId(action.id), label: action.label, ...emoji });
    } else if ((action.selection ?? 'buttons') === 'buttons') {
      for (const roleId of action.roleIds!) append({ type: 2, style: action.style, custom_id: roleCustomId(action.id, roleId), label: action.options?.find(option => option.value === roleId)?.label || action.label, ...emoji });
    } else {
      flush();
      rows.push({ type: 1, components: [{
        type: action.selection === 'role-select' ? 6 : 3,
        custom_id: actionCustomId(action.id), placeholder: action.label,
        min_values: action.minValues ?? 0, max_values: action.maxValues ?? action.roleIds!.length,
        ...(action.selection === 'role-select' ? {} : {
          options: action.roleIds!.map(roleId => {
            const option = action.options?.find(candidate => candidate.value === roleId);
            return { label: option?.label || roleId, value: roleId, ...(option?.description ? { description: option.description } : {}), ...(option?.emoji ? { emoji: buttonEmoji(option.emoji) } : {}) };
          }),
        }),
      }] });
    }
  }
  flush();
  return rows;
}

export function countDiscordComponents(components: unknown[]): number {
  return components.reduce<number>((count, value) => {
    if (!value || typeof value !== 'object') return count;
    const component = value as DiscordObject;
    return count + 1 + (Array.isArray(component.components) ? countDiscordComponents(component.components) : 0) + (component.accessory ? 1 : 0);
  }, 0);
}

export function appendActionRows(payload: DiscordObject, actions: BotAction[]): DiscordObject {
  const existing = Array.isArray(payload.components) ? payload.components : [];
  const components = [...existing, ...buildActionRows(actions)];
  if (typeof payload.flags === 'number' && (payload.flags & COMPONENTS_V2_FLAG)) {
    if (countDiscordComponents(components) > 40) throw new Error('This message exceeds Discord’s 40-component limit.');
  } else if (components.length > 5) throw new Error('Regular messages allow up to five button or menu rows.');
  return components.length ? { ...payload, components } : payload;
}

/** Reuses the complete existing embed/V2 serializer, stripping webhook-only fields. */
export function buildBotMessage(message: Message, actions: BotAction[] = []): DiscordObject {
  const issue = getSendBlockingReason([message], [message._attachments?.length ?? 0]);
  const hasActions = actions.some(action => action.enabled);
  const emptyV2WithActions = hasActions && Boolean(message.flags & COMPONENTS_V2_FLAG || message.componentMode === 'v2') && !message.componentBlocks?.length;
  if (issue && !(hasActions && issue.startsWith('Nothing to send')) && !emptyV2WithActions && !issue.startsWith('Links need a message')) throw new Error(issue.replace('\n', ': '));
  if (message._attachments?.length) throw new Error('Bot messages need hosted image URLs. Local files must be uploaded before saving to the dashboard.');
  const source = buildPayload(message);
  const { username: _username, avatar_url: _avatar, thread_name: _thread, attachments: _attachments, ...body } = source;
  const checkMedia = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(checkMedia); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'url' && typeof child === 'string' && /^(blob:|data:|local-file:|attachment:)/i.test(child)) throw new Error('Use a hosted image URL for bot messages and schedules.');
      checkMedia(child);
    }
  };
  checkMedia(body);
  return { ...appendActionRows(body as DiscordObject, actions), allowed_mentions: { parse: [] } };
}

function modalField(field: BotFormField): DiscordObject {
  const common = { custom_id: field.id };
  const required = { required: field.required };
  const selection = { ...required, min_values: field.minValues ?? (field.required ? 1 : 0), max_values: field.maxValues ?? 1 };
  const options = field.options?.map(option => ({ label: option.label, value: option.value, ...(option.description ? { description: option.description } : {}), ...(field.type === 'select' && option.emoji ? { emoji: buttonEmoji(option.emoji) } : {}) }));
  let component: DiscordObject;
  switch (field.type) {
    case 'short': case 'paragraph':
      component = { ...common, type: 4, style: field.type === 'short' ? 1 : 2, ...required,
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
        ...(field.minLength !== undefined ? { min_length: field.minLength } : {}),
        max_length: field.maxLength ?? 4000 }; break;
    case 'select': component = { ...common, type: 3, options, ...selection, ...(field.placeholder ? { placeholder: field.placeholder } : {}) }; break;
    case 'user': case 'role': case 'mentionable': case 'channel':
      component = { ...common, type: { user: 5, role: 6, mentionable: 7, channel: 8 }[field.type], ...selection,
        ...(field.placeholder ? { placeholder: field.placeholder } : {}), ...(field.type === 'channel' && field.channelTypes ? { channel_types: field.channelTypes } : {}) }; break;
    case 'file': component = { ...common, type: 19, ...selection }; break;
    case 'radio': component = { ...common, type: 21, options, ...required }; break;
    case 'checkboxes': component = { ...common, type: 22, options, ...selection }; break;
    case 'checkbox': component = { ...common, type: 23 }; break;
  }
  return { type: 18, label: field.label, ...(field.description ? { description: field.description } : {}), component };
}

export function buildFormModal(form: BotForm): InteractionResponse {
  const issue = validateBotForm(form);
  if (issue) throw new Error(issue);
  return { type: 9, data: { title: form.title, custom_id: formCustomId(form.id), components: form.fields.map(modalField) } };
}
