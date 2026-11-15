/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { MapPin, FileText, Download, Layers, User, Clock, ArrowLeft, RotateCcw, X, Map as MapIcon, Plus, Trash2, Users, Lock, Globe, Loader2 } from 'lucide-react';
import { User as UserType, Farm, FarmPlot, FarmMapNote, FarmUpdate, Document, UserRole, PlotStatus } from '../types';
import CommentsSection from './CommentsSection';
import { getRelativeTime } from '../utils/time';
import { toast } from './ui/sonner';
import { useConfirm } from './ui/confirm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input, Textarea } from './ui/input';
import { Label } from './ui/label';
import { DataTable } from './ui/data-table';
import { formatNaira } from '../lib/utils';
import { HoldingDialog } from './HoldingDialogs';

interface FarmDetailProps {
  user: UserType;
  token: string;
  farmId: string;
  onBack: () => void;
  onSelectInvestor?: (investorId: string) => void;
  refreshSignal: number;
}

interface FarmData {
  farm: Farm;
  plots: FarmPlot[];
  updates: FarmUpdate[];
  documents: Document[];
  investorHoldings?: any[];
  farmInvestors?: any[];
  totalEstateInvestment?: number;
  mapNotes?: FarmMapNote[];
}

const STATUS_LABEL: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'default' }> = {
  [PlotStatus.ACTIVE]: { label: 'Growing', variant: 'success' },
  [PlotStatus.HARVESTING]: { label: 'Harvesting', variant: 'warning' },
  [PlotStatus.DORMANT]: { label: 'Resting', variant: 'muted' },
  [PlotStatus.AVAILABLE]: { label: 'Available', variant: 'default' }
};
const PLOT_FILL: Record<string, string> = {
  [PlotStatus.ACTIVE]: 'bg-emerald-600/15 border-emerald-600/40 text-emerald-900 dark:text-emerald-200',
  [PlotStatus.HARVESTING]: 'bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200',
  [PlotStatus.DORMANT]: 'bg-stone-500/15 border-stone-500/40 text-stone-700 dark:text-stone-300',
  [PlotStatus.AVAILABLE]: 'bg-sky-500/15 border-sky-500/40 text-sky-900 dark:text-sky-200'
};

const CATEGORY_LABEL: Record<string, string> = {
  contract: 'Contract',
  certificate: 'Certificate',
  report: 'Report',
  financial: 'Financial',
  legal: 'Legal',
  other: 'Other'
};

const sizeText = (n: number | string, unit?: string) => `${Number(n) || 0} ${unit || 'acre'}${Number(n) === 1 ? '' : 's'}`;

