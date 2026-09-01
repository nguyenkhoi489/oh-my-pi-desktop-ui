// Comprehensive File Extension & Monaco Language Detection Mapping

export interface FileLanguageInfo {
  languageId: string;
  displayLabel: string;
  category: 'code' | 'markup' | 'data' | 'config' | 'doc' | 'script' | 'text';
}

const EXACT_FILENAME_MAP: Record<string, FileLanguageInfo> = {
  dockerfile: { languageId: 'dockerfile', displayLabel: 'DOCKERFILE', category: 'config' },
  containerfile: { languageId: 'dockerfile', displayLabel: 'CONTAINERFILE', category: 'config' },
  makefile: { languageId: 'makefile', displayLabel: 'MAKEFILE', category: 'config' },
  cmakelists: { languageId: 'cmake', displayLabel: 'CMAKE', category: 'config' },
  gemfile: { languageId: 'ruby', displayLabel: 'RUBY (GEMFILE)', category: 'code' },
  rakefile: { languageId: 'ruby', displayLabel: 'RUBY (RAKEFILE)', category: 'code' },
};

const EXTENSION_MAP: Record<string, FileLanguageInfo> = {
  // JavaScript & TypeScript
  js: { languageId: 'javascript', displayLabel: 'JAVASCRIPT', category: 'code' },
  jsx: { languageId: 'javascript', displayLabel: 'JAVASCRIPT (REACT)', category: 'code' },
  cjs: { languageId: 'javascript', displayLabel: 'JAVASCRIPT (CJS)', category: 'code' },
  mjs: { languageId: 'javascript', displayLabel: 'JAVASCRIPT (ESM)', category: 'code' },
  es6: { languageId: 'javascript', displayLabel: 'JAVASCRIPT', category: 'code' },
  pac: { languageId: 'javascript', displayLabel: 'JAVASCRIPT', category: 'code' },

  ts: { languageId: 'typescript', displayLabel: 'TYPESCRIPT', category: 'code' },
  tsx: { languageId: 'typescript', displayLabel: 'TYPESCRIPT (REACT)', category: 'code' },
  cts: { languageId: 'typescript', displayLabel: 'TYPESCRIPT (CTS)', category: 'code' },
  mts: { languageId: 'typescript', displayLabel: 'TYPESCRIPT (MTS)', category: 'code' },
  'd.ts': { languageId: 'typescript', displayLabel: 'TYPESCRIPT DECLARATION', category: 'code' },

  // JSON & Data Formats
  json: { languageId: 'json', displayLabel: 'JSON', category: 'data' },
  jsonc: { languageId: 'json', displayLabel: 'JSON WITH COMMENTS', category: 'data' },
  json5: { languageId: 'json', displayLabel: 'JSON5', category: 'data' },
  webmanifest: { languageId: 'json', displayLabel: 'WEB MANIFEST', category: 'data' },
  geojson: { languageId: 'json', displayLabel: 'GEOJSON', category: 'data' },

  // YAML & Config Formats
  yaml: { languageId: 'yaml', displayLabel: 'YAML', category: 'config' },
  yml: { languageId: 'yaml', displayLabel: 'YAML', category: 'config' },
  toml: { languageId: 'ini', displayLabel: 'TOML', category: 'config' },
  ini: { languageId: 'ini', displayLabel: 'INI', category: 'config' },
  conf: { languageId: 'ini', displayLabel: 'CONFIG', category: 'config' },
  cfg: { languageId: 'ini', displayLabel: 'CONFIG', category: 'config' },
  env: { languageId: 'ini', displayLabel: 'ENV', category: 'config' },
  properties: { languageId: 'ini', displayLabel: 'PROPERTIES', category: 'config' },

  // Web & Styles
  html: { languageId: 'html', displayLabel: 'HTML', category: 'markup' },
  htm: { languageId: 'html', displayLabel: 'HTML', category: 'markup' },
  xhtml: { languageId: 'html', displayLabel: 'XHTML', category: 'markup' },
  vue: { languageId: 'html', displayLabel: 'VUE COMPONENT', category: 'markup' },
  svelte: { languageId: 'html', displayLabel: 'SVELTE COMPONENT', category: 'markup' },
  astro: { languageId: 'html', displayLabel: 'ASTRO', category: 'markup' },

  css: { languageId: 'css', displayLabel: 'CSS', category: 'markup' },
  scss: { languageId: 'scss', displayLabel: 'SCSS', category: 'markup' },
  sass: { languageId: 'scss', displayLabel: 'SASS', category: 'markup' },
  less: { languageId: 'less', displayLabel: 'LESS', category: 'markup' },
  postcss: { languageId: 'css', displayLabel: 'POSTCSS', category: 'markup' },

  // Markdown & Documentation
  md: { languageId: 'markdown', displayLabel: 'MARKDOWN', category: 'doc' },
  markdown: { languageId: 'markdown', displayLabel: 'MARKDOWN', category: 'doc' },
  mdown: { languageId: 'markdown', displayLabel: 'MARKDOWN', category: 'doc' },
  mdx: { languageId: 'markdown', displayLabel: 'MDX', category: 'doc' },
  txt: { languageId: 'plaintext', displayLabel: 'PLAIN TEXT', category: 'text' },
  log: { languageId: 'plaintext', displayLabel: 'LOG', category: 'text' },

  // Python & Notebooks
  py: { languageId: 'python', displayLabel: 'PYTHON', category: 'code' },
  pyw: { languageId: 'python', displayLabel: 'PYTHON', category: 'code' },
  pyx: { languageId: 'python', displayLabel: 'CYTHON', category: 'code' },
  ipynb: { languageId: 'json', displayLabel: 'JUPYTER NOTEBOOK', category: 'code' },

  // Rust & Go
  rs: { languageId: 'rust', displayLabel: 'RUST', category: 'code' },
  go: { languageId: 'go', displayLabel: 'GO', category: 'code' },

  // C / C++ / C#
  c: { languageId: 'c', displayLabel: 'C', category: 'code' },
  h: { languageId: 'c', displayLabel: 'C HEADER', category: 'code' },
  cpp: { languageId: 'cpp', displayLabel: 'C++', category: 'code' },
  cc: { languageId: 'cpp', displayLabel: 'C++', category: 'code' },
  cxx: { languageId: 'cpp', displayLabel: 'C++', category: 'code' },
  hpp: { languageId: 'cpp', displayLabel: 'C++ HEADER', category: 'code' },
  hxx: { languageId: 'cpp', displayLabel: 'C++ HEADER', category: 'code' },
  cs: { languageId: 'csharp', displayLabel: 'C#', category: 'code' },

  // Java / Kotlin / Scala / Swift
  java: { languageId: 'java', displayLabel: 'JAVA', category: 'code' },
  kt: { languageId: 'kotlin', displayLabel: 'KOTLIN', category: 'code' },
  kts: { languageId: 'kotlin', displayLabel: 'KOTLIN SCRIPT', category: 'code' },
  scala: { languageId: 'scala', displayLabel: 'SCALA', category: 'code' },
  swift: { languageId: 'swift', displayLabel: 'SWIFT', category: 'code' },

  // PHP & Ruby
  php: { languageId: 'php', displayLabel: 'PHP', category: 'code' },
  phtml: { languageId: 'php', displayLabel: 'PHP HTML', category: 'code' },
  rb: { languageId: 'ruby', displayLabel: 'RUBY', category: 'code' },
  erb: { languageId: 'html', displayLabel: 'ERB TEMPLATE', category: 'markup' },

  // Shell & Scripts
  sh: { languageId: 'shell', displayLabel: 'SHELL SCRIPT', category: 'script' },
  bash: { languageId: 'shell', displayLabel: 'BASH', category: 'script' },
  zsh: { languageId: 'shell', displayLabel: 'ZSH', category: 'script' },
  command: { languageId: 'shell', displayLabel: 'COMMAND SCRIPT', category: 'script' },
  bat: { languageId: 'bat', displayLabel: 'BATCH SCRIPT', category: 'script' },
  cmd: { languageId: 'bat', displayLabel: 'COMMAND PROMPT', category: 'script' },
  ps1: { languageId: 'powershell', displayLabel: 'POWERSHELL', category: 'script' },
  psm1: { languageId: 'powershell', displayLabel: 'POWERSHELL MODULE', category: 'script' },

  // SQL & Database
  sql: { languageId: 'sql', displayLabel: 'SQL', category: 'code' },
  psql: { languageId: 'sql', displayLabel: 'POSTGRESQL', category: 'code' },
  mysql: { languageId: 'sql', displayLabel: 'MYSQL', category: 'code' },
  pgsql: { languageId: 'sql', displayLabel: 'PL/PGSQL', category: 'code' },
  prisma: { languageId: 'graphql', displayLabel: 'PRISMA SCHEMA', category: 'config' },

  // XML & SVG
  xml: { languageId: 'xml', displayLabel: 'XML', category: 'markup' },
  svg: { languageId: 'xml', displayLabel: 'SVG IMAGE', category: 'markup' },
  plist: { languageId: 'xml', displayLabel: 'PROPERTY LIST', category: 'config' },
  xsd: { languageId: 'xml', displayLabel: 'XML SCHEMA', category: 'markup' },

  // GraphQL
  graphql: { languageId: 'graphql', displayLabel: 'GRAPHQL', category: 'code' },
  gql: { languageId: 'graphql', displayLabel: 'GRAPHQL', category: 'code' },

  // Docker
  dockerfile: { languageId: 'dockerfile', displayLabel: 'DOCKERFILE', category: 'config' },
  dockerignore: { languageId: 'plaintext', displayLabel: 'DOCKER IGNORE', category: 'config' },

  // Lua / R / Dart / Elixir / Clojure
  lua: { languageId: 'lua', displayLabel: 'LUA', category: 'code' },
  r: { languageId: 'r', displayLabel: 'R', category: 'code' },
  dart: { languageId: 'dart', displayLabel: 'DART', category: 'code' },
  ex: { languageId: 'elixir', displayLabel: 'ELIXIR', category: 'code' },
  exs: { languageId: 'elixir', displayLabel: 'ELIXIR SCRIPT', category: 'code' },
  clj: { languageId: 'clojure', displayLabel: 'CLOJURE', category: 'code' },
};

