import type { OmpCommandInfo } from '../types/index.ts';

export const DEMO_COMMANDS: OmpCommandInfo[] = [
  { name: 'model', description: 'Chọn hoặc hiển thị model đang hoạt động', inputHint: '<provider/model>' },
  { name: 'thinking', description: 'Cài đặt mức độ suy nghĩ (off/low/medium/high/max)', inputHint: '<level>' },
  { name: 'compact', description: 'Nén ngữ cảnh phiên hội thoại hiện tại', inputHint: '[instructions]' },
  { name: 'handoff', description: 'Tạo tài liệu bàn giao ngữ cảnh phiên làm việc hiện tại', inputHint: '[instructions]' },
  { name: 'share', description: 'Chia sẻ phiên làm việc hiện tại qua liên kết mã hoá', inputHint: '[--gist]' },
  { name: 'join', description: 'Tham gia phiên làm việc cộng tác (collab) qua liên kết', inputHint: '<link>' },
  { name: 'help', description: 'Hiển thị trợ giúp danh sách lệnh' },
  {
    name: 'security',
    description: 'Kiểm tra bảo mật và rà soát lỗ hổng',
    subcommands: [
      { name: 'scan', description: 'Quét lỗ hổng nhanh trong codebase' },
      { name: 'audit', description: 'Kiểm tra bảo mật toàn diện STRIDE + OWASP' },
    ],
  },
  { name: 'skill:ak-brainstorm', description: 'Brainstorm ý tưởng & kiến trúc trước khi code' },
  { name: 'skill:ak-cook', description: 'Thực thi tính năng theo workflow có cấu trúc' },
  { name: 'skill:ak-debug', description: 'Debug và phân tích nguyên nhân gốc rễ trước khi sửa' },
  { name: 'skill:ak-code-review', description: 'Review chất lượng code và tìm lỗi tiềm ẩn' },
  { name: 'skill:ak-git', description: 'Thao tác git commit chuẩn conventional' },
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
