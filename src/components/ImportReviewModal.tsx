/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Review step for investor imports: runs the import as a dry run, shows
 * what will be created plus every warning and error, and only saves when
 * the admin confirms.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { DataTable } from './ui/data-table';
import { FormError } from './ui/form';
import { useConfirm } from './ui/confirm';
import { formatNaira } from '../lib/utils';

interface ImportReviewModalProps {
  records: any[];
  token: string;
  /** '/api/admin/users/bulk-upload' (admins) or '/api/import/data' (admins and managers) */
  endpoint?: string;
  /** Added to row numbers so they match spreadsheet line numbers (1 = header row) */
  rowOffset?: number;
  onClose: () => void;
  onImported: (results: any) => void;
}

interface PreviewRow {
  row: number;
  status: 'new_user' | 'existing_user' | 'already_present' | 'amount_updated' | 'skipped' | 'error';
  name: string;
  email: string;
  username: string;
  farm: string;
  size: string;
  crop: string;
  amount: number;
  errors: string[];
  warnings: string[];
}

const STATUS: Record<PreviewRow['status'], { label: string; variant: 'success' | 'default' | 'muted' | 'destructive' | 'warning' }> = {
  new_user: { label: 'New account', variant: 'success' },
  existing_user: { label: 'Add to account', variant: 'default' },
  already_present: { label: 'Already in portal', variant: 'muted' },
  amount_updated: { label: 'Amount filled in', variant: 'warning' },
  skipped: { label: 'Skipped', variant: 'muted' },
  error: { label: 'Error', variant: 'destructive' }
};

