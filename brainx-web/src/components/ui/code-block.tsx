import { useState, useRef, useEffect, useMemo } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup-templating';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-twig';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

interface CodeToken {
  text: string;
  type?: string;
  alias?: string;
}

interface LanguageDefinition {
  label: string;
  getGrammar: () => Prism.Grammar | undefined;
}

const LANGUAGE_MAP: Record<string, LanguageDefinition> = {
  python: { label: 'PYTHON', getGrammar: () => Prism.languages.python },
  py: { label: 'PYTHON', getGrammar: () => Prism.languages.python },
  javascript: { label: 'JAVASCRIPT', getGrammar: () => Prism.languages.javascript },
  js: { label: 'JAVASCRIPT', getGrammar: () => Prism.languages.javascript },
  typescript: { label: 'TYPESCRIPT', getGrammar: () => Prism.languages.typescript || Prism.languages.javascript },
  ts: { label: 'TYPESCRIPT', getGrammar: () => Prism.languages.typescript || Prism.languages.javascript },
  html: { label: 'HTML', getGrammar: () => Prism.languages.markup },
  markup: { label: 'HTML', getGrammar: () => Prism.languages.markup },
  xml: { label: 'HTML', getGrammar: () => Prism.languages.markup },
  svg: { label: 'HTML', getGrammar: () => Prism.languages.markup },
  sql: { label: 'SQL', getGrammar: () => Prism.languages.sql },
  bash: { label: 'BASH', getGrammar: () => Prism.languages.bash },
  sh: { label: 'BASH', getGrammar: () => Prism.languages.bash },
  shell: { label: 'BASH', getGrammar: () => Prism.languages.bash },
  zsh: { label: 'BASH', getGrammar: () => Prism.languages.bash },
  php: { label: 'PHP', getGrammar: () => Prism.languages.php },
  yaml: { label: 'YAML', getGrammar: () => Prism.languages.yaml },
  yml: { label: 'YAML', getGrammar: () => Prism.languages.yaml },
  twig: { label: 'TWIG', getGrammar: () => Prism.languages.twig },
  json: { label: 'JSON', getGrammar: () => Prism.languages.json },
  dockerfile: { label: 'DOCKERFILE', getGrammar: () => Prism.languages.docker },
  docker: { label: 'DOCKER', getGrammar: () => Prism.languages.docker },
  ini: { label: 'INI', getGrammar: () => Prism.languages.ini },
  markdown: { label: 'MARKDOWN', getGrammar: () => Prism.languages.markdown },
  md: { label: 'MARKDOWN', getGrammar: () => Prism.languages.markdown },
  css: { label: 'CSS', getGrammar: () => Prism.languages.css },
};

function flattenTokens(tokens: (string | Prism.Token)[], parentType?: string, parentAlias?: string): CodeToken[] {
  const result: CodeToken[] = [];
  for (const token of tokens) {
    if (typeof token === 'string') {
      result.push({ text: token, type: parentType, alias: parentAlias });
    } else {
      const aliasStr = Array.isArray(token.alias)
        ? token.alias.join(' ')
        : (typeof token.alias === 'string' ? token.alias : parentAlias);
      const tokenType = token.type || parentType;

      if (typeof token.content === 'string') {
        result.push({ text: token.content, type: tokenType, alias: aliasStr });
      } else if (Array.isArray(token.content)) {
        result.push(...flattenTokens(token.content, tokenType, aliasStr));
      } else if (token.content) {
        result.push(...flattenTokens([token.content as Prism.Token], tokenType, aliasStr));
      }
    }
  }
  return result;
}

function splitTokensIntoLines(flatTokens: CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const token of flatTokens) {
    // Normalize Windows CRLF carriage returns to prevent line height distortions
    const cleanText = token.text.replace(/\r/g, '');
    const parts = cleanText.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        lines.push([]);
      }
      if (parts[i].length > 0) {
        lines[lines.length - 1].push({ text: parts[i], type: token.type, alias: token.alias });
      }
    }
  }
  return lines;
}

