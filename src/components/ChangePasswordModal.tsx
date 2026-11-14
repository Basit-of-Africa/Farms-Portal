/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { User } from '../types';

interface ChangePasswordModalProps {
  token: string;
  /** When true the dialog cannot be dismissed (temporary password must be replaced). */
  forced: boolean;
  onSuccess: (token: string, user: User) => void;
  onClose: () => void;
  onLogout: () => void;
}

export default function ChangePasswordModal({ token, forced, onSuccess, onClose, onLogout }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not change password.');
      onSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Could not change password.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30 focus:border-[#1B4332]';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-stone-900 border border-[#2D6A4F]/20 dark:border-stone-800 rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl relative text-stone-800 dark:text-stone-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        {!forced && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-[#1B4332]/10 dark:bg-[#52B788]/10 rounded-2xl text-[#1B4332] dark:text-[#52B788]">
            <KeyRound className="h-6 w-6" />
          </div>
          <h3 id="change-password-title" className="font-bold text-lg text-[#1B4332] dark:text-emerald-400">
            {forced ? 'Choose a new password' : 'Change password'}
          </h3>
        </div>

        {forced && (
          <p className="text-sm text-stone-600 dark:text-stone-300 mb-4">
            You signed in with a temporary password. Please choose your own password to continue.
          </p>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 rounded-xl text-red-700 text-xs font-semibold">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="cp-current" className="block text-xs font-semibold mb-1 text-stone-500">
              {forced ? 'Temporary password' : 'Current password'}
            </label>
            <input id="cp-current" type="password" required autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="cp-new" className="block text-xs font-semibold mb-1 text-stone-500">New password</label>
            <input id="cp-new" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
            <p className="text-[11px] text-stone-400 mt-1">At least 8 characters, with letters and numbers.</p>
          </div>
          <div>
            <label htmlFor="cp-confirm" className="block text-xs font-semibold mb-1 text-stone-500">Confirm new password</label>
            <input id="cp-confirm" type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-[#1B4332] hover:bg-[#2D6A4F] text-white disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Saving…' : 'Save password'}
            </button>
            {forced ? (
              <button type="button" onClick={onLogout} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 cursor-pointer">
                Log out
              </button>
            ) : (
              <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 cursor-pointer">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
