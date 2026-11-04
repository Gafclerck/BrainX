import { Routes, Route, Navigate } from 'react-router-dom';
import { RegisterPage } from '@/features/auth/register-page';
import { LoginPage } from '@/features/auth/login-page';
import { VerifyEmailPage } from '@/features/auth/verify-email-page';
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';
import { LandingPage } from '@/features/landing/landing-page';
import { StudentLayout } from '@/components/layout/student-layout';
import { AuthGuard, PublisherGuard, GuestGuard } from './guards';
import {
  CoursesPage,
  CourseModulesPage,
  ModuleChaptersPage,
  ChapterLessonsPage,
  LessonDetailPage,
  BrowseTreeSidebar,
} from '@/features/browse';
import {
  PublisherDashboardPage,
  PublisherCoursePage,
  PublisherLessonPage,
  PublisherTrashPage,
  SearchAnalyticsDashboardPage,
} from '@/features/publisher';

export function CoursesPagePlaceholder() {
  return (
    <div
      data-testid="courses-page-placeholder"
      className="w-full py-12 bg-background text-foreground flex items-center justify-center p-4 min-w-[360px]"
    >
      <div className="rounded-lg border border-border bg-card p-6 max-w-md w-full text-center space-y-3">
        <h1 className="text-xl font-bold">Catalogue des Cours</h1>
        <p className="text-sm text-foreground-muted">
          Bienvenue sur BrainX. Les cours et ressources pédagogiques seront affichés ici.
        </p>
      </div>
    </div>
  );
}

export function SearchPagePlaceholder() {
  return (
    <div
      data-testid="search-page-placeholder"
      className="w-full py-12 bg-background text-foreground flex items-center justify-center p-4 min-w-[360px]"
    >
      <div className="rounded-lg border border-border bg-card p-6 max-w-md w-full text-center space-y-3">
        <h1 className="text-xl font-bold">Recherche</h1>
        <p className="text-sm text-foreground-muted">
          Recherchez des cours, des leçons et des ressources pédagogiques.
        </p>
      </div>
    </div>
  );
}

export function PublisherPagePlaceholder() {
  return (
    <div
      data-testid="publisher-page-placeholder"
      className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 min-w-[360px]"
    >
      <div className="rounded-lg border border-border bg-card p-6 max-w-md w-full text-center space-y-3">
        <h1 className="text-xl font-bold">Espace Éditeur</h1>
        <p className="text-sm text-foreground-muted">
          Bienvenue dans l'espace réservé aux éditeurs de contenus pédagogiques.
        </p>
      </div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Guest-only routes */}
      <Route element={<GuestGuard />}>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Authenticated student routes */}
      <Route element={<AuthGuard />}>
        <Route element={<StudentLayout sidebar={<BrowseTreeSidebar />} />}>
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CourseModulesPage />} />
          <Route path="/modules/:moduleId" element={<ModuleChaptersPage />} />
          <Route path="/chapters/:chapterId" element={<ChapterLessonsPage />} />
          <Route path="/lessons/:lessonId" element={<LessonDetailPage />} />
          <Route path="/search" element={<SearchPagePlaceholder />} />
        </Route>
      </Route>

      {/* Authenticated publisher routes */}
      <Route element={<PublisherGuard />}>
        <Route path="/publisher" element={<PublisherDashboardPage />} />
        <Route path="/publisher/dashboard" element={<PublisherDashboardPage />} />
        <Route path="/publisher/trash" element={<PublisherTrashPage />} />
        <Route path="/publisher/search-analytics" element={<SearchAnalyticsDashboardPage />} />
        <Route path="/publisher/courses/:courseId" element={<PublisherCoursePage />} />
        <Route path="/publisher/lessons/:lessonId" element={<PublisherLessonPage />} />
        <Route path="/publisher/*" element={<PublisherPagePlaceholder />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
