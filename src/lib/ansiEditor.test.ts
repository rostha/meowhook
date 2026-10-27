import { describe, expect, it } from 'vitest';
import { parseAnsiRuns } from './ansi';
import { ansiColorHex, ansiEditorAppearance, ansiEditorContext, ansiPlainText, ansiSelectionStyle, applyAnsiEditor, gradientAnsiSelection, serializeAnsiRuns, styleAnsiSelection } from './ansiEditor';

describe('ANSI popup editing', () => {
  it('recognizes existing gradients and their endpoints when reopening', () => {
    const runs=parseAnsiRuns('\u001b[38;2;120;72;0mA\u001b[38;2;255;255;255mB');
    expect(ansiEditorAppearance(runs)).toEqual({target:'foreground',gradient:true,from:'#784800',to:'#ffffff'});
    expect(ansiEditorAppearance([{text:'AB',style:{background:'#123456'}}])).toMatchObject({target:'background',gradient:false});
  });

  it('clears a block without leaving an empty fence and preserves surrounding text', () => {
    expect(applyAnsiEditor('Original',0,8,[])).toBe('');
    const text='Before\n```ansi\nGold\n```\nAfter';
    const context=ansiEditorContext(text,15,15);
    expect(applyAnsiEditor(text,context.start,context.end,[])).toBe('Before\n\nAfter');
  });
  it('finds common formatting while keeping mixed selection colors distinct', () => {
    const runs = [{text:'red',style:{foreground:'#ff0000',bold:true}},{text:'blue',style:{foreground:'#0000ff',bold:true}}];
    expect(ansiSelectionStyle(runs,0,7)).toEqual({bold:true});
    expect(ansiSelectionStyle(runs,0,3)).toEqual({foreground:'#ff0000',bold:true});
    expect(ansiColorHex('rgb(18, 52, 86)')).toBe('#123456');
  });

  it('reopens a nearby ANSI block when the caret is after it without nesting fences', () => {
    const text = 'Before\n```ansi\n\u001b[31mRed\u001b[0m\n```\nAfter';
    const context = ansiEditorContext(text,text.length,text.length);
    expect(ansiPlainText(context.runs)).toBe('Red');
    const output = applyAnsiEditor(text,context.start,context.end,context.runs);
    expect(output.match(/```ansi/g)).toHaveLength(1);
    expect(output).toMatch(/^Before\n[\s\S]*\nAfter$/);
  });

  it('reopens the existing block when an automatic paste selects the surrounding field', () => {
    const text = 'Intro\n```ansi\nGold\n```\nEnd';
    const context = ansiEditorContext(text,0,text.length);
    expect(ansiPlainText(context.runs)).toBe('Gold');
    expect(text.slice(0,context.start)).toBe('Intro\n');
    expect(text.slice(context.end)).toBe('\nEnd');
  });
  it('preserves selected and unselected styles through serialization', () => {
    const initial = parseAnsiRuns('\u001b[1;38;2;10;20;30mHello world\u001b[0m!');
    const next = styleAnsiSelection(initial, 6, 11, {italic:true,foreground:'#ffffff'});
    const output = parseAnsiRuns(serializeAnsiRuns(next));
    expect(ansiPlainText(output)).toBe('Hello world!');
    expect(output[0].style).toMatchObject({bold:true,foreground:'rgb(10,20,30)'});
    expect(output[1]).toEqual({text:'world',style:{bold:true,italic:true,foreground:'rgb(255,255,255)'}});
    expect(output.at(-1)).toEqual({text:'!',style:{}});
  });

  it('applies gradients to the selection only, retaining Unicode characters and backgrounds', () => {
    const initial = [{text:'A🐈BCZ',style:{background:'#000000',bold:true}}];
    const next = gradientAnsiSelection(initial, 1, 5, '#000000', '#ffffff', 'foreground');
    expect(ansiPlainText(next)).toBe('A🐈BCZ');
    expect(next[0].style.foreground).toBeUndefined();
    expect(next[1]).toEqual({text:'🐈',style:{background:'#000000',bold:true,foreground:'rgb(0,0,0)'}});
    expect(next[3].style.foreground).toBe('rgb(255,255,255)');
    expect(next[4].style.foreground).toBeUndefined();
  });

  it('resets selected styles without affecting neighboring text', () => {
    const next = styleAnsiSelection([{text:'ABC',style:{bold:true,foreground:'#ff0000'}}],1,2,{bold:false,foreground:undefined});
    const serialized = parseAnsiRuns(serializeAnsiRuns(next));
    expect(serialized[1]).toEqual({text:'B',style:{}});
    expect(serialized[2].style.bold).toBe(true);
  });

  it('reopens an existing ANSI fence and replaces it without touching surrounding markdown', () => {
    const text = 'Before\n```ansi\n\u001b[31mRed\u001b[0m\n```\nAfter';
    const context = ansiEditorContext(text, 18, 18);
    expect(ansiPlainText(context.runs)).toBe('Red');
    const changed = styleAnsiSelection(context.runs,0,3,{foreground:'#ffffff'});
    const output = applyAnsiEditor(text,context.start,context.end,changed);
    expect(output).toBe('Before\n```ansi\n\u001b[38;2;255;255;255mRed\u001b[0m\n```\nAfter');
  });

  it('opens selected ordinary text and inserts a complete separate block', () => {
    const context = ansiEditorContext('Before word After',7,11);
    expect(ansiPlainText(context.runs)).toBe('word');
    expect(applyAnsiEditor('Before word After',context.start,context.end,context.runs)).toBe('Before \n```ansi\nword\n```\n After');
  });

  it('keeps RGB gradients compact instead of resetting all styles for each letter', () => {
    const runs = parseAnsiRuns('\u001b[1;38;2;10;20;30mA\u001b[1;38;2;40;50;60mB\u001b[0m');
    const output = serializeAnsiRuns(runs);
    expect(output).toBe('\u001b[1;38;2;10;20;30mA\u001b[38;2;40;50;60mB\u001b[0m');
    expect(ansiPlainText(parseAnsiRuns(output))).toBe('AB');
  });
});
