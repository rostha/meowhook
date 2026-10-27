import { describe, it, expect } from 'vitest';
import { groupEmbedFieldsForPreview, inlineEmbedFieldGridTemplateColumns } from './utils';

describe('groupEmbedFieldsForPreview', () => {
  const f = (id: string, inline: boolean) => ({ id, name: '', value: '', inline });

  it('groups up to 3 consecutive inline fields', () => {
    const rows = groupEmbedFieldsForPreview([f('a', true), f('b', true), f('c', true)]);
    expect(rows).toEqual([{ kind: 'inline', fields: [f('a', true), f('b', true), f('c', true)] }]);
  });

  it('splits inline groups after a full-width field', () => {
    const rows = groupEmbedFieldsForPreview([f('a', true), f('b', false), f('c', true)]);
    expect(rows).toEqual([
      { kind: 'inline', fields: [f('a', true)] },
      { kind: 'full', field: f('b', false) },
      { kind: 'inline', fields: [f('c', true)] },
    ]);
  });

  it('puts two inline fields in one row (50% each in Discord)', () => {
    const rows = groupEmbedFieldsForPreview([f('a', true), f('b', true)]);
    expect(rows).toEqual([{ kind: 'inline', fields: [f('a', true), f('b', true)] }]);
  });
});

describe('inlineEmbedFieldGridTemplateColumns', () => {
  it('uses 2 equal columns for 2 inline fields', () => {
    expect(inlineEmbedFieldGridTemplateColumns(2)).toBe('repeat(2, 1fr)');
  });

  it('uses 3 columns for a lone inline field (first slot ~⅓)', () => {
    expect(inlineEmbedFieldGridTemplateColumns(1)).toBe('repeat(3, 1fr)');
  });
});
