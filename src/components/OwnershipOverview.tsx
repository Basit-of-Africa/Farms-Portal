/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin "Farm ownership": every farm with its investors, the land each holds
 * (per unit, never mixing acres and plots) and the amount invested, plus any
 * holdings that are not linked to a farm.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Copy, Loader2, RefreshCw, AlertTriangle, MapPin, UserPlus, Merge } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { NativeSelect } from './ui/input';
import { FormField, FormError } from './ui/form';
import { useConfirm } from './ui/confirm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { HoldingDialog } from './HoldingDialogs';
import { toast } from './ui/sonner';
import { formatNaira } from '../lib/utils';

interface InvestorRow { id: string | null; name: string; email: string; landText: string; invested: number; holdings: number }
interface FarmRow { id: string; name: string; location: string; duplicateName: boolean; plots: number; landText: string; holdings: number; investors: InvestorRow[]; invested: number }
interface Overview {
  generatedAt: string;
  farms: FarmRow[];
  unlinked: Array<{ holdingId: string; investorId: string | null; investorName: string; email: string; reason: string; land: string; invested: number }>;
  totals: { farms: number; plots: number; activeHoldings: number; investorsWithHoldings: number; invested: number; holdingsWithAmount: number; landText: string };
}

export default function OwnershipOverview({ token, onSelectFarm, onSelectInvestor }: { token: string; onSelectFarm: (id: string) => void; onSelectInvestor: (id: string) => void }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [addFor, setAddFor] = useState<string | null>(null);
  const [mergeFrom, setMergeFrom] = useState<FarmRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ownership-overview', { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not load the overview.');
      setData(d);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const farms = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.farms;
    return data.farms.filter(f => f.name.toLowerCase().includes(q) || f.investors.some(i => i.name.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)));
  }, [data, query]);

  const toggle = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /** Farm names and numbers only (no names or emails), safe to share for support */
  const copySummary = async () => {
    if (!data) return;
    const t = data.totals;
    const lines = [
      `Estates summary (${new Date(data.generatedAt).toLocaleString()})`,
      `Totals: ${t.farms} farms, ${t.plots} plots, ${t.activeHoldings} active holdings (${t.holdingsWithAmount} with an amount), ${t.investorsWithHoldings} investors with holdings, ${formatNaira(t.invested)} invested, land ${t.landText}`,
      ...data.farms.map(f => `- ${f.name}${f.duplicateName ? ' [DUPLICATE NAME]' : ''}: ${f.plots} plots (${f.landText}), ${f.holdings} holdings, ${f.investors.length} investors, ${formatNaira(f.invested)}`),
      `Holdings not linked to any farm: ${data.unlinked.length} (${formatNaira(data.unlinked.reduce((s, u) => s + u.invested, 0))})`,
      ...Object.entries(data.unlinked.reduce((m: Record<string, number>, u) => ((m[u.reason.replace(/\(.*\)/, '').trim()] = (m[u.reason.replace(/\(.*\)/, '').trim()] || 0) + 1), m), {})).map(([r, n]) => `  - ${r}: ${n}`)
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success('Summary copied. It contains estate names and numbers only.');
    } catch {
      toast.error('Could not copy. Select the text manually instead.');
    }
  };

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground p-8" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Loading estates…</p>
    );
  }
  if (!data) return null;
  const t = data.totals;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-foreground">Estates and farm owners</h1>
          <p className="text-sm text-muted-foreground mt-1">Every estate with its farm owners, the size of farm each owns and the amount invested.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh</Button>
          <Button variant="outline" onClick={copySummary}><Copy /> Copy summary (no personal data)</Button>
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" aria-label="Totals">
        {[
          ['Estates', t.farms],
          ['Farms', t.plots],
          ['Land', t.landText],
          ['Farm owners', t.investorsWithHoldings],
          ['Farms owned', `${t.activeHoldings} (${t.holdingsWithAmount} with amount)`],
          ['Total invested', formatNaira(t.invested)]
        ].map(([label, value]) => (
          <Card key={label as string} className="p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="font-bold text-lg mt-0.5 break-words">{value}</div>
          </Card>
        ))}
      </section>

      {data.unlinked.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> {data.unlinked.length} farm(s) not linked to any estate</CardTitle>
            <CardDescription>These investments exist but their estate is missing, so they appear under no estate and the farm owner may not see them. Open the farm owner and edit the farm to choose the right estate.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Farm owner</TableHead><TableHead>Problem</TableHead><TableHead>Size of farm</TableHead><TableHead>Invested</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.unlinked.map(u => (
                  <TableRow key={u.holdingId}>
                    <TableCell>
                      {u.investorId ? <button className="font-semibold text-primary hover:underline cursor-pointer" onClick={() => onSelectInvestor(u.investorId!)}>{u.investorName}</button> : u.investorName}
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{u.reason}</TableCell>
                    <TableCell className="whitespace-nowrap">{u.land}</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{formatNaira(u.invested)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label="Search estates or farm owners" placeholder="Search an estate or farm owner…" value={query} onChange={e => setQuery(e.target.value)} className="max-w-sm" />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(new Set(farms.map(f => f.id)))}>Expand all</Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(new Set())}>Collapse all</Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {farms.map(f => {
          const isOpen = open.has(f.id) || !!query.trim();
          return (
            <Card key={f.id} className={f.duplicateName ? 'border-warning/50' : ''}>
              <button type="button" onClick={() => toggle(f.id)} aria-expanded={isOpen} className="w-full flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-left cursor-pointer hover:bg-muted/30 rounded-2xl">
                <span className="flex-1 min-w-[200px]">
                  <span className="flex items-center gap-2 font-bold">
                    {f.name}
                    {f.duplicateName && <Badge variant="warning">Another estate has the same name</Badge>}
                  </span>
                  {f.location && <span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {f.location}</span>}
                </span>
                <span className="text-sm"><span className="text-muted-foreground">Land </span><b>{f.landText}</b></span>
                <span className="text-sm"><span className="text-muted-foreground">Farm owners </span><b>{f.investors.length}</b></span>
                <span className="text-sm"><span className="text-muted-foreground">Invested </span><b>{formatNaira(f.invested)}</b></span>
                <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <CardContent className="flex flex-col gap-3">
                  {f.investors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No farm owners in this estate yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow><TableHead>Farm owner</TableHead><TableHead>Size of farm</TableHead><TableHead>Farms</TableHead><TableHead className="text-right">Invested</TableHead></TableRow>
                      </TableHeader>
                      <TableBody>
                        {f.investors.map(i => (
                          <TableRow key={(i.id || i.name) + f.id}>
                            <TableCell>
                              {i.id ? <button className="font-semibold text-primary hover:underline cursor-pointer text-left" onClick={() => onSelectInvestor(i.id!)}>{i.name}</button> : <span className="text-destructive">{i.name}</span>}
                              <div className="text-xs text-muted-foreground">{i.email}</div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{i.landText}</TableCell>
                            <TableCell>{i.holdings}</TableCell>
                            <TableCell className={`text-right whitespace-nowrap font-semibold ${i.invested ? '' : 'text-warning'}`}>{i.invested ? formatNaira(i.invested) : 'No amount'}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                          <TableCell>Total</TableCell>
                          <TableCell className="whitespace-nowrap">{f.landText}</TableCell>
                          <TableCell>{f.holdings}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">{formatNaira(f.invested)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onSelectFarm(f.id)}>Open estate</Button>
                    <Button size="sm" variant="outline" onClick={() => setAddFor(f.id)}><UserPlus /> Add farm owner</Button>
                    <Button size="sm" variant="ghost" onClick={() => setMergeFrom(f)}><Merge /> Merge into another estate…</Button>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
        {farms.length === 0 && <p className="text-sm text-muted-foreground">No estates match your search.</p>}
      </div>

      <HoldingDialog token={token} open={!!addFor} farmId={addFor || undefined} onClose={() => setAddFor(null)} onSaved={load} />
      <MergeEstateDialog token={token} source={mergeFrom} estates={data.farms} onClose={() => setMergeFrom(null)} onMerged={load} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Merge one estate into another (e.g. a misspelt duplicate)
// ---------------------------------------------------------------------------

const nameKey = (n: string) => n.toLowerCase().replace(/\b(farms?|estates?)\b/g, '').replace(/[^a-z0-9]/g, '');
function editDistance(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function MergeEstateDialog({ token, source, estates, onClose, onMerged }: { token: string; source: FarmRow | null; estates: FarmRow[]; onClose: () => void; onMerged: () => void }) {
  const confirmDialog = useConfirm();
  const [targetId, setTargetId] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Most similar names first (same estate typed differently)
  const options = useMemo(() => {
    if (!source) return [];
    const k = nameKey(source.name);
    return estates.filter(e => e.id !== source.id).sort((a, b) => editDistance(nameKey(a.name), k) - editDistance(nameKey(b.name), k) || a.name.localeCompare(b.name));
  }, [source, estates]);

  useEffect(() => {
    if (source) {
      setTargetId(options[0]?.id || '');
      setError(null);
    }
  }, [source?.id]);

  useEffect(() => {
    if (!source || !targetId) return setPreview(null);
    fetch('/api/admin/farms/merge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sourceId: source.id, targetId, dryRun: true }) })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setPreview(d); setError(null); })
      .catch(err => { setPreview(null); setError(err.message); });
  }, [source?.id, targetId]);

  const merge = async () => {
    if (!source || !preview) return;
    const ok = await confirmDialog({
      title: `Merge "${source.name}" into "${preview.target.name}"?`,
      description: `Everything in "${source.name}" moves to "${preview.target.name}" and "${source.name}" is removed. This cannot be undone.`,
      confirmText: 'Merge estates',
      destructive: true,
      requireText: 'MERGE'
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/farms/merge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sourceId: source.id, targetId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'The merge failed.');
      toast.success(`Merged into ${d.target.name}: ${d.farms} farm(s) from ${d.farmOwners} owner(s) moved.`);
      onMerged();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!source} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge "{source?.name}" into another estate</DialogTitle>
          <DialogDescription>Use this when the same estate exists twice, for example because of a spelling mistake in an import.</DialogDescription>
        </DialogHeader>
        <FormError message={error} />
        <FormField id="merge-target" label="Move everything into">
          <NativeSelect value={targetId} onChange={e => setTargetId(e.target.value)}>
            {options.map(o => <option key={o.id} value={o.id}>{o.name}{o.location ? ` (${o.location})` : ''}</option>)}
          </NativeSelect>
        </FormField>
        {preview && (
          <div className="rounded-2xl bg-muted p-4 text-sm space-y-1">
            <p className="font-semibold">This will move:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>{preview.farms} farm(s) owned by {preview.farmOwners} farm owner(s), {formatNaira(preview.invested)} invested</li>
              {preview.updates > 0 && <li>{preview.updates} update(s)</li>}
              {preview.documents > 0 && <li>{preview.documents} document(s)</li>}
              {preview.managers > 0 && <li>{preview.managers} farm manager assignment(s)</li>}
              {preview.renumbered > 0 && <li>{preview.renumbered} reference number(s) adjusted to avoid clashes</li>}
            </ul>
            <p className="pt-1">Then "{preview.source.name}" is removed.</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={merge} disabled={!preview || busy}>{busy && <Loader2 className="animate-spin" />} Merge estates</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
