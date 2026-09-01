import React, { useState } from 'react';
import {
  Copy,
  Check,
  Info,
  Lightbulb,
  AlertTriangle,
  Flame,
  ExternalLink,
} from 'lucide-react';
import { ThemeMode } from '../../types';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  theme?: ThemeMode;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
}) => {
  // Render inline formatting: code, bold, italic, strikethrough, links, images
  const renderInline = (text: string): React.ReactNode => {
    if (!text) return null;

    const tokens: React.ReactNode[] = [];
    let remaining = text;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Inline code: `...`
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        tokens.push(
          <code
            key={keyIdx++}
            className="px-1.5 py-0.5 rounded text-[12px] font-mono bg-surface-highlight text-codex-accent border border-border/80 font-medium"
          >
            {codeMatch[1]}
          </code>
        );
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Bold: **...** or __...__
      const boldMatch = remaining.match(/^(\*\*|__)(.*?)\1/);
      if (boldMatch) {
        tokens.push(
          <strong key={keyIdx++} className="font-semibold text-slate-900 dark:text-zinc-100">
            {renderInline(boldMatch[2])}
          </strong>
        );
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Strikethrough: ~~...~~
      const strikeMatch = remaining.match(/^~~(.*?)~~/);
      if (strikeMatch) {
        tokens.push(
          <del key={keyIdx++} className="line-through text-slate-400 dark:text-zinc-500">
            {renderInline(strikeMatch[1])}
          </del>
        );
        remaining = remaining.slice(strikeMatch[0].length);
        continue;
      }

      // Italic: *...* or _..._
      const italicMatch = remaining.match(/^(\*|_)(.*?)\1/);
      if (italicMatch && !italicMatch[2].startsWith(' ')) {
        tokens.push(
          <em key={keyIdx++} className="italic text-slate-800 dark:text-zinc-200">
            {renderInline(italicMatch[2])}
          </em>
        );
        remaining = remaining.slice(italicMatch[0].length);
        continue;
      }

      // Image: ![alt](url)
      const imgMatch = remaining.match(/^!\[(.*?)\]\((.*?)\)/);
      if (imgMatch) {
        tokens.push(
          <img
            key={keyIdx++}
            src={imgMatch[2]}
            alt={imgMatch[1]}
            className="max-w-full rounded-lg my-2 border border-border shadow-xs inline-block"
          />
        );
        remaining = remaining.slice(imgMatch[0].length);
        continue;
      }

      // Link: [text](url)
      const linkMatch = remaining.match(/^\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        tokens.push(
          <a
            key={keyIdx++}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-codex-accent hover:underline font-medium"
          >
            <span>{renderInline(linkMatch[1])}</span>
            <ExternalLink className="w-3 h-3 opacity-60 inline" />
          </a>
        );
        remaining = remaining.slice(linkMatch[0].length);
        continue;
      }

      // Plain text up to next special character
      const nextSpecial = remaining.search(/[`*_~\[!]/);
      if (nextSpecial === -1) {
        tokens.push(remaining);
        break;
      } else if (nextSpecial === 0) {
        tokens.push(remaining[0]);
        remaining = remaining.slice(1);
      } else {
        tokens.push(remaining.slice(0, nextSpecial));
        remaining = remaining.slice(nextSpecial);
      }
    }

    return <>{tokens}</>;
  };

  // Block elements renderer
  const renderBlocks = (): React.ReactNode[] => {
    const lines = content.split('\n');
    const nodes: React.ReactNode[] = [];
    let i = 0;
    let nodeKey = 0;

    while (i < lines.length) {
      const line = lines[i];

      // 1. Fenced Code Blocks
      if (line.trim().startsWith('```')) {
        const langMatch = line.trim().match(/^```([a-zA-Z0-9_-]*)/);
        const language = langMatch ? langMatch[1] : '';
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```

        const fullCode = codeLines.join('\n');
        nodes.push(
          <CodeBlockNode
            key={nodeKey++}
            code={fullCode}
            language={language}
          />
        );
        continue;
      }

      // 2. Horizontal Rule (---, ***, ___)
      if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
        nodes.push(
          <hr key={nodeKey++} className="my-6 border-t border-border" />
        );
        i++;
        continue;
      }

      // 3. Headings (# H1 to ###### H6)
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        const headingClasses = [
          'text-2xl font-bold text-slate-900 dark:text-zinc-50 mt-6 mb-3 pb-2 border-b border-border',
          'text-xl font-bold text-slate-900 dark:text-zinc-100 mt-5 mb-2.5 pb-1 border-b border-border/60',
          'text-lg font-semibold text-slate-900 dark:text-zinc-100 mt-4 mb-2',
          'text-base font-semibold text-slate-800 dark:text-zinc-200 mt-3.5 mb-1.5',
          'text-sm font-semibold text-slate-800 dark:text-zinc-200 mt-3 mb-1',
          'text-xs font-semibold text-slate-700 dark:text-zinc-300 mt-2 mb-1 uppercase tracking-wider',
        ][level - 1];

        const key = nodeKey++;
        if (level === 1) {
          nodes.push(<h1 key={key} className={headingClasses}>{renderInline(text)}</h1>);
        } else if (level === 2) {
          nodes.push(<h2 key={key} className={headingClasses}>{renderInline(text)}</h2>);
        } else if (level === 3) {
          nodes.push(<h3 key={key} className={headingClasses}>{renderInline(text)}</h3>);
        } else if (level === 4) {
          nodes.push(<h4 key={key} className={headingClasses}>{renderInline(text)}</h4>);
        } else if (level === 5) {
          nodes.push(<h5 key={key} className={headingClasses}>{renderInline(text)}</h5>);
        } else {
          nodes.push(<h6 key={key} className={headingClasses}>{renderInline(text)}</h6>);
        }
        i++;
        continue;
      }

      // 4. Blockquotes & GitHub-style Alerts
      if (line.trim().startsWith('>')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }

        const firstLine = quoteLines[0] || '';
        const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);

        if (alertMatch) {
          const alertType = alertMatch[1].toUpperCase();
          const alertBody = [firstLine.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, '').trim(), ...quoteLines.slice(1)].filter(Boolean).join('\n');

          let alertStyles = {
            border: 'border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-200',
            icon: <Info className="w-4 h-4 text-blue-500 shrink-0" />,
            title: 'Note',
          };

          if (alertType === 'TIP') {
            alertStyles = {
              border: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
              icon: <Lightbulb className="w-4 h-4 text-emerald-500 shrink-0" />,
              title: 'Tip',
            };
          } else if (alertType === 'IMPORTANT') {
            alertStyles = {
              border: 'border-purple-500/40 bg-purple-500/10 text-purple-900 dark:text-purple-200',
              icon: <Flame className="w-4 h-4 text-purple-500 shrink-0" />,
              title: 'Important',
            };
          } else if (alertType === 'WARNING') {
            alertStyles = {
              border: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
              icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
              title: 'Warning',
            };
          } else if (alertType === 'CAUTION') {
            alertStyles = {
              border: 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200',
              icon: <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />,
              title: 'Caution',
            };
          }

          nodes.push(
            <div
              key={nodeKey++}
              className={`p-3.5 my-3 rounded-xl border-l-4 text-[13px] leading-relaxed shadow-xs ${alertStyles.border}`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs mb-1 uppercase tracking-wider">
                {alertStyles.icon}
                <span>{alertStyles.title}</span>
              </div>
              <div className="whitespace-pre-line pl-5">
                {renderInline(alertBody)}
              </div>
            </div>
          );
        } else {
          // Standard blockquote
          nodes.push(
            <blockquote
              key={nodeKey++}
              className="border-l-4 border-slate-300 dark:border-zinc-700 pl-4 py-1.5 my-3 text-slate-600 dark:text-zinc-400 italic text-[13px] leading-relaxed"
            >
              {quoteLines.map((ql, qidx) => (
                <div key={qidx}>{renderInline(ql)}</div>
              ))}
            </blockquote>
          );
        }
        continue;
      }

      // 5. Tables (| col1 | col2 |)
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }

        if (tableLines.length >= 2) {
          const headerCells = tableLines[0]
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());
          const bodyLines = tableLines.slice(2);

          nodes.push(
            <div key={nodeKey++} className="overflow-x-auto my-4 rounded-xl border border-border shadow-xs">
              <table className="min-w-full text-left text-[12.5px]">
                <thead className="bg-surface border-b border-border">
                  <tr>
                    {headerCells.map((h, hidx) => (
                      <th
                        key={hidx}
                        className="px-3.5 py-2 font-semibold text-slate-800 dark:text-zinc-200"
                      >
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-panel">
                  {bodyLines.map((bRow, rIdx) => {
                    const rowCells = bRow
                      .split('|')
                      .slice(1, -1)
                      .map((c) => c.trim());
                    return (
                      <tr
                        key={rIdx}
                        className="hover:bg-surface-highlight/50 transition-colors"
                      >
                        {rowCells.map((cVal, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3.5 py-2 text-slate-700 dark:text-zinc-300"
                          >
                            {renderInline(cVal)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // 6. GFM Task List items (- [ ] / - [x])
      const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        const isChecked = taskMatch[2].toLowerCase() === 'x';
        const taskText = taskMatch[3];
        nodes.push(
          <div
            key={nodeKey++}
            className="flex items-start gap-2.5 py-1 text-[13px] leading-snug"
          >
            <input
              type="checkbox"
              checked={isChecked}
              readOnly
              className="mt-1 rounded accent-codex-accent cursor-default pointer-events-none"
            />
            <span
              className={
                isChecked
                  ? 'line-through text-slate-400 dark:text-zinc-500'
                  : 'text-slate-800 dark:text-zinc-200'
              }
            >
              {renderInline(taskText)}
            </span>
          </div>
        );
        i++;
        continue;
      }

      // 7. Unordered / Ordered Lists
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (listMatch) {
        const indent = listMatch[1].length;
        const isOrdered = /^\d+\./.test(listMatch[2]);
        const listItems: { text: string; ordered: boolean; num?: string }[] = [];

        while (i < lines.length) {
          const lMatch = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
          if (!lMatch) break;
          listItems.push({
            text: lMatch[3],
            ordered: /^\d+\./.test(lMatch[2]),
            num: lMatch[2],
          });
          i++;
        }

        nodes.push(
          <ul
            key={nodeKey++}
            className={`my-2 space-y-1 text-[13px] leading-relaxed text-slate-800 dark:text-zinc-200 ${
              isOrdered ? 'list-decimal pl-6' : 'list-disc pl-5'
            }`}
            style={{ paddingLeft: `${Math.max(16, indent * 10 + 16)}px` }}
          >
            {listItems.map((item, idx) => (
              <li key={idx} className="pl-1">
                {renderInline(item.text)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // 8. Empty lines
      if (!line.trim()) {
        i++;
        continue;
      }

      // 9. Paragraph text
      const paragraphLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].trim().startsWith('#') &&
        !lines[i].trim().startsWith('>') &&
        !lines[i].trim().startsWith('|') &&
        !/^(\s*[-*_]\s*){3,}$/.test(lines[i]) &&
        !lines[i].match(/^(\s*)([-*+]|\d+\.)\s+/)
      ) {
        paragraphLines.push(lines[i]);
        i++;
      }

      if (paragraphLines.length > 0) {
        nodes.push(
          <p
            key={nodeKey++}
            className="my-2.5 text-[13.5px] leading-relaxed text-slate-800 dark:text-zinc-200"
          >
            {renderInline(paragraphLines.join(' '))}
          </p>
        );
      }
    }

    return nodes;
  };

  return (
    <div
      className={`markdown-body p-6 select-text overflow-y-auto leading-relaxed max-w-4xl mx-auto font-sans ${className}`}
    >
      {renderBlocks()}
    </div>
  );
};

// Code block with copy to clipboard functionality
interface CodeBlockNodeProps {
  code: string;
  language?: string;
}

const CodeBlockNode: React.FC<CodeBlockNodeProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-xl border border-border overflow-hidden bg-[#0e1117] text-zinc-100 shadow-sm">
      <div className="h-8 bg-[#161b22] px-3 border-b border-border/50 flex items-center justify-between text-[11px] font-mono text-zinc-400">
        <span className="font-semibold uppercase tracking-wider text-zinc-300">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-zinc-100 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-white/5"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[12.5px] font-mono leading-relaxed bg-[#0e1117] text-zinc-200 select-text m-0 border-0 rounded-none">
        <code>{code}</code>
      </pre>
    </div>
  );
};
