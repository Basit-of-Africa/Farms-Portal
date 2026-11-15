/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted from shadcn/ui (MIT). Styled with the portal design tokens in src/index.css.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/src/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', {
  variants: {
    variant: {
      default: 'bg-primary/10 text-primary',
      success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
      destructive: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
      muted: 'bg-muted text-muted-foreground',
      outline: 'border border-border text-foreground'
    }
  },
  defaultVariants: { variant: 'default' }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => <span className={cn(badgeVariants({ variant }), className)} {...props} />;
