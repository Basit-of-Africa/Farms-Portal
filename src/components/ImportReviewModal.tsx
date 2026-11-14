/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Review step for investor imports: runs the import as a dry run, shows
 * what will be created plus every warning and error, and only saves when
 * the admin confirms.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, X, XCircle } from 'lucide-react';

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

const naira = (n: number) => `₦${Number(n || 0).toLocaleString()}`;

export default function ImportReviewModal({ records, token, endpoint = '/api/admin/users/bulk-upload', rowOffset = 1, onClose, onImported }: ImportReviewModalProps) {
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [sendEmails, setSendEmails] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);

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

  const issuesByRow = useMemo(() => {
    const map = new Map<number, { errors: string[]; warnings: string[] }>();
    for (const e of preview?.errors || []) {
      const entry = map.get(e.row) || { errors: [], warnings: [] };
      entry.errors.push(e.error);
      map.set(e.row, entry);
    }
    for (const w of preview?.warnings || []) {
      const entry = map.get(w.row) || { errors: [], warnings: [] };
      entry.warnings.push(w.message);
      map.set(w.row, entry);
    }
    return map;
  }, [preview]);

  const confirmImport = async () => {
    if (preview.failCount > 0 && !window.confirm(`${preview.failCount} row(s) have errors and will not be imported. Continue with the other ${preview.successCount}?`)) return;
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

  const line = (row: number) => row + rowOffset;
  const rows = (preview?.rows || []).filter((r: any) => !onlyIssues || issuesByRow.has(r.row));

  // Rendered at <body> level so animated/transformed parents cannot clip it
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="import-review-title" className="bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-100 rounded-3xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-stone-100 dark:border-stone-800">
          <h2 id="import-review-title" className="font-bold text-lg text-[#1B4332] dark:text-emerald-400">
            {result ? 'Import complete' : 'Review import before saving'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
          {loading && !preview && <p className="text-sm text-stone-500">Checking {records.length} rows…</p>}

          {result && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Imported {result.successCount} holding(s).</p>
              <p>{result.usersCreatedCount} new account(s), {result.farmsCreatedCount} new farm(s), {result.plotsCreatedCount} plot(s).</p>
              <p>
                {result.welcomeEmailsSent > 0
                  ? `Login details were emailed to ${result.welcomeEmailsSent} new investor(s).`
                  : 'No emails were sent. When you are ready, select investors under Investors and choose "Send login details".'}
              </p>
            </div>
          )}

          {preview && !result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                {[
                  ['Rows', preview.total],
                  ['Will import', preview.successCount],
                  ['New accounts', preview.usersCreatedCount],
                  ['Existing accounts', preview.existingUsersMatchedCount],
                  ['New farms', preview.farmsCreatedCount],
                  ['Total invested', naira(preview.totalInvestment)]
                ].map(([label, value]) => (
                  <div key={label as string} className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60">
                    <div className="text-[11px] text-stone-500">{label}</div>
                    <div className="font-bold text-base">{value}</div>
                  </div>
                ))}
              </div>

              {(preview.failCount > 0 || preview.skippedCount > 0) && (
                <p className="text-sm">
                  {preview.failCount > 0 && <span className="text-red-600 font-semibold">{preview.failCount} row(s) have errors and will be left out. </span>}
                  {preview.skippedCount > 0 && <span className="text-stone-600 dark:text-stone-300">{preview.skippedCount} duplicate row(s) will be skipped.</span>}
                </p>
              )}

              {preview.farmsCreated?.length > 0 && (
                <div className="text-sm">
                  <span className="font-semibold">Farms that will be created: </span>
                  {preview.farmsCreated.join(', ')}
                </div>
              )}

              {preview.globalWarnings?.length > 0 && (
                <ul className="space-y-1.5">
                  {preview.globalWarnings.map((w: string) => (
                    <li key={w} className="flex gap-2 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{w}</li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={skipDuplicates} onChange={e => setSkipDuplicates(e.target.checked)} /> Skip exact duplicate rows
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} /> Show only rows with warnings or errors ({issuesByRow.size})
                </label>
              </div>

              <div className="overflow-x-auto border border-stone-100 dark:border-stone-800 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 dark:bg-stone-800/60 text-left text-stone-500">
                    <tr>
                      <th className="p-2">Line</th><th className="p-2">Status</th><th className="p-2">Name</th><th className="p-2">Email / username</th>
                      <th className="p-2">Farm</th><th className="p-2">Size</th><th className="p-2">Crop</th><th className="p-2 text-right">Amount</th><th className="p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {rows.map((r: any) => {
                      const issues = issuesByRow.get(r.row);
                      return (
                        <tr key={r.row} className={r.status === 'error' ? 'bg-red-50/60 dark:bg-red-950/20' : issues?.warnings.length ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                          <td className="p-2 font-mono">{line(r.row)}</td>
                          <td className="p-2 whitespace-nowrap">
                            {r.status === 'error' ? <span className="text-red-600 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Error</span>
                              : r.status === 'skipped' ? <span className="text-stone-500">Skipped</span>
                              : r.status === 'new_user' ? 'New account' : 'Add to account'}
                          </td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2"><div>{r.email}</div><div className="text-stone-400">{r.username}</div></td>
                          <td className="p-2">{r.farm}</td>
                          <td className="p-2 whitespace-nowrap">{r.size}</td>
                          <td className="p-2">{r.crop}</td>
                          <td className="p-2 text-right whitespace-nowrap">{r.amount ? naira(r.amount) : '—'}</td>
                          <td className="p-2 min-w-[280px] whitespace-normal">
                            {issues?.errors.map(m => <div key={m} className="text-red-600">{m}</div>)}
                            {issues?.warnings.map(m => <div key={m} className="text-amber-700 dark:text-amber-300">{m}</div>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {!result && (
          <div className="p-5 border-t border-stone-100 dark:border-stone-800 space-y-3">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} />
              <span>
                Email login details to new investors now. Leave this off to check the imported data first; you can send them later from
                Investors → select → <b>Send login details</b>.
              </span>
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={confirmImport}
                disabled={loading || !preview || preview.successCount === 0}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-[#1B4332] hover:bg-[#2D6A4F] text-white disabled:opacity-50 cursor-pointer"
              >
                {loading && preview ? 'Working…' : `Import ${preview?.successCount ?? 0} holding(s)`}
              </button>
              <button onClick={onClose} className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
        {result && (
          <div className="p-5 border-t border-stone-100 dark:border-stone-800">
            <button onClick={onClose} className="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-[#1B4332] hover:bg-[#2D6A4F] text-white cursor-pointer">Done</button>
          </div>
        )}
      </div>
    </div>
  , document.body);
}

export function useImportReview(token: string) {
  const [state, setState] = useState<null | { records: any[]; endpoint?: string; rowOffset?: number; resolve: (data: any) => void }>(null);

  const reviewImport = (records: any[], opts: { endpoint?: string; rowOffset?: number } = {}) =>
    new Promise<any>(resolve => setState({ records, ...opts, resolve }));

  const reviewModal = state ? (
    <ImportReviewModal
      records={state.records}
      token={token}
      endpoint={state.endpoint}
      rowOffset={state.rowOffset}
      onImported={data => state.resolve(data)}
      onClose={() => {
        state.resolve(null);
        setState(null);
      }}
    />
  ) : null;

  return { reviewImport, reviewModal };
}
