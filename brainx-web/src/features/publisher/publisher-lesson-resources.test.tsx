import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import { AppRoutes } from '@/routes';
import {
  ResourceFormModal,
  fetchManageableResources,
  createResource,
  deleteResource,
} from './index';
import type {
  PublisherLessonItem,
  PublisherResourceItem,
  CreateResourcePayload,
} from './types';

const mockLesson: PublisherLessonItem = {
  id: 'l1111111-1111-1111-1111-111111111111',
  chapter_id: 'ch111111-1111-1111-1111-111111111111',
  title: 'Introduction aux Architectures Distribuées',
  description: 'Une vue d’ensemble complète des modèles de consistance.',
  teacher: 'Prof. Ada Lovelace',
  course_date: '2026-10-31',
  keywords: 'distribué, raft, consensus',
  position: 1,
  is_deleted: false,
  is_published: true,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T09:00:00Z',
};

const mockDocumentResource: PublisherResourceItem = {
  id: 'r1111111-1111-1111-1111-111111111111',
  type: 'document',
  title: 'Polycopié de Cours - Chapitre 1',
  note: 'À lire avant la première séance.',
  url: null,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T10:00:00Z',
};

const mockImageResource: PublisherResourceItem = {
  id: 'r2222222-2222-2222-2222-222222222222',
  type: 'image',
  title: 'Diagramme d’Architecture Raft',
  note: 'Schéma de transition des états de nœud.',
  url: null,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T10:05:00Z',
};

const mockVideoResource: PublisherResourceItem = {
  id: 'r3333333-3333-3333-3333-333333333333',
  type: 'video',
  title: 'Conférence - Consensus Distribué',
  note: 'Enregistrement de la session du MIT.',
  url: 'https://video.example.com/lecture-distributed-systems',
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T10:10:00Z',
};

const mockLinkResource: PublisherResourceItem = {
  id: 'r4444444-4444-4444-4444-444444444444',
  type: 'external_link',
  title: 'Spécification Officielle Raft (Ongaro & Ousterhout)',
  note: 'Papier de recherche original Stanford.',
  url: 'https://raft.github.io/raft.pdf',
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T10:15:00Z',
};

const mockDeletedResource: PublisherResourceItem = {
  id: 'r5555555-5555-5555-5555-555555555555',
  type: 'document',
  title: 'Ancienne version obsolète',
  note: null,
  url: null,
  is_deleted: true,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-10-31T10:20:00Z',
};

function setupPublisherAuth() {
  useAuthStore.getState().setTokens({
    access: 'mock-access-token',
    refresh: 'mock-refresh-token',
  });
  useAuthStore.getState().setUser({
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
    is_publisher: true,
  });
  useAuthStore.getState().setIsPublisher(true);
}

function setupStudentAuth() {
  useAuthStore.getState().setTokens({
    access: 'mock-access-token',
    refresh: 'mock-refresh-token',
  });
  useAuthStore.getState().setUser({
    id: 'u9999999-9999-9999-9999-999999999999',
    email: 'student@brainx.edu',
    is_publisher: false,
  });
  useAuthStore.getState().setIsPublisher(false);
}

