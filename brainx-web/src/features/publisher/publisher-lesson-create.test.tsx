import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LessonFormModal } from './components/lesson-form-modal';
import { PublisherDashboardPage } from './components/publisher-dashboard-page';
import * as api from './api';
import { ApiError } from '@/lib/api';
import type { PublisherLessonItem, CurriculumSyncResponse } from './types';

const mockCreatedLesson: PublisherLessonItem = {
  id: 'l1111111-1111-1111-1111-111111111111',
  chapter_id: 'ch111111-1111-1111-1111-111111111111',
  title: 'Architecture JVM et Compilation',
  teacher: 'Professeur Baila Wane',
  course_date: '2026-11-20',
  description: 'Introduction aux principes de la JVM',
  keywords: 'Java, JVM, Bytecode',
  position: 1,
  is_published: false,
  is_deleted: false,
  last_modified_by: {
    id: 'u1111111-1111-1111-1111-111111111111',
    email: 'publisher@brainx.edu',
  },
  updated_at: '2026-11-20T10:00:00Z',
};

describe('LessonFormModal Component', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal when open with default values', () => {
    render(
      <LessonFormModal
        isOpen={true}
        onClose={onClose}
        chapterId="ch111111-1111-1111-1111-111111111111"
        chapterName="Écosystème Java"
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId('lesson-form-modal')).toBeInTheDocument();
    expect(screen.getByTestId('lesson-form-title')).toHaveTextContent('Nouvelle Leçon');
    expect(screen.getByTestId('lesson-form-description')).toHaveTextContent('Écosystème Java');
    expect(screen.getByTestId('lesson-title-input')).toHaveValue('');
    expect(screen.getByTestId('lesson-teacher-input')).toHaveValue('');
    expect(screen.getByTestId('lesson-course-date-input')).not.toHaveValue('');
  });

  it('blocks submission and displays errors when required fields are empty', async () => {
    const user = userEvent.setup();

    render(
      <LessonFormModal
        isOpen={true}
        onClose={onClose}
        chapterId="ch111111-1111-1111-1111-111111111111"
        onSuccess={onSuccess}
      />
    );

    // Clear course_date to trigger all validations
    const dateInput = screen.getByTestId('lesson-course-date-input');
    await user.clear(dateInput);

    const submitBtn = screen.getByTestId('lesson-form-submit-btn');
    await user.click(submitBtn);

    expect(screen.getByTestId('lesson-title-error')).toHaveTextContent('Le titre est obligatoire.');
    expect(screen.getByTestId('lesson-teacher-error')).toHaveTextContent("Le nom de l'enseignant est obligatoire.");
    expect(screen.getByTestId('lesson-course-date-error')).toHaveTextContent('La date du cours est obligatoire.');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('submits valid data, calls createLesson API, and invokes onSuccess', async () => {
    const user = userEvent.setup();
    const createLessonSpy = vi.spyOn(api, 'createLesson').mockResolvedValue(mockCreatedLesson);

    render(
      <LessonFormModal
        isOpen={true}
        onClose={onClose}
        chapterId="ch111111-1111-1111-1111-111111111111"
        onSuccess={onSuccess}
      />
    );

    await user.type(screen.getByTestId('lesson-title-input'), 'Architecture JVM et Compilation');
    await user.type(screen.getByTestId('lesson-teacher-input'), 'Professeur Baila Wane');
    await user.type(screen.getByTestId('lesson-keywords-input'), 'Java, JVM');
    await user.type(screen.getByTestId('lesson-description-input'), 'Intro JVM');

    await user.click(screen.getByTestId('lesson-form-submit-btn'));

    await waitFor(() => {
      expect(createLessonSpy).toHaveBeenCalledWith(
        'ch111111-1111-1111-1111-111111111111',
        expect.objectContaining({
          title: 'Architecture JVM et Compilation',
          teacher: 'Professeur Baila Wane',
          keywords: 'Java, JVM',
          description: 'Intro JVM',
        })
      );
      expect(onSuccess).toHaveBeenCalledWith(mockCreatedLesson);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('handles API 400 validation errors and displays them on respective fields', async () => {
    const user = userEvent.setup();
    const apiError = new ApiError({
      type: 'https://brainx.edu/errors/validation',
      status: 400,
      title: 'Bad Request',
      detail: 'Données invalides',
      errors: {
        title: ['Un cours avec ce titre existe déjà.'],
      },
    });

    vi.spyOn(api, 'createLesson').mockRejectedValue(apiError);

    render(
      <LessonFormModal
        isOpen={true}
        onClose={onClose}
        chapterId="ch111111-1111-1111-1111-111111111111"
        onSuccess={onSuccess}
      />
    );

    await user.type(screen.getByTestId('lesson-title-input'), 'Doublon Titre');
    await user.type(screen.getByTestId('lesson-teacher-input'), 'Professeur X');

    await user.click(screen.getByTestId('lesson-form-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('lesson-title-error')).toHaveTextContent('Un cours avec ce titre existe déjà.');
      expect(screen.getByTestId('lesson-form-error')).toHaveTextContent('Données invalides');
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('PublisherDashboardPage Curriculum Sync Integration', () => {
  it('triggers syncCurriculum on clicking "Synchroniser Curriculum" and displays success alert', async () => {
    const user = userEvent.setup();

    const mockSyncResponse: CurriculumSyncResponse = {
      status: 'success',
      dry_run: false,
      counts: {
        courses: 5,
        modules: 15,
        chapters: 32,
        lessons: 64,
        resources: 12,
      },
      errors: [],
    };

    vi.spyOn(api, 'fetchManageableCourses').mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const syncSpy = vi.spyOn(api, 'syncCurriculum').mockResolvedValue(mockSyncResponse);

    render(
      <MemoryRouter>
        <PublisherDashboardPage />
      </MemoryRouter>
    );

    const syncBtn = await screen.findByTestId('sync-curriculum-btn');
    expect(syncBtn).toBeInTheDocument();

    await user.click(syncBtn);

    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalled();
      const alert = screen.getByTestId('sync-curriculum-alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Synchronisation réussie : 5 cours, 15 modules, 32 chapitres, 64 leçons et 12 ressources');
    });
  });
});
