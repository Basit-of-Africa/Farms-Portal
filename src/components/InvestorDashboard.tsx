/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Sprout, MapPin, Wallet, Ruler, TrendingUp, Clock, ChevronRight, HelpCircle, FileText } from 'lucide-react';
import { User as UserType, Farm } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { DataTable } from './ui/data-table';
import { FormError } from './ui/form';
import { formatNaira } from '../lib/utils';

interface InvestorDashboardProps {
  user: UserType;
  token: string;
  onSelectFarm: (farmId: string) => void;
  refreshSignal: number;
}

interface Holding {
  farmId?: string;
  farmName?: string;
  plotNumber?: string;
  cropType?: string;
  investmentAmount?: number;
  sizeHectares?: number;
  sizeUnit?: string;
  contractRef?: string;
  startDate?: string;
}

const unitLabel = (n: number, unit: string) => `${Number(n.toFixed(2))} ${unit}${n === 1 ? '' : 's'}`;

/** "3 acres · 2 plots" (sizes in different units are never added together) */
function landSummary(holdings: Holding[]): string {
  const totals = new Map<string, number>();
  for (const h of holdings) {
    const unit = (h.sizeUnit || 'acre').toLowerCase();
    totals.set(unit, (totals.get(unit) || 0) + (Number(h.sizeHectares) || 0));
  }
  if (totals.size === 0) return '—';
  return [...totals.entries()].map(([unit, n]) => unitLabel(n, unit)).join(' · ');
}

function Stat({ icon: Icon, label, value, note, tone = 'primary' }: { icon: any; label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'primary' | 'gold' | 'success' }) {
  const toneClass = tone === 'gold' ? 'bg-gold/10 text-gold' : tone === 'success' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary';
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className={`p-3 rounded-2xl ${toneClass}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-xl font-bold text-foreground mt-0.5 break-words">{value}</div>
        {note && <div className="text-xs text-muted-foreground mt-0.5">{note}</div>}
      </div>
    </Card>
  );
}

export default function InvestorDashboard({ user, token, onSelectFarm, refreshSignal }: InvestorDashboardProps) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<{ totalCapital: number; totalPaidReturns: number; totalPendingReturns: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/investor/portfolio', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('We could not load your portfolio. Please try again.');
        const data = await res.json();
        setFarms(data.farms || []);
        setHoldings(data.holdings || []);
        setSummary(data.summary || null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, refreshSignal]);

  const totalInvested = summary?.totalCapital ?? holdings.reduce((s, h) => s + (Number(h.investmentAmount) || 0), 0);
  const firstName = user.name.replace(/^(mr|mrs|ms|miss|dr|prof|engr|alh)\.?\s+/i, '').split(' ')[0];

  const columns = useMemo<ColumnDef<Holding>[]>(
    () => [
      { accessorKey: 'farmName', header: 'Farm', cell: ({ getValue }) => <span className="font-semibold">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'plotNumber', header: 'Plot', cell: ({ getValue }) => <span className="font-mono text-xs whitespace-nowrap">{(getValue() as string) || '—'}</span> },
      { accessorKey: 'cropType', header: 'Crop' },
      {
        id: 'size',
        header: 'Size',
        accessorFn: h => Number(h.sizeHectares) || 0,
        cell: ({ row }) => <span className="whitespace-nowrap">{unitLabel(Number(row.original.sizeHectares) || 0, row.original.sizeUnit || 'acre')}</span>
      },
      {
        accessorKey: 'investmentAmount',
        header: 'Invested',
        cell: ({ getValue }) => <span className="font-semibold whitespace-nowrap">{formatNaira(getValue() as number)}</span>
      },
      {
        accessorKey: 'startDate',
        header: 'Since',
        cell: ({ getValue }) => <span className="whitespace-nowrap">{getValue() ? new Date(getValue() as string).toLocaleDateString() : '—'}</span>
      },
      { accessorKey: 'contractRef', header: 'Contract', cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">{(getValue() as string) || '—'}</span> }
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]" role="status" aria-label="Loading your portfolio">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div id="investor-dashboard-container" className="flex flex-col gap-8">
      <FormError message={error} />

      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F291E] via-[#1B4332] to-[#2D6A4F] p-8 md:p-10 text-white shadow-premium">
        <Sprout className="pointer-events-none absolute -right-10 -bottom-10 h-72 w-72 opacity-[0.06]" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <h1 className="font-bold text-2xl md:text-3xl">Welcome back, {firstName}</h1>
          <p className="mt-2 text-base text-white/80">
            Here is an overview of your farm investments: your plots, what you have invested and the returns paid to you.
          </p>
          <Button
            variant="outline"
            className="mt-5 border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={() => window.dispatchEvent(new CustomEvent('start-onboarding-tour'))}
          >
            <HelpCircle /> Show me around
          </Button>
        </div>
      </section>

      <section id="investor-stats-grid" aria-label="Portfolio summary" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat icon={Wallet} label="Total invested" value={formatNaira(totalInvested)} />
        <Stat icon={Sprout} label="Your plots" value={holdings.length} note={`on ${farms.length} ${farms.length === 1 ? 'farm' : 'farms'}`} tone="gold" />
        <Stat icon={Ruler} label="Land held" value={landSummary(holdings)} />
        <Stat
          icon={TrendingUp}
          label="Returns paid to you"
          value={formatNaira(summary?.totalPaidReturns ?? 0)}
          note={summary?.totalPendingReturns ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {formatNaira(summary.totalPendingReturns)} pending</span> : undefined}
          tone="success"
        />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section id="investor-farms-list" className="xl:col-span-5 flex flex-col gap-4" aria-labelledby="farms-heading">
          <h2 id="farms-heading" className="font-bold text-lg text-foreground">Your farms</h2>
          {farms.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">You don't hold any plots yet. Your plots will appear here once they are allocated to you.</Card>
          ) : (
            farms.map(farm => (
              <button
                key={farm.id}
                onClick={() => onSelectFarm(farm.id)}
                className="group text-left rounded-2xl border border-border bg-card shadow-sm overflow-hidden transition hover:shadow-premium-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
              >
                <div className="relative h-32 bg-muted overflow-hidden">
                  <img src={farm.coverImage || '/farm-placeholder.svg'} alt="" className="w-full h-full object-cover transition duration-700 group-hover:scale-105" />
                </div>
                <div className="p-5">
                  <h3 className="font-bold text-base text-foreground">{farm.name}</h3>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> {farm.location}, {farm.state}
                  </p>
                  <p className="text-sm mt-3">
                    {farm.myPlotsCount ?? 1} {(farm.myPlotsCount ?? 1) === 1 ? 'plot' : 'plots'} · {formatNaira(farm.myTotalInvested ?? 0)} invested
                  </p>
                  <span className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm font-semibold text-primary">
                    See farm updates and documents
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </div>
              </button>
            ))
          )}
        </section>

        <section id="investor-plots-table" className="xl:col-span-7 flex flex-col gap-4" aria-labelledby="plots-heading">
          <h2 id="plots-heading" className="font-bold text-lg text-foreground">Your plots</h2>
          <DataTable columns={columns} data={holdings} hideSearch={holdings.length < 8} searchPlaceholder="Search your plots…" emptyMessage="No plots yet." />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" /> Your documents</CardTitle>
              <CardDescription>
                Contracts, certificates of ownership and survey plans are in each farm's document section. Open a farm to see them.
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </section>
      </div>
    </div>
  );
}
