'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import Link from 'next/link';
import EmbedEditor from '@/components/EmbedEditor';
import MessageComponentsEditor, { MessageV2Toggle } from '@/components/editor/MessageComponentsEditor';
import TextFieldWithQuickActions from '@/components/TextFieldWithQuickActions';
import { IconArrowDown, IconArrowUp, IconCheck, IconLoader, IconPlus, IconTrash, IconX } from '@/components/MeowIcons';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { useBodyScrollLock } from '@/lib/useBodyScrollLock';
import { useUiMotion } from '@/lib/useUiMotion';
import { dashboardRequest, errorMessage } from '@/lib/dashboardClient';
import { scheduleDateTimeInput, scheduleDateTimeInstant } from '@/lib/dashboardDateTime';
import { createDefaultEmbed, createDefaultMessage, parseDiscordPayloadToMessage, uid } from '@/lib/utils';
import { buildPayload } from '@/lib/payload';
import { buttonEmoji, isComponentsV2 } from '@/lib/messageComponents';
import { persistEditorMedia } from '@/lib/platform/editorBridge';
import { getUploadSizeError } from '@/lib/uploadLimits';
import { activeMessageAttachments } from '@/lib/componentAttachments';
import type { Message, Embed } from '@/lib/types';
import type { EmbedWithDragControls } from '@/components/EmbedEditor';
import type { EmbedAttachmentField } from '@/lib/embedTransfers';
import type { ChannelSummary, GuildSummary, PlatformStatus, ResourceMap, ResourceName, RoleSummary, SavedMessage } from '@/lib/platform/types';
import type { BotChoice, BotFormField, BotFieldType } from '@/lib/bot/types';
import type { DashboardData } from './Dashboard';
import type { ScheduleRule } from '@/lib/scheduling/types';
import MessagePreview from './MessagePreview';
import styles from './dashboard.module.css';

type EditableResource = Exclude<ResourceName, 'responses'>;
type Save = (values: Record<string, unknown>) => Promise<void>;
type EditorProps = { item?: ResourceMap[ResourceName]; data: DashboardData; guilds: GuildSummary[]; status: PlatformStatus | null; onSave: Save; onClose: () => void };

