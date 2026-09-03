import os from 'node:os';
import path from 'node:path';

export interface OmpLaunchOptions {
  addDirs?: string[];
  tools?: string[];
  noTools?: boolean;
  noLsp?: boolean;
  noPty?: boolean;
  skills?: string[];
  noSkills?: boolean;
  noRules?: boolean;
  noExtensions?: boolean;
  extensions?: string[];
  hooks?: string[];
  advisor?: boolean;
  prewalk?: boolean;
  prewalkInto?: string;
  planYolo?: boolean;
  planYoloInto?: string;
  maxTime?: string;
  serviceTier?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  configOverlays?: string[];
  models?: string[];
  hideThinking?: boolean;
  noTitle?: boolean;
}

// Expand ~ to user home directory
export function expandHomeDir(targetPath: string): string {
  const trimmed = targetPath.trim();
  if (!trimmed) return '';
  if (trimmed === '~') {
    return os.homedir();
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function cleanStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((item): item is string => typeof item === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanOptionalString(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Sanitize and normalize launch options from settings
export function sanitizeLaunchOptions(raw: unknown): OmpLaunchOptions {
  if (!raw || typeof raw !== 'object') {
    return {
      addDirs: [],
      configOverlays: [],
      extensions: [],
      hooks: [],
    };
  }

  const obj = raw as Record<string, unknown>;

  const result: OmpLaunchOptions = {
    addDirs: cleanStringArray(obj.addDirs),
    configOverlays: cleanStringArray(obj.configOverlays),
    extensions: cleanStringArray(obj.extensions),
    hooks: cleanStringArray(obj.hooks),
  };

  const tools = cleanStringArray(obj.tools);
  if (tools.length > 0) result.tools = tools;

  const skills = cleanStringArray(obj.skills);
  if (skills.length > 0) result.skills = skills;

  const models = cleanStringArray(obj.models);
  if (models.length > 0) result.models = models;

  if (typeof obj.noTools === 'boolean') result.noTools = obj.noTools;
  if (typeof obj.noLsp === 'boolean') result.noLsp = obj.noLsp;
  if (typeof obj.noPty === 'boolean') result.noPty = obj.noPty;
  if (typeof obj.noSkills === 'boolean') result.noSkills = obj.noSkills;
  if (typeof obj.noRules === 'boolean') result.noRules = obj.noRules;
  if (typeof obj.noExtensions === 'boolean') result.noExtensions = obj.noExtensions;
  if (typeof obj.advisor === 'boolean') result.advisor = obj.advisor;
  if (typeof obj.prewalk === 'boolean') result.prewalk = obj.prewalk;
  if (typeof obj.planYolo === 'boolean') result.planYolo = obj.planYolo;
  if (typeof obj.hideThinking === 'boolean') result.hideThinking = obj.hideThinking;
  if (typeof obj.noTitle === 'boolean') result.noTitle = obj.noTitle;

  const prewalkInto = cleanOptionalString(obj.prewalkInto);
  if (prewalkInto) result.prewalkInto = prewalkInto;

  const planYoloInto = cleanOptionalString(obj.planYoloInto);
  if (planYoloInto) result.planYoloInto = planYoloInto;

  const maxTime = cleanOptionalString(obj.maxTime);
  if (maxTime) result.maxTime = maxTime;

  const serviceTier = cleanOptionalString(obj.serviceTier);
  if (serviceTier) result.serviceTier = serviceTier;

  const systemPrompt = cleanOptionalString(obj.systemPrompt);
  if (systemPrompt) result.systemPrompt = systemPrompt;

  const appendSystemPrompt = cleanOptionalString(obj.appendSystemPrompt);
  if (appendSystemPrompt) result.appendSystemPrompt = appendSystemPrompt;

  return result;
}

// Build CLI argument list from launch options
export function buildLaunchArgs(opts?: OmpLaunchOptions | null): string[] {
  if (!opts || typeof opts !== 'object') {
    return [];
  }

  const args: string[] = [];

  // 1. addDirs
  if (opts.addDirs && opts.addDirs.length > 0) {
    for (const dir of opts.addDirs) {
      const expanded = expandHomeDir(dir);
      if (expanded) {
        args.push('--add-dir', expanded);
      }
    }
  }

  // 2. tools vs noTools (noTools overrides tools)
  if (opts.noTools) {
    args.push('--no-tools');
  } else if (opts.tools && opts.tools.length > 0) {
    for (const tool of opts.tools) {
      const trimmed = tool.trim();
      if (trimmed) {
        args.push('--tools', trimmed);
      }
    }
  }

  // 3. noLsp
  if (opts.noLsp) {
    args.push('--no-lsp');
  }

  // 4. noPty
  if (opts.noPty) {
    args.push('--no-pty');
  }

  // 5. skills vs noSkills (noSkills overrides skills)
  if (opts.noSkills) {
    args.push('--no-skills');
  } else if (opts.skills && opts.skills.length > 0) {
    for (const skill of opts.skills) {
      const trimmed = skill.trim();
      if (trimmed) {
        args.push('--skills', trimmed);
      }
    }
  }

  // 6. noRules
  if (opts.noRules) {
    args.push('--no-rules');
  }

  // 7. extensions & hooks vs noExtensions (noExtensions overrides extensions & hooks)
  if (opts.noExtensions) {
    args.push('--no-extensions');
  } else {
    if (opts.extensions && opts.extensions.length > 0) {
      for (const ext of opts.extensions) {
        const expanded = expandHomeDir(ext);
        if (expanded) {
          args.push('-e', expanded);
        }
      }
    }
    if (opts.hooks && opts.hooks.length > 0) {
      for (const hook of opts.hooks) {
        const expanded = expandHomeDir(hook);
        if (expanded) {
          args.push('--hook', expanded);
        }
      }
    }
  }

  // 8. advisor
  if (opts.advisor) {
    args.push('--advisor');
  }

  // 9. prewalk vs prewalkInto
  if (opts.prewalkInto) {
    const expanded = expandHomeDir(opts.prewalkInto);
    if (expanded) {
      args.push('--prewalk-into', expanded);
    }
  } else if (opts.prewalk) {
    args.push('--prewalk');
  }

  // 10. planYolo vs planYoloInto
  if (opts.planYoloInto) {
    const expanded = expandHomeDir(opts.planYoloInto);
    if (expanded) {
      args.push('--plan-yolo-into', expanded);
    }
  } else if (opts.planYolo) {
    args.push('--plan-yolo');
  }

  // 11. maxTime
  if (opts.maxTime) {
    const trimmed = opts.maxTime.trim();
    if (trimmed) {
      args.push('--max-time', trimmed);
    }
  }

  // 12. serviceTier
  if (opts.serviceTier) {
    const trimmed = opts.serviceTier.trim();
    if (trimmed) {
      args.push('--service-tier', trimmed);
    }
  }

  // 13. systemPrompt
  if (opts.systemPrompt) {
    const trimmed = opts.systemPrompt.trim();
    if (trimmed) {
      args.push('--system-prompt', trimmed);
    }
  }

  // 14. appendSystemPrompt
  if (opts.appendSystemPrompt) {
    const trimmed = opts.appendSystemPrompt.trim();
    if (trimmed) {
      args.push('--append-system-prompt', trimmed);
    }
  }

  // 15. configOverlays
  if (opts.configOverlays && opts.configOverlays.length > 0) {
    for (const cfg of opts.configOverlays) {
      const expanded = expandHomeDir(cfg);
      if (expanded) {
        args.push('--config', expanded);
      }
    }
  }

  // 16. models
  if (opts.models && opts.models.length > 0) {
    for (const model of opts.models) {
      const trimmed = model.trim();
      if (trimmed) {
        args.push('--models', trimmed);
      }
    }
  }

  // 17. hideThinking
  if (opts.hideThinking) {
    args.push('--hide-thinking');
  }

  // 18. noTitle
  if (opts.noTitle) {
    args.push('--no-title');
  }

  return args;
}
