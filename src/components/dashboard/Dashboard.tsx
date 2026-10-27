'use client';

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandDiscord } from '@/components/BrandIcons';
import { DashboardApiError, dashboardRequest, errorMessage } from '@/lib/dashboardClient';
import type { GuildSummary, PlatformStatus, ResourceMap, ResourceName, SavedMessage, SavedResponse } from '@/lib/platform/types';
import { IconBraces, IconCalendarClock, IconChevronRight, IconClock, IconFileText, IconFolder, IconGrid, IconLoader, IconMenu, IconMessage, IconMessages, IconPencil, IconPlus, IconSearch, IconSendHook, IconShield, IconSidebar, IconSliders, IconTrash, IconX, type MeowIconProps } from '@/components/MeowIcons';
import { ResourceEditor, DashboardModal, SendMessageForm } from './ResourceEditors';
import styles from './dashboard.module.css';

type View = 'overview' | 'messages' | 'actions' | 'forms' | 'responses' | 'schedules' | 'commands' | 'servers' | 'settings';
export type DashboardData = { [K in ResourceName]: ResourceMap[K][] };
export type DashboardUser = { id: string; name: string; email?: string; image?: string | null };
export type DiscordIdentity = { id: string; username?: string; displayName?: string; avatarUrl?: string; email?: string };
function discordAvatar(value?: string | null): string | undefined {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && ['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname) ? url.href : undefined; }
  catch { return undefined; }
}
const EMPTY: DashboardData = { messages: [], actions: [], forms: [], responses: [], schedules: [], commands: [] };
const NAV: { view: View; label: string; icon: ComponentType<MeowIconProps>; group: number }[] = [
  { view: 'overview', label: 'Overview', icon: IconGrid, group: 0 },
  { view: 'messages', label: 'Messages', icon: IconMessages, group: 0 },
  { view: 'actions', label: 'Buttons & roles', icon: IconShield, group: 0 },
  { view: 'forms', label: 'Forms', icon: IconFileText, group: 0 },
  { view: 'responses', label: 'Responses', icon: IconMessage, group: 0 },
  { view: 'schedules', label: 'Schedules', icon: IconCalendarClock, group: 1 },
  { view: 'commands', label: 'App commands', icon: IconBraces, group: 1 },
  { view: 'servers', label: 'Servers', icon: IconFolder, group: 2 },
  { view: 'settings', label: 'Settings', icon: IconSliders, group: 2 },
];
const TITLES: Record<View, [string, string]> = {
  overview: ['Your workspace', 'Build something your community can use.'],
  messages: ['Messages', 'Your saved messages, embeds, and interactive layouts.'],
  actions: ['Buttons & roles', 'Give buttons and dropdowns something to do.'],
  forms: ['Forms', 'Collect applications, feedback, and everything in between.'],
  responses: ['Responses', 'Submissions from your Discord forms.'],
  schedules: ['Schedules', 'The right message, at the right time.'],
  commands: ['App commands', 'Slash commands and right-click actions for your server.'],
  servers: ['Servers', 'The communities connected to your workspace.'],
  settings: ['Settings', 'Your account and workspace connections.'],
};
const SINGULAR: Record<ResourceName, string> = { messages: 'message', actions: 'action', forms: 'form', responses: 'response', schedules: 'schedule', commands: 'command' };

function viewFromHash(): View { const value = window.location.hash.slice(1); return NAV.some(item => item.view === value) ? value as View : 'overview'; }
function dateLabel(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled'; }
function recordTitle(resource: ResourceName, item: ResourceMap[ResourceName]): string {
  if (resource === 'messages') return (item as ResourceMap['messages']).name;
  if (resource === 'actions') return (item as ResourceMap['actions']).label;
  if (resource === 'forms') return (item as ResourceMap['forms']).title;
  if (resource === 'responses') return (item as ResourceMap['responses']).formTitle;
  if (resource === 'commands') { const command = item as ResourceMap['commands']; return `${command.type === 1 ? '/' : ''}${command.name}`; }
  return 'Scheduled message';
}
function recordDescription(resource: ResourceName, item: ResourceMap[ResourceName], data: DashboardData): string {
  if (resource === 'messages') { const message = item as ResourceMap['messages']; return `${Array.isArray(message.payload.embeds) ? message.payload.embeds.length : 0} embeds · ${message.actionIds.length} actions · Updated ${dateLabel(message.updatedAt)}`; }
  if (resource === 'actions') { const action = item as ResourceMap['actions']; return action.type === 'role' ? `Self roles · ${action.selection === 'buttons' ? 'Buttons' : 'Dropdown menu'} · ${action.roleIds?.length ?? 0} roles` : action.type === 'form' ? 'Opens a Discord form' : 'Sends a private reply'; }
  if (resource === 'forms') { const form = item as ResourceMap['forms']; return `${form.fields.length} ${form.fields.length === 1 ? 'field' : 'fields'} · ${data.responses.filter(response => response.formId === form.id).length} responses`; }
  if (resource === 'responses') { const response = item as ResourceMap['responses']; return `${response.username} · ${dateLabel(response.submittedAt)}`; }
  if (resource === 'commands') { const command = item as ResourceMap['commands']; return command.type === 1 ? command.description || 'Slash command' : command.type === 2 ? 'Right-click a user → Apps' : 'Right-click a message → Apps'; }
  const schedule = item as ResourceMap['schedules'];
  const name = data.messages.find(message => message.id === schedule.messageId)?.name ?? 'Saved message';
  return `${name} · ${dateLabel(schedule.nextRunAt)} · ${schedule.rule.timezone}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(true);
  const [guildsError, setGuildsError] = useState('');
  const [discordLinked, setDiscordLinked] = useState(false);
  const [discordUser, setDiscordUser] = useState<DiscordIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('overview');
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<{ resource: Exclude<ResourceName, 'responses'>; item?: ResourceMap[ResourceName] } | null>(null);
  const [deleting, setDeleting] = useState<{ resource: ResourceName; item: ResourceMap[ResourceName] } | null>(null);
  const [sending, setSending] = useState<SavedMessage | null>(null);
  const [response, setResponse] = useState<SavedResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const oauthRequest = useRef<AbortController | null>(null);
  const guildsRequest = useRef<AbortController | null>(null);
  const abandonedOAuth = useRef(false);

  useEffect(() => {
    if (abandonedOAuth.current) { setBusy(false); abandonedOAuth.current = false; }
    return () => { if (oauthRequest.current) { abandonedOAuth.current = true; oauthRequest.current.abort(); oauthRequest.current = null; } guildsRequest.current?.abort(); };
  }, []);

  const refreshGuilds = useCallback(async () => {
    guildsRequest.current?.abort();
    const controller = new AbortController();
    guildsRequest.current = controller;
    setGuildsLoading(true);
    try {
      const result = await dashboardRequest<{ items: GuildSummary[]; connected?: boolean }>('/api/platform/guilds', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.connected === false) { setGuildsError('Reconnect Discord to refresh server access.'); return; }
      setGuilds(result.items); setGuildsError('');
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof DashboardApiError && reason.status === 401) { setUser(null); router.replace('/login'); return; }
      setGuildsError(errorMessage(reason));
    } finally {
      if (!controller.signal.aborted) setGuildsLoading(false);
      if (guildsRequest.current === controller) guildsRequest.current = null;
    }
  }, [router]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const session = await dashboardRequest<{ user: DashboardUser } | null>('/api/auth/get-session', { signal });
    if (signal?.aborted) return false;
    if (!session?.user) { setUser(null); router.replace('/login'); return false; }
    const [state, account, ...resources] = await Promise.all([
      dashboardRequest<PlatformStatus>('/api/platform/status', { signal }),
      dashboardRequest<{ user: DashboardUser; discordLinked: boolean; discordUser?: DiscordIdentity }>('/api/platform/account', { signal }),
      ...Object.keys(EMPTY).map(resource => dashboardRequest<{ items: ResourceMap[ResourceName][] }>(`/api/platform/${resource}`, { signal })),
    ]);
    if (signal?.aborted) return false;
    setUser(account.user || session.user); setDiscordUser(account.discordUser ?? null);
    setStatus(state); setDiscordLinked(account.discordLinked);
    setData(Object.fromEntries(Object.keys(EMPTY).map((key, index) => [key, resources[index].items])) as DashboardData);
    return true;
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    setView(viewFromHash());
    const onHash = () => { setView(viewFromHash()); setSearch(''); setDrawer(false); };
    window.addEventListener('hashchange', onHash);
    void refresh(controller.signal).then(loaded => { if (loaded && !controller.signal.aborted) void refreshGuilds(); }).catch(reason => { if (!controller.signal.aborted) { if (reason instanceof DashboardApiError && [401, 403].includes(reason.status)) { setUser(null); router.replace('/login'); } else setError(errorMessage(reason)); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); window.removeEventListener('hashchange', onHash); };
  }, [refresh, refreshGuilds, router]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const change = () => { setMobile(query.matches); if (!query.matches) setDrawer(false); };
    change(); query.addEventListener('change', change);
    try { setCollapsed(localStorage.getItem('meowhook_dashboard_sidebar') === 'collapsed'); } catch { /* optional preference */ }
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    const sidebar = sidebarRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...(sidebar?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]') ?? [])].filter(element => element.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
      if (event.key === 'Tab') {
        const items = focusable(); const index = items.indexOf(document.activeElement as HTMLElement);
        if (!items.length) { event.preventDefault(); return; }
        if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === items.length - 1))) { event.preventDefault(); (event.shiftKey ? items.at(-1) : items[0])?.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', keydown); previous?.focus({ preventScroll: true }); };
  }, [drawer]);

  function navigate(next: View) { window.location.hash = next; setView(next); setSearch(''); setDrawer(false); mainRef.current?.scrollTo({ top: 0 }); }
  async function mutate(path: string, init: RequestInit, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await dashboardRequest(path, init);
      try { await refresh(); }
      catch (reason) { if (reason instanceof DashboardApiError && [401, 403].includes(reason.status)) { setUser(null); router.replace('/login'); } else setError('The action completed, but the workspace could not refresh. Reload the page to see the latest changes.'); }
      setNotice(success);
    }
    catch (reason) { if (reason instanceof DashboardApiError && reason.status === 401) router.replace('/login'); setError(errorMessage(reason)); throw reason; }
    finally { setBusy(false); }
  }
  async function save(resource: Exclude<ResourceName, 'responses'>, item: ResourceMap[ResourceName] | undefined, values: Record<string, unknown>) {
    await mutate(`/api/platform/${resource}${item ? `/${item.id}` : ''}`, { method: item ? 'PATCH' : 'POST', body: JSON.stringify({ ...values, ...(item ? { revision: item.revision } : {}) }) }, `${SINGULAR[resource][0].toUpperCase() + SINGULAR[resource].slice(1)} saved.`);
    setEditor(null);
  }
  async function remove() {
    if (!deleting) return;
    try { await mutate(`/api/platform/${deleting.resource}/${deleting.item.id}`, { method: 'DELETE' }, `${SINGULAR[deleting.resource][0].toUpperCase() + SINGULAR[deleting.resource].slice(1)} deleted.`); setDeleting(null); } catch { /* error shown */ }
  }
  async function signOut() {
    try { await dashboardRequest('/api/auth/sign-out', { method: 'POST', body: '{}' }); router.replace('/login'); router.refresh(); }
    catch (reason) { setError(errorMessage(reason)); }
  }
  async function connectDiscord() {
    if (busy || oauthRequest.current) return;
    const controller = new AbortController();
    oauthRequest.current = controller;
    let redirecting = false;
    setBusy(true); setError('');
    try {
      const result = await dashboardRequest<{ url?: string }>('/api/auth/sign-in/social', { method: 'POST', signal: controller.signal, body: JSON.stringify({ provider: 'discord', callbackURL: '/dashboard#servers' }) });
      if (controller.signal.aborted) return;
      if (result.url) { window.location.assign(result.url); redirecting = true; } else throw new Error('Discord sign-in is not available yet.');
    }
    catch (reason) { if (!controller.signal.aborted) setError(errorMessage(reason)); }
    finally { if (!controller.signal.aborted && !redirecting) setBusy(false); if (oauthRequest.current === controller) oauthRequest.current = null; }
  }
  async function syncCommands(guildId: string) {
    await mutate('/api/platform/commands/sync', { method: 'POST', body: JSON.stringify({ guildId }) }, 'Commands synced to Discord.');
  }

  if (loading) return <div className={styles.shell}><div className={styles.loading}><IconLoader size={18} className={styles.spin} />Opening your workspace…</div></div>;
  if (!user) return <div className={styles.shell}><div className={styles.empty}>{error ? <p className={styles.error} role="alert">{error}</p> : <p>Opening sign in…</p>}<Link className={styles.secondaryButton} href="/login">Go to sign in</Link></div></div>;

  const isResource = view in EMPTY;
  const resource = view as ResourceName;
  const filtered = isResource ? data[resource].filter(item => `${recordTitle(resource, item)} ${recordDescription(resource, item, data)}`.toLowerCase().includes(search.toLowerCase())) : [];
  const nav = NAV.find(item => item.view === view)!;
  const displayName = discordUser?.displayName || discordUser?.username || user.name;
  const avatar = discordAvatar(discordUser?.avatarUrl || user.image);

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <div className={styles.topbarLeft}><button ref={menuRef} type="button" className={styles.iconButton} aria-label={mobile ? drawer ? 'Close navigation' : 'Open navigation' : collapsed ? 'Show sidebar' : 'Hide sidebar'} aria-expanded={mobile ? drawer : !collapsed} aria-controls="dashboard-sidebar" onClick={() => { if (mobile) setDrawer(value => !value); else setCollapsed(value => { try { localStorage.setItem('meowhook_dashboard_sidebar', value ? 'open' : 'collapsed'); } catch { /* optional preference */ } return !value; }); }}>{mobile ? drawer ? <IconX size={19} /> : <IconMenu size={19} /> : <IconSidebar size={18} />}</button><Link href="/" className={styles.brand}><img className={styles.brandIcon} src={encodeURI('/MEAWHOOK ICON WHITE.svg')} alt="Meowhook" /><img className={styles.brandWord} src={encodeURI('/MEAWHOOK WHITE LETTER.svg')} alt="" /></Link><span className={styles.topbarLabel}>Dashboard</span></div>
      <div className={styles.topbarRight}><Link href="/" className={styles.quietLink}>Open editor <span aria-hidden>↗</span></Link><div className={styles.accountButton} aria-label={`Signed in with Discord as ${displayName}`}><span className={styles.avatar}>{avatar ? <img src={avatar} alt="" width={27} height={27} /> : displayName.trim().slice(0, 1).toUpperCase() || 'M'}</span><span className={styles.accountName}>{displayName}</span></div></div>
    </header>
    <div className={styles.body}>
      <button className={styles.drawerBackdrop} data-open={drawer} aria-label="Close navigation" tabIndex={drawer ? 0 : -1} onClick={() => setDrawer(false)} />
      <aside ref={sidebarRef} className={styles.sidebar} id="dashboard-sidebar" data-open={drawer} data-collapsed={collapsed && !mobile} role={mobile && drawer ? 'dialog' : undefined} aria-modal={mobile && drawer ? 'true' : undefined} aria-label="Dashboard navigation">
        <nav className={styles.sidebarContent}>{[0, 1, 2].map(group => <div className={styles.navGroup} key={group}><p className={styles.navLabel}>{['Workspace', 'Automation', 'Manage'][group]}</p>{NAV.filter(item => item.group === group).map(item => <button key={item.view} type="button" className={styles.navButton} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><item.icon size={17} />{item.label}{item.view in EMPTY && data[item.view as ResourceName].length > 0 && <span className={styles.navCount}>{data[item.view as ResourceName].length}</span>}</button>)}</div>)}</nav>
        <footer className={styles.sidebarFooter}><p><span className={styles.statusDot} data-ready={status?.botConfigured} />{status?.botConfigured ? 'Bot available' : 'Bot not connected'}</p><Link className={styles.quietLink} href="/docs">Help & documentation <IconChevronRight size={13} /></Link></footer>
      </aside>
      <main ref={mainRef} className={styles.main} id="dashboard-main"><div className={styles.content}>
        <div className={styles.pageHeading}><div><h1>{TITLES[view][0]}</h1><p>{TITLES[view][1]}</p></div><div className={styles.headingActions}>{isResource && view !== 'responses' && <button className={styles.primaryButton} type="button" onClick={() => setEditor({ resource: view as Exclude<ResourceName, 'responses'> })}><IconPlus size={15} />New {SINGULAR[resource]}</button>}{view === 'overview' && <button className={styles.primaryButton} type="button" onClick={() => setEditor({ resource: 'messages' })}><IconPlus size={15} />New message</button>}</div></div>
        <div className={styles.stack}>
          {guildsError && <div className={styles.notice} role="status"><div className={styles.between}><span>Discord servers could not be refreshed. Your saved workspace is still available.</span><button type="button" className={styles.secondaryButton} aria-label="Retry loading servers" disabled={guildsLoading} onClick={() => void refreshGuilds()}>{guildsLoading ? 'Retrying…' : 'Retry'}</button></div><p className={styles.helper} style={{ margin: '8px 0 0', overflowWrap: 'anywhere' }}>{guildsError}</p></div>}
          {error && !editor && !sending && !deleting && <div className={styles.error} role="alert"><div className={styles.between}><span>{error}</span><button type="button" className={styles.iconButton} aria-label="Dismiss error" onClick={() => setError('')}><IconX size={14} /></button></div></div>}
          {notice && <div className={styles.success} role="status"><div className={styles.between}><span>{notice}</span><button type="button" className={styles.iconButton} aria-label="Dismiss notification" onClick={() => setNotice('')}><IconX size={14} /></button></div></div>}
          {view === 'overview' && <Overview user={user} data={data} status={status} navigate={navigate} newMessage={() => setEditor({ resource: 'messages' })} editMessage={item => setEditor({ resource: 'messages', item })} />}
          {isResource && <div><div className={styles.toolbar}><div className={styles.searchWrap}><IconSearch size={15} /><input className={styles.search} aria-label={`Search ${TITLES[view][0].toLowerCase()}`} placeholder={`Search ${TITLES[view][0].toLowerCase()}…`} value={search} onChange={event => setSearch(event.target.value)} /></div><span className={styles.muted}>{data[resource].length} total</span></div><div className={styles.panel}>{filtered.length ? <div className={styles.list}>{filtered.map(item => {
            const enabled = 'enabled' in item ? item.enabled : undefined;
            const schedule = resource === 'schedules' ? item as ResourceMap['schedules'] : undefined;
            const title = resource === 'schedules' ? data.messages.find(message => message.id === schedule?.messageId)?.name ?? 'Scheduled message' : recordTitle(resource, item);
            return <div className={styles.listItem} key={item.id}><div className={styles.itemIcon}><nav.icon size={16} /></div><div className={styles.itemBody}><strong>{title}</strong><p>{recordDescription(resource, item, data)}</p>{schedule?.lastError && <p title={schedule.lastError} style={{ color: 'var(--danger)' }}>{schedule.lastError}</p>}</div><div className={styles.itemActions}>{enabled !== undefined && <span className={styles.badge} data-tone={enabled ? 'success' : undefined}>{enabled ? 'Enabled' : 'Disabled'}</span>}{schedule && <span className={styles.badge} data-tone={schedule.status === 'active' ? 'success' : schedule.status === 'failed' ? 'error' : undefined}>{schedule.status}</span>}{resource === 'messages' && <button type="button" className={styles.iconButton} title="Send message" aria-label={`Send ${title}`} disabled={!status?.botConfigured} onClick={() => setSending(item as SavedMessage)}><IconSendHook size={16} /></button>}{resource === 'responses' ? <button type="button" className={styles.secondaryButton} onClick={() => setResponse(item as SavedResponse)}>View</button> : <button type="button" className={styles.iconButton} title="Edit" aria-label={`Edit ${title}`} onClick={() => setEditor({ resource: resource as Exclude<ResourceName, 'responses'>, item })}><IconPencil size={15} /></button>}<button type="button" className={styles.iconButton} title="Delete" aria-label={`Delete ${title}`} onClick={() => setDeleting({ resource, item })}><IconTrash size={15} /></button></div></div>;
          })}</div> : <div className={styles.empty}><nav.icon size={28} /><h2>{search ? 'No matches' : `No ${TITLES[view][0].toLowerCase()} yet`}</h2><p>{search ? 'Try a different search.' : view === 'responses' ? 'When someone submits one of your Discord forms, their answers will appear here.' : `Create your first ${SINGULAR[resource]} to get started.`}</p>{!search && view !== 'responses' && <button type="button" className={styles.secondaryButton} onClick={() => setEditor({ resource: resource as Exclude<ResourceName, 'responses'> })}><IconPlus size={14} />Create {SINGULAR[resource]}</button>}</div>}</div>{view === 'commands' && <p className={styles.helper} style={{ marginTop: 14 }}>After saving commands, sync them from Servers. Context commands appear under Apps when someone right-clicks a user or message.</p>}</div>}
          {view === 'servers' && <Servers guilds={guilds} loading={guildsLoading} loadError={guildsError} refresh={() => void refreshGuilds()} linked={discordLinked} status={status} busy={busy} connect={connectDiscord} sync={syncCommands} onError={message => setError(message)} />}
          {view === 'settings' && <Settings user={user} identity={discordUser} status={status} discordLinked={discordLinked} busy={busy} connect={connectDiscord} signOut={signOut} />}
        </div>
      </div></main>
    </div>
    {editor && <ResourceEditor key={`${editor.resource}-${editor.item?.id ?? 'new'}`} resource={editor.resource} item={editor.item} data={data} guilds={guilds} status={status} onClose={() => setEditor(null)} onSave={values => save(editor.resource, editor.item, values)} />}
    {deleting && <DashboardModal title={`Delete ${SINGULAR[deleting.resource]}?`} onClose={() => { if (!busy) setDeleting(null); }}><div className={styles.stack}><p className={styles.bodyText}>“{recordTitle(deleting.resource, deleting.item)}” will be permanently deleted.{deleting.resource === 'messages' ? ' Messages already sent to Discord are kept.' : deleting.resource === 'commands' ? ' Sync commands from Servers afterward to update Discord.' : ''}</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setDeleting(null)} disabled={busy}>Cancel</button><button type="button" className={styles.dangerButton} disabled={busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete'}</button></div></div></DashboardModal>}
    {sending && <SendMessageForm message={sending} guilds={guilds} onClose={() => setSending(null)} onSend={async values => { await mutate(`/api/platform/messages/${sending.id}/send`, { method: 'POST', body: JSON.stringify(values) }, values.mode === 'edit' ? 'Sent message updated in Discord.' : 'Message sent to Discord.'); setSending(null); }} />}
    {response && <DashboardModal title={response.formTitle} subtitle={`${response.username} · ${dateLabel(response.submittedAt)}`} onClose={() => setResponse(null)}><div className={styles.responseAnswers}><dl>{Object.entries(response.answers).map(([id, value]) => <div key={id}><dt>{data.forms.find(form => form.id === response.formId)?.fields.find(field => field.id === id)?.label ?? id}</dt><dd>{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : value || 'No answer'}</dd></div>)}</dl>{response.attachments?.map(file => <a key={file.id} className={styles.quietLink} href={file.url} target="_blank" rel="noopener noreferrer">{file.filename} ↗</a>)}</div></DashboardModal>}
  </div>;
}

function Overview({ user, data, status, navigate, newMessage, editMessage }: { user: DashboardUser; data: DashboardData; status: PlatformStatus | null; navigate: (view: View) => void; newMessage: () => void; editMessage: (item: SavedMessage) => void }) {
  const counts = [
    { view: 'messages' as const, title: 'Messages', count: data.messages.length, icon: IconMessages, detail: 'Saved to your account' },
    { view: 'actions' as const, title: 'Actions', count: data.actions.length, icon: IconShield, detail: 'Buttons and role menus' },
    { view: 'responses' as const, title: 'Responses', count: data.responses.length, icon: IconFileText, detail: `${data.forms.length} forms in your workspace` },
    { view: 'schedules' as const, title: 'Scheduled', count: data.schedules.filter(job => job.status === 'active').length, icon: IconCalendarClock, detail: 'Active schedules' },
  ];
  return <>
    <div className={styles.stats}>{counts.map(stat => <a key={stat.title} className={styles.stat} href={`#${stat.view}`} onClick={event => { event.preventDefault(); navigate(stat.view); }}><span><stat.icon size={15} />{stat.title}</span><strong>{stat.count}</strong><small>{stat.detail}</small></a>)}</div>
    {!status?.botConfigured && <p className={styles.notice}>Bot not connected yet. You can build and save messages here.</p>}
    <div className={styles.grid}><section className={styles.panel}><header className={styles.panelHeader}><h2>Recent messages</h2><button type="button" className={styles.textButton} onClick={() => navigate('messages')}>View all</button></header>{data.messages.length ? <div className={styles.list}>{[...data.messages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4).map(message => <div className={styles.listItem} key={message.id}><div className={styles.itemIcon}><IconMessage size={16} /></div><div className={styles.itemBody}><strong>{message.name}</strong><p>Updated {dateLabel(message.updatedAt)}</p></div><button type="button" className={styles.iconButton} aria-label={`Edit ${message.name}`} onClick={() => editMessage(message)}><IconChevronRight size={16} /></button></div>)}</div> : <div className={styles.empty}><IconMessages size={26} /><h3>Make your first message</h3><p>Start with text, an embed, or a complete Components V2 layout.</p><button type="button" className={styles.secondaryButton} onClick={newMessage}><IconPlus size={14} />Create message</button></div>}</section>
    <section className={styles.panel}><header className={styles.panelHeader}><h2>Coming up</h2><button type="button" className={styles.textButton} onClick={() => navigate('schedules')}>View schedules</button></header>{data.schedules.some(job => job.status === 'active') ? <div className={styles.list}>{data.schedules.filter(job => job.status === 'active').sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt)).slice(0, 4).map(job => <div className={styles.listItem} key={job.id}><div className={styles.itemIcon}><IconClock size={16} /></div><div className={styles.itemBody}><strong>{data.messages.find(message => message.id === job.messageId)?.name ?? 'Scheduled message'}</strong><p>{dateLabel(job.nextRunAt)} · {job.rule.frequency}</p></div></div>)}</div> : <div className={styles.empty}><IconCalendarClock size={26} /><h3>No upcoming messages</h3><p>Schedule an announcement once, every day, or on selected days.</p><button type="button" className={styles.secondaryButton} onClick={() => navigate('schedules')}>Go to schedules</button></div>}</section></div>
    <section className={styles.panel}><header className={styles.panelHeader}><h2>Build for your community</h2><span>{user.name.split(' ')[0]}’s workspace</span></header><div className={`${styles.panelBody} ${styles.grid}`}><div className={styles.featureCard}><IconShield size={22} /><div><h3>Let members choose their roles</h3><p>Add a dropdown or a row of buttons to any saved message.</p><button type="button" className={styles.textButton} style={{ marginTop: 10 }} onClick={() => navigate('actions')}>Build an action →</button></div></div><div className={styles.featureCard}><IconFileText size={22} /><div><h3>Ask your community</h3><p>Build a form, open it from a button or command, and review every answer here.</p><button type="button" className={styles.textButton} style={{ marginTop: 10 }} onClick={() => navigate('forms')}>Create a form →</button></div></div></div></section>
  </>;
}

