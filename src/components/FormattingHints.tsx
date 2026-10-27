'use client';

import { useId, useState } from 'react';
import { motion } from 'framer-motion';
import { IconBookOpen, IconChevronRight } from '@/components/MeowIcons';
import { FORMATTING_HINTS } from '@/lib/formattingHints';
import { parseDiscordMarkdownForPreview } from '@/lib/markdown';
import { useUiMotion } from '@/lib/useUiMotion';

// Fixed examples are parsed once, independently of whatever the person is typing.
const EXAMPLES = FORMATTING_HINTS.filter(hint => hint.id !== 'indent').map(hint => ({
  ...hint,
  html: parseDiscordMarkdownForPreview(hint.syntax)
    .replace(/ onclick="[^"]*"/g, '')
    .replace(/<a /g, '<a tabindex="-1" '),
}));

export default function FormattingHints() {
  const id = useId();
  const uiMotion = useUiMotion();
  const [open, setOpen] = useState(false);
  const [activeHint, setActiveHint] = useState<string | null>(null);

  return <section className="formatting-hints" aria-label="Formatting tips">
    <button type="button" className="formatting-hints__toggle" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(value => !value)}>
      <IconBookOpen size={16} aria-hidden /><span>Formatting tips</span><IconChevronRight size={14} className="formatting-hints__chevron" aria-hidden />
    </button>
    <motion.div id={`${id}-body`} initial={false} animate={{ height: open ? 'auto' : 0 }} transition={uiMotion.transition}
      className="formatting-hints__collapse" inert={!open} aria-hidden={!open}>
      <div className="formatting-hints__body">
        <p>Choose a style to see how it works.</p>
        <div className="formatting-hints__list">
          {EXAMPLES.map(example => {
            const expanded = activeHint === example.id;
            return <div key={example.id} className="formatting-hint">
              <button type="button" className="formatting-hint__toggle" aria-expanded={expanded} aria-controls={`${id}-${example.id}`} onClick={() => setActiveHint(expanded ? null : example.id)}>
                <span>{example.name}</span><IconChevronRight size={13} aria-hidden />
              </button>
              <motion.div id={`${id}-${example.id}`} initial={false} animate={{ height: expanded ? 'auto' : 0 }} transition={uiMotion.transition}
                className="formatting-hint__collapse" inert={!expanded} aria-hidden={!expanded}>
                <div className="formatting-hint__body">
                  <span className="formatting-hint__label">{example.id === 'ansi' ? 'Paste this' : 'Type this'}</span>
                  <code>{example.syntax}</code>
                  <span className="formatting-hint__label">Preview</span>
                  <div className="formatting-hint__preview" aria-hidden dangerouslySetInnerHTML={{ __html: example.html }} />
                  <p>{example.hint}</p>
                </div>
              </motion.div>
            </div>;
          })}
        </div>
        <p className="formatting-hints__emoji">Custom emoji use <code>{'<:name:id>'}</code>. You can paste them into your text too.</p>
        <a className="formatting-hints__docs" href="/docs#text" target="_blank" rel="noopener noreferrer">More formatting help <span className="visually-hidden">(opens in a new tab)</span></a>
      </div>
    </motion.div>
  </section>;
}
