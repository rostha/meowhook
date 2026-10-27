import { describe, it, expect } from 'vitest';
import { insertRaw, wrapSelection, insertPrefixOnLine } from './textEditorInsert';

describe('textEditorInsert', () => {
  it('insertRaw respects max length', () => {
    const r = insertRaw('ab', 1, 1, 'XYZ', 4);
    expect(r?.text).toBe('aXYb');
  });

  it('wrapSelection wraps selection', () => {
    const r = wrapSelection('hello world', 0, 5, '**', '**', 100);
    expect(r?.text).toBe('**hello** world');
    expect(r?.selStart).toBe(2);
    expect(r?.selEnd).toBe(7);
  });

  it('insertPrefixOnLine adds at line start', () => {
    const r = insertPrefixOnLine('line\nother', 5, '> ', 100);
    expect(r?.text).toBe('line\n> other');
  });
});
