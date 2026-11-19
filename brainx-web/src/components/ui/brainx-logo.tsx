import React from 'react';
import { cn } from '@/lib/utils';

export interface BrainXLogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'h-6 w-auto',
  md: 'h-7 w-auto',
  lg: 'h-9 w-auto',
  xl: 'h-12 w-auto',
};

export function BrainXLogo({
  size = 'md',
  className,
  alt = 'BrainX Logo',
  ...props
}: BrainXLogoProps) {
  return (
    <img
      src="/brainx-logo.png"
      alt={alt}
      data-testid="brainx-logo-image"
      className={cn(
        'object-contain shrink-0 select-none inline-block',
        SIZE_CLASSES[size],
        className
      )}
      loading="eager"
      {...props}
    />
  );
}

export default BrainXLogo;
