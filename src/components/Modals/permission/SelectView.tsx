import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { OmpUiRequest } from '../../../types';
import { handleSelectKeyNav } from '../../../utils/permissionNav';

export interface SelectViewProps {
  request: OmpUiRequest;
  onSelect: (value: string) => void;
  onCancel: () => void;
}

export const SelectView: React.FC<SelectViewProps> = ({
  request,
  onSelect,
  onCancel,
}) => {
  const options = request.options || [];
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Reset selected index when request id changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [request.id]);

  // Keyboard navigation: ↑/↓ + Enter + 1-9
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua nếu đang tương tác với input khác
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const res = handleSelectKeyNav(e.key, selectedIndex, options.length);
      if (res.handled) {
        e.preventDefault();
        setSelectedIndex(res.nextIndex);
        if (typeof res.submitIndex === 'number' && options[res.submitIndex]) {
          onSelect(options[res.submitIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, options, onSelect]);

  return (
    <div className="space-y-4">
      <div className="space-y-2 max-h-72 overflow-y-auto py-1">
        {options.map((option, idx) => {
          const detail = request.optionDetails?.[idx];
          const isSelected = idx === selectedIndex;
          const keyNumber = idx < 9 ? idx + 1 : null;

          return (
            <button
              key={`${option}-${idx}`}
              type="button"
              onClick={() => onSelect(option)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                isSelected
                  ? 'bg-indigo-500/10 dark:bg-indigo-600/20 border-indigo-500/50 dark:border-indigo-400/50 shadow-xs'
                  : 'bg-surface hover:bg-surface-highlight border-border'
              }`}
            >
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold truncate ${
                      isSelected
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-800 dark:text-zinc-200'
                    }`}
                  >
                    {option}
                  </span>
                </div>
                {detail?.description && (
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                    {detail.description}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {keyNumber && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-slate-400">
                    {keyNumber}
                  </span>
                )}
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="text-[10.5px] text-slate-400 dark:text-zinc-500">
          Phím tắt: <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-surface border border-border">↑↓</kbd> di chuyển · <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-surface border border-border">↵</kbd> chọn · <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-surface border border-border">1-9</kbd> chọn nhanh
        </span>

        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-border transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Hủy (ESC)</span>
        </button>
      </div>
    </div>
  );
};
