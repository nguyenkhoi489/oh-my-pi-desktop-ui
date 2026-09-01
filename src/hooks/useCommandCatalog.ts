import { useMemo } from 'react';
import type { OmpCommandInfo } from '../types';
import type { CommandMenuItem } from '../utils/commandMenu';
import {
  DEMO_COMMANDS,
  filterAndGroupCommands,
} from '../utils/commandMenu';
export interface UseCommandCatalogOptions {
  availableCommands?: OmpCommandInfo[];
  query?: string;
}

export interface UseCommandCatalogResult {
  rawCommands: OmpCommandInfo[];
  items: CommandMenuItem[];
  groups: { name: string; items: CommandMenuItem[] }[];
}

// Hook dùng chung quản lý và lọc danh mục lệnh/skills giữa CommandMenu và Omnibar
export function useCommandCatalog({
  availableCommands,
  query = '',
}: UseCommandCatalogOptions = {}): UseCommandCatalogResult {
  const rawCommands = useMemo(() => {
    return availableCommands && availableCommands.length > 0
      ? availableCommands
      : DEMO_COMMANDS;
  }, [availableCommands]);

  const { items, groups } = useMemo(() => {
    return filterAndGroupCommands(rawCommands, query);
  }, [rawCommands, query]);

  return {
    rawCommands,
    items,
    groups,
  };
}
