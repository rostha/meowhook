import type { ComponentBlock, EditorFocusTarget, Message } from './types';

export function validationTarget(messages: Message[], reason: string): Omit<EditorFocusTarget, 'requestId'> {
  const messageIndex = Math.max(0, Number(reason.match(/Message (\d+)/i)?.[1] ?? 1) - 1);
  const message = messages[messageIndex];
  const embedIndex = Math.max(0, Number(reason.match(/embed\s+(\d+)/i)?.[1] ?? 1) - 1);
  const embed = message?.embeds[embedIndex];
  const fieldIndex = Number(reason.match(/field\s+(\d+)/i)?.[1] ?? reason.match(/field (\d+) needs/i)?.[1] ?? 0) - 1;
  const section = /component|V2/i.test(reason) ? 'components' : /avatar/i.test(reason) ? 'profile' : /upload|attachment|file needs/i.test(reason) ? 'files' : /component|link button|link needs/i.test(reason) ? 'components' : /embed|field/i.test(reason) ? 'embeds' : 'content';
  const inputLabel = /author name/i.test(reason) ? 'Embed author name' : /footer/i.test(reason) ? 'Embed footer text' : /description/i.test(reason) ? 'Embed description' : 'Embed title';
  let blocks = message?.componentBlocks ?? [], component: ComponentBlock | undefined;
  if (section === 'components') {
    for (const match of reason.matchAll(/,\s*block\s+(\d+)/gi)) {
      component = blocks[Number(match[1]) - 1];
      blocks = component?.type === 'container' ? component.blocks : [];
    }
  }
  const componentInput = component?.type === 'text' ? 'Component text'
    : component?.type === 'section' ? /thumbnail image URL/i.test(reason) ? 'Thumbnail URL' : /image description/i.test(reason) ? 'Thumbnail description' : 'Section text'
    : component?.type === 'gallery' && /image\s+\d+/i.test(reason) ? `Gallery image ${reason.match(/image\s+(\d+)/i)?.[1]} ${/description/i.test(reason) ? 'description' : 'URL'}`
    : component?.type === 'file' ? 'File attachment' : undefined;
  return { messageIndex, section, embedId: section === 'embeds' ? embed?.id : undefined,
    componentId: component?.id,
    fieldId: fieldIndex >= 0 ? embed?.fields[fieldIndex]?.id : undefined,
    inputLabel: section === 'embeds' ? inputLabel : componentInput,
    embedSection: fieldIndex >= 0 ? 'fields' : /author name/i.test(reason) ? 'author' : /footer/i.test(reason) ? 'footer' : undefined,
    source: 'editor' };
}