describe('Story FE-4.5: Gestion des Ressources : Téléversement Multipart & Intégration Externe', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
    setupPublisherAuth();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // 1. Client API Service Functions & Multipart Handling
  // =========================================================================
  describe('Client API Services & Multipart Handling (api.ts)', () => {
    it('fetchManageableResources queries GET /api/v1/lessons/:id/resources/ and unwraps paginated pages', async () => {
      let page1Called = false;
      let page2Called = false;

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/?page=2`)) {
          page2Called = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 2,
                  next: null,
                  previous: '...page=1',
                  results: [mockVideoResource],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          page1Called = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 2,
                  next: `http://localhost/api/v1/lessons/${mockLesson.id}/resources/?page=2`,
                  previous: null,
                  results: [mockDocumentResource],
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const results = await fetchManageableResources(mockLesson.id);

      expect(page1Called).toBe(true);
      expect(page2Called).toBe(true);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(mockDocumentResource.id);
      expect(results[1].id).toBe(mockVideoResource.id);
    });

    it('createResource sends multipart/form-data for document type without setting Content-Type header', async () => {
      let capturedBody: any = null;
      let capturedHeaders: any = null;

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`) && opts?.method === 'POST') {
          capturedBody = opts.body;
          capturedHeaders = opts.headers;
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify(mockDocumentResource)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const testFile = new File(['%PDF-1.4 dummy content'], 'cours.pdf', {
        type: 'application/pdf',
      });

      const payload: CreateResourcePayload = {
        type: 'document',
        title: 'Polycopié de Cours',
        note: 'À lire avant la première séance.',
        file: testFile,
      };

      const result = await createResource(mockLesson.id, payload);

      expect(result.id).toBe(mockDocumentResource.id);
      expect(capturedBody).toBeInstanceOf(FormData);
      expect(capturedBody.get('type')).toBe('document');
      expect(capturedBody.get('title')).toBe('Polycopié de Cours');
      expect(capturedBody.get('note')).toBe('À lire avant la première séance.');
      expect(capturedBody.get('file')).toBe(testFile);
      // Ensure Content-Type is not set to application/json so browser generates boundary
      expect(capturedHeaders['Content-Type']).toBeUndefined();
      expect(capturedHeaders['content-type']).toBeUndefined();
    });

    it('createResource sends multipart/form-data for image type without setting Content-Type header', async () => {
      let capturedBody: any = null;
      let capturedHeaders: any = null;

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`) && opts?.method === 'POST') {
          capturedBody = opts.body;
          capturedHeaders = opts.headers;
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify(mockImageResource)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const testImage = new File(['dummy-png-bytes'], 'architecture.png', {
        type: 'image/png',
      });

      const payload: CreateResourcePayload = {
        type: 'image',
        title: 'Diagramme d’Architecture Raft',
        note: 'Schéma de transition des états de nœud.',
        file: testImage,
      };

      const result = await createResource(mockLesson.id, payload);

      expect(result.id).toBe(mockImageResource.id);
      expect(capturedBody).toBeInstanceOf(FormData);
      expect(capturedBody.get('type')).toBe('image');
      expect(capturedBody.get('title')).toBe('Diagramme d’Architecture Raft');
      expect(capturedBody.get('note')).toBe('Schéma de transition des états de nœud.');
      expect(capturedBody.get('file')).toBe(testImage);
      expect(capturedHeaders['Content-Type']).toBeUndefined();
      expect(capturedHeaders['content-type']).toBeUndefined();
    });

    it('createResource sends JSON payload for video and external_link types', async () => {
      let capturedBody: any = null;
      let capturedHeaders: any = null;

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`) && opts?.method === 'POST') {
          capturedBody = JSON.parse(opts.body);
          capturedHeaders = opts.headers;
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify(mockVideoResource)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const payload: CreateResourcePayload = {
        type: 'video',
        title: 'Conférence - Consensus Distribué',
        note: 'Enregistrement de la session.',
        url: 'https://video.example.com/lecture',
      };

      const result = await createResource(mockLesson.id, payload);

      expect(result.id).toBe(mockVideoResource.id);
      expect(capturedHeaders['Content-Type']).toBe('application/json');
      expect(capturedBody).toEqual({
        type: 'video',
        title: 'Conférence - Consensus Distribué',
        note: 'Enregistrement de la session.',
        url: 'https://video.example.com/lecture',
      });
    });

    it('deleteResource dispatches DELETE /api/v1/resources/:resourceId/', async () => {
      let deleteCalled = false;

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/resources/${mockDocumentResource.id}/`) && opts?.method === 'DELETE') {
          deleteCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({ ...mockDocumentResource, is_deleted: true })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const deleted = await deleteResource(mockDocumentResource.id);

      expect(deleteCalled).toBe(true);
      expect(deleted.is_deleted).toBe(true);
    });
  });

  // =========================================================================
  // 2. ResourceFormModal Component
  // =========================================================================
  describe('ResourceFormModal Component', () => {
    it('renders accessible modal dialog with all 4 resource types in select dropdown', () => {
      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByTestId('resource-form-modal')).toBeInTheDocument();
      expect(screen.getByTestId('resource-modal-title')).toHaveTextContent(
        'Ajouter une ressource pédagogique'
      );

      const typeSelect = screen.getByTestId('resource-type-select');
      expect(typeSelect).toBeInTheDocument();
      expect(typeSelect).toHaveValue('document');

      const options = screen.getAllByRole('option');
      expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
        'document',
        'image',
        'video',
        'external_link',
      ]);
    });

    it('conditionally switches between file input and URL input based on type selection', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      // Default: document -> file input is present, url input is not
      expect(screen.getByTestId('resource-file-input')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-url-input')).not.toBeInTheDocument();

      // Switch to image -> file input is present, url input is not
      await user.selectOptions(screen.getByTestId('resource-type-select'), 'image');
      expect(screen.getByTestId('resource-file-input')).toBeInTheDocument();
      expect(screen.queryByTestId('resource-url-input')).not.toBeInTheDocument();

      // Switch to video -> file input is hidden, url input is present
      await user.selectOptions(screen.getByTestId('resource-type-select'), 'video');
      expect(screen.queryByTestId('resource-file-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-url-input')).toBeInTheDocument();

      // Switch to external_link -> file input is hidden, url input is present
      await user.selectOptions(screen.getByTestId('resource-type-select'), 'external_link');
      expect(screen.queryByTestId('resource-file-input')).not.toBeInTheDocument();
      expect(screen.getByTestId('resource-url-input')).toBeInTheDocument();
    });

    it('resets file state and file input value when switching between types', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      const validPdf = new File(['%PDF-1.4'], 'notes.pdf', {
        type: 'application/pdf',
      });
      const fileInput = screen.getByTestId('resource-file-input') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [validPdf] } });

      // Switch type from document to image
      await user.selectOptions(screen.getByTestId('resource-type-select'), 'image');

      // The file input value should be reset
      expect(fileInput.value).toBe('');

      // Submitting without choosing a new image file blocks submission
      await user.type(screen.getByTestId('resource-title-input'), 'Schéma sans fichier');
      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-file-error')).toHaveTextContent(
        'Veuillez sélectionner un fichier.'
      );
    });

    it('client validation rejects empty title and focuses title input', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      const titleInput = screen.getByTestId('resource-title-input');
      expect(titleInput).toHaveValue('');

      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-title-error')).toHaveTextContent(
        'Le titre est obligatoire.'
      );
      expect(titleInput).toHaveFocus();
    });

    it('client validation rejects missing file on document upload', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.type(screen.getByTestId('resource-title-input'), 'Polycopié');
      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-file-error')).toHaveTextContent(
        'Veuillez sélectionner un fichier.'
      );
      expect(screen.getByTestId('resource-file-input')).toHaveFocus();
    });

    it('client validation rejects disallowed extension for document (.docx or .exe)', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.type(screen.getByTestId('resource-title-input'), 'Support Cours');

      const invalidFile = new File(['content'], 'cours.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const fileInput = screen.getByTestId('resource-file-input');
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-file-error')).toHaveTextContent(
        'Les extensions autorisées pour un document sont : .pdf'
      );
      expect(fileInput).toHaveFocus();
    });

    it('client validation rejects disallowed extension for image (.gif or .svg)', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.selectOptions(screen.getByTestId('resource-type-select'), 'image');
      await user.type(screen.getByTestId('resource-title-input'), 'Illustration');

      const gifFile = new File(['gif content'], 'animation.gif', {
        type: 'image/gif',
      });
      const fileInput = screen.getByTestId('resource-file-input');
      fireEvent.change(fileInput, { target: { files: [gifFile] } });

      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-file-error')).toHaveTextContent(
        'Les extensions autorisées pour une image sont : .png, .jpg, .jpeg, .webp'
      );
      expect(fileInput).toHaveFocus();
    });

    it('client validation rejects file exceeding 50 MB ceiling', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.type(screen.getByTestId('resource-title-input'), 'Gros PDF');

      // Create dummy file with mocked size > 50MB (52,428,801 bytes)
      const hugeFile = new File(['dummy'], 'huge.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(hugeFile, 'size', {
        value: 52_428_801,
        configurable: true,
      });

      const fileInput = screen.getByTestId('resource-file-input');
      await user.upload(fileInput, hugeFile);

      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-file-error')).toHaveTextContent(
        'Le fichier ne doit pas dépasser 50 Mo.'
      );
      expect(fileInput).toHaveFocus();
    });

    it('client validation rejects invalid URL scheme for video/external_link', async () => {
      const user = userEvent.setup({ delay: null });

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.selectOptions(screen.getByTestId('resource-type-select'), 'video');
      await user.type(screen.getByTestId('resource-title-input'), 'Lien Suspect');

      const urlInput = screen.getByTestId('resource-url-input');

      // Test unsafe scheme: javascript:
      await user.type(urlInput, 'javascript:alert(1)');
      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-url-error')).toHaveTextContent(
        "L'URL doit obligatoirement commencer par http:// ou https://"
      );
      expect(urlInput).toHaveFocus();

      // Test ftp scheme
      await user.clear(urlInput);
      await user.type(urlInput, 'ftp://files.example.com/video.mp4');
      await user.click(screen.getByTestId('submit-resource-btn'));

      expect(screen.getByTestId('resource-url-error')).toHaveTextContent(
        "L'URL doit obligatoirement commencer par http:// ou https://"
      );
    });

    it('maps backend RFC 9457 400 validation error dictionaries onto form inputs', async () => {
      const user = userEvent.setup({ delay: null });

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`) && opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'validation_error',
                  title: 'Validation Error',
                  status: 400,
                  detail: 'Les champs fournis sont invalides.',
                  errors: {
                    title: ['Ce titre de ressource existe déjà.'],
                    file: ['Le fichier téléversé est corrompu ou illisible.'],
                  },
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.type(screen.getByTestId('resource-title-input'), 'Titre Existant');
      const validPdf = new File(['%PDF-1.4'], 'notes.pdf', {
        type: 'application/pdf',
      });
      await user.upload(screen.getByTestId('resource-file-input'), validPdf);

      await user.click(screen.getByTestId('submit-resource-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('resource-title-error')).toHaveTextContent(
          'Ce titre de ressource existe déjà.'
        );
        expect(screen.getByTestId('resource-file-error')).toHaveTextContent(
          'Le fichier téléversé est corrompu ou illisible.'
        );
      });

      // Modal stays open and input is focused
      expect(screen.getByTestId('resource-form-modal')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId('resource-title-input')).toHaveFocus();
      });
    });

    it('displays non_field_errors in modal error banner without leaking prefix', async () => {
      const user = userEvent.setup({ delay: null });

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`) && opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'validation_error',
                  title: 'Validation Error',
                  status: 400,
                  detail: 'Impossible de créer la ressource.',
                  errors: {
                    non_field_errors: [
                      'La limite de quota de stockage de la leçon est atteinte.',
                    ],
                  },
                })
              ),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={vi.fn()}
          lessonId={mockLesson.id}
          onSuccess={vi.fn()}
        />
      );

      await user.type(screen.getByTestId('resource-title-input'), 'Nouveau PDF');
      const validPdf = new File(['%PDF-1.4'], 'cours.pdf', {
        type: 'application/pdf',
      });
      const fileInput = screen.getByTestId('resource-file-input');
      fireEvent.change(fileInput, { target: { files: [validPdf] } });

      await user.click(screen.getByTestId('submit-resource-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('resource-modal-error')).toBeInTheDocument();
      });

      const banner = screen.getByTestId('resource-modal-error');
      expect(banner).toHaveTextContent(
        'La limite de quota de stockage de la leçon est atteinte.'
      );
      expect(banner).not.toHaveTextContent('non_field_errors:');
    });

    it('submits valid document resource and calls onSuccess callback', async () => {
      const user = userEvent.setup({ delay: null });
      const onSuccessSpy = vi.fn();
      const onCloseSpy = vi.fn();

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`) && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve(JSON.stringify(mockDocumentResource)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <ResourceFormModal
          isOpen={true}
          onClose={onCloseSpy}
          lessonId={mockLesson.id}
          onSuccess={onSuccessSpy}
        />
      );

      await user.type(screen.getByTestId('resource-title-input'), 'Polycopié de Cours');
      await user.type(screen.getByTestId('resource-note-input'), 'À lire avant la première séance.');

      const validPdf = new File(['%PDF-1.4 test'], 'cours.pdf', {
        type: 'application/pdf',
      });
      await user.upload(screen.getByTestId('resource-file-input'), validPdf);

      await user.click(screen.getByTestId('submit-resource-btn'));

      await waitFor(() => {
        expect(onSuccessSpy).toHaveBeenCalledWith(mockDocumentResource);
        expect(onCloseSpy).toHaveBeenCalled();
      });
    });
  });

  // =========================================================================
  // 3. PublisherLessonPage Integration (Resources Section, Soft-Delete, Links)
  // =========================================================================
  describe('PublisherLessonPage Resources Integration', () => {
    it('loads and renders existing resources with badges, titles, notes, and external links', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 4,
                  next: null,
                  previous: null,
                  results: [
                    mockDocumentResource,
                    mockImageResource,
                    mockVideoResource,
                    mockLinkResource,
                    mockDeletedResource, // Should be filtered out from active list
                  ],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('resources-section-heading')).toBeInTheDocument();
      });

      // All active resources rendered
      await waitFor(() => {
        expect(screen.getByTestId(`resource-card-${mockDocumentResource.id}`)).toBeInTheDocument();
        expect(screen.getByTestId(`resource-card-${mockImageResource.id}`)).toBeInTheDocument();
        expect(screen.getByTestId(`resource-card-${mockVideoResource.id}`)).toBeInTheDocument();
        expect(screen.getByTestId(`resource-card-${mockLinkResource.id}`)).toBeInTheDocument();
      });

      // Soft-deleted resource is filtered out
      expect(
        screen.queryByTestId(`resource-card-${mockDeletedResource.id}`)
      ).not.toBeInTheDocument();

      // Check badges
      expect(screen.getByTestId('resource-badge-document')).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-image')).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-video')).toBeInTheDocument();
      expect(screen.getByTestId('resource-badge-external_link')).toBeInTheDocument();

      // Check external links have safe attributes
      const videoLink = screen.getByTestId(`resource-link-${mockVideoResource.id}`);
      expect(videoLink).toHaveAttribute('href', mockVideoResource.url);
      expect(videoLink).toHaveAttribute('target', '_blank');
      expect(videoLink).toHaveAttribute('rel', 'noreferrer noopener');

      const extLink = screen.getByTestId(`resource-link-${mockLinkResource.id}`);
      expect(extLink).toHaveAttribute('href', mockLinkResource.url);
      expect(extLink).toHaveAttribute('target', '_blank');
      expect(extLink).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('renders empty state when no resources are attached', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 0,
                  next: null,
                  previous: null,
                  results: [],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('resources-empty-state')).toBeInTheDocument();
      });

      expect(screen.getByTestId('resources-empty-state')).toHaveTextContent(
        'Aucune ressource pédagogique attachée à cette leçon.'
      );
    });

    it('displays error banner with retry button when resource fetching fails', async () => {
      let attempts = 0;

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          attempts++;
          if (attempts === 1) {
            return Promise.resolve({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    type: 'server_error',
                    title: 'Server Error',
                    status: 500,
                    detail: 'Erreur réseau lors du chargement des ressources.',
                  })
                ),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockDocumentResource],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      const user = userEvent.setup({ delay: null });

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('resources-error-banner')).toBeInTheDocument();
      });

      // Click retry button
      const retryBtn = screen.getByTestId('retry-resources-btn');
      await user.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByTestId(`resource-card-${mockDocumentResource.id}`)).toBeInTheDocument();
      });

      expect(attempts).toBe(2);
    });

    it('opens ResourceFormModal on button click, submits a new resource, and updates the list', async () => {
      const user = userEvent.setup({ delay: null });

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          if (opts?.method === 'POST') {
            return Promise.resolve({
              ok: true,
              status: 201,
              text: () => Promise.resolve(JSON.stringify(mockLinkResource)),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockDocumentResource],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('add-resource-btn')).toBeInTheDocument();
      });

      // Open modal
      await user.click(screen.getByTestId('add-resource-btn'));

      expect(screen.getByTestId('resource-form-modal')).toBeInTheDocument();

      // Fill external_link
      await user.selectOptions(screen.getByTestId('resource-type-select'), 'external_link');
      await user.type(
        screen.getByTestId('resource-title-input'),
        'Spécification Officielle Raft'
      );
      await user.type(
        screen.getByTestId('resource-url-input'),
        'https://raft.github.io/raft.pdf'
      );

      // Submit
      await user.click(screen.getByTestId('submit-resource-btn'));

      // Resource added to list and success notification visible
      await waitFor(() => {
        expect(screen.getByTestId('resource-action-success')).toBeInTheDocument();
        expect(screen.getByTestId(`resource-card-${mockLinkResource.id}`)).toBeInTheDocument();
      });

      expect(screen.getByTestId('resource-action-success')).toHaveTextContent(
        'Ressource ajoutée avec succès.'
      );
    });

    it('soft-deletes resource after confirmation in dialog and removes it from list', async () => {
      const user = userEvent.setup({ delay: null });

      let deleteDispatched = false;

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/resources/${mockDocumentResource.id}/`) && opts?.method === 'DELETE') {
          deleteDispatched = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({ ...mockDocumentResource, is_deleted: true })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockDocumentResource],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`delete-resource-btn-${mockDocumentResource.id}`)
        ).toBeInTheDocument();
      });

      // Click delete button
      await user.click(screen.getByTestId(`delete-resource-btn-${mockDocumentResource.id}`));

      // Confirmation modal is displayed
      expect(screen.getByTestId('delete-resource-modal')).toBeInTheDocument();
      expect(screen.getByTestId('delete-resource-modal-title')).toHaveTextContent(
        'Supprimer la ressource'
      );

      // Confirm deletion
      await user.click(screen.getByTestId('confirm-delete-resource-btn'));

      // Dispatches DELETE and removes item from list
      await waitFor(() => {
        expect(deleteDispatched).toBe(true);
        expect(screen.queryByTestId(`resource-card-${mockDocumentResource.id}`)).not.toBeInTheDocument();
        expect(screen.getByTestId('resource-action-success')).toHaveTextContent(
          'Ressource supprimée avec succès.'
        );
      });
    });

    it('cancelling deletion keeps the resource in the active list', async () => {
      const user = userEvent.setup({ delay: null });

      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockDocumentResource],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`delete-resource-btn-${mockDocumentResource.id}`)
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTestId(`delete-resource-btn-${mockDocumentResource.id}`));
      expect(screen.getByTestId('delete-resource-modal')).toBeInTheDocument();

      // Click cancel
      await user.click(screen.getByTestId('cancel-delete-resource-btn'));

      // Modal closed, resource still present
      await waitFor(() => {
        expect(screen.queryByTestId('delete-resource-modal')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId(`resource-card-${mockDocumentResource.id}`)).toBeInTheDocument();
    });

    it('displays error banner inside delete dialog when deletion fails on backend', async () => {
      const user = userEvent.setup({ delay: null });

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/resources/${mockDocumentResource.id}/`) && opts?.method === 'DELETE') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'server_error',
                  title: 'Server Error',
                  status: 500,
                  detail: 'Erreur serveur lors de la suppression de la ressource.',
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  count: 1,
                  next: null,
                  previous: null,
                  results: [mockDocumentResource],
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`delete-resource-btn-${mockDocumentResource.id}`)
        ).toBeInTheDocument();
      });

      await user.click(screen.getByTestId(`delete-resource-btn-${mockDocumentResource.id}`));

      expect(screen.getByTestId('delete-resource-modal')).toBeInTheDocument();

      await user.click(screen.getByTestId('confirm-delete-resource-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('resource-delete-error')).toBeInTheDocument();
      });

      expect(screen.getByTestId('resource-delete-error')).toHaveTextContent(
        'Erreur serveur lors de la suppression de la ressource.'
      );
      // Resource still present in the list
      expect(screen.getByTestId(`resource-card-${mockDocumentResource.id}`)).toBeInTheDocument();
    });

    it('clears resource error banner and sets resourcesStatus to success when resource is added via modal', async () => {
      const user = userEvent.setup({ delay: null });

      const fetchSpy = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/resources/`)) {
          if (opts?.method === 'POST') {
            return Promise.resolve({
              ok: true,
              status: 201,
              text: () => Promise.resolve(JSON.stringify(mockLinkResource)),
            });
          }
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  type: 'server_error',
                  title: 'Server Error',
                  status: 500,
                  detail: 'Erreur réseau initiale.',
                })
              ),
          });
        }
        if (url.includes(`/api/v1/lessons/${mockLesson.id}/`)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify(mockLesson)),
          });
        }
        return Promise.reject(new Error(`Unexpected call: ${url}`));
      });
      globalThis.fetch = fetchSpy;

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('resources-error-banner')).toBeInTheDocument();
      });

      // Open modal and add resource
      await user.click(screen.getByTestId('add-resource-btn'));
      expect(screen.getByTestId('resource-form-modal')).toBeInTheDocument();

      await user.selectOptions(screen.getByTestId('resource-type-select'), 'external_link');
      await user.type(screen.getByTestId('resource-title-input'), 'Nouveau Lien');
      await user.type(screen.getByTestId('resource-url-input'), 'https://example.com/doc');
      await user.click(screen.getByTestId('submit-resource-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('resources-error-banner')).not.toBeInTheDocument();
        expect(screen.getByTestId(`resource-card-${mockLinkResource.id}`)).toBeInTheDocument();
      });
    });

    it('blocks unauthenticated visitors and redirects with PublisherGuard', async () => {
      useAuthStore.getState().clearAuth();

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('publisher-lesson-page')).not.toBeInTheDocument();
      });
    });

    it('blocks student users (isPublisher === false) with PublisherGuard', async () => {
      setupStudentAuth();

      render(
        <MemoryRouter initialEntries={[`/publisher/lessons/${mockLesson.id}`]}>
          <AppRoutes />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('publisher-lesson-page')).not.toBeInTheDocument();
      });
    });
  });
});
