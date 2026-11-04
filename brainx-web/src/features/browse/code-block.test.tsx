import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { CodeBlock } from '@/components/ui/code-block';

describe('Story FE-2.5: Composant Bloc de Code Syntaxique & Protection du Floor 360px', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('AC-1: Language Badges, Slate Header & Syntax Highlighting', () => {
    it('renders Python code block with slate header, uppercase badge, copy button, line numbers, and token styling', () => {
      const code = `def calculate_total(price, tax):\n    # Return final amount\n    return price + tax`;
      render(<CodeBlock code={code} language="python" />);

      const block = screen.getByTestId('code-block');
      expect(block).toBeInTheDocument();
      expect(block.getAttribute('data-language')).toBe('python');

      // Slate top bar #161B22 (h-9, 36px)
      const header = screen.getByTestId('code-header');
      expect(header).toBeInTheDocument();
      expect(header.className).toContain('bg-[#161B22]');
      expect(header.className).toContain('h-9');

      // Language badge in uppercase
      const badge = screen.getByTestId('code-language-badge');
      expect(badge).toHaveTextContent('PYTHON');

      // Copy button
      const copyBtn = screen.getByTestId('code-copy-button');
      expect(copyBtn).toHaveTextContent('Copier');
      expect(screen.getByTestId('copy-default-icon')).toBeInTheDocument();

      // Line numbers in gutter
      const lineNumbers = screen.getAllByTestId('code-line-number');
      expect(lineNumbers).toHaveLength(3);
      expect(lineNumbers[0]).toHaveTextContent('1');
      expect(lineNumbers[1]).toHaveTextContent('2');
      expect(lineNumbers[2]).toHaveTextContent('3');
      expect(lineNumbers[0].className).toContain('text-[#484F58]');
      expect(lineNumbers[0].className).toContain('select-none');

      // Syntax tokens
      const pre = screen.getByTestId('code-pre');
      const keywords = pre.querySelectorAll('.text-\\[\\#FF7B72\\]');
      expect(keywords.length).toBeGreaterThanOrEqual(2); // 'def', 'return'
      const comments = pre.querySelectorAll('.text-\\[\\#8B949E\\]');
      expect(comments.length).toBeGreaterThanOrEqual(1); // '# Return final amount'
    });

    it('renders JavaScript, HTML, SQL, and Bash language badges in uppercase', () => {
      const cases = [
        { lang: 'javascript', expected: 'JAVASCRIPT', code: 'const answer = 42;' },
        { lang: 'js', expected: 'JAVASCRIPT', code: 'let x = 10;' },
        { lang: 'typescript', expected: 'TYPESCRIPT', code: 'interface User { id: string; }' },
        { lang: 'html', expected: 'HTML', code: '<div class="test">Hello</div>' },
        { lang: 'sql', expected: 'SQL', code: 'SELECT id, name FROM courses;' },
        { lang: 'bash', expected: 'BASH', code: 'echo "hello terminal"' },
        { lang: 'sh', expected: 'BASH', code: 'npm run build' },
        { lang: 'php', expected: 'PHP', code: 'namespace App\\Entity;\nclass User {\n  private string $name;\n}' },
        { lang: 'yaml', expected: 'YAML', code: 'services:\n  App\\Service: true' },
        { lang: 'yml', expected: 'YAML', code: 'framework:\n  secret: test' },
        { lang: 'twig', expected: 'TWIG', code: '{% extends "base.html.twig" %}' },
        { lang: 'json', expected: 'JSON', code: '{"name": "brainx"}' },
        { lang: 'dockerfile', expected: 'DOCKERFILE', code: 'FROM php:8.2-fpm' },
      ];

      for (const { lang, expected, code } of cases) {
        const { unmount } = render(<CodeBlock code={code} language={lang} />);
        const badge = screen.getByTestId('code-language-badge');
        expect(badge).toHaveTextContent(expected);
        unmount();
      }
    });

    it('highlights PHP syntax with keywords, class definitions, functions, and variables in distinct colors', () => {
      const phpCode = `<?php\nnamespace App\\Entity;\nclass Course {\n    private string $title;\n    public function getTitle(): string {\n        return $this->title;\n    }\n}`;
      render(<CodeBlock code={phpCode} language="php" />);

      const pre = screen.getByTestId('code-pre');

      // Coral red keywords (#FF7B72): namespace, class, private, public, function, return
      const keywords = pre.querySelectorAll('.text-\\[\\#FF7B72\\]');
      expect(keywords.length).toBeGreaterThanOrEqual(4);

      // Purple functions & classes (#D2A8FF): Course, getTitle
      const purpleTokens = pre.querySelectorAll('.text-\\[\\#D2A8FF\\]');
      expect(purpleTokens.length).toBeGreaterThanOrEqual(1);

      // Orange variables (#FFA657): $title, $this
      const variableTokens = pre.querySelectorAll('.text-\\[\\#FFA657\\]');
      expect(variableTokens.length).toBeGreaterThanOrEqual(2);
    });

    it('highlights Twig templates with tags, delimiters, and strings', () => {
      const twigCode = `{% extends "base.html.twig" %}\n{% block body %}\n    <h1>{{ user.name }}</h1>\n{% endblock %}`;
      render(<CodeBlock code={twigCode} language="twig" />);

      const pre = screen.getByTestId('code-pre');
      // Coral red tags/delimiters (#FF7B72): extends, block, endblock, {%
      const redTokens = pre.querySelectorAll('.text-\\[\\#FF7B72\\]');
      expect(redTokens.length).toBeGreaterThanOrEqual(3);

      // Strings (#A5D6FF): "base.html.twig"
      const stringTokens = pre.querySelectorAll('.text-\\[\\#A5D6FF\\]');
      expect(stringTokens.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to uppercase CODE badge when language is omitted or unknown', () => {
      const { unmount } = render(<CodeBlock code="Plain text content" />);
      expect(screen.getByTestId('code-language-badge')).toHaveTextContent('CODE');
      expect(screen.getByTestId('code-block').getAttribute('data-language')).toBe('code');
      unmount();

      render(<CodeBlock code="Some custom code" language="unknownlang" />);
      expect(screen.getByTestId('code-language-badge')).toHaveTextContent('UNKNOWNLANG');
    });
  });

  describe('AC-2: Copy to Clipboard & 2000 ms Visual Confirmation', () => {
    it('copies code to clipboard and switches icon/text to "Copié !" for exactly 2000 ms', async () => {
      const code = 'const greeting = "Hello BrainX";';
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<CodeBlock code={code} language="javascript" />);

      const copyBtn = screen.getByTestId('code-copy-button');
      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copier');
      expect(screen.getByTestId('copy-default-icon')).toBeInTheDocument();
      expect(copyBtn).toHaveAttribute('aria-label', 'Copier le code dans le presse-papier');

      // Click copy button
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(writeTextMock).toHaveBeenCalledWith(code);

      // Visual confirmation switches to "Copié !" with check icon
      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copié !');
      expect(screen.getByTestId('copy-success-icon')).toBeInTheDocument();
      expect(copyBtn).toHaveAttribute('aria-label', 'Code copié dans le presse-papier');

      // At 1999 ms, confirmation remains visible
      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copié !');

      // At 2000 ms, reverts to "Copier"
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copier');
      expect(screen.getByTestId('copy-default-icon')).toBeInTheDocument();
      expect(copyBtn).toHaveAttribute('aria-label', 'Copier le code dans le presse-papier');
    });

    it('falls back to document.execCommand when navigator.clipboard.writeText rejects', async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const execCommandMock = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      render(<CodeBlock code="echo 'fallback test'" language="bash" />);

      const copyBtn = screen.getByTestId('code-copy-button');
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copié !');
    });

    it('falls back to document.execCommand when navigator.clipboard is unavailable', async () => {
      const originalClipboard = navigator.clipboard;
      // @ts-expect-error simulate legacy browser without clipboard
      delete navigator.clipboard;

      const execCommandMock = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      render(<CodeBlock code="SELECT * FROM lessons;" language="sql" />);

      const copyBtn = screen.getByTestId('code-copy-button');
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(execCommandMock).toHaveBeenCalledWith('copy');
      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copié !');

      // Revert timers
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copier');

      // Restore clipboard
      Object.assign(navigator, { clipboard: originalClipboard });
    });
  });

  describe('AC-3: Protection du Floor 360px & Isolation du Scroll Horizontal', () => {
    it('isolates horizontal scrolling inside <pre> with overflow-x-auto without breaking container boundaries', () => {
      const veryLongLine = 'const veryLongVariable = "' + 'A'.repeat(800) + '";';
      render(<CodeBlock code={veryLongLine} language="javascript" />);

      const block = screen.getByTestId('code-block');
      expect(block.className).toContain('min-w-0');
      expect(block.className).toContain('max-w-full');
      expect(block.className).toContain('overflow-hidden');

      const pre = screen.getByTestId('code-pre');
      expect(pre.className).toContain('overflow-x-auto');
      expect(pre.className).toContain('min-w-0');
      expect(pre.className).toContain('max-w-full');
    });

    it('provides keyboard focusability and ARIA accessibility on scrollable <pre>', () => {
      render(<CodeBlock code="const a = 1;" language="typescript" />);

      const pre = screen.getByTestId('code-pre');
      expect(pre).toHaveAttribute('tabIndex', '0');
      expect(pre).toHaveAttribute('role', 'region');
      expect(pre).toHaveAttribute('aria-label', 'Extrait de code TYPESCRIPT');

      const status = screen.getByTestId('code-copy-status');
      expect(status).toHaveAttribute('role', 'status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    it('handles snippets exceeding 99 lines with proper gutter layout', () => {
      const lines120 = Array.from({ length: 120 }, (_, i) => `const val_${i + 1} = ${i + 1};`).join('\n');
      render(<CodeBlock code={lines120} language="javascript" />);

      const lineNumbers = screen.getAllByTestId('code-line-number');
      expect(lineNumbers).toHaveLength(120);
      expect(lineNumbers[119]).toHaveTextContent('120');
      expect(lineNumbers[119].className).toContain('min-w-[2rem]');
    });
  });

  describe('AC-4: Inline Code vs Code Block in ReactMarkdown', () => {
    it('renders inline code with JetBrains Mono, slate #1F242C background, fine #30363D border, without code header', () => {
      const markdown = 'Utilisez la fonction `get_lesson_id()` pour inspecter les leçons.';

      const markdownComponents = {
        code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
          <code
            className={`font-mono text-[13px] bg-[#1F242C] border border-[#30363D] text-[#E6EDF3] px-1.5 py-0.5 rounded ${className || ''}`}
            {...props}
          >
            {children}
          </code>
        ),
      };

      const { container } = render(
        <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
      );

      const inlineCode = container.querySelector('code');
      expect(inlineCode).toBeInTheDocument();
      expect(inlineCode?.textContent).toBe('get_lesson_id()');
      expect(inlineCode?.className).toContain('font-mono');
      expect(inlineCode?.className).toContain('bg-[#1F242C]');
      expect(inlineCode?.className).toContain('border-[#30363D]');
      expect(inlineCode?.className).toContain('text-[#E6EDF3]');
      expect(inlineCode?.className).toContain('px-1.5');
      expect(inlineCode?.className).toContain('py-0.5');
      expect(inlineCode?.className).toContain('rounded');

      // No CodeBlock header for inline code
      expect(screen.queryByTestId('code-header')).not.toBeInTheDocument();
    });

    it('renders fenced code blocks through CodeBlock and inline code through custom code component simultaneously', () => {
      const markdown = `
Voici une explication avec du code inline : \`user.is_authenticated\`.

\`\`\`bash
pip install -r requirements.txt
\`\`\`
      `;

      const markdownComponents = {
        pre: ({ children }: React.ComponentPropsWithoutRef<'pre'>) => {
          if (React.isValidElement(children)) {
            const childProps = children.props as { className?: string; children?: React.ReactNode };
            const codeString = typeof childProps.children === 'string' ? childProps.children : '';
            const match = /language-([^\s]+)/.exec(childProps.className || '');
            const language = match ? match[1] : undefined;
            return <CodeBlock code={codeString} language={language} />;
          }
          return <pre>{children}</pre>;
        },
        code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
          <code
            className={`font-mono text-[13px] bg-[#1F242C] border border-[#30363D] text-[#E6EDF3] px-1.5 py-0.5 rounded ${className || ''}`}
            {...props}
          >
            {children}
          </code>
        ),
      };

      const { container } = render(
        <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
      );

      // Inline code
      const inlineCode = container.querySelector('p code');
      expect(inlineCode).toBeInTheDocument();
      expect(inlineCode?.textContent).toBe('user.is_authenticated');
      expect(inlineCode?.className).toContain('bg-[#1F242C]');

      // Block code
      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock).toBeInTheDocument();
      expect(screen.getByTestId('code-language-badge')).toHaveTextContent('BASH');
      expect(screen.getByTestId('code-pre')).toHaveTextContent('pip install -r requirements.txt');
    });

    it('preserves languages with special symbols such as c++ or c# in markdown', () => {
      const markdown = '```c++\nint main() { return 0; }\n```';
      const components = {
        pre: ({ children }: React.ComponentPropsWithoutRef<'pre'>) => {
          if (React.isValidElement(children)) {
            const childProps = children.props as { className?: string; children?: React.ReactNode };
            const codeString = typeof childProps.children === 'string' ? childProps.children : '';
            const match = /language-([^\s]+)/.exec(childProps.className || '');
            const language = match ? match[1] : undefined;
            return <CodeBlock code={codeString} language={language} />;
          }
          return <pre>{children}</pre>;
        },
      };

      render(
        <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={components}>
          {markdown}
        </ReactMarkdown>
      );

      expect(screen.getByTestId('code-language-badge')).toHaveTextContent('C++');
    });
  });

  describe('Edge-Case Scenarios', () => {
    it('normalizes Windows CRLF line endings without distorting line numbers', () => {
      const crlfCode = 'line 1\r\nline 2\r\nline 3';
      render(<CodeBlock code={crlfCode} language="bash" />);

      const lineNumbers = screen.getAllByTestId('code-line-number');
      expect(lineNumbers).toHaveLength(3);
      expect(lineNumbers[0]).toHaveTextContent('1');
      expect(lineNumbers[1]).toHaveTextContent('2');
      expect(lineNumbers[2]).toHaveTextContent('3');
      expect(screen.getByTestId('code-pre')).toHaveTextContent('line 1');
      expect(screen.getByTestId('code-pre')).toHaveTextContent('line 2');
      expect(screen.getByTestId('code-pre')).toHaveTextContent('line 3');
    });

    it('handles empty code block cleanly without throwing errors', () => {
      render(<CodeBlock code="" language="python" />);
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
      expect(screen.getByTestId('code-language-badge')).toHaveTextContent('PYTHON');
      const lineNumbers = screen.getAllByTestId('code-line-number');
      expect(lineNumbers).toHaveLength(1);
      expect(lineNumbers[0]).toHaveTextContent('1');
    });

    it('cleans up copy timeout on component unmount to prevent memory leaks', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

      const { unmount } = render(<CodeBlock code="const x = 1;" language="js" />);
      const copyBtn = screen.getByTestId('code-copy-button');

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(screen.getByTestId('code-copy-status')).toHaveTextContent('Copié !');
      // Unmount while timer is pending
      unmount();

      // Advancing timer after unmount should not throw
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(2000);
        });
      }).not.toThrow();
    });
  });
});
