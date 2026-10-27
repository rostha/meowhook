import type { Message, Tab } from './types';
import { isComponentsV2 } from './messageComponents';
import { calculateTotalEmbedLength } from './utils';
import { reconcileSentMessage } from './sentMessage';

/** Dormant regular embeds never consume the active Components V2 text budget. */
export function activeEmbedTextLength(message: Message): number {
  return isComponentsV2(message) ? 0 : calculateTotalEmbedLength(message);
}

/** A send may finish after the user switches drafts. Match stable ids, never current indices. */
export function reconcileSequenceReceipt(tabs: Tab[], draftId: string, sent: Message, receipt: Record<string, unknown>): Tab[] {
  const index = tabs.findIndex(tab => tab.id === draftId);
  if (index < 0) return tabs;
  const tab = tabs[index];
  const messageIndex = tab.messages.findIndex(message => message.id === sent.id);
  if (messageIndex < 0) return tabs;
  const current = tab.messages[messageIndex];
  const reconciled = reconcileSentMessage(current, sent, receipt);
  if (reconciled === current) return tabs;
  const messages = [...tab.messages]; messages[messageIndex] = reconciled;
  const result = [...tabs]; result[index] = { ...tab, messages };
  return result;
}