export function DashboardModal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useDialogFocus(onClose);
  const titleId = useId();
  useBodyScrollLock();
  return <div className={styles.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={`${styles.modal} ${wide ? styles.modalWide : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}><header className={styles.modalHead}><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" className={styles.iconButton} aria-label="Close dialog" onClick={onClose}><IconX size={18} /></button></header><div className={styles.modalBody}>{children}</div></div></div>;
}

export function ResourceEditor({ resource, ...props }: EditorProps & { resource: EditableResource }) {
  if (resource === 'messages') return <MessageComposer {...props} />;
  if (resource === 'actions') return <ActionEditor {...props} />;
  if (resource === 'forms') return <FormEditor {...props} />;
  if (resource === 'commands') return <CommandEditor {...props} />;
  return <ScheduleEditor {...props} />;
}

function useSaving(onSave: Save) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async (values: Record<string, unknown> | (() => Promise<Record<string, unknown>>)) => {
    if (saving) return;
    setSaving(true); setError('');
    try { await onSave(typeof values === 'function' ? await values() : values); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  };
  return { saving, error, setError, save };
}

function Footer({ saving, onClose, label = 'Save' }: { saving: boolean; onClose: () => void; label?: string }) {
  return <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={saving}>{saving ? <IconLoader size={15} className={styles.spin} /> : <IconCheck size={15} />}{saving ? 'Saving…' : label}</button></div>;
}

function useGuild(guildId: string) {
  const [details, setDetails] = useState<{ channels: ChannelSummary[]; roles: RoleSummary[] }>({ channels: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!guildId) { setDetails({ channels: [], roles: [] }); setError(''); return; }
    const controller = new AbortController();
    setLoading(true); setError(''); setDetails({ channels: [], roles: [] });
    void dashboardRequest<{ channels: ChannelSummary[]; roles: RoleSummary[] }>(`/api/platform/guilds/${encodeURIComponent(guildId)}`, { signal: controller.signal }).then(setDetails).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [guildId]);
  return { ...details, loading, error };
}

function GuildSelect({ guilds, value, onChange, required = false }: { guilds: GuildSummary[]; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className={styles.field}>Server<select value={value} onChange={event => onChange(event.target.value)} required={required}><option value="">{required ? 'Choose a server' : 'Choose later'}</option>{value && !guilds.some(guild => guild.id === value) && <option value={value}>Saved server · {value}</option>}{guilds.map(guild => <option key={guild.id} value={guild.id}>{guild.name}{guild.botPresent ? '' : ' · bot not added'}</option>)}</select>{!guilds.length && <small>Connect Discord from Servers to choose a community.</small>}</label>;
}

function ChannelSelect({ channels, value, onChange, required = false, label = 'Channel', disabled = false }: { channels: ChannelSummary[]; value: string; onChange: (value: string) => void; required?: boolean; label?: string; disabled?: boolean }) {
  return <label className={styles.field}>{label}<select value={value} onChange={event => onChange(event.target.value)} required={required} disabled={disabled}><option value="">{required ? 'Choose a channel' : 'Choose later'}</option>{value && !channels.some(channel => channel.id === value) && <option value={value}>Saved channel · {value}</option>}{channels.filter(channel => [0, 5, 10, 11, 12].includes(channel.type)).map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}</select></label>;
}

function Enabled({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <label className={styles.check}><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />Enabled</label>; }

function MessageComposer({ item, data, guilds, onSave, onClose }: EditorProps) {
  const existing = item as ResourceMap['messages'] | undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [message, setMessage] = useState<Message>(() => existing?.editorMessage ?? (existing ? parseDiscordPayloadToMessage(existing.payload) : createDefaultMessage()));
  const [guildId, setGuildId] = useState(existing?.guildId ?? '');
  const [channelId, setChannelId] = useState(existing?.channelId ?? '');
  const [actionIds, setActionIds] = useState(existing?.actionIds ?? []);
  const [tab, setTab] = useState<'visual' | 'json' | 'preview'>('visual');
  const [json, setJson] = useState(() => JSON.stringify(existing?.payload ?? { content: '' }, null, 2));
  const { saving, error, setError, save } = useSaving(onSave);
  const guild = useGuild(guildId);
  const pendingUrls = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { for (const url of pendingUrls.current) URL.revokeObjectURL(url); }, []);
  const update = (change: Partial<Message>) => { setMessage(value => ({ ...value, ...change })); for (const attachment of change._attachments ?? []) if (attachment.previewUrl.startsWith('blob:')) pendingUrls.current.add(attachment.previewUrl); };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save(async () => {
      let document = message;
      let payload: Record<string, unknown>;
      if (tab === 'json') {
        const value = JSON.parse(json);
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Enter a message JSON object.');
        payload = value; document = { ...parseDiscordPayloadToMessage(payload), _attachments: message._attachments };
      } else {
        payload = buildPayload(message) as unknown as Record<string, unknown>;
      }
      document = await persistEditorMedia(document);
      payload = buildPayload(document) as unknown as Record<string, unknown>;
      setMessage(document);
      return { name: name.trim(), guildId, channelId, payload, actionIds, editorMessage: document };
    });
  }
  function moveEmbed(index: number, direction: number) {
    const next = [...message.embeds]; [next[index], next[index + direction]] = [next[index + direction], next[index]];
    update({ embeds: next });
  }
  function uploadEmbed(embed: Embed, field: EmbedAttachmentField, previewUrl: string, file: File) {
    pendingUrls.current.add(previewUrl);
    const next = structuredClone(embed);
    if (field === 'image' || field === 'thumbnail') next[field].url = previewUrl;
    else if (field === 'author_icon') next.author.icon_url = previewUrl;
    else next.footer.icon_url = previewUrl;
    update({ embeds: message.embeds.map(current => current.id === embed.id ? next : current), _attachments: [...(message._attachments ?? []), { fieldKey: `embed.${embed.id}.${field}`, previewUrl, file, name: file.name, size: file.size, mimeType: file.type }] });
  }
  function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    const attachments = [...(message._attachments ?? [])];
    for (const file of files) {
      const issue = getUploadSizeError(file);
      if (issue) { setError(issue); continue; }
      if (activeMessageAttachments({ ...message, _attachments: attachments }).length >= 10) { setError('A message can have up to 10 file attachments.'); break; }
      const previewUrl = URL.createObjectURL(file); pendingUrls.current.add(previewUrl);
      attachments.push({ fieldKey: `content_file_${uid()}`, previewUrl, file, name: file.name, size: file.size, mimeType: file.type });
    }
    update({ _attachments: attachments });
  }
  function changeTab(next: 'visual' | 'json' | 'preview') {
    try {
      if (next === 'json') setJson(JSON.stringify(buildPayload(message), null, 2));
      else if (tab === 'json') { const value = JSON.parse(json); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Enter a message JSON object.'); setMessage({ ...parseDiscordPayloadToMessage(value), _attachments: message._attachments }); }
      setTab(next); setError('');
    } catch (reason) { setError(errorMessage(reason)); }
  }
  return <DashboardModal title={existing ? 'Edit message' : 'New message'} subtitle="Everything you build here is saved to your account." wide onClose={() => { if (!saving) onClose(); }}><form className={styles.form} onSubmit={submit}>
    <label className={styles.field}>Message name<input value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="Welcome to the server" /></label>
    <div className={styles.row}><GuildSelect guilds={guilds} value={guildId} onChange={value => { setGuildId(value); setChannelId(''); }} /><ChannelSelect channels={guild.channels} value={channelId} onChange={setChannelId} disabled={guild.loading} /></div>
    <div><div className={styles.tabs} role="tablist" aria-label="Message editor mode"><button type="button" role="tab" aria-selected={tab === 'visual'} onClick={() => changeTab('visual')}>Visual editor</button><button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => changeTab('preview')}>Preview</button><button type="button" role="tab" aria-selected={tab === 'json'} onClick={() => changeTab('json')}>Message JSON</button></div>
    {tab === 'preview' ? <MessagePreview message={message} actions={data.actions.filter(action => actionIds.includes(action.id))} /> : tab === 'json' ? <label className={styles.field}>Discord message payload<textarea className={styles.code} value={json} onChange={event => setJson(event.target.value)} spellCheck={false} style={{ minHeight: 300 }} /><small>Use the visual editor for embeds and layouts, or enter a Discord message payload here.</small></label> : <div className={styles.stack}>
      <MessageV2Toggle message={message} onChange={update} />
      {!isComponentsV2(message) && <><label className={styles.field}><span>Message text<small>{message.content.length.toLocaleString()} / 2,000</small></span><TextFieldWithQuickActions multiline value={message.content} onChange={content => update({ content })} aria-label="Message text" expandedEditorTitle="Message text" placeholder="Write your message…" maxLength={2000} rows={4} /></label>
      <div className={styles.fieldGroup}><div className={styles.fieldGroupHead}><strong>Files</strong><button type="button" className={styles.secondaryButton} onClick={() => fileInput.current?.click()}><IconPlus size={14} />Add file</button><input ref={fileInput} type="file" multiple hidden aria-label="Upload message files" onChange={event => { uploadFiles(event.target.files); event.target.value = ''; }} /></div>{message._attachments?.filter(file => file.fieldKey.startsWith('content_file')).map(file => <div className={styles.between} key={file.previewUrl}><span className={styles.helper}>{file.name ?? file.file?.name ?? 'File'}{file.size ? ` · ${(file.size / 1024).toFixed(0)} KB` : ''}</span><button type="button" className={styles.iconButton} aria-label={`Remove ${file.name ?? 'file'}`} onClick={() => update({ _attachments: message._attachments?.filter(current => current !== file) })}><IconX size={14} /></button></div>)}</div>
      <Reorder.Group as="div" axis="y" values={message.embeds.map(embed => embed.id)} onReorder={ids => update({ embeds: ids.map(id => message.embeds.find(embed => embed.id === id)!) })} className={styles.embedEditors}>{message.embeds.map((embed, index) => <DashboardEmbedRow key={embed.id} embed={embed} index={index} onChange={next => update({ embeds: message.embeds.map(current => current.id === embed.id ? next : current) })} onRemove={() => update({ embeds: message.embeds.filter(current => current.id !== embed.id) })} onDuplicate={() => { if (message.embeds.length < 10) update({ embeds: [...message.embeds, { ...structuredClone(embed), id: uid() }] }); }} onMoveUp={index > 0 ? () => moveEmbed(index, -1) : undefined} onMoveDown={index < message.embeds.length - 1 ? () => moveEmbed(index, 1) : undefined} onFileUpload={(field, previewUrl, file) => uploadEmbed(embed, field, previewUrl, file)} />)}</Reorder.Group><button type="button" className={styles.secondaryButton} disabled={message.embeds.length >= 10} onClick={() => update({ embeds: [...message.embeds, createDefaultEmbed()] })}><IconPlus size={14} />Add embed <span className={styles.muted}>{message.embeds.length}/10</span></button></>}
      <MessageComponentsEditor message={message} onChange={update} />
    </div>}</div>
    <div className={styles.fieldGroup}><div className={styles.fieldGroupHead}><strong>Interactive actions</strong><Link href="/dashboard#actions" className={styles.textButton} target="_blank" rel="noopener noreferrer">Manage actions ↗</Link></div>{data.actions.length ? data.actions.filter(action => !guildId || !action.guildId || action.guildId === guildId).map(action => <label className={styles.check} key={action.id}><input type="checkbox" checked={actionIds.includes(action.id)} onChange={event => setActionIds(ids => event.target.checked ? [...ids, action.id] : ids.filter(id => id !== action.id))} />{action.label}<span className={styles.badge}>{action.type === 'role' ? 'Self roles' : action.type === 'form' ? 'Form' : 'Reply'}</span></label>) : <p className={styles.helper}>Create a role menu, form button, or reply in Buttons & roles, then attach it to this message.</p>}</div>
    {existing && <Link className={styles.quietLink} href={`/?cloudMessage=${encodeURIComponent(existing.id)}`} target="_blank" rel="noopener noreferrer">Open saved copy in the full editor ↗</Link>}
    {error && <p className={styles.error} role="alert">{error}</p>}<Footer saving={saving} onClose={onClose} label="Save message" />
  </form></DashboardModal>;
}

function DashboardEmbedRow({ embed, onChange, ...props }: Omit<React.ComponentProps<typeof EmbedEditor>, 'embed' | 'onChange'> & { embed: Embed; onChange: (embed: Embed) => void }) {
  const controls = useDragControls();
  const motion = useUiMotion();
  return <Reorder.Item as="div" value={embed.id} dragListener={false} dragControls={controls} layout="position" transition={motion.reorder} dragTransition={motion.dragTransition} dragMomentum={false} style={{ position: 'relative' }} whileDrag={{ zIndex: 5 }}><EmbedEditor {...props} embed={{ ...embed, _dragControls: controls }} onChange={(value: EmbedWithDragControls) => { const { _dragControls, ...clean } = value; onChange(clean); }} /></Reorder.Item>;
}

function ActionEditor({ item, data, guilds, onSave, onClose }: EditorProps) {
  const existing = item as ResourceMap['actions'] | undefined;
  const [label, setLabel] = useState(existing?.label ?? '');
  const [guildId, setGuildId] = useState(existing?.guildId ?? '');
  const [type, setType] = useState<'role' | 'form' | 'reply'>(existing?.type ?? 'role');
  const [style, setStyle] = useState<1 | 2 | 3 | 4>(existing?.style ?? 1);
  const [emoji, setEmoji] = useState(existing?.emoji ?? '');
  const [roleIds, setRoleIds] = useState<string[]>(existing?.roleIds ?? []);
  const [selection, setSelection] = useState<'buttons' | 'string-select' | 'role-select'>(existing?.selection ?? 'string-select');
  const [minValues, setMinValues] = useState(existing?.minValues ?? 0);
  const [maxValues, setMaxValues] = useState(existing?.maxValues ?? 1);
  const [formId, setFormId] = useState(existing?.formId ?? '');
  const [response, setResponse] = useState(existing?.response ?? '');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [choices, setChoices] = useState<BotChoice[]>(existing?.options ?? []);
  const { saving, error, setError, save } = useSaving(onSave);
  const guild = useGuild(guildId);
  const assignable = guild.roles.filter(role => role.assignable);
  const previewEmoji = buttonEmoji(emoji);
  function changeRoles(ids: string[]) {
    setRoleIds(ids);
    setMaxValues(value => Math.max(1, Math.min(value, ids.length)));
    setMinValues(value => Math.min(value, ids.length));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (type === 'role' && !roleIds.length) { setError('Choose at least one role.'); return; }
    const options = roleIds.map(id => ({ label: choices.find(choice => choice.value === id)?.label ?? guild.roles.find(role => role.id === id)?.name ?? 'Role', value: id, ...(choices.find(choice => choice.value === id)?.emoji ? { emoji: choices.find(choice => choice.value === id)!.emoji } : {}) }));
    await save({ label: label.trim(), guildId, type, style, emoji: emoji.trim(), roleIds: type === 'role' ? roleIds : [], selection, minValues, maxValues, options, formId: type === 'form' ? formId : '', response: type === 'reply' ? response : '', enabled });
  }
  return <DashboardModal title={existing ? 'Edit action' : 'New action'} subtitle="Attach this action to a saved message." onClose={() => { if (!saving) onClose(); }}><form className={styles.form} onSubmit={submit}>
    <div className={styles.row}><label className={styles.field}>Label<input value={label} onChange={event => setLabel(event.target.value)} maxLength={80} required placeholder="Choose your roles" /></label><label className={styles.field}>Action<select value={type} onChange={event => setType(event.target.value as typeof type)}><option value="role">Self roles</option><option value="form">Open a form</option><option value="reply">Private reply</option></select></label></div>
    <GuildSelect guilds={guilds} value={guildId} onChange={value => { setGuildId(value); setRoleIds([]); }} />
    {type === 'role' && <>
      <label className={styles.field}>Display as<select value={selection} onChange={event => setSelection(event.target.value as typeof selection)}><option value="string-select">Dropdown with custom labels</option><option value="role-select">Discord role dropdown</option><option value="buttons">Role buttons</option></select><small>Members can add or remove their own roles. Only the roles selected below are allowed.</small></label>
      <div className={styles.fieldGroup}><strong className={styles.sectionTitle}>Allowed roles</strong>{guild.loading ? <p className={styles.helper}>Loading roles…</p> : assignable.length ? assignable.map(role => <label key={role.id} className={styles.check}><input type="checkbox" checked={roleIds.includes(role.id)} onChange={event => changeRoles(event.target.checked ? [...roleIds, role.id] : roleIds.filter(id => id !== role.id))} />{role.name}</label>) : <p className={styles.helper}>{guildId ? 'No assignable roles found. The bot needs Manage Roles and a role above the roles it assigns.' : 'Choose a connected server to see its assignable roles.'}</p>}{roleIds.filter(id => !guild.roles.some(role => role.id === id)).map(id => <label className={styles.check} key={id}><input type="checkbox" checked onChange={() => changeRoles(roleIds.filter(value => value !== id))} />Saved role · {id}</label>)}</div>
      {selection === 'string-select' && roleIds.length > 0 && <div className={styles.fieldGroup}><strong className={styles.sectionTitle}>Dropdown labels</strong>{roleIds.map(id => <div className={styles.row} key={id}><label className={styles.field}>{guild.roles.find(role => role.id === id)?.name ?? 'Role'}<input value={choices.find(choice => choice.value === id)?.label ?? guild.roles.find(role => role.id === id)?.name ?? 'Role'} maxLength={100} onChange={event => setChoices(values => [...values.filter(choice => choice.value !== id), { ...values.find(choice => choice.value === id), value: id, label: event.target.value }])} /></label><label className={styles.field}>Emoji<input value={choices.find(choice => choice.value === id)?.emoji ?? ''} maxLength={100} placeholder="Optional" onChange={event => setChoices(values => [...values.filter(choice => choice.value !== id), { value: id, label: guild.roles.find(role => role.id === id)?.name ?? 'Role', ...values.find(choice => choice.value === id), emoji: event.target.value }])} /></label></div>)}</div>}
      {selection !== 'buttons' && <div className={styles.row}><label className={styles.field}>Minimum selected<input type="number" min={0} max={25} value={minValues} onChange={event => setMinValues(Number(event.target.value))} required /></label><label className={styles.field}>Maximum selected<input type="number" min={1} max={Math.max(roleIds.length, 1)} value={maxValues} onChange={event => setMaxValues(Number(event.target.value))} required /></label></div>}
    </>}
    {type === 'form' && <label className={styles.field}>Form<select value={formId} onChange={event => setFormId(event.target.value)} required><option value="">Choose a form</option>{data.forms.filter(form => !guildId || !form.guildId || form.guildId === guildId).map(form => <option key={form.id} value={form.id}>{form.title}</option>)}</select>{!data.forms.length && <small>Create a form first from the Forms section.</small>}</label>}
    {type === 'reply' && <label className={styles.field}>Private reply<textarea value={response} onChange={event => setResponse(event.target.value)} required maxLength={2000} placeholder="Only the person who clicks will see this reply." /></label>}
    {(type !== 'role' || selection === 'buttons') && <div className={styles.row}><label className={styles.field}>Button style<select value={style} onChange={event => setStyle(Number(event.target.value) as typeof style)}><option value={1}>Primary · blue</option><option value={2}>Secondary · gray</option><option value={3}>Success · green</option><option value={4}>Danger · red</option></select></label><label className={styles.field}>Button emoji<input value={emoji} onChange={event => setEmoji(event.target.value)} placeholder="Emoji or <:name:id>" maxLength={100} /></label></div>}
    <div className={styles.previewMessage}><span className={styles.helper}>Preview</span><div className={styles.previewActions}>{type === 'role' && selection !== 'buttons' ? <select aria-label="Role menu preview" disabled><option>{label || 'Choose your roles'}</option></select> : <button type="button" disabled style={{ background: style === 1 ? '#5865f2' : style === 3 ? '#248046' : style === 4 ? '#da373c' : undefined, color: 'white' }}>{previewEmoji && (previewEmoji.id ? <img src={`https://cdn.discordapp.com/emojis/${previewEmoji.id}.${previewEmoji.animated ? 'gif' : 'webp'}?size=32`} alt={previewEmoji.name ?? 'Custom emoji'} width={16} height={16} /> : <span>{previewEmoji.name}</span>)}{label || 'Button'}</button>}</div></div>
    <Enabled checked={enabled} onChange={setEnabled} />{error && <p className={styles.error} role="alert">{error}</p>}<Footer saving={saving} onClose={onClose} label="Save action" />
  </form></DashboardModal>;
}

const FIELD_TYPES: { value: BotFieldType; label: string }[] = [{ value: 'short', label: 'Short text' }, { value: 'paragraph', label: 'Long text' }, { value: 'select', label: 'Dropdown' }, { value: 'radio', label: 'Radio group' }, { value: 'checkboxes', label: 'Checkbox group' }, { value: 'checkbox', label: 'Checkbox' }, { value: 'user', label: 'User picker' }, { value: 'role', label: 'Role picker' }, { value: 'mentionable', label: 'User or role picker' }, { value: 'channel', label: 'Channel picker' }, { value: 'file', label: 'File upload' }];
function newField(): BotFormField { return { id: uid(), label: '', type: 'short', required: true, maxLength: 1000 }; }
function serializeChoices(options: BotChoice[] = []) { return options.map(option => `${option.label} | ${option.value}${option.description ? ` | ${option.description}` : ''}`).join('\n'); }
function parseChoices(value: string): BotChoice[] { return value.split('\n').filter(line => line.trim()).map(line => { const [label, optionValue, description] = line.split('|').map(part => part.trim()); return { label, value: optionValue || label, ...(description ? { description } : {}) }; }); }

function FormEditor({ item, guilds, onSave, onClose }: EditorProps) {
  const existing = item as ResourceMap['forms'] | undefined;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [guildId, setGuildId] = useState(existing?.guildId ?? '');
  const [fields, setFields] = useState<BotFormField[]>(existing?.fields ?? [newField()]);
  const [confirmation, setConfirmation] = useState(existing?.confirmation ?? 'Thanks! Your response has been saved.');
  const [channelId, setChannelId] = useState(existing?.responseChannelId ?? '');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const { saving, error, save } = useSaving(onSave);
  const guild = useGuild(guildId);
  const patchField = (id: string, value: Partial<BotFormField>) => setFields(items => items.map(field => field.id === id ? { ...field, ...value } : field));
  const move = (index: number, direction: number) => setFields(items => { const next = [...items]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  async function submit(event: React.FormEvent) { event.preventDefault(); await save({ title: title.trim(), guildId, fields, confirmation, responseChannelId: channelId, enabled }); }
  return <DashboardModal title={existing ? 'Edit form' : 'New form'} subtitle="Open this form with a button or an app command." wide onClose={() => { if (!saving) onClose(); }}><form className={styles.form} onSubmit={submit}>
    <label className={styles.field}><span>Form title<small>{title.length}/45</small></span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={45} placeholder="Join the team" required /></label>
    <GuildSelect guilds={guilds} value={guildId} onChange={value => { setGuildId(value); setChannelId(''); }} />
    <div className={styles.between}><h3 className={styles.sectionTitle}>Questions</h3><span className={styles.helper}>{fields.length}/5 fields</span></div>
    {fields.map((field, index) => <div className={styles.fieldGroup} key={field.id}><div className={styles.fieldGroupHead}><strong>Question {index + 1}</strong><div className={styles.inline}><button type="button" className={styles.iconButton} aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><IconArrowUp size={14} /></button><button type="button" className={styles.iconButton} aria-label={`Move question ${index + 1} down`} disabled={index === fields.length - 1} onClick={() => move(index, 1)}><IconArrowDown size={14} /></button><button type="button" className={styles.iconButton} aria-label={`Remove question ${index + 1}`} disabled={fields.length === 1} onClick={() => setFields(items => items.filter(current => current.id !== field.id))}><IconTrash size={14} /></button></div></div>
      <div className={styles.row}><label className={styles.field}>Question<input value={field.label} maxLength={45} required placeholder="What would you like to ask?" onChange={event => patchField(field.id, { label: event.target.value })} /></label><label className={styles.field}>Answer type<select value={field.type} onChange={event => { const type = event.target.value as BotFieldType; patchField(field.id, { type, required: type === 'checkbox' ? false : field.required, options: ['select', 'radio', 'checkboxes'].includes(type) ? field.options ?? [] : undefined, maxLength: type === 'short' || type === 'paragraph' ? field.maxLength ?? 1000 : undefined }); }}>{FIELD_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label></div>
      <label className={styles.field}>Help text<input value={field.description ?? ''} maxLength={100} placeholder="Optional explanation" onChange={event => patchField(field.id, { description: event.target.value })} /></label>
      {['short', 'paragraph'].includes(field.type) && <><label className={styles.field}>Placeholder<input value={field.placeholder ?? ''} maxLength={100} placeholder="An example answer" onChange={event => patchField(field.id, { placeholder: event.target.value })} /></label><div className={styles.row}><label className={styles.field}>Minimum characters<input type="number" min={0} max={4000} value={field.minLength ?? 0} onChange={event => patchField(field.id, { minLength: Number(event.target.value) })} /></label><label className={styles.field}>Maximum characters<input type="number" min={1} max={4000} value={field.maxLength ?? 1000} onChange={event => patchField(field.id, { maxLength: Number(event.target.value) })} /></label></div></>}
      {['select', 'radio', 'checkboxes'].includes(field.type) && <label className={styles.field}>Choices<textarea key={`${field.id}-${field.type}`} defaultValue={serializeChoices(field.options)} onBlur={event => patchField(field.id, { options: parseChoices(event.target.value) })} placeholder={'News | news\nEvents | events'} required /><small>One choice per line: label | saved value. {field.type === 'radio' ? '2–10 choices.' : field.type === 'checkboxes' ? 'Up to 10 choices.' : 'Up to 25 choices.'}</small></label>}
      {['select', 'checkboxes', 'user', 'role', 'mentionable', 'channel', 'file'].includes(field.type) && <div className={styles.row}><label className={styles.field}>Minimum selected<input type="number" min={0} max={25} value={field.minValues ?? (field.required ? 1 : 0)} onChange={event => patchField(field.id, { minValues: Number(event.target.value) })} /></label><label className={styles.field}>Maximum selected<input type="number" min={1} max={field.type === 'file' ? 10 : 25} value={field.maxValues ?? 1} onChange={event => patchField(field.id, { maxValues: Number(event.target.value) })} /></label></div>}
      <label className={styles.check}><input type="checkbox" checked={field.required} disabled={field.type === 'checkbox'} onChange={event => patchField(field.id, { required: event.target.checked, ...(field.minValues !== undefined ? { minValues: event.target.checked ? Math.max(1, field.minValues) : field.minValues } : {}) })} />Required{field.type === 'checkbox' && <span className={styles.helper}>Single checkboxes are optional in Discord.</span>}</label>
    </div>)}
    <button type="button" className={styles.secondaryButton} disabled={fields.length >= 5} onClick={() => setFields(items => [...items, newField()])}><IconPlus size={14} />Add question</button>
    <label className={styles.field}>Confirmation message<textarea value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={2000} required /></label>
    <ChannelSelect label="Also send responses to" channels={guild.channels} value={channelId} onChange={setChannelId} />
    <p className={styles.helper}>All responses are saved to your dashboard. A response channel is optional.</p>
    <Enabled checked={enabled} onChange={setEnabled} />{error && <p className={styles.error} role="alert">{error}</p>}<Footer saving={saving} onClose={onClose} label="Save form" />
  </form></DashboardModal>;
}

function CommandEditor({ item, data, guilds, onSave, onClose }: EditorProps) {
  const existing = item as ResourceMap['commands'] | undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [type, setType] = useState<1 | 2 | 3>(existing?.type ?? 1);
  const [guildId, setGuildId] = useState(existing?.guildId ?? '');
  const [behavior, setBehavior] = useState(existing?.formId ? 'form' : existing?.actionId ? 'action' : 'reply');
  const [formId, setFormId] = useState(existing?.formId ?? '');
  const [actionId, setActionId] = useState(existing?.actionId ?? '');
  const [response, setResponse] = useState(existing?.response ?? '');
  const [permission, setPermission] = useState(existing?.defaultMemberPermissions ?? '');
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const { saving, error, save } = useSaving(onSave);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await save({ name: name.trim(), type, guildId, description: type === 1 ? description : '', formId: behavior === 'form' ? formId : '', actionId: behavior === 'action' ? actionId : '', response: behavior === 'reply' ? response : '', defaultMemberPermissions: permission, enabled });
  }
  return <DashboardModal title={existing ? 'Edit command' : 'New app command'} subtitle="Sync saved commands to Discord from Servers." onClose={() => { if (!saving) onClose(); }}><form className={styles.form} onSubmit={submit}>
    <label className={styles.field}>Command type<select value={type} onChange={event => setType(Number(event.target.value) as typeof type)}><option value={1}>Slash command · /command</option><option value={2}>User command · right-click a user</option><option value={3}>Message command · right-click a message</option></select><small>{type === 1 ? 'Members type / to find this command.' : 'Members right-click a user or message, then choose Apps.'}</small></label>
    <label className={styles.field}>Name<input value={name} onChange={event => setName(event.target.value)} required minLength={1} maxLength={32} placeholder={type === 1 ? 'apply' : 'Open application'} /><small>{type === 1 ? 'Lowercase letters, numbers, hyphens, and underscores. Unicode letters are supported.' : 'A short name for the context menu.'}</small></label>
    {type === 1 && <label className={styles.field}>Description<input value={description} onChange={event => setDescription(event.target.value)} required minLength={1} maxLength={100} placeholder="Apply to join the team" /></label>}
    <GuildSelect guilds={guilds} value={guildId} onChange={setGuildId} />
    <label className={styles.field}>When used<select value={behavior} onChange={event => setBehavior(event.target.value)}><option value="reply">Send a private reply</option><option value="form">Open a form</option><option value="action">Run an action</option></select></label>
    {behavior === 'form' ? <label className={styles.field}>Form<select value={formId} onChange={event => setFormId(event.target.value)} required><option value="">Choose a form</option>{data.forms.filter(form => !guildId || !form.guildId || form.guildId === guildId).map(form => <option key={form.id} value={form.id}>{form.title}</option>)}</select></label> : behavior === 'action' ? <label className={styles.field}>Action<select value={actionId} onChange={event => setActionId(event.target.value)} required><option value="">Choose an action</option>{data.actions.filter(action => !guildId || !action.guildId || action.guildId === guildId).map(action => <option key={action.id} value={action.id}>{action.label}</option>)}</select></label> : <label className={styles.field}>Private reply<textarea value={response} onChange={event => setResponse(event.target.value)} required maxLength={2000} placeholder="What should the bot reply?" /></label>}
    <label className={styles.field}>Who can use this?<select value={permission} onChange={event => setPermission(event.target.value)}><option value="">Everyone</option><option value="32">Manage Server</option><option value="268435456">Manage Roles</option><option value="8192">Manage Messages</option><option value="8">Administrators</option>{permission && !['32', '268435456', '8192', '8'].includes(permission) && <option value={permission}>Custom permission · {permission}</option>}</select></label>
    <Enabled checked={enabled} onChange={setEnabled} />{error && <p className={styles.error} role="alert">{error}</p>}<Footer saving={saving} onClose={onClose} label="Save command" />
  </form></DashboardModal>;
}

function ScheduleEditor({ item, data, guilds, status, onSave, onClose }: EditorProps) {
  const existing = item as ResourceMap['schedules'] | undefined;
  const initial = new Date(Date.now() + 3600_000).toISOString();
  const [messageId, setMessageId] = useState(existing?.messageId ?? '');
  const [guildId, setGuildId] = useState(existing?.guildId ?? '');
  const [channelId, setChannelId] = useState(existing?.channelId ?? '');
  const [frequency, setFrequency] = useState<ScheduleRule['frequency']>(existing?.rule.frequency ?? 'once');
  const initialTimezone = existing?.rule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const [timezone, setTimezone] = useState(initialTimezone);
  const [startsAt, setStartsAt] = useState(() => scheduleDateTimeInput(existing?.rule.startsAt ?? initial, initialTimezone));
  const [localTime, setLocalTime] = useState(() => existing?.rule.localTime ?? scheduleDateTimeInput(initial, initialTimezone).slice(11));
  const [weekdays, setWeekdays] = useState<number[]>(existing?.rule.weekdays ?? [new Date().getDay()]);
  const [endsAt, setEndsAt] = useState(() => existing?.rule.endsAt ? scheduleDateTimeInput(existing.rule.endsAt, initialTimezone) : '');
  const [jobStatus, setJobStatus] = useState(existing?.status ?? 'active');
  const { saving, error, setError, save } = useSaving(onSave);
  const guild = useGuild(guildId);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!messageId) { setError('Choose a saved message first.'); return; }
    if (frequency === 'weekly' && !weekdays.length) { setError('Choose at least one weekday.'); return; }
    try {
      const selectedTimezone = timezone.trim();
      const unchangedZone = existing?.rule.timezone === selectedTimezone;
      const start = scheduleDateTimeInstant(startsAt, selectedTimezone, unchangedZone ? existing?.rule.startsAt : undefined);
      const end = frequency !== 'once' && endsAt ? scheduleDateTimeInstant(endsAt, selectedTimezone, unchangedZone ? existing?.rule.endsAt : undefined) : undefined;
      await save({ messageId, guildId, channelId, rule: { frequency, timezone: selectedTimezone, localTime: frequency === 'once' ? startsAt.slice(11, 16) : localTime, startsAt: start, ...(frequency === 'weekly' ? { weekdays } : {}), ...(end ? { endsAt: end } : {}) }, status: jobStatus });
    } catch (reason) { setError(errorMessage(reason)); }
  }
  return <DashboardModal title={existing ? 'Edit schedule' : 'Schedule a message'} subtitle="Schedules use a saved snapshot of the message." onClose={() => { if (!saving) onClose(); }}><form className={styles.form} onSubmit={submit}>
    {!status?.schedulerConfigured && <p className={styles.notice}>Scheduled delivery needs the scheduler and Discord bot to be connected. Your saved messages are available in Messages.</p>}
    <label className={styles.field}>Message<select value={messageId} onChange={event => { const id = event.target.value; setMessageId(id); const message = data.messages.find(value => value.id === id); if (message) { setGuildId(message.guildId); setChannelId(message.channelId); } }} required><option value="">Choose a saved message</option>{data.messages.map(message => <option value={message.id} key={message.id}>{message.name}</option>)}</select>{!data.messages.length && <small>Save a message first from Messages.</small>}</label>
    <div className={styles.row}><GuildSelect guilds={guilds} value={guildId} onChange={value => { setGuildId(value); setChannelId(''); }} required /><ChannelSelect channels={guild.channels} value={channelId} onChange={setChannelId} required /></div>
    <div className={styles.row}><label className={styles.field}>Repeat<select value={frequency} onChange={event => setFrequency(event.target.value as typeof frequency)}><option value="once">Once</option><option value="daily">Every day</option><option value="weekly">Selected weekdays</option></select></label><label className={styles.field}>Timezone<input value={timezone} onChange={event => setTimezone(event.target.value)} required placeholder="Asia/Kathmandu" list="meowhook-timezones" /><datalist id="meowhook-timezones">{['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Kathmandu', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'].map(value => <option value={value} key={value} />)}</datalist><small>Changing timezone keeps the shown clock times and changes when they occur.</small></label></div>
    <label className={styles.field}>{frequency === 'once' ? 'Send at' : 'Start after'}<input type="datetime-local" value={startsAt} onChange={event => setStartsAt(event.target.value)} required /><small>All dates and times use {timezone.trim() || 'the selected timezone'}, including once-only messages.</small></label>
    {frequency !== 'once' && <label className={styles.field}>Delivery time<input type="time" value={localTime} onChange={event => setLocalTime(event.target.value)} required /><small>Local time in {timezone || 'the selected timezone'}.</small></label>}
    {frequency === 'weekly' && <div className={styles.fieldGroup}><strong className={styles.sectionTitle}>Days</strong><div className={styles.inline}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => <label className={styles.check} key={day}><input type="checkbox" checked={weekdays.includes(index)} onChange={event => setWeekdays(days => event.target.checked ? [...days, index] : days.filter(value => value !== index))} />{day}</label>)}</div></div>}
    {frequency !== 'once' && <label className={styles.field}>Stop after (optional)<input type="datetime-local" value={endsAt} onChange={event => setEndsAt(event.target.value)} /><small>Local date and time in {timezone.trim() || 'the selected timezone'}.</small></label>}
    <label className={styles.field}>Status<select value={jobStatus} onChange={event => setJobStatus(event.target.value as typeof jobStatus)}><option value="active">Active</option><option value="paused">Paused</option>{existing && <option value="cancelled">Cancelled</option>}{existing && !['active', 'paused', 'cancelled'].includes(jobStatus) && <option value={jobStatus}>{jobStatus}</option>}</select></label>
    {existing?.lastError && <p className={styles.notice}>Last attempt: {existing.lastError}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}<Footer saving={saving} onClose={onClose} label="Save schedule" />
  </form></DashboardModal>;
}

export function SendMessageForm({ message, guilds, onClose, onSend }: { message: SavedMessage; guilds: GuildSummary[]; onClose: () => void; onSend: Save }) {
  const [guildId, setGuildId] = useState(message.guildId);
  const [channelId, setChannelId] = useState(message.channelId);
  const [mode, setMode] = useState<'send' | 'edit'>('send');
  const requestId = useRef(crypto.randomUUID());
  const guild = useGuild(guildId);
  const { saving, error, save } = useSaving(onSend);
  return <DashboardModal title="Send to Discord" subtitle={message.name} onClose={() => { if (!saving) onClose(); }}><form className={styles.form} onSubmit={event => { event.preventDefault(); void save({ guildId, channelId, mode, requestId: requestId.current }); }}>
    {message.lastMessageId && <label className={styles.field}>Delivery<select value={mode} onChange={event => { const next = event.target.value as typeof mode; setMode(next); requestId.current = crypto.randomUUID(); if (next === 'edit') setChannelId((message as SavedMessage & { lastChannelId?: string }).lastChannelId ?? message.channelId); }}><option value="send">Send a new message</option><option value="edit">Update the last sent message</option></select></label>}
    <GuildSelect value={guildId} guilds={guilds.filter(guild => guild.botPresent)} onChange={value => { setGuildId(value); setChannelId(''); requestId.current = crypto.randomUUID(); }} required /><ChannelSelect channels={guild.channels} value={channelId} onChange={value => { setChannelId(value); requestId.current = crypto.randomUUID(); }} required disabled={mode === 'edit'} />
    {mode === 'edit' && <p className={styles.helper}>Updates the last copy sent by this saved message. Other copies stay as they are.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}<Footer saving={saving} onClose={onClose} label={mode === 'edit' ? 'Update sent message' : 'Send message'} /></form></DashboardModal>;
}
