import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { StudentLayout } from './student-layout';
import { useAuthStore } from '@/features/auth/auth-store';

describe('Story FE-2.1: StudentLayout Component (3 Columns & Responsive Shell)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    window.localStorage?.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders root layout adhering to strict dark palette and 360px floor containment', () => {
    render(
      <MemoryRouter>
        <StudentLayout>
          <div>Contenu de test</div>
        </StudentLayout>
      </MemoryRouter>
    );

    const root = screen.getByTestId('student-layout');
    expect(root).toBeInTheDocument();
    expect(root.className).toContain('min-w-[360px]');
    expect(root.className).toContain('overflow-x-hidden');
    expect(root.className).toContain('bg-background');
    expect(root.className).toContain('text-foreground');
    expect(root.className).toContain('font-sans');
    expect(root.className).not.toContain('light');
    expect(document.querySelector('.light')).toBeNull();
  });

  it('renders 3 distinct documentation columns with design tokens (w-sidebar-width, max-w-content-max, w-toc-width)', () => {
    render(
      <MemoryRouter>
        <StudentLayout>
          <h1>Leçon 1: Architecture Django & React</h1>
        </StudentLayout>
      </MemoryRouter>
    );

    // Left navigation sidebar: fixed 280px via w-sidebar-width, desktop-only, sticky under header, independently scrollable
    const leftSidebar = screen.getByTestId('student-left-sidebar');
    expect(leftSidebar).toBeInTheDocument();
    expect(leftSidebar.className).toContain('w-sidebar-width');
    expect(leftSidebar.className).toContain('hidden');
    expect(leftSidebar.className).toContain('lg:block');
    expect(leftSidebar.className).toContain('sticky');
    expect(leftSidebar.className).toContain('overflow-y-auto');
    expect(leftSidebar.className).toContain('border-r');
    expect(leftSidebar.className).toContain('border-border');
    expect(leftSidebar).toHaveTextContent(/Sommaire du cours/i);

    // Central reading zone: flex-1 min-w-0 max-w-content-max mx-auto
    const mainContent = screen.getByTestId('student-main-content');
    expect(mainContent).toBeInTheDocument();
    expect(mainContent.className).toContain('max-w-content-max');
    expect(mainContent.className).toContain('min-w-0');
    expect(mainContent.className).toContain('flex-1');
    expect(mainContent.className).toContain('mx-auto');
    expect(mainContent).toHaveTextContent('Leçon 1: Architecture Django & React');

    // Right TOC rail: fixed 220px via w-toc-width, desktop-only, sticky under header, independently scrollable
    const rightToc = screen.getByTestId('student-right-toc');
    expect(rightToc).toBeInTheDocument();
    expect(rightToc.className).toContain('w-toc-width');
    expect(rightToc.className).toContain('hidden');
    expect(rightToc.className).toContain('lg:block');
    expect(rightToc.className).toContain('sticky');
    expect(rightToc.className).toContain('overflow-y-auto');
    expect(rightToc.className).toContain('border-l');
    expect(rightToc.className).toContain('border-border');
    expect(rightToc).toHaveTextContent(/Sur cette page/i);
  });

  it('provides mobile drawer trigger buttons with minimum 48x48px touch targets', () => {
    render(
      <MemoryRouter>
        <StudentLayout>
          <div>Contenu</div>
        </StudentLayout>
      </MemoryRouter>
    );

    // Left drawer toggle button
    const leftTrigger = screen.getByTestId('left-drawer-trigger');
    expect(leftTrigger).toBeInTheDocument();
    expect(leftTrigger).toHaveAttribute('aria-label', 'Sommaire du cours');
    expect(leftTrigger.className).toContain('min-h-[48px]');
    expect(leftTrigger.className).toContain('min-w-[48px]');
    expect(leftTrigger.className).toContain('h-12');
    expect(leftTrigger.className).toContain('w-12');

    // Right drawer toggle button
    const rightTrigger = screen.getByTestId('right-drawer-trigger');
    expect(rightTrigger).toBeInTheDocument();
    expect(rightTrigger).toHaveAttribute('aria-label', 'Sur cette page');
    expect(rightTrigger.className).toContain('min-h-[48px]');
    expect(rightTrigger.className).toContain('min-w-[48px]');
    expect(rightTrigger.className).toContain('h-12');
    expect(rightTrigger.className).toContain('w-12');
  });

  it('opens and closes mobile left drawer (Sommaire du cours) via trigger, Escape key, and close button', async () => {
    render(
      <MemoryRouter>
        <StudentLayout>
          <div>Contenu</div>
        </StudentLayout>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('left-drawer-content')).not.toBeInTheDocument();

    const leftTrigger = screen.getByTestId('left-drawer-trigger');
    await userEvent.click(leftTrigger);

    // Left drawer is now open
    const drawer = await screen.findByTestId('left-drawer-content');
    expect(drawer).toBeInTheDocument();
    expect(drawer.className).toContain('bg-surface');
    expect(drawer.className).toContain('border-border');
    expect(within(drawer).getByRole('heading', { level: 2, name: 'Sommaire du cours' })).toBeInTheDocument();

    // Close button has >= 48x48px touch target
    const closeBtn = screen.getByTestId('close-left-drawer');
    expect(closeBtn.className).toContain('min-h-[48px]');
    expect(closeBtn.className).toContain('min-w-[48px]');

    // Click close button
    await userEvent.click(closeBtn);
    expect(screen.queryByTestId('left-drawer-content')).not.toBeInTheDocument();

    // Re-open and close with Escape key
    await userEvent.click(leftTrigger);
    expect(await screen.findByTestId('left-drawer-content')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('left-drawer-content')).not.toBeInTheDocument();
  });

  it('closes mobile left drawer when a link inside it is clicked', async () => {
    render(
      <MemoryRouter>
        <StudentLayout>
          <div>Contenu</div>
        </StudentLayout>
      </MemoryRouter>
    );

    const leftTrigger = screen.getByTestId('left-drawer-trigger');
    await userEvent.click(leftTrigger);

    const drawer = await screen.findByTestId('left-drawer-content');
    expect(drawer).toBeInTheDocument();

    const overviewLink = within(drawer).getByRole('link', { name: "Vue d'ensemble" });
    await userEvent.click(overviewLink);

    expect(screen.queryByTestId('left-drawer-content')).not.toBeInTheDocument();
  });

  it('opens mobile right drawer (Sur cette page) and closes on link selection, close button, or Escape', async () => {
    render(
      <MemoryRouter>
        <StudentLayout>
          <div>Contenu</div>
        </StudentLayout>
      </MemoryRouter>
    );

    expect(screen.queryByTestId('right-drawer-content')).not.toBeInTheDocument();

    const rightTrigger = screen.getByTestId('right-drawer-trigger');
    await userEvent.click(rightTrigger);

    // Right drawer is now open
    const drawer = await screen.findByTestId('right-drawer-content');
    expect(drawer).toBeInTheDocument();
    expect(drawer.className).toContain('bg-surface');
    expect(drawer.className).toContain('border-border');
    expect(within(drawer).getByRole('heading', { level: 2, name: 'Sur cette page' })).toBeInTheDocument();

    // Close button has >= 48x48px touch target
    const closeBtn = screen.getByTestId('close-right-drawer');
    expect(closeBtn.className).toContain('min-h-[48px]');
    expect(closeBtn.className).toContain('min-w-[48px]');

    // Clicking a link inside the right drawer closes it
    const introLink = within(drawer).getByRole('link', { name: 'Introduction' });
    await userEvent.click(introLink);
    expect(screen.queryByTestId('right-drawer-content')).not.toBeInTheDocument();

    // Re-open and close with close button
    await userEvent.click(rightTrigger);
    expect(await screen.findByTestId('right-drawer-content')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('close-right-drawer'));
    expect(screen.queryByTestId('right-drawer-content')).not.toBeInTheDocument();

    // Re-open and close with Escape key
    await userEvent.click(rightTrigger);
    expect(await screen.findByTestId('right-drawer-content')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('right-drawer-content')).not.toBeInTheDocument();
  });

  it('auto-closes open mobile drawers when navigating to a new route', async () => {
    let navigateFn!: ReturnType<typeof useNavigate>;
    function NavigationHelper() {
      navigateFn = useNavigate();
      return null;
    }

    render(
      <MemoryRouter initialEntries={['/courses']}>
        <NavigationHelper />
        <StudentLayout>
          <div>Contenu</div>
        </StudentLayout>
      </MemoryRouter>
    );

    const leftTrigger = screen.getByTestId('left-drawer-trigger');
    await userEvent.click(leftTrigger);
    expect(await screen.findByTestId('left-drawer-content')).toBeInTheDocument();

    // Trigger route change via router navigation
    act(() => {
      navigateFn('/courses/module-1');
    });

    expect(screen.queryByTestId('left-drawer-content')).not.toBeInTheDocument();
  });

  it('supports custom sidebar and toc content nodes', async () => {
    render(
      <MemoryRouter>
        <StudentLayout
          sidebar={<div data-testid="custom-sidebar">Arborescence personnalisée</div>}
          toc={<div data-testid="custom-toc">Ancres personnalisées</div>}
        >
          <div data-testid="custom-content">Contenu principal</div>
        </StudentLayout>
      </MemoryRouter>
    );

    expect(screen.getByTestId('custom-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('custom-toc')).toBeInTheDocument();
    expect(screen.getByTestId('custom-content')).toBeInTheDocument();

    // Custom content is also passed to mobile drawers
    await userEvent.click(screen.getByTestId('left-drawer-trigger'));
    const drawers = screen.getAllByTestId('custom-sidebar');
    expect(drawers.length).toBeGreaterThanOrEqual(2); // In desktop aside and in mobile drawer
  });

  it('renders nested route Outlet when used as a layout route', () => {
    render(
      <MemoryRouter initialEntries={['/courses']}>
        <Routes>
          <Route element={<StudentLayout />}>
            <Route path="/courses" element={<div data-testid="courses-route-content">Page Catalogue</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('student-layout')).toBeInTheDocument();
    expect(screen.getByTestId('courses-route-content')).toBeInTheDocument();
    expect(screen.getByTestId('student-left-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('student-right-toc')).toBeInTheDocument();
  });
});
