import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { MermaidBlock } from '@/components/ui/mermaid-block';

// Mock mermaid module to simulate diagram rendering in JSDOM environment
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation(async (id: string, code: string) => {
      if (code.includes('syntax_error')) {
        throw new Error('Parse error on line 1: Syntax error in graph');
      }
      return {
        svg: `<svg data-testid="mock-mermaid-svg" id="${id}"><g><text>Rendered Diagram</text></g></svg>`,
      };
    }),
  },
}));

describe('Markdown Tables & Mermaid Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GFM Tables Support in ReactMarkdown', () => {
    it('parses and renders markdown tables into semantic HTML table elements', () => {
      const markdown = `
| Colonne 1 | Colonne 2 | Statut |
| :--- | :---: | ---: |
| Java | 21 LTS | Actif |
| Symfony | 7.2 | Actif |
      `;

      const markdownComponents = {
        table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
          <div data-testid="table-container" className="overflow-x-auto rounded-lg border border-border">
            <table data-testid="markdown-table" className="w-full border-collapse" {...props}>
              {children}
            </table>
          </div>
        ),
        thead: ({ children, ...props }: React.ComponentPropsWithoutRef<'thead'>) => (
          <thead data-testid="markdown-thead" {...props}>{children}</thead>
        ),
        tbody: ({ children, ...props }: React.ComponentPropsWithoutRef<'tbody'>) => (
          <tbody data-testid="markdown-tbody" {...props}>{children}</tbody>
        ),
        th: ({ children, ...props }: React.ComponentPropsWithoutRef<'th'>) => (
          <th data-testid="markdown-th" {...props}>{children}</th>
        ),
        td: ({ children, ...props }: React.ComponentPropsWithoutRef<'td'>) => (
          <td data-testid="markdown-td" {...props}>{children}</td>
        ),
      };

      render(
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={markdownComponents}
        >
          {markdown}
        </ReactMarkdown>
      );

      // Verify table container with responsive overflow wrapper
      const container = screen.getByTestId('table-container');
      expect(container).toBeInTheDocument();
      expect(container.className).toContain('overflow-x-auto');

      // Verify table element
      const table = screen.getByTestId('markdown-table');
      expect(table).toBeInTheDocument();

      // Verify thead and headers
      const thead = screen.getByTestId('markdown-thead');
      expect(thead).toBeInTheDocument();
      const headers = screen.getAllByTestId('markdown-th');
      expect(headers).toHaveLength(3);
      expect(headers[0]).toHaveTextContent('Colonne 1');
      expect(headers[1]).toHaveTextContent('Colonne 2');
      expect(headers[2]).toHaveTextContent('Statut');

      // Verify tbody and rows/cells
      const tbody = screen.getByTestId('markdown-tbody');
      expect(tbody).toBeInTheDocument();
      const cells = screen.getAllByTestId('markdown-td');
      expect(cells).toHaveLength(6);
      expect(cells[0]).toHaveTextContent('Java');
      expect(cells[1]).toHaveTextContent('21 LTS');
      expect(cells[2]).toHaveTextContent('Actif');
      expect(cells[3]).toHaveTextContent('Symfony');
    });
  });

  describe('MermaidBlock Component', () => {
    it('renders a mermaid diagram as SVG with header badge and copy button', async () => {
      const chartCode = `
flowchart TD
    A[Client] --> B[API]
    B --> C[PostgreSQL]
      `;

      render(<MermaidBlock chart={chartCode} />);

      // Block container
      expect(screen.getByTestId('mermaid-block')).toBeInTheDocument();

      // Slate header and DIAGRAMME badge
      const badge = screen.getByTestId('mermaid-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('DIAGRAMME');

      // Wait for async SVG render
      await waitFor(() => {
        expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
      });

      // SVG wrapper should be present inside diagram container
      const diagramContainer = screen.getByTestId('mermaid-diagram-container');
      expect(diagramContainer).toBeInTheDocument();
      expect(diagramContainer.className).toContain('overflow-x-auto');
    });

    it('allows toggling between Diagram Render and Source Code view', async () => {
      const chartCode = `graph LR\n  X --> Y`;

      render(<MermaidBlock chart={chartCode} />);

      // Wait for SVG render
      await waitFor(() => {
        expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
      });

      const toggleCodeBtn = screen.getByTestId('mermaid-toggle-code');
      const toggleDiagramBtn = screen.getByTestId('mermaid-toggle-diagram');

      // Click "Source" to switch to code view
      fireEvent.click(toggleCodeBtn);
      expect(screen.getByTestId('mermaid-code-view')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-mermaid-svg')).not.toBeInTheDocument();

      // Click "Rendu" to switch back to diagram view
      fireEvent.click(toggleDiagramBtn);
      expect(screen.getByTestId('mermaid-diagram-container')).toBeInTheDocument();
      expect(screen.getByTestId('mock-mermaid-svg')).toBeInTheDocument();
    });

    it('falls back gracefully to Code View when Mermaid parsing encounters a syntax error', async () => {
      const invalidChart = 'flowchart TD\n  syntax_error in definition';

      render(<MermaidBlock chart={invalidChart} />);

      // Wait for error handling
      await waitFor(() => {
        expect(screen.getByTestId('mermaid-error-badge')).toBeInTheDocument();
      });

      // Falls back to code view
      expect(screen.getByTestId('mermaid-code-view')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-mermaid-svg')).not.toBeInTheDocument();
    });

    it('copies the diagram source code to clipboard when clicking copy button', async () => {
      const chartCode = `sequenceDiagram\n  Alice->>Bob: Hello`;
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      render(<MermaidBlock chart={chartCode} />);

      const copyBtn = screen.getByTestId('mermaid-copy-button');
      fireEvent.click(copyBtn);

      expect(writeTextMock).toHaveBeenCalledWith(chartCode.trim());
      await waitFor(() => {
        expect(screen.getByText('Copié')).toBeInTheDocument();
      });
    });
  });
});