export default function FarmDetail({ user, token, farmId, onBack, onSelectInvestor, refreshSignal }: FarmDetailProps) {
  const confirmDialog = useConfirm();
  const [data, setData] = useState<FarmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('updates');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [addHoldingOpen, setAddHoldingOpen] = useState(false);

  const isStaff = user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER;
  const isAdmin = user.role === UserRole.ADMIN;

  const fetchFarmDetails = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      const res = await fetch(`/api/farms/${farmId}`, { headers: { Authorization: `Bearer ${token}` } });
      const val = await res.json();
      if (!res.ok) throw new Error(val.error || 'We could not load this farm.');
      setData(val);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFarmDetails();
  }, [farmId, token, refreshSignal]);

  /**
   * Documents are served by the API (local files) or via a short-lived signed
   * link (private cloud storage). The session cookie authorises both.
   */
  const handleDownload = async (doc: Document) => {
    const url = `/api/documents/${doc.id}/download`;
    setDownloadingId(doc.id);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual' });
      if (res.type === 'opaqueredirect') {
        window.location.assign(url);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'You do not have access to this document.');
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = doc.fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const plotColumns = useMemo<ColumnDef<FarmPlot>[]>(() => {
    const holdings = data?.investorHoldings || [];
    const cols: ColumnDef<FarmPlot>[] = [
      { accessorKey: 'plotNumber', header: 'Plot', cell: ({ getValue }) => <span className="font-mono text-xs whitespace-nowrap">{getValue() as string}</span> },
      { id: 'size', header: 'Size', accessorFn: p => Number(p.sizeHectares) || 0, cell: ({ row }) => <span className="whitespace-nowrap">{sizeText(row.original.sizeHectares, row.original.sizeUnit)}</span> },
      { accessorKey: 'cropType', header: 'Crop' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const s = STATUS_LABEL[getValue() as string] || { label: String(getValue()), variant: 'muted' as const };
          return <Badge variant={s.variant}>{s.label}</Badge>;
        }
      },
      {
        id: 'owner',
        header: 'Owner',
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          const ph = holdings.filter((h: any) => h.plotId === p.id);
          if (ph.length === 0) return <span className="text-muted-foreground">{p.status === PlotStatus.AVAILABLE ? 'Available' : '—'}</span>;
          if (user.role === UserRole.INVESTOR) return <span className="font-semibold text-success">Your plot</span>;
          return (
            <div className="flex flex-wrap gap-x-2">
              {ph.map((h: any, i: number) =>
                isAdmin && onSelectInvestor && h.investorId ? (
                  <button key={i} type="button" onClick={() => onSelectInvestor(h.investorId)} className="font-semibold text-primary hover:underline cursor-pointer">
                    {h.investorName || 'Investor'}
                  </button>
                ) : (
                  <span key={i} className="font-semibold">{h.investorName || 'Investor'}</span>
                )
              )}
            </div>
          );
        }
      }
    ];
    if (user.role !== UserRole.FARM_MANAGER) {
      cols.push({
        id: 'invested',
        header: 'Invested',
        accessorFn: p => holdings.filter((h: any) => h.plotId === p.id).reduce((s: number, h: any) => s + (Number(h.investmentAmount) || 0), 0),
        cell: ({ getValue }) => <span className="font-semibold whitespace-nowrap">{(getValue() as number) ? formatNaira(getValue() as number) : '—'}</span>
      });
    }
    return cols;
  }, [data, user.role]);

  const ownerColumns = useMemo<ColumnDef<any>[]>(() => {
    const cols: ColumnDef<any>[] = [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const inv = row.original;
          const label = (
            <span>
              <span className="block font-semibold">{inv.name}</span>
              <span className="block text-xs text-muted-foreground">@{inv.username}</span>
            </span>
          );
          return isAdmin && onSelectInvestor ? (
            <button type="button" onClick={() => onSelectInvestor(inv.id)} className="text-left hover:underline cursor-pointer">{label}</button>
          ) : (
            label
          );
        }
      },
      {
        accessorKey: 'email',
        header: 'Contact',
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{row.original.email}</div>
            {row.original.phone && <div className="text-xs text-muted-foreground">{row.original.phone}</div>}
          </div>
        )
      },
      {
        accessorKey: 'plotsCount',
        header: 'Plots',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.plotNumbers || []).map((pn: string) => (
              <Badge key={pn} variant="outline" className="font-mono">{pn}</Badge>
            ))}
          </div>
        )
      },
      { id: 'area', header: 'Land', accessorFn: inv => Number(inv.totalSize) || 0, cell: ({ row }) => <span className="whitespace-nowrap">{row.original.landText || sizeText(row.original.totalSize, row.original.sizeUnit)}</span> }
    ];
    if (isAdmin) {
      cols.push({ accessorKey: 'totalInvested', header: 'Invested', cell: ({ getValue }) => <span className="font-semibold whitespace-nowrap">{formatNaira(getValue() as number)}</span> });
    }
    return cols;
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]" role="status" aria-label="Loading farm">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6 border-destructive/40 flex flex-col gap-3">
        <h3 className="font-bold text-destructive">We could not open this farm</h3>
        <p className="text-sm text-muted-foreground">{error || 'You may not have access to it.'}</p>
        <div>
          <Button onClick={onBack}><ArrowLeft /> Back to dashboard</Button>
        </div>
      </Card>
    );
  }

  const { farm, plots, updates, documents, farmInvestors = [], totalEstateInvestment = 0, mapNotes = [] } = data;
  const filteredUpdates = updates.filter(up => {
    if (!up.createdAt) return true;
    const d = new Date(up.createdAt);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return (!filterStart || ds >= filterStart) && (!filterEnd || ds <= filterEnd);
  });
  const clearFilter = () => {
    setFilterStart('');
    setFilterEnd('');
  };

  // Land totals per unit (acres and plots are never added together)
  const landByUnit = new Map<string, number>();
  plots.forEach(p => landByUnit.set(p.sizeUnit || 'acre', (landByUnit.get(p.sizeUnit || 'acre') || 0) + (Number(p.sizeHectares) || 0)));
  const landText = [...landByUnit.entries()].map(([u, n]) => sizeText(Number(n.toFixed(2)), u)).join(' · ') || '—';

  return (
    <div id="farm-detail-stage" className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" onClick={onBack} className="-ml-3">
          <ArrowLeft /> Back to dashboard
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="relative h-56 md:h-64 bg-muted">
          <img src={farm.coverImage || '/farm-placeholder.svg'} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0F291E] via-[#1B4332]/40 to-transparent" />
          <div className="absolute bottom-5 left-6 right-6 text-white">
            {farm.dateEstablished && (
              <Badge className="bg-gold text-[#1f2d26]">Since {new Date(farm.dateEstablished).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</Badge>
            )}
            <h1 className="font-bold text-2xl md:text-3xl mt-2">{farm.name}</h1>
            <p className="flex items-center gap-1.5 text-sm mt-1 text-white/85">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {farm.location}, {farm.state}
            </p>
          </div>
        </div>
        <CardContent className="pt-5">
          {farm.description && <p className="text-sm text-muted-foreground max-w-4xl">{farm.description}</p>}
          <dl className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Plots</dt>
              <dd className="font-bold text-base">{plots.length}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Land</dt>
              <dd className="font-bold text-base">{landText}</dd>
            </div>
            {isStaff && (
              <div>
                <dt className="text-muted-foreground">Investors</dt>
                <dd className="font-bold text-base">{farmInvestors.length}</dd>
              </div>
            )}
            {user.role !== UserRole.FARM_MANAGER && (
              <div>
                <dt className="text-muted-foreground">{isAdmin ? 'Total invested' : 'You invested'}</dt>
                <dd className="font-bold text-base">{formatNaira(totalEstateInvestment)}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap sm:flex-wrap">
          <TabsTrigger value="updates"><Clock /> Updates ({updates.length})</TabsTrigger>
          <TabsTrigger value="documents"><FileText /> Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="plots"><Layers /> Plots ({plots.length})</TabsTrigger>
          {isStaff && <TabsTrigger value="owners"><Users /> Investors ({farmInvestors.length})</TabsTrigger>}
          <TabsTrigger value="map"><MapIcon /> Map notes ({mapNotes.length})</TabsTrigger>
        </TabsList>

        {/* UPDATES */}
        <TabsContent value="updates" className="flex flex-col gap-4">
          {updates.length > 0 && (
            <Card className="p-4 flex flex-col md:flex-row md:items-end justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {filterStart || filterEnd ? `Showing ${filteredUpdates.length} of ${updates.length} updates` : `${updates.length} update${updates.length === 1 ? '' : 's'}`}
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="upd-from" className="text-xs">From</Label>
                  <Input id="upd-from" type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="h-9 w-auto" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="upd-to" className="text-xs">To</Label>
                  <Input id="upd-to" type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="h-9 w-auto" />
                </div>
                {(filterStart || filterEnd) && (
                  <Button variant="outline" size="sm" onClick={clearFilter}><RotateCcw /> Clear</Button>
                )}
              </div>
            </Card>
          )}

          {updates.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground border-dashed">No updates have been posted for this farm yet.</Card>
          ) : filteredUpdates.length === 0 ? (
            <Card className="p-10 text-center flex flex-col items-center gap-3 border-dashed">
              <p className="text-sm text-muted-foreground">No updates in the selected dates.</p>
              <Button size="sm" onClick={clearFilter}><RotateCcw /> Show all updates</Button>
            </Card>
          ) : (
            filteredUpdates.map(up => (
              <Card key={up.id} className="p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="success" className="capitalize">{String(up.updateType).replace(/_/g, ' ')}</Badge>
                      {isStaff &&
                        (up.targetInvestorIds && up.targetInvestorIds.length > 0 ? (
                          <Badge variant="muted"><Lock className="h-3 w-3" /> {up.targetInvestorIds.length} selected investor(s)</Badge>
                        ) : (
                          <Badge variant="muted"><Globe className="h-3 w-3" /> All investors on this farm</Badge>
                        ))}
                    </div>
                    <h3 className="font-bold text-base">{up.title}</h3>
                  </div>
                  <time dateTime={up.createdAt} title={new Date(up.createdAt).toLocaleString()} className="text-sm text-muted-foreground whitespace-nowrap">
                    {getRelativeTime(up.createdAt)}
                  </time>
                </div>

                <p className="text-sm leading-relaxed whitespace-pre-line">{up.body}</p>

                {up.photos && up.photos.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {up.photos.map(p => (
                      <figure key={p.id} className="overflow-hidden rounded-xl border border-border bg-muted">
                        <img src={p.image} alt={p.caption || `Photo from ${up.title}`} className="w-full h-36 object-cover" loading="lazy" referrerPolicy="no-referrer" />
                        {p.caption && <figcaption className="p-2 text-xs text-muted-foreground truncate">{p.caption}</figcaption>}
                      </figure>
                    ))}
                  </div>
                )}

                <p className="flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border pt-3">
                  <User className="h-3.5 w-3.5" aria-hidden="true" /> Posted by {up.postedByName}
                  {up.updatedAt && up.updatedAt !== up.createdAt && <> · edited {getRelativeTime(up.updatedAt)}</>}
                </p>

                <CommentsSection updateId={up.id} comments={up.comments} currentUser={user} token={token} onCommentAdded={() => fetchFarmDetails(false)} />
              </Card>
            ))
          )}
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents">
          {documents.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground border-dashed">No documents have been shared for this farm yet.</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documents.map(doc => (
                <Card key={doc.id} className="p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2.5 rounded-xl bg-muted text-muted-foreground shrink-0">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm">{doc.title}</h4>
                        <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                      </div>
                    </div>
                    <Badge variant="outline">{CATEGORY_LABEL[doc.category] || doc.category}</Badge>
                  </div>
                  {doc.description && <p className="text-sm text-muted-foreground">{doc.description}</p>}
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-3 mt-auto">
                    <span className="text-xs text-muted-foreground">
                      {doc.visibility === 'plot' ? 'Shared with the plot owner' : 'Shared with all investors on this farm'} · {new Date(doc.uploadedAt).toLocaleDateString()}
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => handleDownload(doc)} disabled={downloadingId === doc.id}>
                      {downloadingId === doc.id ? <Loader2 className="animate-spin" /> : <Download />} Download
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* PLOTS */}
        <TabsContent value="plots">
          <DataTable columns={plotColumns} data={plots} hideSearch={plots.length < 10} searchPlaceholder="Search plots…" emptyMessage="No plots on this farm yet." />
        </TabsContent>

        {/* INVESTORS (staff) */}
        {isStaff && (
          <TabsContent value="owners" className="flex flex-col gap-3">
            {isAdmin && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {onSelectInvestor ? "Select a name to open that investor's profile, where holdings and payouts can be edited." : 'Investors with holdings on this farm.'}
                </p>
                <Button size="sm" onClick={() => setAddHoldingOpen(true)}><Users /> Add investor to this farm</Button>
              </div>
            )}
            {isAdmin && (
              <HoldingDialog
                token={token}
                open={addHoldingOpen}
                farmId={farmId}
                onClose={() => setAddHoldingOpen(false)}
                onSaved={() => fetchFarmDetails(false)}
              />
            )}
            <DataTable columns={ownerColumns} data={farmInvestors} searchPlaceholder="Search investors…" emptyMessage="No investors hold plots on this farm yet." />
          </TabsContent>
        )}

        {/* MAP NOTES */}
        <TabsContent value="map">
          <FarmMapNotes
            farmId={farmId}
            token={token}
            user={user}
            plots={plots}
            notes={mapNotes}
            onChanged={() => fetchFarmDetails(false)}
            confirmDelete={() => confirmDialog({ title: 'Delete this map note?', confirmText: 'Delete', destructive: true })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Map notes: a schematic plot layout where staff can pin notes
// ---------------------------------------------------------------------------

function FarmMapNotes({
  farmId,
  token,
  user,
  plots,
  notes,
  onChanged,
  confirmDelete
}: {
  farmId: string;
  token: string;
  user: UserType;
  plots: FarmPlot[];
  notes: FarmMapNote[];
  onChanged: () => void;
  confirmDelete: () => Promise<boolean>;
}) {
  const canPin = user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER;
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<FarmMapNote | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft || !text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/farms/${farmId}/map-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...draft, note: text })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not save the note.');
      setDraft(null);
      setText('');
      toast.success('Note pinned.');
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (note: FarmMapNote) => {
    if (!(await confirmDelete())) return;
    try {
      const res = await fetch(`/api/farms/${farmId}/map-notes/${note.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not delete the note.');
      setSelected(null);
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Plot layout</CardTitle>
          <CardDescription>
            A schematic view of this farm's plots (not to scale).{' '}
            {canPin ? 'Click anywhere to pin a note for the team and investors.' : 'Select a pin to read the note.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            id="farm-estate-map-canvas"
            role={canPin ? 'button' : undefined}
            aria-label={canPin ? 'Plot layout. Click to place a note.' : 'Plot layout'}
            onClick={e => {
              if (!canPin) return;
              const target = e.target as HTMLElement;
              if (target.closest('.map-pin-element') || target.closest('.map-pin-tooltip') || target.closest('form')) return;
              const rect = e.currentTarget.getBoundingClientRect();
              setDraft({
                x: Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10,
                y: Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10
              });
              setText('');
              setSelected(null);
            }}
            className={`relative h-[420px] w-full rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-emerald-50 to-amber-50/40 dark:from-emerald-950/40 dark:to-stone-900 select-none ${canPin ? 'cursor-crosshair' : ''}`}
          >
            <div className="absolute inset-0 p-6 grid grid-cols-2 sm:grid-cols-3 gap-3 pointer-events-none">
              {plots.map(plot => (
                <div key={plot.id} className={`rounded-xl border border-dashed p-3 flex flex-col justify-between ${PLOT_FILL[plot.status] || PLOT_FILL[PlotStatus.DORMANT]}`}>
                  <span className="text-xs font-mono font-semibold">{plot.plotNumber}</span>
                  <span className="text-xs">
                    {plot.cropType} · {sizeText(plot.sizeHectares, plot.sizeUnit)}
                  </span>
                </div>
              ))}
            </div>

            {notes.map(note => (
              <button
                key={note.id}
                type="button"
                className="map-pin-element absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{ left: `${note.x}%`, top: `${note.y}%` }}
                onClick={e => {
                  e.stopPropagation();
                  setSelected(note);
                  setDraft(null);
                }}
                aria-label={`Note by ${note.authorName}: ${note.note}`}
              >
                <span className={`flex p-1.5 rounded-full shadow border transition ${focusedId === note.id ? 'bg-gold border-gold text-[#1f2d26] scale-125' : 'bg-card border-border text-primary hover:scale-110'}`}>
                  <MapPin className="h-4 w-4 fill-current" />
                </span>
              </button>
            ))}

            {draft && (
              <span className="absolute z-30 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full border-2 border-gold bg-gold/20 flex items-center justify-center pointer-events-none" style={{ left: `${draft.x}%`, top: `${draft.y}%` }}>
                <Plus className="h-4 w-4 text-gold" />
              </span>
            )}

            {selected && (
              <div
                className="map-pin-tooltip absolute z-40 w-72 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-2xl border border-border bg-popover p-4 shadow-xl flex flex-col gap-2"
                style={{ left: `${Math.min(Math.max(selected.x, 20), 80)}%`, top: selected.y > 60 ? `${selected.y - 30}%` : `${selected.y + 4}%` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{selected.authorName}</p>
                    <p className="text-xs text-muted-foreground">{getRelativeTime(selected.createdAt)}</p>
                  </div>
                  <button type="button" onClick={() => setSelected(null)} className="p-1 rounded-full hover:bg-muted cursor-pointer" aria-label="Close note">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm max-h-28 overflow-y-auto whitespace-pre-line">{selected.note}</p>
                {(user.role === UserRole.ADMIN || selected.authorId === user.id) && (
                  <div>
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 -ml-2" onClick={() => remove(selected)}>
                      <Trash2 /> Delete
                    </Button>
                  </div>
                )}
              </div>
            )}

            {draft && (
              <form onSubmit={save} className="absolute bottom-3 left-3 right-3 z-40 rounded-2xl border border-border bg-popover p-4 shadow-xl flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 flex flex-col gap-1.5">
                  <Label htmlFor="pin-note">New note</Label>
                  <Textarea id="pin-note" autoFocus rows={2} required placeholder="e.g. Irrigation line repaired here on Monday" value={text} onChange={e => setText(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
                  <Button type="submit" disabled={saving || !text.trim()}>{saving ? 'Saving…' : 'Pin note'}</Button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {Object.entries(STATUS_LABEL).map(([status, s]) => (
              <span key={status} className="inline-flex items-center gap-1.5">
                <span className={`w-3.5 h-3.5 rounded border border-dashed ${PLOT_FILL[status]}`} /> {s.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
          <CardDescription>{notes.length} note{notes.length === 1 ? '' : 's'} on this farm</CardDescription>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-2xl text-sm text-muted-foreground">
              <MapPin className="h-8 w-8 mb-2 opacity-40" aria-hidden="true" />
              No notes yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
              {notes.map(note => (
                <li key={note.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setFocusedId(note.id)}
                    onMouseLeave={() => setFocusedId(null)}
                    onFocus={() => setFocusedId(note.id)}
                    onBlur={() => setFocusedId(null)}
                    onClick={() => {
                      setSelected(note);
                      setDraft(null);
                      document.getElementById('farm-estate-map-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}
                    className="w-full text-left rounded-2xl border border-border p-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <p className="text-sm line-clamp-2">{note.note}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {note.authorName} · {getRelativeTime(note.createdAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
