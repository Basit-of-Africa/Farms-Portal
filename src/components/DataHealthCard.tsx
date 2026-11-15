/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin "Data check": runs a read-only integrity report and lists what is
 * wrong (broken links, duplicates, hidden records) and what it causes.
 */

import React, { useState } from 'react';
import { Stethoscope, Loader2, AlertTriangle, Info, XCircle, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from './ui/sonner';

interface Issue {
  id: string;
  title: string;
  effect: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  examples: string[];
}

export default function DataHealthCard({ token }: { token: string }) {
  const [report, setReport] = useState<{ generatedAt: string; counts: Record<string, number>; issues: Issue[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/data-health', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The data check failed.');
      setReport(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const icon = (s: Issue['severity']) =>
    s === 'error' ? <XCircle className="h-4 w-4 text-destructive" /> : s === 'warning' ? <AlertTriangle className="h-4 w-4 text-warning" /> : <Info className="h-4 w-4 text-muted-foreground" />;

  return (
    <Card id="data-health">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" /> Data check</CardTitle>
        <CardDescription>Looks for broken links between investors, holdings, plots and farms, duplicate accounts or farms, and records the screens would hide. It only reads; nothing is changed.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button onClick={run} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <Stethoscope />} {report ? 'Run again' : 'Run data check'}</Button>
        </div>

        {report && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(report.counts).map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-muted p-3">
                  <div className="text-xs text-muted-foreground capitalize">{k}</div>
                  <div className="font-bold text-lg">{v}</div>
                </div>
              ))}
            </div>

            {report.issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success font-semibold"><CheckCircle2 className="h-4 w-4" /> No problems found.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
                {report.issues.map(issue => (
                  <li key={issue.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(open === issue.id ? null : issue.id)}
                      aria-expanded={open === issue.id}
                      className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/40 cursor-pointer"
                    >
                      <span className="mt-0.5">{icon(issue.severity)}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-sm">{issue.title}</span>
                        <span className="block text-sm text-muted-foreground">{issue.effect}</span>
                      </span>
                      <Badge variant={issue.severity === 'error' ? 'destructive' : issue.severity === 'warning' ? 'warning' : 'muted'}>{issue.count}</Badge>
                      <ChevronDown className={`h-4 w-4 mt-0.5 transition ${open === issue.id ? 'rotate-180' : ''}`} />
                    </button>
                    {open === issue.id && (
                      <ul className="px-4 pb-4 pl-11 text-xs text-muted-foreground space-y-1 font-mono break-all">
                        {issue.examples.map(e => <li key={e}>{e}</li>)}
                        {issue.count > issue.examples.length && <li>…and {issue.count - issue.examples.length} more</li>}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
