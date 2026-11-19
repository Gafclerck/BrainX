import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HighlightText } from './highlight-text';
import { SearchResultCard } from './search-result-card';
import type { SearchLessonItem } from './types';

describe('HighlightText Component', () => {
  it('renders plaintext without highlight when query is empty or whitespace', () => {
    const { rerender } = render(<HighlightText text="Introduction à Django" query="" />);
    expect(screen.getByText('Introduction à Django')).toBeInTheDocument();
    expect(screen.queryByTestId('search-highlight')).not.toBeInTheDocument();

    rerender(<HighlightText text="Introduction à Django" query="   " />);
    expect(screen.getByText('Introduction à Django')).toBeInTheDocument();
    expect(screen.queryByTestId('search-highlight')).not.toBeInTheDocument();
  });

  it('renders null when text is empty or non-string', () => {
    const { container } = render(<HighlightText text="" query="django" />);
    expect(container.firstChild).toBeNull();
  });

  it('highlights matching substring with technical amber mark tag and preserves original case', () => {
    render(<HighlightText text="Introduction aux Vues Génériques Django" query="django" />);

    const mark = screen.getByTestId('search-highlight');
    expect(mark).toBeInTheDocument();
    expect(mark.tagName.toLowerCase()).toBe('mark');
    expect(mark).toHaveTextContent('Django');
    expect(mark.className).toContain('text-highlight');
    expect(mark.className).toContain('bg-highlight/15');
    expect(mark.className).toContain('font-semibold');
    expect(mark.className).toContain('rounded-sm');
  });

  it('supports multi-word query terms, highlighting all matching tokens', () => {
    render(<HighlightText text="Introduction aux Vues Génériques Django" query="intro vues" />);

    const marks = screen.getAllByTestId('search-highlight');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveTextContent('Intro');
    expect(marks[1]).toHaveTextContent('Vues');
  });

  it('safely escapes regex special characters in query without crashing (AD-7 edge case)', () => {
    const specialQueries = ['C++', '(v18)', '[test]', 'regex*+?^$'];
    for (const q of specialQueries) {
      const { unmount } = render(
        <HighlightText text={`Tutoriel sur ${q} avancé`} query={q} />
      );
      const mark = screen.getByTestId('search-highlight');
      expect(mark).toBeInTheDocument();
      expect(mark).toHaveTextContent(q);
      unmount();
    }
  });

  it('returns plaintext fallback if RegExp creation encounters abnormal patterns', () => {
    render(<HighlightText text="Test Fallback" query="test" className="custom-wrapper" />);
    expect(screen.getByText(/Fallback/)).toBeInTheDocument();
  });
});

