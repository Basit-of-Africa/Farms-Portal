/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Adapted from shadcn/ui (MIT). Styled with the portal design tokens in src/index.css.
 */

import * as React from 'react';
import { cn } from '@/src/lib/utils';

export const inputClasses =
  'flex w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input type={type} className={cn(inputClasses, 'h-10', className)} ref={ref} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea className={cn(inputClasses, 'min-h-[80px]', className)} ref={ref} {...props} />
));
Textarea.displayName = 'Textarea';

/** Native select styled like the other inputs (best on mobile). */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select className={cn(inputClasses, 'h-10', className)} ref={ref} {...props} />
));
NativeSelect.displayName = 'NativeSelect';
