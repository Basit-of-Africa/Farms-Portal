/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Irreversible database actions, kept away from everyday screens and
 * protected by typed confirmation.
 */

import React from 'react';
import { AlertOctagon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { useConfirm } from './ui/confirm';
import { toast } from './ui/sonner';

export default function DangerZone({ token, onDone }: { token: string; onDone: () => void }) {
  const confirmDialog = useConfirm();

  const call = async (url: string, success: string) => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The action failed.');
      toast.success(success);
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const goLive = async () => {
    const ok = await confirmDialog({
      title: 'Delete all data and go live?',
      description: 'Deletes all farms, plots, investments, updates, documents and every account except administrators. Privacy and audit records are kept. This cannot be undone.',
      confirmText: 'Delete everything',
      destructive: true,
      requireText: 'DELETE'
    });
    if (ok) call('/api/admin/clean-slate', 'All data deleted. The portal is ready for real data.');
  };

  const resetDemo = async () => {
    const ok = await confirmDialog({
      title: 'Reset the database to demo data?',
      description: 'Everything except your own account is replaced with the original demo data. Privacy and audit records are kept. This cannot be undone.',
      confirmText: 'Reset database',
      destructive: true,
      requireText: 'RESET'
    });
    if (ok) call('/api/admin/reset-db', 'Database reset to demo data.');
  };

  return (
    <Card id="danger-zone" className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertOctagon className="h-5 w-5" /> Danger zone
        </CardTitle>
        <CardDescription>These actions permanently delete data. Download a backup first.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 first:pt-0">
          <div>
            <p className="font-semibold text-sm">Delete all data and go live</p>
            <p className="text-sm text-muted-foreground">Removes demo or test data so you can start with real investors.</p>
          </div>
          <Button variant="destructive" onClick={goLive}>Delete all data</Button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 last:pb-0">
          <div>
            <p className="font-semibold text-sm">Reset to demo data</p>
            <p className="text-sm text-muted-foreground">Replaces everything with the original demo data. For testing only.</p>
          </div>
          <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={resetDemo}>Reset to demo data</Button>
        </div>
      </CardContent>
    </Card>
  );
}
