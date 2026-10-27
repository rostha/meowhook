export type FormattingHint = {
  id: string;
  name: string;
  syntax: string;
  hint: string;
};

export const FORMATTING_HINTS: readonly FormattingHint[] = [
  { id: 'bold', name: 'Bold', syntax: '**important**', hint: 'Put two asterisks on each side to make a word stand out.' },
  { id: 'italic', name: 'Italic', syntax: '*a little emphasis*', hint: 'Put one asterisk on each side for a little emphasis.' },
  { id: 'under', name: 'Underline', syntax: '__remember this__', hint: 'Put two underscores on each side to underline text.' },
  { id: 'strike', name: 'Strikethrough', syntax: '~~old plan~~', hint: 'Put two tildes on each side to cross out text.' },
  { id: 'bi', name: 'Bold + italic', syntax: '***extra emphasis***', hint: 'Put three asterisks on each side to combine bold and italic.' },
  { id: 'h1', name: 'Large heading', syntax: '# Announcement', hint: 'Start a new line with # and a space for your biggest heading.' },
  { id: 'h2', name: 'Medium heading', syntax: '## What’s new', hint: 'Start a new line with ## and a space for a smaller heading.' },
  { id: 'h3', name: 'Small heading', syntax: '### Details', hint: 'Start a new line with ### and a space for a small heading.' },
  { id: 'subtext', name: 'Small text / footer', syntax: '-# Updated today', hint: 'Start a new line with -# and a space for a quiet note. Put it last inside a container to make a footer.' },
  { id: 'quote', name: 'Quote', syntax: '> A message worth sharing', hint: 'Start a new line with > and a space to quote someone.' },
  { id: 'list', name: 'List', syntax: '- First item\n- Next item', hint: 'Start each new line with - and a space. Use 1. and a space for a numbered list.' },
  { id: 'link', name: 'Link', syntax: '[Visit Meowhook](https://meowhook.com)', hint: 'Put the words in square brackets, then the full website address in parentheses.' },
  { id: 'spoiler', name: 'Spoiler', syntax: '||a surprise||', hint: 'Put two vertical bars on each side. People click or tap the text to reveal it.' },
  { id: 'code', name: 'Inline code', syntax: '`/help`', hint: 'Put one backtick on each side to show a command or code exactly as written.' },
  { id: 'fenced', name: 'Code block', syntax: '```\nYour code here\n```', hint: 'Put three backticks on their own lines above and below your code.' },
  { id: 'ansi', name: 'Text colors', syntax: '```ansi\n\u001b[1;38;2;255;215;0mGold \u001b[38;2;255;255;255mto white\u001b[0m\n```', hint: 'Choose Colors below a text field, or paste ANSI text to open the color editor automatically. Select a few words to style them, or change the whole block. Valid edits save automatically.' },
  { id: 'task', name: 'Task list', syntax: '- [ ] A task to do', hint: 'Adds a list item with an empty checkbox marker. It stays text; people cannot tick it in Discord.' },
  { id: 'indent', name: 'Indent', syntax: '  - Nested item', hint: 'Indent a list item with two spaces. The Tab tool inserts a tab at your cursor.' },
];

export function formattingHintForTool(id: string): FormattingHint | undefined {
  return FORMATTING_HINTS.find(hint => hint.id === id);
}