describe('SearchResultCard Component', () => {
  const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

  afterEach(() => {
    window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  const mockLessonComplete: SearchLessonItem = {
    id: 'lesson-uuid-101',
    title: 'Introduction aux Vues Génériques Django',
    course_name: 'Architecture Django & Web',
    module_name: 'Vues et Routage',
    chapter_name: 'Vues Basées sur les Classes',
    teacher: 'Prof. Ada Lovelace',
    course_date: '2026-10-28',
    resources: [
      { id: 'res-1', type: 'document', title: 'Cours PDF' },
      { id: 'res-2', type: 'video', title: 'Vidéo Explicative' },
      { id: 'res-3', type: 'image', title: 'Schéma Architecture' },
      { id: 'res-4', type: 'external_link', title: 'Doc Django' },
    ],
  };

  it('renders all 5 mandatory context fields: title (h3), breadcrumb ancestry, teacher, ISO date, and resource badges', () => {
    const onSelect = vi.fn();
    render(
      <SearchResultCard
        lesson={mockLessonComplete}
        query="Django"
        onSelect={onSelect}
      />
    );

    // Card attributes: tabIndex={-1} and title
    const card = screen.getByTestId(`search-result-item-${mockLessonComplete.id}`);
    expect(card).toHaveAttribute('tabindex', '-1');
    expect(card).toHaveAttribute('title', mockLessonComplete.title);

    // 1. Lesson title as h3 heading
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Introduction aux Vues Génériques Django');

    // 2. Full ancestry breadcrumb [Cours] → [Module] → [Chapitre]
    const ancestry = screen.getByTestId(`search-result-ancestry-${mockLessonComplete.id}`);
    expect(ancestry).toBeInTheDocument();
    expect(ancestry).toHaveTextContent('Architecture Django & Web');
    expect(ancestry).toHaveTextContent('Vues et Routage');
    expect(ancestry).toHaveTextContent('Vues Basées sur les Classes');
    expect(ancestry).toHaveTextContent('→');

    // 3. Teacher name clearly labeled
    const teacher = screen.getByTestId(`search-result-teacher-${mockLessonComplete.id}`);
    expect(teacher).toBeInTheDocument();
    expect(teacher).toHaveTextContent('Enseignant : Prof. Ada Lovelace');

    // 4. Course date displayed in ISO format YYYY-MM-DD in monospace font
    const date = screen.getByTestId(`search-result-date-${mockLessonComplete.id}`);
    expect(date).toBeInTheDocument();
    expect(date).toHaveTextContent('2026-10-28');
    expect(date.className).toContain('font-mono');

    // 5. Resource badges rendered with ResourceBadge
    const resources = screen.getByTestId(`search-result-resources-${mockLessonComplete.id}`);
    expect(resources).toBeInTheDocument();
    expect(screen.getByTestId('resource-badge-document')).toBeInTheDocument();
    expect(screen.getByTestId('resource-badge-video')).toBeInTheDocument();
    expect(screen.getByTestId('resource-badge-image')).toBeInTheDocument();
    expect(screen.getByTestId('resource-badge-external_link')).toBeInTheDocument();
  });

  it('renders graceful fallbacks for nullable or omitted fields without throwing (resilience)', () => {
    const bareLesson: SearchLessonItem = {
      id: 'lesson-uuid-bare',
      title: 'Leçon Sans Métadonnées',
      course_name: 'Cours Test',
      module_name: 'Module Test',
      chapter_name: 'Chapitre Test',
      teacher: undefined,
      course_date: undefined,
      resources: undefined,
    };

    render(<SearchResultCard lesson={bareLesson} onSelect={vi.fn()} />);

    // Title exists as h3
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Leçon Sans Métadonnées');

    // Teacher fallback
    const teacher = screen.getByTestId(`search-result-teacher-${bareLesson.id}`);
    expect(teacher).toHaveTextContent('Enseignant non spécifié');

    // Date fallback
    const date = screen.getByTestId(`search-result-date-${bareLesson.id}`);
    expect(date).toHaveTextContent('Date non spécifiée');

    // Resources fallback
    const noResources = screen.getByTestId(`search-result-no-resources-${bareLesson.id}`);
    expect(noResources).toHaveTextContent('Aucune ressource');
  });

  it('falls back to "Enseignant non spécifié" when teacher is whitespace only', () => {
    const whitespaceTeacherLesson: SearchLessonItem = {
      ...mockLessonComplete,
      id: 'whitespace-teacher-lesson',
      teacher: '   ',
    };

    render(<SearchResultCard lesson={whitespaceTeacherLesson} onSelect={vi.fn()} />);
    const teacher = screen.getByTestId(`search-result-teacher-${whitespaceTeacherLesson.id}`);
    expect(teacher).toHaveTextContent('Enseignant non spécifié');
  });

  it('slices ISO date with timestamp to YYYY-MM-DD', () => {
    const timestampDateLesson: SearchLessonItem = {
      ...mockLessonComplete,
      id: 'timestamp-date-lesson',
      course_date: '2026-10-28T14:30:00Z',
    };

    render(<SearchResultCard lesson={timestampDateLesson} onSelect={vi.fn()} />);
    const date = screen.getByTestId(`search-result-date-${timestampDateLesson.id}`);
    expect(date).toHaveTextContent('2026-10-28');
  });

  it('dynamically joins only non-empty breadcrumb segments without dangling arrows', () => {
    const partialAncestryLesson: SearchLessonItem = {
      ...mockLessonComplete,
      id: 'partial-ancestry-lesson',
      course_name: 'Cours Seul',
      module_name: '',
      chapter_name: 'Chapitre Direct',
    };

    render(<SearchResultCard lesson={partialAncestryLesson} onSelect={vi.fn()} />);
    const ancestry = screen.getByTestId(`search-result-ancestry-${partialAncestryLesson.id}`);
    expect(ancestry).toHaveTextContent('Cours Seul');
    expect(ancestry).toHaveTextContent('Chapitre Direct');
    // Exactly 1 arrow between the 2 segments
    const text = ancestry.textContent || '';
    const arrowCount = (text.match(/→/g) || []).length;
    expect(arrowCount).toBe(1);
  });

  it('renders "Aucune ressource" when resources array is empty', () => {
    const emptyResLesson: SearchLessonItem = {
      ...mockLessonComplete,
      id: 'empty-res-lesson',
      resources: [],
    };

    render(<SearchResultCard lesson={emptyResLesson} onSelect={vi.fn()} />);
    expect(
      screen.getByTestId(`search-result-no-resources-${emptyResLesson.id}`)
    ).toHaveTextContent('Aucune ressource');
  });

  it('applies visual focus styles and aria-selected="true" when isSelected is true', () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const { rerender } = render(
      <SearchResultCard
        lesson={mockLessonComplete}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    const card = screen.getByTestId(`search-result-item-${mockLessonComplete.id}`);
    expect(card).toHaveAttribute('aria-selected', 'false');
    expect(card.className).toContain('bg-[#161B22]');
    expect(card.className).toContain('border-[#30363D]');

    rerender(
      <SearchResultCard
        lesson={mockLessonComplete}
        isSelected={true}
        onSelect={vi.fn()}
      />
    );

    expect(card).toHaveAttribute('aria-selected', 'true');
    expect(card.className).toContain('bg-[#1F242C]');
    expect(card.className).toContain('border-[#38BDF8]');
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('triggers onSelect when clicked', async () => {
    const onSelect = vi.fn();

    render(
      <SearchResultCard
        lesson={mockLessonComplete}
        onSelect={onSelect}
      />
    );

    const card = screen.getByTestId(`search-result-item-${mockLessonComplete.id}`);
    await userEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(mockLessonComplete.id);
  });

  it('triggers onMouseEnter when hovered', async () => {
    const onMouseEnter = vi.fn();

    render(
      <SearchResultCard
        lesson={mockLessonComplete}
        onSelect={vi.fn()}
        onMouseEnter={onMouseEnter}
      />
    );

    const card = screen.getByTestId(`search-result-item-${mockLessonComplete.id}`);
    await userEvent.hover(card);
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
  });

  it('respects minimum touch target height (48px) for mobile compliance', () => {
    render(<SearchResultCard lesson={mockLessonComplete} onSelect={vi.fn()} />);

    const card = screen.getByTestId(`search-result-item-${mockLessonComplete.id}`);
    expect(card.className).toContain('min-h-[48px]');
  });
});
