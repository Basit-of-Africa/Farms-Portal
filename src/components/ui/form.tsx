/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Small helpers for react-hook-form: a labelled field that shows the
 * validation message under the input and wires up aria attributes.
 */

import * as React from 'react';
import { FieldError } from 'react-hook-form';
import { Label } from './label';
import { cn } from '@/src/lib/utils';

interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  error?: FieldError | { message?: string };
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactElement<any>;
}

export function FormField({ id, label, error, hint, className, children }: FormFieldProps) {
  const describedBy = [hint ? `${id}-hint` : null, error?.message ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, { id, 'aria-invalid': error?.message ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error?.message && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error?.message && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">{error.message}</p>
      )}
    </div>
  );
}

/** Banner for form-level errors (e.g. from the server). */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border-l-4 border-destructive bg-destructive/10 p-3 text-sm font-medium text-destructive">
      {message}
    </div>
  );
}
