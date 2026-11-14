/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { User } from '../types';
import { PrivacyNoticeContent, PrivacyNoticeData } from './PrivacyNotice';

interface Props {
  token: string;
  notice: PrivacyNoticeData;
  isUpdate: boolean;
  onAcknowledged: (user: User) => void;
  onLogout: () => void;
}

/** Shown when a user has not yet acknowledged the current privacy notice version. */
export default function PrivacyAcknowledgeModal({ token, notice, isUpdate, onAcknowledged, onLogout }: Props) {
  const [read, setRead] = useState(false);
  // Marketing consent must be an active, unticked opt-in
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/privacy/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ marketingConsent: marketing })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      onAcknowledged(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="privacy-ack-title" className="bg-white dark:bg-stone-900 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] text-stone-800 dark:text-stone-100">
        <div className="p-6 pb-3 flex items-center gap-3 border-b border-stone-100 dark:border-stone-800">
          <ShieldCheck className="h-6 w-6 text-[#2D6A4F] dark:text-emerald-400" />
          <h2 id="privacy-ack-title" className="font-bold text-lg text-[#1B4332] dark:text-emerald-400">
            {isUpdate ? 'Our privacy notice has changed' : 'How we use your personal data'}
          </h2>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <PrivacyNoticeContent notice={notice} />
        </div>
        <div className="p-6 pt-4 border-t border-stone-100 dark:border-stone-800 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={read} onChange={e => setRead(e.target.checked)} />
            <span>I have read and understood this privacy notice.</span>
          </label>
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={marketing} onChange={e => setMarketing(e.target.checked)} />
            <span>Optional: send me news about new investment opportunities and offers. I can withdraw this at any time.</span>
          </label>
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button onClick={submit} disabled={!read || busy} className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-[#1B4332] hover:bg-[#2D6A4F] text-white disabled:opacity-50 cursor-pointer">
              Continue
            </button>
            <button onClick={onLogout} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 cursor-pointer">
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
