/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Loader2 } from 'lucide-react';
import { User } from '../types';
import { changePasswordSchema, ChangePasswordInput } from '../lib/schemas';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { FormField, FormError } from './ui/form';
import { toast } from './ui/sonner';

interface ChangePasswordModalProps {
  token: string;
  /** When true the dialog cannot be dismissed (temporary password must be replaced). */
  forced: boolean;
  onSuccess: (token: string, user: User) => void;
  onClose: () => void;
  onLogout: () => void;
}

export default function ChangePasswordModal({ token, forced, onSuccess, onClose, onLogout }: ChangePasswordModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = async (values: ChangePasswordInput) => {
    setServerError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change password.');
      toast.success('Your password was changed.');
      onSuccess(data.token, data.user);
    } catch (err: any) {
      setServerError(err.message || 'Could not change password.');
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && !forced && onClose()}>
      <DialogContent
        hideClose={forced}
        onEscapeKeyDown={e => forced && e.preventDefault()}
        onPointerDownOutside={e => forced && e.preventDefault()}
        onInteractOutside={e => forced && e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-accent text-accent-foreground">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle id="change-password-title">{forced ? 'Choose a new password' : 'Change password'}</DialogTitle>
          </div>
          <DialogDescription>
            {forced ? 'You signed in with a temporary password. Please choose your own password to continue.' : 'Changing your password signs you out on other devices.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FormError message={serverError} />
          <FormField id="cp-current" label={forced ? 'Temporary password' : 'Current password'} error={errors.currentPassword}>
            <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
          </FormField>
          <FormField id="cp-new" label="New password" error={errors.newPassword} hint="At least 8 characters, with letters and numbers.">
            <Input type="password" autoComplete="new-password" {...register('newPassword')} />
          </FormField>
          <FormField id="cp-confirm" label="Confirm new password" error={errors.confirmPassword}>
            <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
          </FormField>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={forced ? onLogout : onClose}>
              {forced ? 'Log out' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Save password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
