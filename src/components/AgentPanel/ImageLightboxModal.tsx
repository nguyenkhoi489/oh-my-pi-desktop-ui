import React, { useEffect } from 'react';
import { X, ZoomIn } from 'lucide-react';
import { AttachmentImage } from '../Common/AttachmentImage';
import { useI18n } from '../../i18n/I18nProvider';

interface ImageLightboxModalProps {
  isOpen: boolean;
  imageUrl: string;
  imageName?: string;
  onClose: () => void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  imageUrl,
  imageName,
  onClose,
}) => {
  const { t } = useI18n();
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[88vh] flex flex-col items-center bg-surface dark:bg-[#161822] border border-border rounded-2xl shadow-2xl overflow-hidden p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="w-full flex items-center justify-between px-3 py-2 border-b border-border/50 text-xs">
          <div className="flex items-center gap-2 truncate text-slate-700 dark:text-zinc-200 font-medium">
            <ZoomIn className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="truncate">{imageName || t('lightbox.title')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-100 hover:bg-surface-highlight transition-colors cursor-pointer"
            title={t('lightbox.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Image Body */}
        <div className="p-2 flex items-center justify-center overflow-auto max-h-[calc(88vh-50px)]">
          <AttachmentImage
            src={imageUrl}
            alt={imageName || 'Attachment preview'}
            className="max-w-full max-h-[78vh] object-contain rounded-lg select-none min-w-24 min-h-24"
          />
        </div>
      </div>
    </div>
  );
};
