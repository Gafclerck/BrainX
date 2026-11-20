import { useEffect, useState, useId } from 'react';
import mermaid from 'mermaid';
import { Copy, Check, Code, Eye, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from './code-block';

export interface MermaidBlockProps {
  chart: string;
  className?: string;
}

let isMermaidInitialized = false;

function initMermaidOnce() {
  if (isMermaidInitialized || typeof window === 'undefined') return;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'dark',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      themeVariables: {
        darkMode: true,
        background: '#0D1117',
        primaryColor: '#1F6FEB',
        primaryTextColor: '#F0F6FC',
        primaryBorderColor: '#30363D',
        lineColor: '#8B949E',
        secondaryColor: '#161B22',
        tertiaryColor: '#21262D',
        mainBkg: '#161B22',
        nodeBorder: '#30363D',
        clusterBkg: '#0D1117',
        clusterBorder: '#30363D',
        defaultLinkColor: '#8B949E',
        titleColor: '#E6EDF3',
        edgeLabelBackground: '#161B22',
        actorBkg: '#161B22',
        actorBorder: '#30363D',
        actorTextColor: '#E6EDF3',
        actorLineColor: '#8B949E',
        signalColor: '#8B949E',
        signalTextColor: '#E6EDF3',
        labelBoxBkgColor: '#161B22',
        labelBoxBorderColor: '#30363D',
        labelTextColor: '#E6EDF3',
        loopTextColor: '#E6EDF3',
        noteBorderColor: '#30363D',
        noteBkgColor: '#161B22',
        noteTextColor: '#E6EDF3',
      },
    });
    isMermaidInitialized = true;
  } catch (e) {
    console.error('Failed to initialize mermaid:', e);
  }
}

export function MermaidBlock({ chart, className }: MermaidBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'diagram' | 'code'>('diagram');
  const [copied, setCopied] = useState(false);
  const rawId = useId();
  const safeId = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    let isCancelled = false;
    initMermaidOnce();

    const cleanChart = chart.trim();
    if (!cleanChart) {
      setSvg(null);
      return;
    }

    const renderDiagram = async () => {
      try {
        const renderId = `${safeId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: renderedSvg } = await mermaid.render(renderId, cleanChart);
        if (!isCancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : 'Erreur de syntaxe Mermaid';
          setError(msg);
          // Auto switch to code view if rendering fails
          setViewMode('code');
        }
      }
    };

    renderDiagram();

    return () => {
      isCancelled = true;
    };
  }, [chart, safeId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chart.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  return (
    <div
      data-testid="mermaid-block"
      className={cn(
        'my-6 rounded-lg border border-[#30363D] bg-[#0D1117] overflow-hidden shadow-sm',
        className
      )}
    >
      {/* Header bar matching CodeBlock aesthetics */}
      <div
        data-testid="mermaid-header"
        className="flex items-center justify-between px-3 h-10 bg-[#161B22] border-b border-[#30363D] select-none text-xs"
      >
        <div className="flex items-center space-x-2">
          <span
            data-testid="mermaid-badge"
            className="px-2 py-0.5 rounded font-mono font-semibold tracking-wide bg-indigo-950/70 text-indigo-300 border border-indigo-700/50"
          >
            DIAGRAMME
          </span>
          {error && (
            <span
              data-testid="mermaid-error-badge"
              className="flex items-center text-amber-400 gap-1 text-[11px]"
              title={error}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Source brute
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1">
          {/* View toggle (Diagram vs Source Code) */}
          {!error && svg && (
            <div className="flex rounded bg-[#21262D] p-0.5 border border-[#30363D]">
              <button
                type="button"
                data-testid="mermaid-toggle-diagram"
                onClick={() => setViewMode('diagram')}
                aria-pressed={viewMode === 'diagram'}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  viewMode === 'diagram'
                    ? 'bg-[#30363D] text-[#F0F6FC] font-medium'
                    : 'text-[#8B949E] hover:text-[#C9D1D9]'
                )}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Rendu</span>
              </button>
              <button
                type="button"
                data-testid="mermaid-toggle-code"
                onClick={() => setViewMode('code')}
                aria-pressed={viewMode === 'code'}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  viewMode === 'code'
                    ? 'bg-[#30363D] text-[#F0F6FC] font-medium'
                    : 'text-[#8B949E] hover:text-[#C9D1D9]'
                )}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Source</span>
              </button>
            </div>
          )}

          {/* Copy button */}
          <button
            type="button"
            data-testid="mermaid-copy-button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] rounded border border-transparent hover:border-[#30363D] transition-colors ml-1"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Diagram Canvas or Code Fallback */}
      {viewMode === 'diagram' && svg ? (
        <div
          data-testid="mermaid-diagram-container"
          className="w-full overflow-x-auto p-4 sm:p-6 flex justify-center bg-[#0D1117]"
        >
          <div
            data-testid="mermaid-svg-wrapper"
            className="min-w-0 max-w-full [&>svg]:max-w-full [&>svg]:h-auto flex justify-center"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <div data-testid="mermaid-code-view" className="bg-[#0F141C]">
          <CodeBlock code={chart.trim()} language="markdown" />
        </div>
      )}
    </div>
  );
}
