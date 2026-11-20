import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  bulkUnpublishModule,
  bulkUnpublishChapter,
  PublisherCoursePage,
} from './index';
import type {
  PublisherCourseItem,
  PublisherModuleItem,
  PublisherChapterItem,
} from './types';

const mockCourse: PublisherCourseItem = {
  id: 'c1111111-1111-1111-1111-111111111111',
  name: 'Architecture Logicielle',
  subject: 'Informatique',
  position: 1,
  is_deleted: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
};

const mockModule: PublisherModuleItem = {
  id: 'm1111111-1111-1111-1111-111111111111',
  name: 'Microservices & Patterns',
  position: 1,
  is_deleted: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
};

const mockChapter: PublisherChapterItem = {
  id: 'ch111111-1111-1111-1111-111111111111',
  name: 'Domain-Driven Design',
  position: 1,
  is_deleted: false,
  last_modified_by: { id: 'u1', email: 'publisher@brainx.edu' },
  updated_at: '2026-11-04T10:00:00Z',
};

function setupPublisherAuth() {
  useAuthStore.getState().setTokens({
    access: 'valid_publisher_token',
    refresh: 'valid_refresh_token',
  });
  useAuthStore.getState().setUser({
    id: 'u1',
    email: 'publisher@brainx.edu',
    is_publisher: true,
  });
  useAuthStore.getState().setIsPublisher(true);
}

describe('Bulk Unpublish Features', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupPublisherAuth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bulkUnpublishModule dispatches POST /api/v1/modules/:id/bulk-unpublish/', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ changed: 5 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await bulkUnpublishModule(mockModule.id);
    expect(result).toEqual({ changed: 5 });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/modules/${mockModule.id}/bulk-unpublish/`),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('bulkUnpublishChapter dispatches POST /api/v1/chapters/:id/bulk-unpublish/', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ changed: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await bulkUnpublishChapter(mockChapter.id);
    expect(result).toEqual({ changed: 3 });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/chapters/${mockChapter.id}/bulk-unpublish/`),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('opens confirmation dialog when clicking Dépublier tout on a module', async () => {
    const user = userEvent.setup();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes(`/api/v1/courses/${mockCourse.id}/modules/`)) {
        return new Response(JSON.stringify({ count: 1, next: null, results: [mockModule] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(`/api/v1/courses/${mockCourse.id}/`)) {
        return new Response(JSON.stringify(mockCourse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(`/api/v1/modules/${mockModule.id}/chapters/`)) {
        return new Response(JSON.stringify({ count: 1, next: null, results: [mockChapter] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(
      <MemoryRouter initialEntries={[`/publisher/courses/${mockCourse.id}`]}>
        <Routes>
          <Route path="/publisher/courses/:courseId" element={<PublisherCoursePage />} />
        </Routes>
      </MemoryRouter>
    );

    const unpublishModuleBtn = await screen.findByTestId(`bulk-unpublish-module-btn-${mockModule.id}`);
    expect(unpublishModuleBtn).toBeInTheDocument();

    await user.click(unpublishModuleBtn);

    const dialog = await screen.findByTestId('bulk-unpublish-dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Confirmer la dépublication/i)).toBeInTheDocument();

    const cancelBtn = screen.getByTestId('bulk-unpublish-cancel-btn');
    await user.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('bulk-unpublish-dialog')).not.toBeInTheDocument();
    });
  });
});