function Servers({ guilds, loading, loadError, refresh, linked, status, busy, connect, sync, onError }: { guilds: GuildSummary[]; loading: boolean; loadError: string; refresh: () => void; linked: boolean; status: PlatformStatus | null; busy: boolean; connect: () => Promise<void>; sync: (guildId: string) => Promise<void>; onError: (message: string) => void }) {
  const [inviting, setInviting] = useState('');
  const inviteRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { inviteRequest.current?.abort(); }, []);
  async function invite(guildId: string) {
    if (inviteRequest.current) return;
    const controller = new AbortController(); inviteRequest.current = controller;
    let redirecting = false;
    setInviting(guildId);
    try { const result = await dashboardRequest<{ url: string }>(`/api/platform/bot/invite?guildId=${encodeURIComponent(guildId)}`, { signal: controller.signal }); if (!controller.signal.aborted) { window.location.assign(result.url); redirecting = true; } }
    catch (reason) { if (!controller.signal.aborted) onError(errorMessage(reason)); }
    finally { if (!controller.signal.aborted && !redirecting) setInviting(''); if (inviteRequest.current === controller) inviteRequest.current = null; }
  }
  return <><div className={styles.panel}><div className={styles.panelBody}><div className={styles.between}><div className={styles.connection}><span className={styles.avatar}><BrandDiscord size={20} /></span><div><h3>Discord server access</h3><p>{linked ? 'Signed in with your Discord account' : 'Sign in again to refresh the servers you can manage'}</p></div></div><button type="button" className={styles.secondaryButton} disabled={busy || !status?.authAvailable || !status?.discordLogin} onClick={() => void connect()}>{busy ? 'Opening…' : linked ? 'Refresh access' : 'Reconnect Discord'}</button></div>{(!status?.authAvailable || !status?.discordLogin) && <p className={styles.notice}>Discord sign-in is not available on this deployment yet. Your saved workspace stays here.</p>}</div></div>
    <section className={styles.panel} aria-busy={loading}><header className={styles.panelHeader}><h2>Your servers</h2><div className={styles.inline}><span className={styles.helper}>{loading ? 'Refreshing…' : loadError && !guilds.length ? 'Unavailable' : `${guilds.length} servers`}</span><button type="button" className={styles.secondaryButton} aria-label="Refresh servers" disabled={loading} onClick={refresh}>Refresh</button></div></header>{guilds.length ? <div className={styles.list}>{guilds.map(guild => <div key={guild.id} className={styles.listItem}><div className={styles.avatar}>{guild.name.slice(0, 1)}</div><div className={styles.itemBody}><strong>{guild.name}</strong><p>{guild.botPresent ? 'Meowhook is in this server' : 'Meowhook has not joined this server'}</p></div><div className={styles.itemActions}><span className={styles.badge} data-tone={guild.botPresent ? 'success' : undefined}>{guild.botPresent ? 'Connected' : 'Not added'}</span>{guild.botPresent ? <button type="button" className={styles.secondaryButton} disabled={busy || !!inviting || !!loadError || loading} onClick={() => void sync(guild.id).catch(reason => onError(errorMessage(reason)))}>Sync commands</button> : <button type="button" className={styles.secondaryButton} disabled={busy || !!inviting || !status?.botConfigured || !!loadError || loading} onClick={() => void invite(guild.id)}>{inviting === guild.id ? 'Opening…' : 'Add bot'}</button>}</div></div>)}</div> : <div className={styles.empty}><IconFolder size={28} /><h3>{loading ? 'Loading servers…' : loadError ? 'Server access unavailable' : linked ? 'No manageable servers found' : 'Your servers will appear here'}</h3><p>{loading ? 'Your saved workspace is ready to use.' : loadError ? 'Retry fetching your servers or reconnect Discord.' : linked ? 'You need Manage Server permission to configure a server in Meowhook.' : 'Reconnect Discord to refresh the servers you can manage.'}</p></div>}</section></>;
}

