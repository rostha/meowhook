import type { BotAction, BotCommand, BotForm, BotFormField } from './types';

export const SNOWFLAKE = /^\d{17,20}$/;
export const ENTITY_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const fieldTypes = new Set(['short', 'paragraph', 'select', 'user', 'role', 'mentionable', 'channel', 'file', 'radio', 'checkboxes', 'checkbox']);
const channelTypes = new Set([0, 2, 4, 5, 10, 11, 12, 13, 15, 16]);

const bounded = (value: unknown, min: number, max: number) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
const integer = (value: unknown, min: number, max: number) => value === undefined || (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max);

export function validBotEmoji(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (/^<a?:[a-zA-Z0-9_]{2,32}:\d{17,20}>$/.test(value)) return true;
  return value.length <= 32 && [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length === 1 && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(value);
}

export function validateBotForm(form: BotForm): string | null {
  if (!ENTITY_ID.test(form.id)) return 'The form ID is invalid.';
  if (!bounded(form.title, 1, 45)) return 'Give the form a title of 1–45 characters.';
  if (typeof form.enabled !== 'boolean') return 'The form enabled state is invalid.';
  if (!bounded(form.confirmation, 0, 2000)) return 'The confirmation must fit within 2,000 characters.';
  if (form.responseChannelId && !SNOWFLAKE.test(form.responseChannelId)) return 'Choose a valid response channel.';
  if (!Array.isArray(form.fields) || !form.fields.length || form.fields.length > 5) return 'A Discord form needs 1–5 questions.';
  const ids = new Set<string>();
  for (const [index, field] of form.fields.entries()) {
    if (!field || !ENTITY_ID.test(field.id) || ids.has(field.id)) return 'Each form question needs a unique valid ID.';
    ids.add(field.id);
    const issue = validateBotFormField(field);
    if (issue) return `Question ${index + 1}: ${issue}`;
  }
  return null;
}

export function validateBotFormField(field: BotFormField): string | null {
  if (!fieldTypes.has(field.type)) return 'Choose a supported question type.';
  if (!bounded(field.label, 1, 45)) return 'use a label of 1–45 characters.';
  if (field.description !== undefined && !bounded(field.description, 0, 100)) return 'the description allows up to 100 characters.';
  if (field.placeholder !== undefined && !bounded(field.placeholder, 0, 100)) return 'the placeholder allows up to 100 characters.';
  if (typeof field.required !== 'boolean') return 'the required state is invalid.';
  if (field.type === 'checkbox' && field.required) return 'a single checkbox cannot be required; use a checkbox group instead.';
  if (field.type === 'short' || field.type === 'paragraph') {
    if (!integer(field.minLength, 0, 4000) || !integer(field.maxLength, 1, 4000) || (field.minLength ?? 0) > (field.maxLength ?? 4000)) return 'the text length range is invalid (up to 4,000 characters).';
    return null;
  }
  if (['select', 'radio', 'checkboxes'].includes(field.type)) {
    const min = field.type === 'radio' ? 2 : 1;
    const max = field.type === 'select' ? 25 : 10;
    if (!Array.isArray(field.options) || field.options.length < min || field.options.length > max) return `add ${min}–${max} choices.`;
    const values = new Set<string>();
    for (const option of field.options) {
      if (!option || !bounded(option.label, 1, 100) || !bounded(option.value, 1, 100) || values.has(option.value)) return 'choices need unique values and labels of 1–100 characters.';
      if (option.description !== undefined && !bounded(option.description, 0, 100)) return 'choice descriptions allow up to 100 characters.';
      if (option.emoji && (field.type !== 'select' || !validBotEmoji(option.emoji))) return 'emoji choices need one valid emoji and a dropdown question.';
      values.add(option.value);
    }
  }
  if (!['checkbox', 'radio'].includes(field.type)) {
    const max = field.type === 'file' || field.type === 'checkboxes' ? 10 : 25;
    const minValues = field.minValues ?? (field.required ? 1 : 0);
    const maxValues = field.maxValues ?? 1;
    if (!integer(minValues, field.required ? 1 : 0, max) || !integer(maxValues, 1, max) || minValues > maxValues) return 'the selection range is invalid.';
    if (['select', 'checkboxes'].includes(field.type) && maxValues > (field.options?.length ?? 0)) return 'the maximum selections cannot exceed the number of choices.';
  }
  if (field.type === 'channel' && field.channelTypes && (!Array.isArray(field.channelTypes) || !field.channelTypes.length || field.channelTypes.some(type => !channelTypes.has(type)))) return 'choose supported channel types.';
  return null;
}

export function validateBotAction(action: BotAction): string | null {
  if (!ENTITY_ID.test(action.id)) return 'The action ID is invalid.';
  if (!bounded(action.label, 1, 80)) return 'Give the button or menu a label of 1–80 characters.';
  if (![1, 2, 3, 4].includes(action.style)) return 'Choose one of the four Discord button styles.';
  if (typeof action.enabled !== 'boolean') return 'The action enabled state is invalid.';
  if (action.emoji && !validBotEmoji(action.emoji)) return 'Use a Unicode emoji or a Discord custom emoji such as <:name:123456789012345678>.';
  if (action.type === 'role') {
    if (!Array.isArray(action.roleIds) || !action.roleIds.length || action.roleIds.length > 25 || action.roleIds.some(id => !SNOWFLAKE.test(id)) || new Set(action.roleIds).size !== action.roleIds.length) return 'Choose 1–25 distinct roles.';
    if (!['buttons', 'string-select', 'role-select'].includes(action.selection ?? 'buttons')) return 'Choose a supported self-role control.';
    if ((action.selection ?? 'buttons') === 'buttons' && action.roleIds.length > 25) return 'Use up to 25 role buttons.';
    const min = action.minValues ?? 0;
    const max = action.maxValues ?? action.roleIds.length;
    if (!integer(min, 0, 25) || !integer(max, 1, 25) || min > max || max > action.roleIds.length) return 'The role selection range is invalid.';
    if (action.options) {
      const labelLimit = (action.selection ?? 'buttons') === 'buttons' ? 80 : 100;
      if (!Array.isArray(action.options) || action.options.length !== action.roleIds.length || new Set(action.options.map(o => o?.value)).size !== action.options.length || action.options.some(option => !option || !action.roleIds!.includes(option.value) || !bounded(option.label, 1, labelLimit) || (option.description !== undefined && !bounded(option.description, 0, 100)) || (option.emoji && !validBotEmoji(option.emoji)))) return 'Every role choice must match one of the configured roles with a valid label and emoji.';
    }
  } else if (action.type === 'form') {
    if (!action.formId || !ENTITY_ID.test(action.formId)) return 'Choose a form to open.';
  } else if (action.type === 'reply') {
    if (!bounded(action.response, 1, 2000)) return 'Add reply text of 1–2,000 characters.';
  } else return 'Choose a supported action.';
  return null;
}

export function validateBotCommand(command: BotCommand): string | null {
  if (!ENTITY_ID.test(command.id)) return 'The command ID is invalid.';
  if (![1, 2, 3].includes(command.type)) return 'Choose a slash, user, or message command.';
  if (!bounded(command.name, 1, 32)) return 'Command names allow 1–32 characters.';
  if (command.type === 1 && (!/^[-_\u02BC\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u.test(command.name) || command.name !== command.name.toLowerCase())) return 'Slash command names use lowercase letters, numbers, hyphens, or underscores.';
  if (command.type === 1 && !bounded(command.description, 1, 100)) return 'Slash commands need a description of 1–100 characters.';
  if (typeof command.enabled !== 'boolean') return 'The command enabled state is invalid.';
  if (command.defaultMemberPermissions !== undefined && !/^\d{1,20}$/.test(command.defaultMemberPermissions)) return 'The command permissions are invalid.';
  if (command.actionId && !ENTITY_ID.test(command.actionId)) return 'The command action is invalid.';
  if (command.formId && !ENTITY_ID.test(command.formId)) return 'The command form is invalid.';
  if (command.response !== undefined && !bounded(command.response, 0, 2000)) return 'Command replies allow up to 2,000 characters.';
  if (!command.actionId && !command.formId && !command.response?.trim()) return 'Choose an action, a form, or reply text for the command.';
  return null;
}
