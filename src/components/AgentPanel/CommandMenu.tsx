import React, { useMemo, useEffect, useRef } from 'react';
import { Terminal, Sparkles, ChevronRight, Hash, X } from 'lucide-react';
import {
  DEMO_COMMANDS,
  CommandMenuItem,
  filterAndGroupCommands,
} from '../../utils/commandMenu';

export { DEMO_COMMANDS, filterAndGroupCommands };
export type { CommandMenuItem };

export interface CommandMenuProps {
  isOpen: boolean;
  query: string;
  items: CommandMenuItem[];
  groups: { name: string; items: CommandMenuItem[] }[];
  selectedIndex: number;
  onSelectCommand: (insertText: string) => void;
  onClose: () => void;
}

const CommandMenuComponent: React.FC<CommandMenuProps> = ({
  isOpen,
  query,
  items: filteredItems,
  groups,
  selectedIndex,
  onSelectCommand,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // Tra chỉ số toàn cục O(1) thay vì indexOf trong vòng render
  const itemIndexMap = useMemo(() => {
    const map = new Map<CommandMenuItem, number>();
    filteredItems.forEach((item, idx) => map.set(item, idx));
    return map;
  }, [filteredItems]);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: 'nearest',
      });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 left-3 right-3 sm:left-3 sm:right-auto sm:w-[420px] sm:max-w-[calc(100%-24px)] max-h-80 bg-surface dark:bg-[#181a24] border border-border rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in text-slate-800 dark:text-zinc-100"
    >
      {/* Header Info */}
      <div className="px-3 py-2 border-b border-border/60 bg-surface-highlight/30 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5 font-medium">
          <Terminal className="w-3.5 h-3.5 text-blue-500" />
          <span>Slash Commands & Skills</span>
        </div>
        <div className="flex items-center gap-2">
          <span>{filteredItems.length} có sẵn</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border hover:bg-surface-highlight text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors flex items-center gap-1 cursor-pointer"
            title="Đóng menu (ESC)"
          >
            <span>ESC</span>
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Grouped Commands List */}
      <div className="overflow-y-auto flex-1 p-1.5 max-h-64 space-y-2">
        {filteredItems.length === 0 ? (
          <div className="p-5 text-center text-xs text-slate-400">
            Không tìm thấy lệnh hoặc skill nào với &quot;{query}&quot;
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
                      onClick={() => onSelectCommand(item.insertText)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-500/15 dark:bg-blue-600/25 border border-blue-500/30 text-blue-600 dark:text-blue-300'
                          : 'hover:bg-surface-highlight text-slate-700 dark:text-zinc-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {item.isSubcommand ? (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1.5" />
                        ) : item.group === 'Skills' ? (
                          <div className="w-4 h-4 rounded bg-purple-500/10 flex items-center justify-center shrink-0">
                            <Sparkles className="w-2.5 h-2.5 text-purple-500" />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded bg-blue-500/10 flex items-center justify-center shrink-0">
                            <Terminal className="w-2.5 h-2.5 text-blue-500" />
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

                      <div className="shrink-0 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 font-mono ml-2">
                        ↵
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Navigation Guide */}
      <div className="px-3 py-1.5 border-t border-border/60 bg-surface text-[10.5px] text-slate-400 dark:text-zinc-500 flex items-center justify-between">
        <span className="truncate">Gõ để lọc lệnh hoặc skill</span>
        <div className="flex items-center gap-2 shrink-0">
          <span>↑↓ chọn</span>
          <span>↵ chèn</span>
        </div>
      </div>
    </div>
  );
};

export const CommandMenu = React.memo(CommandMenuComponent);
