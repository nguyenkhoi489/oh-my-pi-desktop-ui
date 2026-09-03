import React, { useState, useEffect, useRef, useMemo, KeyboardEvent } from 'react';
import { Sparkles, Terminal, X, Hash, ChevronRight } from 'lucide-react';
import { OmpCommandInfo } from '../../types';
import { useCommandCatalog } from '../../hooks/useCommandCatalog';
import { CommandMenuItem } from '../../utils/commandMenu';
import { useI18n } from '../../i18n/I18nProvider';

export interface OmnibarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  availableCommands?: OmpCommandInfo[];
}

export const OmnibarModal: React.FC<OmnibarModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  availableCommands,
}) => {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  const { items: filteredItems, groups } = useCommandCatalog({
    availableCommands,
    query: prompt,
  });

  // Map index for items for O(1) lookup
  const itemIndexMap = useMemo(() => {
    const map = new Map<CommandMenuItem, number>();
    filteredItems.forEach((item, idx) => map.set(item, idx));
    return map;
  }, [filteredItems]);

  // Reset index when query or isOpen changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [prompt, isOpen]);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setPrompt('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll active item into view
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  // ESC key dismissal
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelectAndSubmit = (item: CommandMenuItem) => {
    onSubmit(item.insertText);
    setPrompt('');
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredItems.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      // If list has items and prompt starts with '/' or query matches
      if (filteredItems.length > 0 && selectedIndex >= 0 && filteredItems[selectedIndex]) {
        // If user types '/' or query is filtering commands, select highlighted command
        if (prompt.startsWith('/') || filteredItems.length < 50) {
          handleSelectAndSubmit(filteredItems[selectedIndex]);
          return;
        }
      }

      // Otherwise submit raw user prompt text directly
      if (prompt.trim()) {
        onSubmit(prompt);
        setPrompt('');
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[50] flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-xl bg-panel border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border bg-surface shrink-0">
          <Sparkles className="w-5 h-5 text-blue-500 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('omnibar.placeholder')}
            className="flex-1 bg-transparent text-sm outline-none text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 font-sans"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-highlight text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer ml-2"
            title={t('omnibar.closeTitle')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Real Command & Skills Suggestion List */}
        <div className="p-2 space-y-2 overflow-y-auto flex-1">
          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              {t('omnibar.noMatch')}
            </div>
          ) : (
            groups.map((grp) => (
              <div key={grp.name} className="space-y-0.5">
                <div className="px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                  {grp.name === 'Skills' ? (
                    <Sparkles className="w-3 h-3 text-purple-500" />
                  ) : (
                    <Hash className="w-3 h-3 text-blue-500" />
                  )}
                  <span>{grp.name}</span>
                  <span className="text-[9.5px] font-normal lowercase opacity-70">
                    ({grp.items.length})
                  </span>
                </div>

                <div className="space-y-0.5">
                  {grp.items.map((item) => {
                    const globalIdx = itemIndexMap.get(item) ?? -1;
                    const isSelected = globalIdx === selectedIndex;

                    return (
                      <button
                        key={item.key}
                        ref={isSelected ? activeItemRef : undefined}
                        type="button"
                        onClick={() => handleSelectAndSubmit(item)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-500/15 dark:bg-blue-600/25 border border-blue-500/30 text-blue-600 dark:text-blue-300 shadow-xs'
                            : 'hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {item.isSubcommand ? (
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
                          ) : item.group === 'Skills' ? (
                            <div className="w-5 h-5 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 text-purple-500">
                              <Sparkles className="w-3 h-3" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 text-blue-500">
                              <Terminal className="w-3 h-3" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-semibold truncate">
                                /{item.displayName}
                              </span>
                              {item.inputHint && (
                                <span className="font-mono text-[10.5px] text-slate-400 dark:text-zinc-500 truncate">
                                  {item.inputHint}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="shrink-0 text-[10px] text-slate-400 font-mono ml-2">
                          ↵
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-surface border-t border-border flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-background border border-border rounded">↑↓</kbd>
            <span className="text-[11px]">{t('omnibar.selectNav')}</span>
            <span className="mx-1 text-slate-300 dark:text-zinc-600">·</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-background border border-border rounded">↵</kbd>
            <span className="text-[11px]">{t('omnibar.executeNav')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-background border border-border rounded">ESC</kbd>
            <span className="text-[11px]">{t('omnibar.closeNav')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
