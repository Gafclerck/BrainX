import React from 'react';
import { cn } from '@/lib/utils';
import type { HighlightTextProps } from './types';

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function HighlightText({
  text,
  query,
  className,
  highlightClassName,
}: HighlightTextProps) {
  if (typeof text !== 'string' || text.length === 0) {
    return null;
  }

  const trimmedQuery = query?.trim();
  if (!trimmedQuery) {
    return <span className={className}>{text}</span>;
  }

  const terms = Array.from(
    new Set(
      trimmedQuery
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  );

  if (terms.length === 0) {
    return <span className={className}>{text}</span>;
  }

  try {
    // Sort longer terms first to match greedy substrings before smaller ones
    const pattern = terms
      .map(escapeRegExp)
      .sort((a, b) => b.length - a.length)
      .join('|');

    // Use capturing group so split() preserves matched segments
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);
    const termSetLower = new Set(terms.map((t) => t.toLowerCase()));

    return (
      <span className={className}>
        {parts.map((part, index) => {
          if (!part) return null;
          const isMatch = termSetLower.has(part.toLowerCase());
          if (isMatch) {
            return (
              <mark
                key={index}
                data-testid="search-highlight"
                className={cn(
                  'bg-highlight/15 text-highlight font-semibold rounded-sm px-0.5',
                  highlightClassName
                )}
              >
                {part}
              </mark>
            );
          }
          return <React.Fragment key={index}>{part}</React.Fragment>;
        })}
      </span>
    );
  } catch {
    // Graceful plaintext fallback if RegExp creation ever throws
    return <span className={className}>{text}</span>;
  }
}

export default HighlightText;
