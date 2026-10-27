import { describe, expect, it } from 'vitest';
import { prepareAnsiPaste } from './ansiPaste';

const colored = '\u001b[1;38;2;255;215;0mGold\u001b[0m';
const fenced = '```ansi\n' + colored + '\n```';

describe('ANSI paste', () => {
  it('opens visual editing for ANSI and leaves ordinary code examples literal', () => {
    expect(prepareAnsiPaste('',0,0,colored,4000)).toHaveProperty('openEditor',true);
    expect(prepareAnsiPaste('```ansi\n\n```',8,8,colored,4000)).toHaveProperty('openEditor',true);
    expect(prepareAnsiPaste('```js\n\n```',6,6,colored,4000)).toHaveProperty('openEditor',false);
    expect(prepareAnsiPaste('',0,0,'```js\n'+colored+'\n```',4000)).toHaveProperty('openEditor',false);
  });
  it('wraps raw ANSI on its own lines and preserves the surrounding selection', () => {
    const result = prepareAnsiPaste('BeforeXAfter', 6, 7, colored, 4000);
    expect(result && 'edit' in result && result.edit.text).toBe('Before\n' + fenced + '\nAfter');
  });

  it('does not nest an already fenced paste or a paste within an existing code block', () => {
    const result = prepareAnsiPaste('', 0, 0, fenced, 4000);
    expect(result && 'edit' in result && result.edit.text).toBe(fenced);
    const existing = '```ansi\n\n```';
    const nested = prepareAnsiPaste(existing, 8, 8, colored, 4000);
    expect(nested && 'edit' in nested && nested.edit.text).toBe(fenced);
  });

  it('accepts the exact character boundary and rejects one character over without truncation', () => {
    expect(prepareAnsiPaste('', 0, 0, colored, fenced.length)).toHaveProperty('edit.text', fenced);
    expect(prepareAnsiPaste('', 0, 0, colored, fenced.length - 1)).toHaveProperty('error');
    expect(prepareAnsiPaste('', 0, 0, fenced, fenced.length - 1)).toHaveProperty('error');
  });

  it('lets ordinary and literal escaped text use native paste', () => {
    expect(prepareAnsiPaste('', 0, 0, 'ordinary text', 4000)).toBeNull();
    expect(prepareAnsiPaste('', 0, 0, '\\u001b[31mexample', 4000)).toBeNull();
  });
});
