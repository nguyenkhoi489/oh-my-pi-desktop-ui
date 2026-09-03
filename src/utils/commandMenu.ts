import type { OmpCommandInfo } from '../types/index.ts';
import { tm } from '../../shared/i18n/index.ts';

// Built per call so command descriptions follow the current locale
export const getDemoCommands = (): OmpCommandInfo[] => [
  { name: 'model', description: tm('command.model.desc'), inputHint: '<provider/model>' },
  { name: 'thinking', description: tm('command.thinking.desc'), inputHint: '<level>' },
  { name: 'compact', description: tm('command.compact.desc'), inputHint: '[instructions]' },
  { name: 'handoff', description: tm('command.handoff.desc'), inputHint: '[instructions]' },
  { name: 'share', description: tm('command.share.desc'), inputHint: '[--gist]' },
  { name: 'join', description: tm('command.join.desc'), inputHint: '<link>' },
  { name: 'help', description: tm('command.help.desc') },
  {
    name: 'security',
    description: tm('command.security.desc'),
    subcommands: [
      { name: 'scan', description: tm('command.security.scan.desc') },
      { name: 'audit', description: tm('command.security.audit.desc') },
    ],
  },
  { name: 'skill:ak-brainstorm', description: tm('command.skill.brainstorm.desc') },
  { name: 'skill:ak-cook', description: tm('command.skill.cook.desc') },
  { name: 'skill:ak-debug', description: tm('command.skill.debug.desc') },
  { name: 'skill:ak-code-review', description: tm('command.skill.codeReview.desc') },
  { name: 'skill:ak-git', description: tm('command.skill.git.desc') },
];

export interface CommandMenuItem {
  key: string;
  commandName: string;
  displayName: string;
  description: string;
  inputHint?: string;
  group: 'Commands' | 'Skills';
  isSubcommand?: boolean;
  parentCommand?: string;
  insertText: string;
}

export function filterAndGroupCommands(
  rawCommands: OmpCommandInfo[],
  query: string
): { items: CommandMenuItem[]; groups: { name: string; items: CommandMenuItem[] }[] } {
  const q = query.trim().toLowerCase().replace(/^\//, '');

  const flattened: CommandMenuItem[] = [];

  for (const cmd of rawCommands) {
    const isSkill = cmd.name.startsWith('skill:');
    const displayName = isSkill ? cmd.name.replace(/^skill:/, '') : cmd.name;
    const group: 'Commands' | 'Skills' = isSkill ? 'Skills' : 'Commands';

    // Top-level command item
    const mainItem: CommandMenuItem = {
      key: `cmd-${cmd.name}`,
      commandName: cmd.name,
      displayName,
      description: cmd.description || '',
      inputHint: cmd.inputHint,
      group,
      insertText: `/${cmd.name} `,
    };

    // Check if main item matches query
    const mainMatches =
      !q ||
      cmd.name.toLowerCase().includes(q) ||
      displayName.toLowerCase().includes(q) ||
      (Boolean(cmd.description) && String(cmd.description).toLowerCase().includes(q)) ||
      (Boolean(cmd.inputHint) && String(cmd.inputHint).toLowerCase().includes(q));

    if (mainMatches) {
      flattened.push(mainItem);
    }

    // Subcommands (level 2)
    if (Array.isArray(cmd.subcommands) && cmd.subcommands.length > 0) {
      for (const sub of cmd.subcommands) {
        const subName = `${cmd.name} ${sub.name}`;
        const subMatches =
          !q ||
          subName.toLowerCase().includes(q) ||
          sub.name.toLowerCase().includes(q) ||
          (Boolean(sub.description) && String(sub.description).toLowerCase().includes(q)) ||
          cmd.name.toLowerCase().includes(q);

        if (subMatches) {
          flattened.push({
            key: `sub-${cmd.name}-${sub.name}`,
            commandName: subName,
            displayName: `${displayName} ${sub.name}`,
            description: sub.description || cmd.description || '',
            group,
            isSubcommand: true,
            parentCommand: cmd.name,
            insertText: `/${cmd.name} ${sub.name} `,
          });
        }
      }
    }
  }

  // Deduplicate and group
  const commandsGroup: CommandMenuItem[] = [];
  const skillsGroup: CommandMenuItem[] = [];

  for (const item of flattened) {
    if (item.group === 'Commands') {
      commandsGroup.push(item);
    } else {
      skillsGroup.push(item);
    }
  }

  const groups: { name: string; items: CommandMenuItem[] }[] = [];
  if (commandsGroup.length > 0) {
    groups.push({ name: 'Commands', items: commandsGroup });
  }
  if (skillsGroup.length > 0) {
    groups.push({ name: 'Skills', items: skillsGroup });
  }

  return { items: flattened, groups };
}
