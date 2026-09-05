import React from 'react';
import { MarkdownRenderer as CommonMarkdownRenderer } from '../Common/MarkdownRenderer';
import type { ThemeMode } from '../../types';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  theme?: ThemeMode;
  onOpenUrl?: (url: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
  theme,
  onOpenUrl,
}) => {
  return (
    <div className={`p-6 select-text overflow-y-auto max-w-4xl mx-auto ${className}`}>
      <CommonMarkdownRenderer content={content} theme={theme} onOpenUrl={onOpenUrl} />
    </div>
  );
};
