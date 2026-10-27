'use client';

import { useState, type ReactNode } from 'react';

/** Mount on first expansion, then retain field state through later collapses. */
export default function LazySectionContent({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(expanded);
  if (expanded && !visited) setVisited(true);
  return expanded || visited ? children : null;
}
