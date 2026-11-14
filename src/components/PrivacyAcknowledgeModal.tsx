/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { User } from '../types';
import { PrivacyNoticeContent, PrivacyNoticeData } from './PrivacyNotice';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { FormError } from './ui/form';

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
    <Dialog open>
      <DialogContent
        hideClose
        className="max-w-2xl p-0 gap-0"
        onEscapeKeyDown={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onInteractOutside={e => e.preventDefault()}
      >
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
            <DialogTitle id="privacy-ack-title">{isUpdate ? 'Our privacy notice has changed' : 'How we use your personal data'}</DialogTitle>
          </div>
          <DialogDescription>Please read this notice before continuing to the portal.</DialogDescription>
        </DialogHeader>
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <PrivacyNoticeContent notice={notice} />
        </div>
        <div className="p-6 pt-4 border-t border-border flex flex-col gap-3">
          <FormError message={error} />
          <div className="flex items-start gap-3">
            <Checkbox id="ack-read" checked={read} onCheckedChange={v => setRead(!!v)} className="mt-0.5" />
            <Label htmlFor="ack-read" className="leading-snug cursor-pointer">I have read and understood this privacy notice.</Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="ack-marketing" checked={marketing} onCheckedChange={v => setMarketing(!!v)} className="mt-0.5" />
            <Label htmlFor="ack-marketing" className="leading-snug font-normal cursor-pointer">
              Optional: send me news about new investment opportunities and offers. I can withdraw this at any time.
            </Label>
          </div>
          <DialogFooter className="pt-1">
            <Button variant="outline" onClick={onLogout}>Log out</Button>
            <Button onClick={submit} disabled={!read || busy}>Continue</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
