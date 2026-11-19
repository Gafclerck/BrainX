import * as React from 'react';
import { FileText, Image as ImageIcon, Video, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LessonResourceType } from '@/features/browse/types';

export interface ResourceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  type: LessonResourceType;
  className?: string;
}

interface ResourceTypeConfig {
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  styles: string;
}

const RESOURCE_TYPE_CONFIG: Record<LessonResourceType, ResourceTypeConfig> = {
  document: {
    label: 'document',
    icon: FileText,
    styles: 'text-[#58A6FF] bg-[#13233A] border-[#1F4273]',
  },
  image: {
    label: 'image',
    icon: ImageIcon,
    styles: 'text-[#BC8CFF] bg-[#211838] border-[#42296B]',
  },
  video: {
    label: 'video',
    icon: Video,
    styles: 'text-[#F0883E] bg-[#2E1B13] border-[#663319]',
  },
  external_link: {
    label: 'external_link',
    icon: ExternalLink,
    styles: 'text-[#39D353] bg-[#132B25] border-[#1D5233]',
  },
};

export function ResourceBadge({
  type,
  className,
  ...props
}: ResourceBadgeProps) {
  const config = RESOURCE_TYPE_CONFIG[type] ?? {
    label: type,
    icon: FileText,
    styles: 'text-[#58A6FF] bg-[#13233A] border-[#1F4273]',
  };

  const Icon = config.icon;

  return (
    <span
      data-testid={`resource-badge-${type}`}
      aria-label={`Ressource ${config.label}`}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium rounded-sm border px-2 py-0.5 select-none transition-colors',
        config.styles,
        className
      )}
      {...props}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}

export default ResourceBadge;
