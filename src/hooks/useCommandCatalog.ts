import { useMemo } from 'react';
import type { OmpCommandInfo } from '../types';
import type { CommandMenuItem } from '../utils/commandMenu';
import {
  getDemoCommands,
  filterAndGroupCommands,
} from '../utils/commandMenu';
import { useI18n } from '../i18n/I18nProvider';
export interface UseCommandCatalogOptions {
  availableCommands?: OmpCommandInfo[];
  query?: string;
}

export interface UseCommandCatalogResult {
  rawCommands: OmpCommandInfo[];
  items: CommandMenuItem[];
  groups: { name: string; items: CommandMenuItem[] }[];
}

// Shared hook to manage and filter commands/skills catalog between CommandMenu and Omnibar
export function useCommandCatalog({
  availableCommands,
  query = '',
}: UseCommandCatalogOptions = {}): UseCommandCatalogResult {
  const { locale } = useI18n();
  const rawCommands = useMemo(() => {
    return availableCommands && availableCommands.length > 0
      ? availableCommands
      : getDemoCommands();
  }, [availableCommands, locale]);

  const { items, groups } = useMemo(() => {
    return filterAndGroupCommands(rawCommands, query);
  }, [rawCommands, query]);

  return {
    rawCommands,
    items,
    groups,
  };
}
