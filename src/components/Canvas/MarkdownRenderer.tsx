import React from 'react';
import { MarkdownRenderer as CommonMarkdownRenderer } from '../Common/MarkdownRenderer';
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
  return (
    <div className={`p-6 select-text overflow-y-auto max-w-4xl mx-auto ${className}`}>
      <CommonMarkdownRenderer content={content} />
    </div>
  );
};
