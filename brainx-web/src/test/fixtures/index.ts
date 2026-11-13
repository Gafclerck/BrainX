/**
 * Centralized mock fixtures for BrainX Web Vitest test suite.
 * Avoids duplicated payload structures across tests and ensures schema consistency.
 */

export const mockTokens = {
  access: 'valid_student_jwt',
  refresh: 'valid_refresh_jwt',
};

export const mockPublisherTokens = {
  access: 'valid_publisher_jwt',
  refresh: 'valid_refresh_jwt',
};

export const mockStudentUser = {
  id: 'u1111111-1111-1111-1111-111111111111',
  email: 'student@brainx.org',
  full_name: 'Etudiant Test',
  is_publisher: false,
  is_email_verified: true,
};

export const mockPublisherUser = {
  id: 'u2222222-2222-2222-2222-222222222222',
  email: 'publisher@brainx.org',
  full_name: 'Prof. Ada Lovelace',
  is_publisher: true,
  is_email_verified: true,
};

export const mockCourse = {
  id: 'c1111111-1111-1111-1111-111111111111',
  name: 'Architecture Django & React',
  subject: 'Informatique',
  level: 'Master',
};

export const mockCoursesPaginated = {
  count: 2,
  next: null,
  previous: null,
  results: [
    { id: 'c1111111-1111-1111-1111-111111111111', name: 'Architecture Django & React' },
    { id: 'c2222222-2222-2222-2222-222222222222', name: 'Bases de Données Relationnelles' },
  ],
};

export const mockModule = {
  id: 'm1111111-1111-1111-1111-111111111111',
  name: 'Vues et Routage',
  course_id: 'c1111111-1111-1111-1111-111111111111',
  position: 1,
};

export const mockChapter = {
  id: 'ch111111-1111-1111-1111-111111111111',
  name: 'Vues Basées sur les Classes',
  module_id: 'm1111111-1111-1111-1111-111111111111',
  position: 1,
};

export const mockLesson = {
  id: 'l1111111-1111-1111-1111-111111111111',
  title: 'Introduction aux Vues Génériques Django',
  course_name: 'Architecture Django & React',
  module_name: 'Vues et Routage',
  chapter_name: 'Vues Basées sur les Classes',
  teacher: 'Prof. Ada Lovelace',
  course_date: '2026-10-28',
  status: 'published' as const,
  position: 1,
  resources: [
    { id: 'r1', type: 'document' as const, title: 'Support PDF', url: '/files/doc.pdf' },
    { id: 'r2', type: 'video' as const, title: 'Vidéo explicative', url: 'https://youtube.com/watch?v=xyz' },
  ],
};

export function createPaginatedResponse<T>(items: T[], total?: number) {
  return {
    count: total ?? items.length,
    next: null,
    previous: null,
    results: items,
  };
}
