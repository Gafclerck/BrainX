import { useEffect, useState, useId } from 'react';
import mermaid from 'mermaid';
import {
  Copy,
  Check,
  Code,
  Eye,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  X,
} from 'lucide-react';
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
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
  const [zoom, setZoom] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Handle escape key to close fullscreen modal
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chart.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2.5, Math.round((prev + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  return (
    <>
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
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 min-h-10 bg-[#161B22] border-b border-[#30363D] select-none text-xs"
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

          <div className="flex items-center space-x-1.5 flex-wrap">
            {/* Zoom Controls (only shown in diagram mode with rendered SVG) */}
            {!error && svg && viewMode === 'diagram' && (
              <div
                data-testid="mermaid-zoom-controls"
                className="flex items-center rounded bg-[#21262D] border border-[#30363D] p-0.5 text-xs text-[#8B949E]"
              >
                <button
                  type="button"
                  data-testid="mermaid-zoom-out"
                  title="Zoom arrière (-25%)"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="p-1 hover:text-[#F0F6FC] hover:bg-[#30363D] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  <span className="sr-only">Zoom arrière</span>
                </button>
                <span
                  data-testid="mermaid-zoom-level"
                  className="px-1.5 font-mono text-[11px] text-[#C9D1D9] min-w-[36px] text-center"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  data-testid="mermaid-zoom-in"
                  title="Zoom avant (+25%)"
                  onClick={handleZoomIn}
                  disabled={zoom >= 2.5}
                  className="p-1 hover:text-[#F0F6FC] hover:bg-[#30363D] rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span className="sr-only">Zoom avant</span>
                </button>
                {zoom !== 1 && (
                  <button
                    type="button"
                    data-testid="mermaid-zoom-reset"
                    title="Réinitialiser le zoom (100%)"
                    onClick={handleZoomReset}
                    className="p-1 hover:text-[#F0F6FC] hover:bg-[#30363D] rounded transition-colors ml-0.5 text-indigo-400"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="sr-only">Réinitialiser</span>
                  </button>
                )}
              </div>
            )}

            {/* Fullscreen Button */}
            {!error && svg && viewMode === 'diagram' && (
              <button
                type="button"
                data-testid="mermaid-fullscreen-btn"
                title="Agrandir en plein écran"
                onClick={() => setIsFullscreen(true)}
                className="p-1.5 text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] rounded border border-transparent hover:border-[#30363D] transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="sr-only">Plein écran</span>
              </button>
            )}

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
              className="flex items-center gap-1 px-2.5 py-1 text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] rounded border border-transparent hover:border-[#30363D] transition-colors"
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
            className="w-full overflow-x-auto p-4 sm:p-6 flex justify-center bg-[#0D1117] transition-all duration-150"
          >
            <div
              data-testid="mermaid-svg-wrapper"
              className={cn(
                'min-w-0 transition-transform duration-150 flex justify-center items-center',
                '[&>svg]:max-w-none [&>svg]:h-auto'
              )}
              style={{
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: 'top center',
                marginBottom: zoom > 1 ? `${(zoom - 1) * 150}px` : undefined,
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        ) : (
          <div data-testid="mermaid-code-view" className="bg-[#0F141C]">
            <CodeBlock code={chart.trim()} language="markdown" />
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && svg && (
        <div
          data-testid="mermaid-fullscreen-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Diagramme en plein écran"
          className="fixed inset-0 z-50 bg-[#090D13]/95 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-in fade-in duration-200"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#30363D] select-none">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded font-mono font-semibold tracking-wide bg-indigo-950/70 text-indigo-300 border border-indigo-700/50 text-xs">
                DIAGRAMME PLEIN ÉCRAN
              </span>
              <span className="text-xs text-[#8B949E] hidden sm:inline">
                (Appuyez sur Échap pour fermer)
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {/* Fullscreen Zoom Controls */}
              <div className="flex items-center rounded bg-[#21262D] border border-[#30363D] p-0.5 text-xs text-[#8B949E]">
                <button
                  type="button"
                  title="Zoom arrière (-25%)"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="p-1.5 hover:text-[#F0F6FC] hover:bg-[#30363D] rounded transition-colors disabled:opacity-40"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono text-xs text-[#C9D1D9] min-w-[40px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  title="Zoom avant (+25%)"
                  onClick={handleZoomIn}
                  disabled={zoom >= 2.5}
                  className="p-1.5 hover:text-[#F0F6FC] hover:bg-[#30363D] rounded transition-colors disabled:opacity-40"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                {zoom !== 1 && (
                  <button
                    type="button"
                    title="Réinitialiser (100%)"
                    onClick={handleZoomReset}
                    className="p-1.5 hover:text-[#F0F6FC] hover:bg-[#30363D] rounded transition-colors ml-0.5 text-indigo-400"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Close Button (min 44px touch target) */}
              <button
                type="button"
                data-testid="mermaid-fullscreen-close"
                title="Fermer (Échap)"
                onClick={() => setIsFullscreen(false)}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg bg-[#21262D] text-[#C9D1D9] hover:text-[#F0F6FC] hover:bg-[#30363D] border border-[#30363D] transition-colors"
              >
                <X className="w-5 h-5" />
                <span className="sr-only">Fermer</span>
              </button>
            </div>
          </div>

          {/* Modal Diagram Viewport */}
          <div className="flex-1 overflow-auto p-4 sm:p-8 flex items-center justify-center">
            <div
              className={cn(
                'min-w-0 transition-transform duration-150 flex justify-center items-center',
                '[&>svg]:max-w-none [&>svg]:h-auto'
              )}
              style={{
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: 'center center',
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      )}
    </>
  );
}