export default function ImportReviewModal({ records, token, endpoint = '/api/admin/users/bulk-upload', rowOffset = 1, onClose, onImported }: ImportReviewModalProps) {
  const confirmDialog = useConfirm();
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [sendEmails, setSendEmails] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = async (dryRun: boolean) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ investors: records, dryRun, skipDuplicateRows: skipDuplicates, sendWelcomeEmails: sendEmails })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Import failed');
    return data;
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    run(true)
      .then(setPreview)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [skipDuplicates]);

  const rows: PreviewRow[] = useMemo(() => {
    if (!preview) return [];
    const issues = new Map<number, { errors: string[]; warnings: string[] }>();
    const get = (row: number) => issues.get(row) || (issues.set(row, { errors: [], warnings: [] }), issues.get(row)!);
    for (const e of preview.errors || []) get(e.row).errors.push(e.error);
    for (const w of preview.warnings || []) get(w.row).warnings.push(w.message);
    return (preview.rows || []).map((r: any) => ({ ...r, row: r.row + rowOffset, errors: issues.get(r.row)?.errors || [], warnings: issues.get(r.row)?.warnings || [] }));
  }, [preview, rowOffset]);

  const changeCount = (preview?.successCount || 0) + (preview?.amountsUpdated || 0);
  const issueCount = rows.filter(r => r.errors.length || r.warnings.length).length;
  const visibleRows = onlyIssues ? rows.filter(r => r.errors.length || r.warnings.length) : rows;

  const columns = useMemo<ColumnDef<PreviewRow>[]>(
    () => [
      { accessorKey: 'row', header: 'Line', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as number}</span> },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const s = STATUS[getValue() as PreviewRow['status']];
          return <Badge variant={s.variant}>{s.label}</Badge>;
        }
      },
      { accessorKey: 'name', header: 'Name' },
      {
        accessorKey: 'email',
        header: 'Email / username',
        cell: ({ row }) => (
          <div>
            <div>{row.original.email}</div>
            <div className="text-xs text-muted-foreground">{row.original.username}</div>
          </div>
        )
      },
      { accessorKey: 'farm', header: 'Farm' },
      { accessorKey: 'size', header: 'Size', cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() as string}</span> },
      { accessorKey: 'crop', header: 'Crop' },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => <span className="whitespace-nowrap">{(getValue() as number) ? formatNaira(getValue() as number) : '—'}</span>
      },
      {
        id: 'notes',
        header: 'Notes',
        enableSorting: false,
        accessorFn: r => [...r.errors, ...r.warnings].join(' '),
        cell: ({ row }) => (
          <div className="min-w-[260px] max-w-[420px] whitespace-normal text-xs space-y-1">
            {row.original.errors.map(m => (
              <p key={m} className="text-destructive font-medium">{m}</p>
            ))}
            {row.original.warnings.map(m => (
              <p key={m} className="text-warning">{m}</p>
            ))}
          </div>
        )
      }
    ],
    []
  );

  const confirmImport = async () => {
    if (preview.failCount > 0) {
      const ok = await confirmDialog({
        title: `Save ${changeCount} change(s) and leave out ${preview.failCount} row(s)?`,
        description: 'Rows with errors are not imported. You can fix them in the file and import them later.',
        confirmText: 'Import'
      });
      if (!ok) return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await run(false);
      setResult(data);
      onImported(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-6xl p-0 gap-0">
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle id="import-review-title">{result ? 'Import complete' : 'Review import before saving'}</DialogTitle>
          <DialogDescription>{result ? 'Your data has been saved.' : 'Nothing is saved until you press Import.'}</DialogDescription>
        </DialogHeader>

        <div className="p-5 overflow-y-auto flex-1 min-h-0 flex flex-col gap-5">
          <FormError message={error} />
          {loading && !preview && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking {records.length} rows…
            </p>
          )}

          {result && (
            <div className="p-4 rounded-2xl bg-accent text-accent-foreground text-sm space-y-1">
              <p className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Added {result.successCount} holding(s){result.amountsUpdated ? ` and filled in ${result.amountsUpdated} amount(s)` : ''}.
              </p>
              {result.holdingsAlreadyPresent > 0 && <p>{result.holdingsAlreadyPresent} row(s) were already in the portal and were left as they are.</p>}
              <p>
                {result.usersCreatedCount} new account(s), {result.farmsCreatedCount} new farm(s), {result.plotsCreatedCount} plot(s).
              </p>
              <p>
                {result.welcomeEmailsSent > 0
                  ? `Login details were emailed to ${result.welcomeEmailsSent} new investor(s).`
                  : 'No emails were sent. When you are ready, select investors under Investors and choose "Send login details".'}
              </p>
            </div>
          )}

          {preview && !result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  ['Rows', preview.total],
                  ['New holdings', preview.successCount],
                  ['Already in portal', preview.holdingsAlreadyPresent ?? 0],
                  ['Amounts filled in', preview.amountsUpdated ?? 0],
                  ['New accounts', preview.usersCreatedCount],
                  ['New farms', preview.farmsCreatedCount]
                ].map(([label, value]) => (
                  <div key={label as string} className="p-3 rounded-2xl bg-muted">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-bold text-base">{value}</div>
                  </div>
                ))}
              </div>

              {(preview.failCount > 0 || preview.skippedCount > 0) && (
                <p className="text-sm flex flex-wrap gap-x-3">
                  {preview.failCount > 0 && (
                    <span className="text-destructive font-semibold flex items-center gap-1">
                      <XCircle className="h-4 w-4" /> {preview.failCount} row(s) have errors and will be left out.
                    </span>
                  )}
                  {preview.skippedCount > 0 && <span className="text-muted-foreground">{preview.skippedCount} duplicate row(s) will be skipped.</span>}
                </p>
              )}

              {preview.farmsCreated?.length > 0 && (
                <p className="text-sm">
                  <span className="font-semibold">Farms that will be created: </span>
                  {preview.farmsCreated.join(', ')}
                </p>
              )}

              {preview.globalWarnings?.length > 0 && (
                <ul className="space-y-1.5">
                  {preview.globalWarnings.map((w: string) => (
                    <li key={w} className="flex gap-2 text-sm text-warning">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}

              <DataTable
                columns={columns}
                data={visibleRows}
                pageSize={50}
                searchPlaceholder="Search name, email or farm…"
                rowClassName={r => (r.status === 'error' ? 'bg-destructive/5' : r.warnings.length ? 'bg-warning/5' : undefined)}
                toolbar={
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Checkbox id="skip-dupes" checked={skipDuplicates} onCheckedChange={v => setSkipDuplicates(!!v)} />
                      <Label htmlFor="skip-dupes" className="font-normal cursor-pointer">Skip exact duplicate rows</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="only-issues" checked={onlyIssues} onCheckedChange={v => setOnlyIssues(!!v)} />
                      <Label htmlFor="only-issues" className="font-normal cursor-pointer">Only rows with warnings or errors ({issueCount})</Label>
                    </div>
                  </div>
                }
              />
            </>
          )}
        </div>

        <div className="p-5 border-t border-border flex flex-col gap-3">
          {!result && (
            <div className="flex items-start gap-3">
              <Checkbox id="send-emails" checked={sendEmails} onCheckedChange={v => setSendEmails(!!v)} className="mt-0.5" />
              <Label htmlFor="send-emails" className="font-normal leading-snug cursor-pointer">
                Email login details to new investors now. Leave this off to check the imported data first; you can send them later from Investors → select →{' '}
                <b>Send login details</b>.
              </Label>
            </div>
          )}
          <DialogFooter>
            {result ? (
              <Button onClick={onClose}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={confirmImport} disabled={loading || !preview || changeCount === 0}>
                  {loading && preview && <Loader2 className="animate-spin" />}
                  {changeCount === 0 ? 'Nothing to change' : `Save ${changeCount} change(s)`}
                </Button>
              </>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for existing import flows: `await reviewImport(records)` opens the
 * review screen and resolves with the import results once the admin
 * confirms, or with null if they cancel.
 */
export function useImportReview(token: string) {
  const [state, setState] = useState<null | { records: any[]; endpoint?: string; rowOffset?: number; resolve: (data: any) => void }>(null);
  const resultRef = React.useRef<any>(null);

  const reviewImport = (records: any[], opts: { endpoint?: string; rowOffset?: number } = {}) =>
    new Promise<any>(resolve => {
      resultRef.current = null;
      setState({ records, ...opts, resolve });
    });

  // The result is handed back when the dialog closes, so the caller's refresh
  // (which may re-render or remount the page) does not dismiss the summary.
  const reviewModal = state ? (
    <ImportReviewModal
      records={state.records}
      token={token}
      endpoint={state.endpoint}
      rowOffset={state.rowOffset}
      onImported={data => {
        resultRef.current = data;
      }}
      onClose={() => {
        state.resolve(resultRef.current);
        setState(null);
      }}
    />
  ) : null;

  return { reviewImport, reviewModal };
}
