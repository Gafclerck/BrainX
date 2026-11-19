import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ResourceCard,
  getVideoEmbedUrl,
  extractHost,
} from './resource-card';
import type { LessonResourceItem } from './types';
import { useAuthStore } from '@/features/auth/auth-store';

describe('Story FE-2.6: Consultation & Téléchargement des 4 Types de Ressources', () => {
  const originalFetch = globalThis.fetch;
  let clickMock: ReturnType<typeof vi.fn>;
  let clickedAnchors: HTMLAnchorElement[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setTokens({
      access: 'valid_student_jwt',
      refresh: 'valid_refresh_jwt',
    });

    clickedAnchors = [];
    clickMock = vi.fn(function (this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    });
    HTMLAnchorElement.prototype.click = clickMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ---------------------------------------------------------------------------
  // 1. Video Embed URL Transformer Unit Tests
  // ---------------------------------------------------------------------------
  describe('Video Embed URL Transformer (getVideoEmbedUrl)', () => {
    it('transforms standard YouTube watch URL to youtube-nocookie embed URL', () => {
      const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      expect(getVideoEmbedUrl(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('transforms YouTube short URL (youtu.be) to embed URL', () => {
      const url = 'https://youtu.be/dQw4w9WgXcQ';
      expect(getVideoEmbedUrl(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('transforms YouTube embed URL to nocookie embed URL', () => {
      const url = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
      expect(getVideoEmbedUrl(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('supports youtube-nocookie.com domains', () => {
      const url = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
      expect(getVideoEmbedUrl(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('supports YouTube shorts format (/shorts/)', () => {
      const url = 'https://www.youtube.com/shorts/dQw4w9WgXcQ';
      expect(getVideoEmbedUrl(url)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    });

    it('preserves timestamp parameter (t or start) in seconds', () => {
      expect(getVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120')).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=120'
      );
      expect(getVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45')).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=45'
      );
      expect(getVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=2m10s')).toBe(
        'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=130'
      );
    });

    it('transforms Vimeo URL to Vimeo player embed URL', () => {
      const url = 'https://vimeo.com/76979871';
      expect(getVideoEmbedUrl(url)).toBe('https://player.vimeo.com/video/76979871');
    });

    it('transforms Vimeo video embed URL to Vimeo player URL', () => {
      const url = 'https://player.vimeo.com/video/76979871';
      expect(getVideoEmbedUrl(url)).toBe('https://player.vimeo.com/video/76979871');
    });

    it('returns null for unknown video host or invalid URL', () => {
      expect(getVideoEmbedUrl('https://example.com/video.mp4')).toBeNull();
      expect(getVideoEmbedUrl('not-a-valid-url')).toBeNull();
      expect(getVideoEmbedUrl(null)).toBeNull();
      expect(getVideoEmbedUrl(undefined)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Host Extractor Unit Tests
  // ---------------------------------------------------------------------------
  describe('Host Extractor (extractHost)', () => {
    it('extracts domain from valid URLs', () => {
      expect(extractHost('https://www.youtube.com/watch?v=123')).toBe('www.youtube.com');
      expect(extractHost('https://vimeo.com/456')).toBe('vimeo.com');
      expect(extractHost('https://developer.mozilla.org/fr/docs/Web')).toBe('developer.mozilla.org');
    });

    it('handles null or invalid strings gracefully', () => {
      expect(extractHost(null)).toBe('externe');
      expect(extractHost(undefined)).toBe('externe');
      expect(extractHost('invalid-uri')).toBe('invalid-uri');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Document Resource & Signed URL Download Flow
  // ---------------------------------------------------------------------------
  describe('Document Resource Flow', () => {
    const documentResource: LessonResourceItem = {
      id: 'doc-uuid-1',
      type: 'document',
      title: 'Polycopié de cours - Algorithmique',
      note: 'Chapitre 1 à 3 révisé pour l\'examen',
    };

    it('renders document card with badge, title, note, and Télécharger action', () => {
      render(<ResourceCard resource={documentResource} />);

      expect(screen.getByTestId('resource-badge-document')).toBeInTheDocument();
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Polycopié de cours - Algorithmique');
      expect(screen.getByTestId('resource-note')).toHaveTextContent('Chapitre 1 à 3 révisé pour l\'examen');

      const downloadBtn = screen.getByTestId('resource-download-button');
      expect(downloadBtn).toBeInTheDocument();
      expect(downloadBtn).toHaveTextContent('Télécharger');
      expect(downloadBtn).toHaveAttribute('aria-label', 'Télécharger Polycopié de cours - Algorithmique');
    });

    it('fetches signed URL with disposition=attachment and triggers browser download on click with proper anchor attributes without target=_blank', async () => {
      const user = userEvent.setup();
      let requestedUrl = '';

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        requestedUrl = url;
        if (url.includes('/api/v1/resources/doc-uuid-1/retrieval/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  url: 'https://s3.eu-west-3.amazonaws.com/brainx/signed-doc.pdf?signature=abc',
                  expires_in: 3600,
                  content_type: 'application/pdf',
                  disposition: 'attachment',
                  filename: 'cours_algo.pdf',
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(<ResourceCard resource={documentResource} />);

      const downloadBtn = screen.getByTestId('resource-download-button');
      await user.click(downloadBtn);

      await waitFor(() => {
        expect(requestedUrl).toContain('/api/v1/resources/doc-uuid-1/retrieval/?disposition=attachment');
      });

      expect(clickMock).toHaveBeenCalled();
      expect(clickedAnchors.length).toBeGreaterThan(0);
      const anchor = clickedAnchors[0];
      expect(anchor.href).toBe('https://s3.eu-west-3.amazonaws.com/brainx/signed-doc.pdf?signature=abc');
      expect(anchor.getAttribute('download')).toBe('cours_algo.pdf');
      // target="_blank" must NOT be set (avoids blank tab & popup blockers)
      expect(anchor.getAttribute('target')).toBeNull();
    });

    it('displays email verification prompt when download returns 403 Forbidden', async () => {
      const user = userEvent.setup();

      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 403,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                type: 'https://brainx.io/errors/forbidden',
                title: 'Forbidden',
                status: 403,
                detail: 'Veuillez vérifier votre compte pour télécharger cette ressource.',
                errors: {},
              })
            ),
          headers: new Headers({ 'content-type': 'application/problem+json' }),
        });
      });

      render(<ResourceCard resource={documentResource} />);

      const downloadBtn = screen.getByTestId('resource-download-button');
      await user.click(downloadBtn);

      await waitFor(() => {
        const errorAlert = screen.getByTestId('resource-error');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent(/vérifier/i);
      });
    });

    it('displays error message when download fails with 500 or network failure', async () => {
      const user = userEvent.setup();

      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.reject(new Error('Network error'));
      });

      render(<ResourceCard resource={documentResource} />);

      const downloadBtn = screen.getByTestId('resource-download-button');
      await user.click(downloadBtn);

      await waitFor(() => {
        const errorAlert = screen.getByTestId('resource-error');
        expect(errorAlert).toBeInTheDocument();
        expect(errorAlert).toHaveTextContent(/Échec du téléchargement/i);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Image Resource Flow (Preview, Zoom Modal & Download)
  // ---------------------------------------------------------------------------
  describe('Image Resource Flow', () => {
    const imageResourceWithUrl: LessonResourceItem = {
      id: 'img-uuid-1',
      type: 'image',
      title: 'Schéma d\'architecture CQRS',
      note: 'Diagramme illustrant la séparation lecture/écriture',
      url: 'https://example.com/diagram.png',
    };

    const imageResourceWithoutUrl: LessonResourceItem = {
      id: 'img-uuid-2',
      type: 'image',
      title: 'Graphique de performance',
      url: null,
    };

    it('renders dedicated loading spinner during in-flight inline retrieval before thumbnail or error', async () => {
      let resolveFetch: (val: unknown) => void = () => {};
      const pendingPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/v1/resources/img-uuid-2/retrieval/')) {
          return pendingPromise;
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(<ResourceCard resource={imageResourceWithoutUrl} />);

      // Should show loading spinner immediately and NOT fallback error
      expect(screen.getByTestId('image-loading')).toBeInTheDocument();
      expect(screen.getByText("Chargement de l'aperçu...")).toBeInTheDocument();
      expect(screen.queryByTestId('image-fallback')).not.toBeInTheDocument();

      // Resolve the promise
      resolveFetch({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              url: 'https://s3.eu-west-3.amazonaws.com/brainx/signed-preview.png',
              expires_in: 3600,
              content_type: 'image/png',
              disposition: 'inline',
              filename: 'perf.png',
            })
          ),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await waitFor(() => {
        expect(screen.getByTestId('image-thumbnail-button')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('image-loading')).not.toBeInTheDocument();
    });

    it('renders image card with preview thumbnail and allows opening lightbox zoom modal', async () => {
      const user = userEvent.setup();
      render(<ResourceCard resource={imageResourceWithUrl} />);

      expect(screen.getByTestId('resource-badge-image')).toBeInTheDocument();
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Schéma d\'architecture CQRS');

      const thumbBtn = screen.getByTestId('image-thumbnail-button');
      expect(thumbBtn).toBeInTheDocument();

      // Click to open zoom Dialog modal
      await user.click(thumbBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Dialog shows image and title
      expect(screen.getByRole('dialog')).toHaveTextContent('Schéma d\'architecture CQRS');
    });

    it('renders an sr-only DialogDescription when resource.note is absent', async () => {
      const user = userEvent.setup();
      const imageWithoutNote: LessonResourceItem = {
        id: 'img-no-note',
        type: 'image',
        title: 'Image Sans Note',
        url: 'https://example.com/no-note.png',
      };

      render(<ResourceCard resource={imageWithoutNote} />);
      const thumbBtn = screen.getByTestId('image-thumbnail-button');
      await user.click(thumbBtn);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      const desc = screen.getByRole('dialog').querySelector('.sr-only');
      expect(desc).toBeInTheDocument();
      expect(desc).toHaveTextContent(/Aperçu agrandi de l'image Image Sans Note/);
    });

    it('renders fallback state if image fails to load', async () => {
      render(<ResourceCard resource={imageResourceWithUrl} />);

      const img = screen.getByAltText('Schéma d\'architecture CQRS');
      fireEvent.error(img);

      await waitFor(() => {
        expect(screen.getByTestId('image-fallback')).toBeInTheDocument();
        expect(screen.getByTestId('image-fallback')).toHaveTextContent(/Impossible de charger l'aperçu/i);
      });
    });

    it('triggers attachment download when clicking Télécharger on image resource with proper attributes', async () => {
      const user = userEvent.setup();
      let requestedUrl = '';

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        requestedUrl = url;
        if (url.includes('/api/v1/resources/img-uuid-1/retrieval/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  url: 'https://s3.eu-west-3.amazonaws.com/brainx/signed-full.png',
                  expires_in: 3600,
                  content_type: 'image/png',
                  disposition: 'attachment',
                  filename: 'schema.png',
                })
              ),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      render(<ResourceCard resource={imageResourceWithUrl} />);

      const downloadBtn = screen.getByTestId('resource-download-button');
      expect(downloadBtn).toHaveAttribute('aria-label', 'Télécharger Schéma d\'architecture CQRS');
      await user.click(downloadBtn);

      await waitFor(() => {
        expect(requestedUrl).toContain('/api/v1/resources/img-uuid-1/retrieval/?disposition=attachment');
      });

      expect(clickMock).toHaveBeenCalled();
      expect(clickedAnchors.length).toBeGreaterThan(0);
      const anchor = clickedAnchors[0];
      expect(anchor.href).toBe('https://s3.eu-west-3.amazonaws.com/brainx/signed-full.png');
      expect(anchor.getAttribute('download')).toBe('schema.png');
      expect(anchor.getAttribute('target')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Video Resource Flow (16:9 Embed & School Network Fallback)
  // ---------------------------------------------------------------------------
  describe('Video Resource Flow', () => {
    const youtubeVideoResource: LessonResourceItem = {
      id: 'vid-uuid-1',
      type: 'video',
      title: 'Tutoriel Django Rest Framework',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      note: 'Démonstration complète de la création de points de terminaison',
    };

    const vimeoVideoResource: LessonResourceItem = {
      id: 'vid-uuid-2',
      type: 'video',
      title: 'Conférence Architecture Web',
      url: 'https://vimeo.com/76979871',
    };

    const invalidVideoResource: LessonResourceItem = {
      id: 'vid-uuid-3',
      type: 'video',
      title: 'Vidéo interne',
      url: 'https://internal-server.school.edu/videos/lesson1.mp4',
    };

    it('renders 16:9 responsive iframe and direct external link button in header', () => {
      render(<ResourceCard resource={youtubeVideoResource} />);

      expect(screen.getByTestId('resource-badge-video')).toBeInTheDocument();
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Tutoriel Django Rest Framework');
      expect(screen.getByTestId('video-host-label')).toHaveTextContent('www.youtube.com');

      // Video header direct link button allows immediate opening in new tab
      const headerDirectLink = screen.getByTestId('video-header-direct-link');
      expect(headerDirectLink).toBeInTheDocument();
      expect(headerDirectLink).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(headerDirectLink).toHaveAttribute('target', '_blank');
      expect(headerDirectLink).toHaveAttribute('rel', 'noopener noreferrer');

      const iframe = screen.getByTestId('video-iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      expect(iframe).toHaveAttribute('allowFullScreen');
      expect(iframe.parentElement?.className).toContain('aspect-video');
    });

    it('renders 16:9 responsive iframe for Vimeo video', () => {
      render(<ResourceCard resource={vimeoVideoResource} />);

      const iframe = screen.getByTestId('video-iframe');
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute('src', 'https://player.vimeo.com/video/76979871');
    });

    it('displays graceful fallback banner when iframe encounters school firewall or network error', async () => {
      render(<ResourceCard resource={youtubeVideoResource} />);

      const iframe = screen.getByTestId('video-iframe');
      fireEvent.error(iframe);

      await waitFor(() => {
        const fallbackBanner = screen.getByTestId('video-fallback-banner');
        expect(fallbackBanner).toBeInTheDocument();
        expect(fallbackBanner).toHaveTextContent(
          'Vidéo inaccessible sur ce réseau (www.youtube.com). Cliquez ici pour ouvrir le lien direct.'
        );
      });

      const directLink = screen.getByTestId('video-direct-link');
      expect(directLink).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(directLink).toHaveAttribute('target', '_blank');
      expect(directLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('displays fallback banner directly when video URL is not embeddable', () => {
      render(<ResourceCard resource={invalidVideoResource} />);

      const fallbackBanner = screen.getByTestId('video-fallback-banner');
      expect(fallbackBanner).toBeInTheDocument();
      expect(fallbackBanner).toHaveTextContent(
        'Vidéo inaccessible sur ce réseau (internal-server.school.edu). Cliquez ici pour ouvrir le lien direct.'
      );
    });

    it('does not render empty # link in fallback banner when resource.url is missing', () => {
      const videoWithoutUrl: LessonResourceItem = {
        id: 'vid-no-url',
        type: 'video',
        title: 'Vidéo sans URL',
        url: null,
      };

      render(<ResourceCard resource={videoWithoutUrl} />);
      const fallbackBanner = screen.getByTestId('video-fallback-banner');
      expect(fallbackBanner).toBeInTheDocument();
      expect(screen.queryByTestId('video-direct-link')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 6. External Link Resource Flow
  // ---------------------------------------------------------------------------
  describe('External Link Resource Flow', () => {
    const externalLinkResource: LessonResourceItem = {
      id: 'ext-uuid-1',
      type: 'external_link',
      title: 'Documentation Officielle MDN Web Docs',
      url: 'https://developer.mozilla.org/fr/docs/Web/HTTP',
      note: 'Spécifications sur les en-têtes HTTP et le protocole',
    };

    it('renders external link card with domain name and secure target=_blank and rel=noopener noreferrer', () => {
      render(<ResourceCard resource={externalLinkResource} />);

      expect(screen.getByTestId('resource-badge-external_link')).toBeInTheDocument();
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Documentation Officielle MDN Web Docs');
      expect(screen.getByTestId('external-link-domain')).toHaveTextContent('developer.mozilla.org');

      const linkButton = screen.getByTestId('external-link-button');
      expect(linkButton).toBeInTheDocument();
      expect(linkButton).toHaveAttribute('href', 'https://developer.mozilla.org/fr/docs/Web/HTTP');
      expect(linkButton).toHaveAttribute('target', '_blank');
      expect(linkButton).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Strict Glossary Terminology Check (No Forbidden Terms)
  // ---------------------------------------------------------------------------
  describe('Strict Glossary Terminology Verification', () => {
    it('never contains the forbidden terms "fichier", "media", or "pièce jointe" in UI', () => {
      const resources: LessonResourceItem[] = [
        { id: '1', type: 'document', title: 'Document de cours' },
        { id: '2', type: 'image', title: 'Image de schéma', url: 'https://example.com/img.png' },
        { id: '3', type: 'video', title: 'Vidéo explicative', url: 'https://youtube.com/watch?v=123' },
        { id: '4', type: 'external_link', title: 'Lien externe', url: 'https://example.org' },
      ];

      const { container } = render(
        <div>
          {resources.map((res) => (
            <ResourceCard key={res.id} resource={res} />
          ))}
        </div>
      );

      const visibleText = (container.textContent || '').toLowerCase();
      expect(visibleText).not.toMatch(/\bfichier\b/);
      expect(visibleText).not.toMatch(/\bfichiers\b/);
      expect(visibleText).not.toMatch(/\bmedia\b/);
      expect(visibleText).not.toMatch(/\bmédias\b/);
      expect(visibleText).not.toMatch(/\bmedias\b/);
      expect(visibleText).not.toMatch(/pièce jointe/);
      expect(visibleText).not.toMatch(/pièces jointes/);

      const ariaLabels = Array.from(container.querySelectorAll('[aria-label]'))
        .map((el) => el.getAttribute('aria-label') || '')
        .join(' ')
        .toLowerCase();
      expect(ariaLabels).not.toMatch(/\bfichier\b/);
      expect(ariaLabels).not.toMatch(/\bmedia\b/);
      expect(ariaLabels).not.toMatch(/pièce jointe/);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Default Fallback for Undefined Title & Props Change Reset
  // ---------------------------------------------------------------------------
  describe('Default Fallback for Undefined Title and Props Reset', () => {
    it('provides correct default localized fallback titles and aria labels when title is undefined', () => {
      const docNoTitle: LessonResourceItem = { id: 'd-notitle', type: 'document' };
      const imgNoTitle: LessonResourceItem = { id: 'i-notitle', type: 'image', url: 'https://example.com/x.png' };
      const vidNoTitle: LessonResourceItem = { id: 'v-notitle', type: 'video', url: 'https://vimeo.com/123' };
      const extNoTitle: LessonResourceItem = { id: 'e-notitle', type: 'external_link', url: 'https://example.com' };

      const { rerender } = render(<ResourceCard resource={docNoTitle} />);
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Document');
      expect(screen.getByTestId('resource-download-button')).toHaveAttribute('aria-label', 'Télécharger Document');

      rerender(<ResourceCard resource={imgNoTitle} />);
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Image');
      expect(screen.getByTestId('resource-download-button')).toHaveAttribute('aria-label', 'Télécharger Image');

      rerender(<ResourceCard resource={vidNoTitle} />);
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Vidéo');

      rerender(<ResourceCard resource={extNoTitle} />);
      expect(screen.getByTestId('resource-title')).toHaveTextContent('Lien externe');
      expect(screen.getByTestId('external-link-button')).toHaveAttribute('aria-label', 'Ouvrir le lien externe Lien externe');
    });

    it('resets error states when resource props change', async () => {
      const vidRes1: LessonResourceItem = {
        id: 'v1',
        type: 'video',
        title: 'Vidéo 1',
        url: 'https://youtube.com/watch?v=1',
      };
      const vidRes2: LessonResourceItem = {
        id: 'v2',
        type: 'video',
        title: 'Vidéo 2',
        url: 'https://youtube.com/watch?v=2',
      };

      const { rerender } = render(<ResourceCard resource={vidRes1} />);
      // Trigger error on video 1
      const iframe = screen.getByTestId('video-iframe');
      fireEvent.error(iframe);

      await waitFor(() => {
        expect(screen.getByTestId('video-fallback-banner')).toBeInTheDocument();
      });

      // Change prop to video 2
      rerender(<ResourceCard resource={vidRes2} />);

      // Should reset error and render fresh iframe
      expect(screen.getByTestId('video-iframe')).toBeInTheDocument();
      expect(screen.queryByTestId('video-fallback-banner')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. 360px Viewport Safety & Touch Target Verification
  // ---------------------------------------------------------------------------
  describe('360px Viewport Safety & Accessibility', () => {
    it('ensures buttons and links have min-h-[44px] and min-w-[44px] touch targets', () => {
      const docRes: LessonResourceItem = { id: 'd1', type: 'document', title: 'Doc' };
      const linkRes: LessonResourceItem = { id: 'l1', type: 'external_link', title: 'Link', url: 'https://ex.com' };

      const { rerender } = render(<ResourceCard resource={docRes} />);
      const downloadBtn = screen.getByTestId('resource-download-button');
      expect(downloadBtn.className).toMatch(/min-h-\[44px\]/);
      expect(downloadBtn.className).toMatch(/min-w-\[44px\]/);

      rerender(<ResourceCard resource={linkRes} />);
      const linkBtn = screen.getByTestId('external-link-button');
      expect(linkBtn.className).toMatch(/min-h-\[44px\]/);
      expect(linkBtn.className).toMatch(/min-w-\[44px\]/);
    });
  });
});
