import React, { createContext, useContext, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SortableItemContextValue {
  id: string;
  name: string;
  index: number;
  total: number;
  isInteractive: boolean;
  isGrabbed: boolean;
  isDragging: boolean;
  handleClassName?: string;
  handleTestId?: string;
  handleDragStart: (e: React.DragEvent) => void;
  handleDragEnd: (e: React.DragEvent) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  handleBlur: () => void;
}

const SortableItemContext = createContext<SortableItemContextValue | null>(null);

export function useSortableItemContext() {
  const context = useContext(SortableItemContext);
  if (!context) {
    throw new Error('SortableHandle must be used within a SortableItem');
  }
  return context;
}

export const getPickUpAnnouncement = (name: string) =>
  `Élément ${name} sélectionné. Utilisez les flèches Haut et Bas pour réordonner, Espace pour confirmer, Échap pour annuler.`;

export const getMovementAnnouncement = (position: number, total: number) =>
  `Position ${position} sur ${total}.`;

export const getBoundaryAnnouncement = (boundary: 'first' | 'last') =>
  boundary === 'first'
    ? 'Premier élément atteint.'
    : 'Dernier élément atteint.';

export const getCommitAnnouncement = (name: string) =>
  `Nouvel ordre enregistré pour ${name}.`;

export const getCancelAnnouncement = () =>
  `Réordonnancement annulé.`;

export interface SortableLiveRegionProps {
  message?: string | null;
}

export function SortableLiveRegion({ message }: SortableLiveRegionProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="reorder-live-region"
      className="sr-only"
    >
      {message || ''}
    </div>
  );
}

export interface SortableHandleProps {
  className?: string;
  testId?: string;
}

export function SortableHandle({ className, testId }: SortableHandleProps) {
  const ctx = useSortableItemContext();

  const ariaLabel = ctx.isGrabbed
    ? `Réordonner ${ctx.name}`
    : `Réordonner ${ctx.name} (appuyez sur Espace pour saisir)`;

  return (
    <button
      type="button"
      role="button"
      tabIndex={ctx.isInteractive ? 0 : -1}
      aria-roledescription="élément réordonnable"
      aria-grabbed={ctx.isGrabbed}
      aria-label={ariaLabel}
      aria-disabled={!ctx.isInteractive}
      disabled={!ctx.isInteractive}
      data-testid={testId || ctx.handleTestId || `drag-handle-${ctx.id}`}
      className={cn(
        'p-1.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none inline-flex items-center justify-center shrink-0',
        ctx.isInteractive
          ? ctx.isGrabbed
            ? 'cursor-grabbing text-primary bg-primary/20 ring-1 ring-primary'
            : 'cursor-grab text-foreground-muted hover:text-foreground hover:bg-surface'
          : 'cursor-not-allowed opacity-40 text-foreground-muted',
        ctx.handleClassName,
        className
      )}
      draggable={ctx.isInteractive}
      onDragStart={ctx.handleDragStart}
      onDragEnd={ctx.handleDragEnd}
      onKeyDown={ctx.handleKeyDown}
      onBlur={() => {
        if (ctx.isGrabbed) {
          ctx.handleBlur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">Réordonner {ctx.name}</span>
    </button>
  );
}

export interface SortableItemProps {
  id: string;
  name: string;
  index: number;
  total: number;
  disabled?: boolean;
  isGrabbed?: boolean;
  isOver?: boolean;
  isDragging?: boolean;
  onPickUp?: () => void;
  onCommit?: () => void;
  onCancel?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onBoundaryReached?: (boundary: 'first' | 'last') => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  className?: string;
  handleClassName?: string;
  handleTestId?: string;
  showDefaultHandle?: boolean;
  liveMessage?: string;
  'data-testid'?: string;
  children?: React.ReactNode;
}

export function SortableItem({
  id,
  name,
  index,
  total,
  disabled = false,
  isGrabbed = false,
  isOver = false,
  isDragging = false,
  onPickUp,
  onCommit,
  onCancel,
  onMoveUp,
  onMoveDown,
  onBoundaryReached,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  className,
  handleClassName,
  handleTestId,
  showDefaultHandle = false,
  liveMessage,
  'data-testid': testId,
  children,
}: SortableItemProps) {
  const isInteractive = total > 1 && !disabled;
  const [internalDragging, setInternalDragging] = useState(false);
  const [internalOver, setInternalOver] = useState(false);

  const draggingActive = isDragging || internalDragging;
  const overActive = isOver || internalOver;

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    if (!isInteractive) {
      e.preventDefault();
      return;
    }
    setInternalDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    onDragStart?.(e);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setInternalDragging(false);
    setInternalOver(false);
    onDragEnd?.(e);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.stopPropagation();
    if (!isInteractive) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setInternalOver(true);
    onDragOver?.(e);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.stopPropagation();
    if (isInteractive) {
      setInternalOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    // Only clear if leaving the container itself
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setInternalOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.stopPropagation();
    if (!isInteractive) return;
    e.preventDefault();
    setInternalOver(false);
    onDrop?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isInteractive) return;

    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      if (!isGrabbed) {
        onPickUp?.();
      } else {
        onCommit?.();
      }
    } else if (e.key === 'ArrowDown') {
      if (isGrabbed) {
        e.preventDefault();
        if (index >= total - 1) {
          onBoundaryReached?.('last');
        }
        onMoveDown?.();
      }
    } else if (e.key === 'ArrowUp') {
      if (isGrabbed) {
        e.preventDefault();
        if (index <= 0) {
          onBoundaryReached?.('first');
        }
        onMoveUp?.();
      }
    } else if (e.key === 'Escape') {
      if (isGrabbed) {
        e.preventDefault();
        onCancel?.();
      }
    }
  };

  const handleBlur = () => {
    if (isGrabbed) {
      onCancel?.();
    }
  };

  const contextValue: SortableItemContextValue = {
    id,
    name,
    index,
    total,
    isInteractive,
    isGrabbed,
    isDragging: draggingActive,
    handleClassName,
    handleTestId,
    handleDragStart,
    handleDragEnd,
    handleKeyDown,
    handleBlur,
  };

  return (
    <SortableItemContext.Provider value={contextValue}>
      <div
        data-testid={testId}
        className={cn(
          'transition-all duration-150',
          overActive && 'border-primary ring-1 ring-primary bg-primary/5',
          isGrabbed && 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5',
          draggingActive && 'opacity-50',
          className
        )}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {showDefaultHandle && <SortableHandle />}
        {children}
        {liveMessage !== undefined && <SortableLiveRegion message={liveMessage} />}
      </div>
    </SortableItemContext.Provider>
  );
}
