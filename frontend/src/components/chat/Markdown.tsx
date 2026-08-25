'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  children: string;
}

/**
 * Renders answer prose as real markdown.
 *
 * The model is instructed to write GitHub-flavoured markdown — headings, bold
 * terms, lists, and comparison tables. Rendering that as plain text (which is
 * what happens without this component) is what makes a well-structured answer
 * look like a wall of `###` and `**`.
 */
export default function Markdown({ children }: MarkdownProps) {
  return (
    <div className="markdown-body" style={{ color: 'var(--text-primary)' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Tables can exceed the bubble width; scroll them, never the page.
          table: ({ children }) => (
            <div className="md-table-scroll">
              <table>{children}</table>
            </div>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