function Settings({ user, identity, status, discordLinked, busy, connect, signOut }: { user: DashboardUser; identity: DiscordIdentity | null; status: PlatformStatus | null; discordLinked: boolean; busy: boolean; connect: () => Promise<void>; signOut: () => Promise<void> }) {
  const displayName = identity?.displayName || identity?.username || user.name;
  const avatar = discordAvatar(identity?.avatarUrl || user.image);
  const canReconnect = status?.authAvailable === true && status?.discordLogin === true;
  return <>
    <section className={styles.panel}>
      <header className={styles.panelHeader}><h2>Your Discord account</h2><button type="button" className={styles.textButton} onClick={() => void signOut()}>Sign out</button></header>
      <div className={styles.panelBody}>
        <div className={styles.discordProfile}><span className={styles.profileAvatar}>{avatar ? <img src={avatar} alt="" width={52} height={52} /> : <BrandDiscord size={25} />}</span><div><h3>{displayName}</h3>{identity?.username && <p>@{identity.username}</p>}<span className={styles.badge} data-tone="accent">Signed in with Discord</span></div></div>
        <p className={styles.helper}>Your profile comes from Discord and is read-only here.</p>
        <dl className={styles.accountDetails}>
          <div><dt>Discord user ID</dt><dd>{identity?.id || 'Unavailable'}</dd></div>
          {identity?.email && <div><dt>Email</dt><dd>{identity.email}</dd></div>}
          <div><dt>Sign-in method</dt><dd>Discord</dd></div>
        </dl>
        <div className={styles.settingsRow}><div><strong>Discord server access</strong><p>{discordLinked ? 'Your manageable servers are available in Servers.' : 'Sign in with Discord again to refresh your server access.'}</p></div><button type="button" className={styles.secondaryButton} disabled={busy || !canReconnect} onClick={() => void connect()}>{busy ? 'Opening…' : 'Reconnect Discord'}</button></div>
        <a className={styles.quietLink} href="https://discord.com/channels/@me" target="_blank" rel="noopener noreferrer">Open Discord <span aria-hidden>↗</span></a>
      </div>
    </section>
    <section className={styles.panel}><header className={styles.panelHeader}><h2>Workspace services</h2></header><div className={styles.panelBody}>{[
      { label: 'Saved workspace', detail: 'Messages, actions, forms, and responses persist in your account.', ready: status?.authAvailable },
      { label: 'Discord bot', detail: 'Delivers messages and handles roles, forms, and commands.', ready: status?.botConfigured },
      { label: 'Scheduled delivery', detail: 'Runs saved schedules while your browser is closed.', ready: status?.schedulerConfigured },
    ].map(service => <div key={service.label} className={styles.settingsRow}><div><strong>{service.label}</strong><p>{service.detail}</p></div><span className={styles.badge} data-tone={service.ready ? 'success' : undefined}>{service.ready ? 'Available' : 'Not configured'}</span></div>)}</div></section>
  </>;
}
