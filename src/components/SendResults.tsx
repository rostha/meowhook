'use client';

import { useId, useState } from 'react';
import { AnimatedEditorList, AnimatedEditorRow } from './AnimatedEditorList';
import { IconAlert, IconCheck, IconChevronDown, IconLoader } from './MeowIcons';
import type { SendRun } from '@/lib/sendHistory';

export default function SendResults({ run, retrying }: { run: SendRun; retrying: boolean }) {
  const failed = run.rows.filter(row => row.status === 'failed').length;
  const sent = run.rows.filter(row => row.status === 'sent').length;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const firstFailure = run.rows.find(row => row.status === 'failed');
  const failureText = firstFailure ? `Message ${firstFailure.position}: ${(firstFailure.error || 'Send failed. Open details to review.').replace(/^attachments:\s*/i, '')}` : '';

  return <section className="send-results" aria-label="Last send results">
    <button type="button" className="send-results__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span className="send-results__label" title={failureText || undefined}>{firstFailure && <IconAlert size={14} className="send-results__failure-count" aria-hidden />}<span>Last send attempt</span></span>
      <span className="send-results__summary">
        <span>{sent} of {run.rows.length} sent</span>
        {failed > 0 && <span className="send-results__failure-count">{failed} failed</span>}
        <span className="send-results__details-label">Details</span>
        <IconChevronDown size={14} aria-hidden />
      </span>
    </button>
    <div id={panelId}><AnimatedEditorList gap={0}>{open && <AnimatedEditorRow key="results">
      <div className="send-results__panel">
        <ol>{run.rows.map(row => <li key={row.localId} className="send-results__row" data-status={row.status}>
          <span className="send-results__icon" aria-hidden>{row.status === 'failed' ? <IconAlert size={16} /> : row.status === 'sent' ? <IconCheck size={16} /> : row.status === 'sending' ? <IconLoader size={16} /> : <span className="send-results__waiting-dot" />}</span>
          <div className="send-results__body">
            <div className="send-results__row-heading"><strong>Message {row.position}</strong><span>{row.status === 'not-sent' ? 'Not sent' : row.status === 'failed' ? 'Failed' : row.status === 'sent' ? 'Sent' : 'Sending'}</span></div>
            {row.error && <p className="send-results__error">{row.error.replace(/^attachments:\s*/i, '')}</p>}
            {row.discordId && <p className="send-results__id">Message ID <code>{row.discordId}</code></p>}
          </div>
        </li>)}</ol>
        {retrying && <p className="send-results__retry-note">Retry sends only failed and unsent messages.</p>}
      </div>
    </AnimatedEditorRow>}</AnimatedEditorList></div>
  </section>;
}
