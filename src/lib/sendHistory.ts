export interface SendRow {
  localId: string;
  position: number;
  status: 'not-sent' | 'sending' | 'sent' | 'failed';
  discordId?: string;
  error?: string;
}
export interface SendRun { draftId: string; destination: string; at: number; rows: SendRow[] }
export function sendDestination(raw: string): string {
  try { const url = new URL(raw); return `${url.host}/${url.pathname.split('/')[3]}?thread=${url.searchParams.get('thread_id') ?? ''}`; }
  catch { return ''; }
}
export function retryMessageIds(run: SendRun | undefined, destination: string): string[] {
  return run?.destination === destination ? run.rows.filter(row => row.status !== 'sent').map(row => row.localId) : [];
}
export function loadSendRuns(): Record<string, SendRun> {
  try {
    const data = JSON.parse(localStorage.getItem('meowhook_send_results') ?? '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, run]) => {
      const r = run as SendRun;
      return r && typeof r.draftId === 'string' && typeof r.destination === 'string' && Array.isArray(r.rows) && r.rows.every(row => row && typeof row.localId === 'string' && ['not-sent','sending','sent','failed'].includes(row.status));
    }).map(([id, run]) => {
      const r = run as SendRun;
      return [id, { ...r, rows: r.rows.map(row => row.status === 'sending' ? { ...row, status: 'failed', error: 'Sending was interrupted. Check Discord before retrying.' } : row) }];
    }));
  } catch { return {}; }
}
