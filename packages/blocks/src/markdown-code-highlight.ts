// Adapted from the colorizer in affectUI's Code Block (MIT).
type Kind = "com" | "str" | "kw" | "num" | "lit" | "fn" | "key" | "var";
type Token = { kind: Kind | null; text: string; offset: number };

type Language = "js" | "json" | "bash" | "python";

const ALIASES: Record<string, Language> = {
  ts: "js",
  tsx: "js",
  typescript: "js",
  js: "js",
  jsx: "js",
  javascript: "js",
  mjs: "js",
  cjs: "js",
  json: "json",
  jsonc: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  python: "python",
  py: "python",
};

const END = "(?![\\s\\S])";
const BLOCK_COMMENT = `\\/\\*[\\s\\S]*?(?:\\*\\/|${END})`;

/** Each language: [kind, pattern] in order – at one spot the first that matches wins */
const RULES: Record<Language, [Kind, string][]> = {
  js: [
    ["com", `\\/\\/[^\\n]*|${BLOCK_COMMENT}`],
    ["str", `"(?:[^"\\\\\\n]|\\\\.)*"?|'(?:[^'\\\\\\n]|\\\\.)*'?|\`(?:[^\`\\\\]|\\\\[\\s\\S])*\`?`],
    ["num", `\\b0[xXbBoO][\\da-fA-F_]+n?\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?n?\\b`],
    ["lit", `\\b(?:true|false|null|undefined|NaN|Infinity)\\b`],
    [
      "kw",
      `\\b(?:abstract|as|async|await|break|case|catch|class|const|continue|debugger|declare|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|keyof|let|new|of|private|protected|public|readonly|return|satisfies|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield)\\b`,
    ],
    ["fn", `(?<![\\w$])[A-Za-z_$][\\w$]*(?=\\s*\\()`],
  ],
  json: [
    ["com", `\\/\\/[^\\n]*|${BLOCK_COMMENT}`],
    ["key", `"(?:[^"\\\\\\n]|\\\\.)*"(?=\\s*:)`],
    ["str", `"(?:[^"\\\\\\n]|\\\\.)*"?`],
    ["num", `-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b`],
    ["lit", `\\b(?:true|false|null)\\b`],
  ],
  bash: [
    ["com", `(?<![^\\s;|&(])#[^\\n]*`],
    ["str", `"(?:[^"\\\\]|\\\\[\\s\\S])*"?|'[^']*'?`],
    ["var", `\\$\\{[^}\\n]*\\}?|\\$[A-Za-z_]\\w*|\\$[0-9@#?*$!-]`],
    [
      "kw",
      `\\b(?:if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|return|export|local|readonly|unset|exit)\\b`,
    ],
  ],
  python: [
    ["com", `#[^\\n]*`],
    [
      "str",
      `(?:\\b[rRbBuUfF]{1,2})?(?:"""[\\s\\S]*?(?:"""|${END})|'''[\\s\\S]*?(?:'''|${END})|"(?:[^"\\\\\\n]|\\\\.)*"?|'(?:[^'\\\\\\n]|\\\\.)*'?)`,
    ],
    ["fn", `@[A-Za-z_][\\w.]*`],
    ["num", `\\b0[xXoObB][\\da-fA-F_]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?j?\\b`],
    ["lit", `\\b(?:True|False|None|self|cls)\\b`],
    [
      "kw",
      `\\b(?:and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|raise|return|try|while|with|yield)\\b`,
    ],
    ["fn", `\\b[A-Za-z_]\\w*(?=\\s*\\()`],
  ],
};

const compiled = new Map<Language, { pattern: RegExp; kinds: Kind[] }>();
function grammarFor(language: Language) {
  let grammar = compiled.get(language);
  if (!grammar) {
    const rules = RULES[language];
    grammar = {
      pattern: new RegExp(rules.map(([, rule]) => `(${rule})`).join("|"), "gm"),
      kinds: rules.map(([kind]) => kind),
    };
    compiled.set(language, grammar);
  }
  return grammar;
}

export function highlightCode(text: string, language: string): Token[] {
  const alias = language.toLowerCase();
  const syntax = Object.hasOwn(ALIASES, alias) ? ALIASES[alias] : undefined;
  // Code is untrusted and can change on every streamed chunk. Bound work in the renderer.
  if (!syntax || !text || text.length > 16_000) return [{ kind: null, text, offset: 0 }];
  const { pattern, kinds } = grammarFor(syntax);
  const tokens: Token[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (!match[0]) continue;
    if (match.index > offset) {
      tokens.push({ kind: null, text: text.slice(offset, match.index), offset });
    }
    const group = match.findIndex((value, index) => index > 0 && value !== undefined);
    tokens.push({ kind: kinds[group - 1] ?? null, text: match[0], offset: match.index });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) tokens.push({ kind: null, text: text.slice(offset), offset });
  return tokens;
}
