import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useImageDataUrl } from '../../hooks/useImageDataUrl';

interface AttachmentImageProps {
  src: string;
  alt: string;
  className?: string;
}

// Attachment image: resolves file path on disk to data URL for rendering
export const AttachmentImage: React.FC<AttachmentImageProps> = ({ src, alt, className }) => {
  const resolvedUrl = useImageDataUrl(src);

  if (!resolvedUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-highlight text-slate-400 dark:text-zinc-500 ${className || ''}`}
        title={alt}
      >
        <ImageIcon className="w-4 h-4 opacity-60" />
      </div>
    );
  }

  return <img src={resolvedUrl} alt={alt} className={className} />;
};