function getTokenClassName(type?: string, alias?: string): string {
  const check = (val?: string) => {
    if (!val) return null;
    switch (val) {
      case 'keyword':
      case 'important':
      case 'operator':
      case 'tag-name':
      case 'instruction':
      case 'delimiter':
        return 'text-[#FF7B72]'; // Coral red (keywords, tags, operators, delimiters)
      case 'boolean':
      case 'number':
      case 'constant':
        return 'text-[#79C0FF]'; // Light blue (numbers, booleans, constants)
      case 'string':
      case 'char':
      case 'attr-value':
      case 'regex':
        return 'text-[#A5D6FF]'; // Cyan / soft blue (strings)
      case 'function':
      case 'function-definition':
      case 'class-name':
      case 'class-name-definition':
      case 'builtin':
        return 'text-[#D2A8FF]'; // Purple (functions, classes, builtins)
      case 'comment':
      case 'prolog':
      case 'doctype':
      case 'cdata':
        return 'text-[#8B949E] italic'; // Slate gray (comments)
      case 'attr-name':
      case 'tag':
      case 'property':
      case 'key':
      case 'atrule':
      case 'package':
        return 'text-[#79C0FF]'; // Property, attribute, package, yaml keys
      case 'variable':
        return 'text-[#FFA657]'; // Warm amber/orange for variables ($this, $user)
      default:
        return null;
    }
  };

  return check(type) || check(alias) || 'text-[#E6EDF3]';
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const normalizedLang = language ? language.trim().toLowerCase() : '';
  const langConfig = normalizedLang ? LANGUAGE_MAP[normalizedLang] : undefined;
  const label = langConfig?.label || (normalizedLang ? normalizedLang.toUpperCase() : 'CODE');
  const grammar = langConfig?.getGrammar() || (normalizedLang ? Prism.languages[normalizedLang] : undefined);

  const cleanCode = useMemo(() => {
    // Strip single trailing newline commonly produced by markdown code fence parsers
    const stripped = code.replace(/\r/g, '');
    return stripped.endsWith('\n') ? stripped.slice(0, -1) : stripped;
  }, [code]);

  const lines = useMemo(() => {
    if (!cleanCode) {
      return [[]];
    }
    if (grammar) {
      try {
        const tokens = Prism.tokenize(cleanCode, grammar);
        const flat = flattenTokens(tokens);
        return splitTokensIntoLines(flat);
      } catch {
        // Fallback to plain text on tokenizer error
      }
    }
    const plainFlat: CodeToken[] = [{ text: cleanCode }];
    return splitTokensIntoLines(plainFlat);
  }, [cleanCode, grammar]);

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    textArea.remove();
    if (!successful) {
      throw new Error('document.execCommand failed to copy');
    }
  };

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(cleanCode);
        } catch {
          fallbackCopy(cleanCode);
        }
      } else {
        fallbackCopy(cleanCode);
      }
      if (!isMountedRef.current) return;
      setCopied(true);
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setCopied(false);
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to copy code to clipboard:', err);
    }
  };

  return (
    <div
      className={cn(
        'w-full min-w-0 max-w-full rounded-lg border border-[#30363D] bg-[#0F141C] overflow-hidden my-4',
        className
      )}
      data-testid="code-block"
      data-language={label.toLowerCase()}
    >
      {/* Header bar: slate background #161B22, height 36px (h-9) */}
      <div
        className="h-9 bg-[#161B22] border-b border-[#30363D] px-4 flex items-center justify-between select-none"
        data-testid="code-header"
      >
        <span
          className="text-xs font-mono font-semibold tracking-wider text-[#8B949E] uppercase"
          data-testid="code-language-badge"
        >
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Code copié dans le presse-papier' : 'Copier le code dans le presse-papier'}
          className="relative inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-[#8B949E] hover:text-[#E6EDF3] bg-[#0D1117] hover:bg-[#1F242C] border border-[#30363D] rounded transition-colors before:absolute before:-inset-1 before:content-['']"
          data-testid="code-copy-button"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary" data-testid="copy-success-icon" />
              <span data-testid="code-copy-status" role="status" aria-live="polite">
                Copié !
              </span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" data-testid="copy-default-icon" />
              <span data-testid="code-copy-status" role="status" aria-live="polite">
                Copier
              </span>
            </>
          )}
        </button>
      </div>

      {/* Code body: dark tech #0F141C, isolated horizontal scroll inside pre */}
      <pre
        tabIndex={0}
        role="region"
        aria-label={`Extrait de code ${label}`}
        className="p-4 overflow-x-auto min-w-0 max-w-full font-mono text-xs leading-relaxed text-[#E6EDF3] focus:outline-none focus:ring-1 focus:ring-primary/40"
        data-testid="code-pre"
      >
        <code className="table min-w-full" data-testid="code-content">
          {lines.map((lineTokens, lineIdx) => (
            <div key={lineIdx} className="table-row">
              <span
                className="table-cell select-none text-right pr-3 text-[#484F58] font-mono text-xs min-w-[2rem] w-auto"
                data-testid="code-line-number"
              >
                {lineIdx + 1}
              </span>
              <span className="table-cell font-mono text-xs text-[#E6EDF3] whitespace-pre min-w-0">
                {lineTokens.length > 0 ? (
                  lineTokens.map((t, tIdx) => (
                    <span key={tIdx} className={getTokenClassName(t.type, t.alias)}>
                      {t.text}
                    </span>
                  ))
                ) : (
                  '\u00A0'
                )}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
