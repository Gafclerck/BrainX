import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

describe('Card Primitive', () => {
  it('renders all card structural subcomponents with dark theme styling', () => {
    render(
      <Card data-testid="test-card">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>Content Area</CardContent>
        <CardFooter>Footer Area</CardFooter>
      </Card>
    );

    const card = screen.getByTestId('test-card');
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('bg-card');
    expect(card.className).toContain('border-border');
    expect(card.className).toContain('rounded-lg');

    expect(screen.getByText('Card Title')).toHaveClass('text-foreground');
    expect(screen.getByText('Card Description')).toHaveClass('text-foreground-muted');
    expect(screen.getByText('Content Area')).toBeInTheDocument();
    expect(screen.getByText('Footer Area')).toBeInTheDocument();
  });
});