/**
 * Resolves Monaco language info for any given filename or path
 */
export function getFileInfo(fileName: string): FileLanguageInfo {
  if (!fileName) {
    return { languageId: 'plaintext', displayLabel: 'PLAINTEXT', category: 'text' };
  }

  const baseName = fileName.split('/').pop()?.toLowerCase() || fileName.toLowerCase();

  // 1. Exact match filename (e.g. Dockerfile, Makefile, .env)
  if (EXACT_FILENAME_MAP[baseName]) {
    return EXACT_FILENAME_MAP[baseName];
  }

  // 2. Dotfiles (e.g. .gitignore, .npmrc, .env.local, .editorconfig)
  if (baseName.startsWith('.')) {
    if (baseName.startsWith('.env')) {
      return { languageId: 'ini', displayLabel: 'ENV CONFIG', category: 'config' };
    }
    if (baseName === '.gitignore' || baseName === '.npmignore' || baseName === '.dockerignore') {
      return { languageId: 'shell', displayLabel: 'IGNORE FILE', category: 'config' };
    }
    if (baseName.includes('rc') || baseName.endsWith('config')) {
      return { languageId: 'json', displayLabel: 'CONFIG', category: 'config' };
    }
  }

  // 3. Multi-dot extensions (e.g. .d.ts)
  if (baseName.endsWith('.d.ts')) {
    return EXTENSION_MAP['d.ts'];
  }

  // 4. Standard extension extraction
  const parts = baseName.split('.');
  if (parts.length > 1) {
    const ext = parts.pop()!;
    if (EXTENSION_MAP[ext]) {
      return EXTENSION_MAP[ext];
    }
  }

  return { languageId: 'plaintext', displayLabel: 'PLAINTEXT', category: 'text' };
}

/**
 * Returns Monaco editor language ID
 */
export function getFileLanguage(fileName: string): string {
  return getFileInfo(fileName).languageId;
}

/**
 * Returns human-readable uppercase display label
 */
export function getLanguageLabel(fileName: string): string {
  return getFileInfo(fileName).displayLabel;
}

/**
 * Checks if a file is a Markdown document
 */
export function isMarkdownFile(fileName: string): boolean {
  if (!fileName) return false;
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.mdown') ||
    lower.endsWith('.mdx')
  );
}
