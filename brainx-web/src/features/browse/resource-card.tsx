import { useState, useEffect, useRef } from 'react';
import {
  Download,
  ExternalLink,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
  Maximize2,
} from 'lucide-react';
import { ResourceBadge } from '@/components/ui/resource-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fetchResourceRetrieval } from './api';
import type { LessonResourceItem } from './types';

export interface ResourceCardProps {
  resource: LessonResourceItem;
  className?: string;
}

export function extractHost(url?: string | null): string {
  if (!url) return 'externe';
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url || 'externe';
  }
}

function parseTimestamp(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const trimmed = timeStr.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  if (/^\d+s$/i.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  let total = 0;
  let matched = false;
  const h = trimmed.match(/(\d+)h/i);
  const m = trimmed.match(/(\d+)m/i);
  const s = trimmed.match(/(\d+)s/i);
  if (h) {
    total += parseInt(h[1], 10) * 3600;
    matched = true;
  }
  if (m) {
    total += parseInt(m[1], 10) * 60;
    matched = true;
  }
  if (s) {
    total += parseInt(s[1], 10);
    matched = true;
  }
  if (matched) return total;
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? null : num;
}

export function getVideoEmbedUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // YouTube: youtube.com, youtube-nocookie.com, or youtu.be
    const isYouTube =
      host.includes('youtube.com') ||
      host.includes('youtube-nocookie.com') ||
      host === 'youtu.be' ||
      host.endsWith('.youtu.be');

    if (isYouTube) {
      let videoId: string | null = null;

      if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
        videoId = parsed.pathname.slice(1).split('/')[0] || null;
      } else {
        const v = parsed.searchParams.get('v');
        if (v) {
          videoId = v;
        } else if (parsed.pathname.startsWith('/embed/')) {
          videoId = parsed.pathname.split('/')[2] || null;
        } else if (parsed.pathname.startsWith('/shorts/')) {
          videoId = parsed.pathname.split('/')[2] || null;
        } else if (parsed.pathname.startsWith('/v/')) {
          videoId = parsed.pathname.split('/')[2] || null;
        }
      }

      if (videoId) {
        const timeParam =
          parsed.searchParams.get('start') || parsed.searchParams.get('t');
        const seconds = parseTimestamp(timeParam);
        const query = seconds !== null ? `?start=${seconds}` : '';
        return `https://www.youtube-nocookie.com/embed/${videoId}${query}`;
      }
    }

    // Vimeo: vimeo.com
    if (host.includes('vimeo.com')) {
      if (parsed.pathname.startsWith('/video/')) {
        const id = parsed.pathname.split('/')[2];
        if (id) return `https://player.vimeo.com/video/${id}`;
      }
      const match = parsed.pathname.match(/\/(\d+)/);
      if (match && match[1]) {
        return `https://player.vimeo.com/video/${match[1]}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function triggerBrowserDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'document';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function ResourceCard({ resource, className }: ResourceCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [inlineUrl, setInlineUrl] = useState<string | null>(null);
  const [isLoadingInline, setIsLoadingInline] = useState(false);
  const [hasThumbError, setHasThumbError] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  const isMountedRef = useRef(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const host = extractHost(resource.url);
  const embedUrl = resource.type === 'video' ? getVideoEmbedUrl(resource.url) : null;
  const imageDisplayUrl = resource.url || inlineUrl;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset errors and local URL on resource props changes
  useEffect(() => {
    setHasVideoError(false);
    setHasThumbError(false);
    setInlineUrl(null);
    setDownloadError(null);
  }, [resource.id, resource.url, resource.type]);

  // Listen for native iframe error events (e.g. network failure / firewall block)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handleError = () => setHasVideoError(true);
    iframe.addEventListener('error', handleError);
    return () => {
      iframe.removeEventListener('error', handleError);
    };
  }, [embedUrl]);

  // For image resources without direct url, fetch inline signed URL for preview
  useEffect(() => {
    let isMounted = true;
    if (resource.type === 'image' && !resource.url && resource.id) {
      setIsLoadingInline(true);
      fetchResourceRetrieval(resource.id, 'inline')
        .then((res) => {
          if (isMounted) {
            setInlineUrl(res.url);
          }
        })
        .catch(() => {
          if (isMounted) {
            setHasThumbError(true);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingInline(false);
          }
        });
    } else {
      setIsLoadingInline(false);
    }
    return () => {
      isMounted = false;
    };
  }, [resource.id, resource.type, resource.url]);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const data = await fetchResourceRetrieval(resource.id, 'attachment');
      if (!isMountedRef.current) return;
      triggerBrowserDownload(data.url, data.filename || 'document');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (err instanceof ApiError) {
        if (err.envelope.status === 403) {
          setDownloadError(
            'Veuillez vérifier votre adresse email pour télécharger cette ressource.'
          );
        } else if (err.envelope.detail) {
          setDownloadError(err.envelope.detail);
        } else {
          setDownloadError(
            'Échec du téléchargement. Veuillez réessayer ultérieurement.'
          );
        }
      } else {
        setDownloadError(
          'Échec du téléchargement. Veuillez réessayer ultérieurement.'
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsDownloading(false);
      }
    }
  };

  const titleText =
    resource.title ||
    (resource.type === 'document'
      ? 'Document'
      : resource.type === 'image'
      ? 'Image'
      : resource.type === 'video'
      ? 'Vidéo'
      : 'Lien externe');

  // Video resource rendering (full width responsive container)
  if (resource.type === 'video') {
    return (
      <div
        data-testid={`resource-card-${resource.id}`}
        className={cn(
          'border border-border bg-card rounded-lg p-4 flex flex-col gap-4 min-w-0 max-w-full col-span-full',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 min-w-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <ResourceBadge type="video" />
            <h3
              data-testid="resource-title"
              className="font-medium text-foreground truncate max-w-full"
            >
              {titleText}
            </h3>
          </div>
          {resource.url && (
            <div className="flex items-center gap-2 shrink-0">
              <span
                data-testid="video-host-label"
                className="text-xs text-foreground-muted font-mono truncate hidden sm:inline"
              >
                {host}
              </span>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px] border-border text-foreground hover:bg-surface"
              >
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="video-header-direct-link"
                  aria-label={`Ouvrir la vidéo sur ${host}`}
                >
                  <ExternalLink className="h-4 w-4 mr-1.5 shrink-0" aria-hidden="true" />
                  <span>Ouvrir</span>
                </a>
              </Button>
            </div>
          )}
        </div>

        {resource.note && (
          <p
            data-testid="resource-note"
            className="text-xs text-foreground-muted line-clamp-2"
          >
            {resource.note}
          </p>
        )}

        {/* Video Embed or Fallback Banner */}
        {hasVideoError || !embedUrl ? (
          <div
            data-testid="video-fallback-banner"
            role="alert"
            className="rounded-lg border border-[#663319] bg-[#2E1B13] p-4 text-[#F0883E] text-sm flex items-center justify-between gap-4 flex-wrap min-w-0 max-w-full"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">
                Vidéo inaccessible sur ce réseau ({host}).{' '}
                {resource.url && (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="video-direct-link"
                    className="underline font-medium hover:text-white transition-colors"
                  >
                    Cliquez ici pour ouvrir le lien direct.
                  </a>
                )}
              </span>
            </div>
            {resource.url && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="min-h-[44px] min-w-[44px] border-[#663319] text-[#F0883E] hover:bg-[#663319]/20"
              >
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ouvrir la vidéo sur ${host}`}
                >
                  <ExternalLink className="h-4 w-4 mr-1.5 shrink-0" />
                  <span>Ouvrir la vidéo</span>
                </a>
              </Button>
            )}
          </div>
        ) : (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border bg-black min-w-0 max-w-full">
            <iframe
              ref={iframeRef}
              data-testid="video-iframe"
              src={embedUrl}
              title={titleText}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onError={() => setHasVideoError(true)}
              className="absolute inset-0 w-full h-full border-0"
            />
          </div>
        )}
      </div>
    );
  }

  // External link resource rendering
  if (resource.type === 'external_link') {
    return (
      <div
        data-testid={`resource-card-${resource.id}`}
        className={cn(
          'border border-border bg-card rounded-lg p-4 flex flex-col justify-between gap-4 min-w-0 max-w-full',
          className
        )}
      >
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <ResourceBadge type="external_link" />
            <h3
              data-testid="resource-title"
              className="font-medium text-foreground truncate max-w-full"
            >
              {titleText}
            </h3>
          </div>
          {resource.note && (
            <p
              data-testid="resource-note"
              className="text-xs text-foreground-muted line-clamp-2"
            >
              {resource.note}
            </p>
          )}
          {resource.url && (
            <p
              data-testid="external-link-domain"
              className="text-xs text-foreground-muted font-mono truncate"
            >
              {host}
            </p>
          )}
        </div>

        <div className="pt-2">
          <Button
            asChild
            variant="outline"
            className="min-h-[44px] min-w-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 border-border"
          >
            <a
              href={resource.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="external-link-button"
              aria-label={`Ouvrir le lien externe ${titleText}`}
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Ouvrir le lien</span>
            </a>
          </Button>
        </div>
      </div>
    );
  }

  // Image resource rendering
  if (resource.type === 'image') {
    return (
      <div
        data-testid={`resource-card-${resource.id}`}
        className={cn(
          'border border-border bg-card rounded-lg p-4 flex flex-col justify-between gap-4 min-w-0 max-w-full',
          className
        )}
      >
        <div className="space-y-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <ResourceBadge type="image" />
            <h3
              data-testid="resource-title"
              className="font-medium text-foreground truncate max-w-full"
            >
              {titleText}
            </h3>
          </div>

          {resource.note && (
            <p
              data-testid="resource-note"
              className="text-xs text-foreground-muted line-clamp-2"
            >
              {resource.note}
            </p>
          )}

          {/* Thumbnail preview with zoom modal */}
          {isLoadingInline ? (
            <div
              data-testid="image-loading"
              className="w-full h-44 rounded-md border border-border bg-surface flex flex-col items-center justify-center text-foreground-muted gap-2 p-4 text-center"
            >
              <Loader2 className="h-6 w-6 animate-spin text-foreground-muted/60" aria-hidden="true" />
              <span className="text-xs">Chargement de l'aperçu...</span>
            </div>
          ) : hasThumbError || !imageDisplayUrl ? (
            <div
              data-testid="image-fallback"
              className="w-full h-44 rounded-md border border-border bg-surface flex flex-col items-center justify-center text-foreground-muted gap-2 p-4 text-center"
            >
              <ImageIcon className="h-8 w-8 text-foreground-muted/60" aria-hidden="true" />
              <span className="text-xs">
                Impossible de charger l'aperçu de l'image.
              </span>
            </div>
          ) : (
            <Dialog open={isZoomOpen} onOpenChange={setIsZoomOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  data-testid="image-thumbnail-button"
                  aria-label={`Agrandir l'image ${titleText}`}
                  className="group relative w-full h-44 rounded-md overflow-hidden border border-border bg-black/20 focus:outline-none focus:ring-2 focus:ring-primary flex items-center justify-center cursor-pointer"
                >
                  <img
                    src={imageDisplayUrl}
                    alt={titleText}
                    onError={() => setHasThumbError(true)}
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2">
                    <Maximize2 className="h-5 w-5" aria-hidden="true" />
                    <span className="text-xs font-medium">Agrandir</span>
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl max-h-[85vh] p-4 flex flex-col items-center justify-center bg-card border-border">
                <DialogHeader className="w-full text-left">
                  <DialogTitle>{titleText}</DialogTitle>
                  {resource.note ? (
                    <DialogDescription>{resource.note}</DialogDescription>
                  ) : (
                    <DialogDescription className="sr-only">
                      Aperçu agrandi de l'image {titleText}
                    </DialogDescription>
                  )}
                </DialogHeader>
                <div className="overflow-auto max-h-[65vh] w-full flex items-center justify-center p-2">
                  <img
                    src={imageDisplayUrl}
                    alt={titleText}
                    className="max-w-full max-h-[60vh] object-contain rounded"
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Action & Error row */}
        <div className="space-y-2 pt-2">
          {downloadError && (
            <div
              data-testid="resource-error"
              role="alert"
              className="text-xs text-destructive flex items-center gap-1.5"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{downloadError}</span>
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={handleDownload}
            disabled={isDownloading}
            aria-label={`Télécharger ${titleText}`}
            data-testid="resource-download-button"
            className="min-h-[44px] min-w-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 border-border"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
                <span>Téléchargement...</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Télécharger</span>
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Document resource rendering
  return (
    <div
      data-testid={`resource-card-${resource.id}`}
      className={cn(
        'border border-border bg-card rounded-lg p-4 flex flex-col justify-between gap-4 min-w-0 max-w-full',
        className
      )}
    >
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <ResourceBadge type="document" />
          <h3
            data-testid="resource-title"
            className="font-medium text-foreground truncate max-w-full"
          >
            {titleText}
          </h3>
        </div>

        {resource.note && (
          <p
            data-testid="resource-note"
            className="text-xs text-foreground-muted line-clamp-2"
          >
            {resource.note}
          </p>
        )}
      </div>

      {/* Action & Error row */}
      <div className="space-y-2 pt-2">
        {downloadError && (
          <div
            data-testid="resource-error"
            role="alert"
            className="text-xs text-destructive flex items-center gap-1.5"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{downloadError}</span>
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={handleDownload}
          disabled={isDownloading}
          aria-label={`Télécharger ${titleText}`}
          data-testid="resource-download-button"
          className="min-h-[44px] min-w-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 border-border"
        >
          {isDownloading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              <span>Téléchargement...</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Télécharger</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default ResourceCard;
