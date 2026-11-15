/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Sprout,
  DollarSign,
  TrendingUp,
  Layers,
  Clock,
  ChevronRight,
  Landmark,
  AlertCircle,
  Loader2,
  Award,
  FileText,
  Calendar
} from 'lucide-react';
import { User as UserType, UserRole, FinancialStatus } from '../types';
import { HoldingDialog, PayoutDialog, HoldingRecord, PayoutRecord } from './HoldingDialogs';
import { Button } from './ui/button';
import { useConfirm } from './ui/confirm';
import { toast } from './ui/sonner';
import { Pencil, Trash2, Plus } from 'lucide-react';

interface InvestorProfileViewProps {
  investorId: string;
  token: string;
  onBack: () => void;
  onSelectFarm: (farmId: string) => void;
  refreshSignal: number;
}

interface InvestorProfileResponse {
  investor: UserType;
  summary: {
    totalFarms: number;
    totalPlots: number;
    totalInvested: number;
    totalPaidReturns: number;
    totalPendingReturns: number;
    totalReturnsAll: number;
    averageRoiPercentage: number;
    cumulativeRoiOnCapital: number;
  };
  farms: Array<{
    id: string | null;
    name: string;
    location: string;
    state: string;
    coverImage: string;
    description: string;
    dateEstablished: string;
    isActive: boolean;
    plotsCount: number;
    activePlotsCount: number;
    totalInvested: number;
    totalPaidReturns: number;
    totalPendingReturns: number;
    cropTypes: string[];
  }>;
  holdings: Array<{
    id: string;
    plotId: string;
    plotNumber: string;
    sizeHectares: number;
    sizeUnit: string;
    cropType: string;
    plotStatus: string;
    farmId: string | null;
    farmName: string;
    farmLocation: string;
    farmState: string;
    investmentAmount: number;
    ownershipPercentage: number;
    startDate: string;
    contractRef: string;
    isActive: boolean;
    paidReturns: number;
    pendingReturns: number;
  }>;
  financials: Array<{
    id: string;
    plotId: string;
    plotNumber: string;
    cropType: string;
    farmId: string | null;
    farmName: string;
    period: string;
    year: number;
    roiPercentage: number;
    payoutAmount: number;
    payoutDate: string;
    status: FinancialStatus;
    notes: string;
  }>;
}

export default function InvestorProfileView({
  investorId,
  token,
  onBack,
  onSelectFarm,
  refreshSignal
}: InvestorProfileViewProps) {
  const [profile, setProfile] = useState<InvestorProfileResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [holdingDialog, setHoldingDialog] = useState<{ open: boolean; holding: HoldingRecord | null }>({ open: false, holding: null });
  const [payoutDialog, setPayoutDialog] = useState<{ open: boolean; payout: PayoutRecord | null }>({ open: false, payout: null });
  const confirmDialog = useConfirm();
  const reload = () => setReloadKey(k => k + 1);

  const deleteRecord = async (url: string, title: string, description: string) => {
    if (!(await confirmDialog({ title, description, confirmText: 'Delete', destructive: true }))) return;
    try {
      const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete.');
      toast.success('Deleted.');
      reload();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const fetchProfile = async () => {
      try {
        if (reloadKey === 0) setLoading(true);
        setError(null);
        const res = await fetch(`/api/admin/investors/${encodeURIComponent(investorId)}/profile`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || 'Unable to load investor profile.');
        }
        const data: InvestorProfileResponse = await res.json();
        if (!isCancelled) {
          setProfile(data);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err.message || 'Failed to fetch investor profile.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    fetchProfile();
    return () => {
      isCancelled = true;
    };
  }, [investorId, token, refreshSignal, reloadKey]);

  const getStatusBadgeClass = (status: FinancialStatus | string) => {
    switch (status) {
      case FinancialStatus.PAID:
        return 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40';
      case FinancialStatus.PENDING:
        return 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40';
      case FinancialStatus.OVERDUE:
        return 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/40';
      case FinancialStatus.PARTIAL:
        return 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40';
      default:
        return 'bg-muted dark:bg-stone-800 text-foreground/80 dark:text-stone-400 border-border dark:border-stone-700';
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 text-[#52B788] animate-spin" />
        <p className="text-xs font-mono text-muted-foreground">Loading investor portfolio & returns ledger...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-card dark:bg-stone-900 border border-border dark:border-stone-800 rounded-xl text-xs font-mono font-bold text-primary dark:text-[#52B788] hover:bg-stone-50 dark:hover:bg-stone-800 transition cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Investors</span>
        </button>

        <div className="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-3xl flex items-start gap-3 text-rose-800 dark:text-rose-300">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-sans font-bold text-sm">Could Not Load Investor Profile</h3>
            <p className="text-xs mt-1">{error || 'Profile record was not found.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const { investor, summary, farms, holdings, financials } = profile;
  const initials = investor.name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Back Bar & Profile Hero */}
      <div className="bg-card dark:bg-stone-900 border border-border dark:border-stone-800 rounded-3xl p-6 shadow-premium space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-muted/40 dark:bg-stone-800 border border-border dark:border-stone-700 rounded-xl text-xs font-mono font-bold text-primary dark:text-[#52B788] hover:bg-emerald-50/60 dark:hover:bg-stone-750 transition cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Investors Directory</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[9.5px] font-mono font-extrabold px-3 py-1 rounded-full border ${
                investor.role === UserRole.ADMIN
                  ? 'bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/40'
                  : investor.role === UserRole.FARM_MANAGER
                  ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40'
                  : 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40'
              }`}
            >
              {investor.role.toUpperCase()}
            </span>
            <span
              className={`text-[9.5px] font-mono font-extrabold px-3 py-1 rounded-full border ${
                investor.isActive !== false
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                  : 'bg-muted dark:bg-stone-800 text-muted-foreground dark:text-stone-400 border-border dark:border-stone-700'
              }`}
            >
              {investor.isActive !== false ? 'ACTIVE ACCOUNT' : 'INACTIVE ACCOUNT'}
            </span>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pt-2 border-t border-border dark:border-stone-800">
          <div className="flex items-center gap-4 min-w-0">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white flex items-center justify-center font-serif font-extrabold text-xl shrink-0 shadow-md">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="font-serif font-extrabold text-2xl text-primary dark:text-[#52B788] truncate">
                {investor.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground dark:text-stone-400">
                <span className="font-mono text-[#2D6A4F] dark:text-emerald-400 font-semibold">@{investor.username}</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  ID: {investor.id}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-muted/40 dark:bg-stone-800/70 rounded-xl border border-stone-200/70 dark:border-stone-700">
              <Mail className="h-4 w-4 text-[#2D6A4F] dark:text-[#52B788] shrink-0" />
              <span className="text-foreground dark:text-stone-200 font-medium">{investor.email}</span>
            </div>
            <div className="flex items-center gap-2 px-3.5 py-2.5 bg-muted/40 dark:bg-stone-800/70 rounded-xl border border-stone-200/70 dark:border-stone-700">
              <Phone className="h-4 w-4 text-[#2D6A4F] dark:text-[#52B788] shrink-0" />
              <span className="text-foreground dark:text-stone-200 font-medium">{investor.phone || 'Not provided'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Financial & Portfolio KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="bg-card dark:bg-stone-900 p-5 rounded-2xl border border-border dark:border-stone-800 shadow-premium flex items-center gap-4">
          <div className="p-3.5 bg-[#1B4332]/10 dark:bg-emerald-950/50 text-primary dark:text-[#52B788] rounded-xl shrink-0">
            <DollarSign className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Amount Invested</p>
            <p className="text-xl font-extrabold text-primary dark:text-stone-100 mt-0.5 truncate">
              ₦{summary.totalInvested.toLocaleString()}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
              Across {summary.totalPlots} active plot{summary.totalPlots === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="bg-card dark:bg-stone-900 p-5 rounded-2xl border border-border dark:border-stone-800 shadow-premium flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Returns Earned (Paid)</p>
            <p className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
              ₦{summary.totalPaidReturns.toLocaleString()}
            </p>
            <p className="text-[10px] font-mono text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
              {summary.cumulativeRoiOnCapital}% cumulative capital return
            </p>
          </div>
        </div>

        <div className="bg-card dark:bg-stone-900 p-5 rounded-2xl border border-border dark:border-stone-800 shadow-premium flex items-center gap-4">
          <div className="p-3.5 bg-[#D4A017]/10 text-[#D4A017] rounded-xl shrink-0">
            <Award className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Pending / Avg ROI</p>
            <p className="text-xl font-extrabold text-foreground dark:text-stone-100 mt-0.5 truncate">
              ₦{summary.totalPendingReturns.toLocaleString()}
            </p>
            <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              Avg Cycle Yield: {summary.averageRoiPercentage}%
            </p>
          </div>
        </div>

        <div className="bg-card dark:bg-stone-900 p-5 rounded-2xl border border-border dark:border-stone-800 shadow-premium flex items-center gap-4">
          <div className="p-3.5 bg-[#52B788]/10 text-[#2D6A4F] dark:text-[#52B788] rounded-xl shrink-0">
            <Sprout className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">Farm Estates Held</p>
            <p className="text-xl font-extrabold text-foreground dark:text-stone-100 mt-0.5">
              {summary.totalFarms} {summary.totalFarms === 1 ? 'Farm' : 'Farms'}
            </p>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
              {financials.length} payout record{financials.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      {/* Farms Portfolio Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif font-extrabold text-lg text-primary dark:text-[#52B788]">
              Farm Holdings Breakdown
            </h2>
            <p className="text-[11px] font-mono text-muted-foreground">
              Estates where {investor.name} owns active or historical plot allocations
            </p>
          </div>
        </div>

        {farms.length === 0 ? (
          <div className="bg-card dark:bg-stone-900 border border-border dark:border-stone-800 rounded-3xl p-10 text-center shadow-premium">
            <Sprout className="h-10 w-10 text-gray-300 dark:text-stone-700 mx-auto mb-2" />
            <h3 className="font-sans font-bold text-sm text-foreground dark:text-stone-300">No Farm Holdings Allocated</h3>
            <p className="text-xs text-muted-foreground mt-1">
              This investor currently does not have any farm plots assigned to their portfolio.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {farms.map((farm, idx) => (
              <div
                key={farm.id || `farm-${idx}`}
                className="bg-card dark:bg-stone-900 border border-border dark:border-stone-800 rounded-3xl overflow-hidden shadow-premium flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-36 bg-[#1B4332]/10 dark:bg-stone-800 overflow-hidden">
                    {farm.coverImage ? (
                      <img
                        src={farm.coverImage}
                        alt={farm.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] text-white/40">
                        <Sprout className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
                      <h3 className="font-serif font-bold text-base text-white truncate">{farm.name}</h3>
                      <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/90 text-primary shrink-0">
                        {farm.activePlotsCount} Plot{farm.activePlotsCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {(farm.location || farm.state) && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground dark:text-stone-400 font-mono">
                        <MapPin className="h-3.5 w-3.5 text-[#2D6A4F] dark:text-[#52B788] shrink-0" />
                        <span className="truncate">
                          {[farm.location, farm.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}

                    {farm.cropTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {farm.cropTypes.map((crop) => (
                          <span
                            key={crop}
                            className="text-[9.5px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-primary dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-800/40"
                          >
                            {crop}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-dashed border-border dark:border-stone-800">
                      <div>
                        <p className="text-[9.5px] font-mono uppercase text-muted-foreground font-bold">Invested</p>
                        <p className="text-sm font-extrabold text-primary dark:text-stone-100 mt-0.5">
                          ₦{farm.totalInvested.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9.5px] font-mono uppercase text-muted-foreground font-bold">Returns Earned</p>
                        <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
                          ₦{farm.totalPaidReturns.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {farm.id && (
                  <div className="px-5 pb-5">
                    <button
                      type="button"
                      onClick={() => onSelectFarm(farm.id!)}
                      className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted/40 dark:bg-stone-800 hover:bg-emerald-50 dark:hover:bg-stone-750 border border-border dark:border-stone-700 text-xs font-mono font-bold text-primary dark:text-[#52B788] transition cursor-pointer"
                    >
                      <span>Open Farm Estate</span>
                      <ChevronRight className="h-4 w-4 text-[#D4A017]" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Allocated Plots Table */}
      <div className="bg-card dark:bg-stone-900 border border-border dark:border-stone-800 rounded-3xl shadow-premium overflow-hidden">
        <div className="px-6 py-5 border-b border-border dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Landmark className="h-5 w-5 text-[#2D6A4F] dark:text-[#52B788]" />
            <div>
              <h2 className="font-serif font-extrabold text-base text-primary dark:text-[#52B788]">
                Allocated Plot Holdings
              </h2>
              <p className="text-[10px] font-mono text-muted-foreground">
                Individual deeded plots, ownership shares, and capital deployed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-muted dark:bg-stone-800 text-foreground/80 dark:text-stone-300">
              {holdings.length} Plot{holdings.length === 1 ? '' : 's'}
            </span>
            <Button size="sm" onClick={() => setHoldingDialog({ open: true, holding: null })}><Plus /> Add holding</Button>
          </div>
        </div>

        {holdings.length === 0 ? (
          <div className="p-10 text-center text-xs font-mono text-muted-foreground">
            No plot allocations recorded for this investor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/40 text-muted-foreground uppercase font-mono text-[10px] tracking-wider">
                  <th className="py-3.5 px-5 font-bold">Plot</th>
                  <th className="py-3.5 px-3 font-bold">Farm Estate</th>
                  <th className="py-3.5 px-3 font-bold">Crop</th>
                  <th className="py-3.5 px-3 font-bold">Size</th>
                  <th className="py-3.5 px-3 font-bold text-center">Ownership</th>
                  <th className="py-3.5 px-3 font-bold text-right">Amount Invested</th>
                  <th className="py-3.5 px-3 font-bold text-right">Returns Earned</th>
                  <th className="py-3.5 px-3 font-bold">Contract Ref</th>
                  <th className="py-3.5 px-3 font-bold text-center">Status</th>
                  <th className="py-3.5 px-5 font-bold text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-stone-800">
                {holdings.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/50 dark:hover:bg-stone-800/40 transition">
                    <td className="py-4 px-5 font-mono font-extrabold text-primary dark:text-[#52B788]">
                      {h.plotNumber}
                    </td>
                    <td className="py-4 px-3 font-semibold text-foreground dark:text-stone-200">
                      {h.farmId ? (
                        <button
                          type="button"
                          onClick={() => onSelectFarm(h.farmId!)}
                          className="hover:underline text-left cursor-pointer text-primary dark:text-emerald-400"
                        >
                          {h.farmName}
                        </button>
                      ) : (
                        h.farmName
                      )}
                    </td>
                    <td className="py-4 px-3 font-mono text-[11px] text-foreground/80 dark:text-stone-300">
                      {h.cropType}
                    </td>
                    <td className="py-4 px-3 font-mono text-muted-foreground dark:text-stone-400">
                      {h.sizeHectares} {h.sizeUnit}
                    </td>
                    <td className="py-4 px-3 text-center font-mono font-bold text-foreground dark:text-stone-300">
                      {h.ownershipPercentage}%
                    </td>
                    <td className="py-4 px-3 text-right font-extrabold text-primary dark:text-stone-100">
                      ₦{(h.investmentAmount || 0).toLocaleString()}
                    </td>
                    <td className="py-4 px-3 text-right font-extrabold text-emerald-700 dark:text-emerald-400">
                      ₦{(h.paidReturns || 0).toLocaleString()}
                    </td>
                    <td className="py-4 px-3 font-mono text-[11px] text-muted-foreground dark:text-stone-400">
                      <div>{h.contractRef || '—'}</div>
                      {h.startDate && (
                        <div className="text-[9.5px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          <span>{h.startDate}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-5 text-center">
                      <span
                        className={`inline-block text-[9px] font-mono font-extrabold px-2.5 py-0.5 rounded-full border ${
                          h.isActive !== false
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40'
                            : 'bg-muted dark:bg-stone-800 text-muted-foreground dark:text-stone-400 border-border dark:border-stone-700'
                        }`}
                      >
                        {h.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label={`Edit holding ${h.plotNumber}`} title="Edit holding" onClick={() => setHoldingDialog({ open: true, holding: h })}><Pencil /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        aria-label={`Delete holding ${h.plotNumber}`}
                        title="Delete holding"
                        onClick={() => deleteRecord(`/api/admin/holdings/${h.id}`, `Delete holding on ${h.farmName}, plot ${h.plotNumber}?`, 'The investor will no longer own this plot. Payouts already recorded for the plot are kept. To keep the record but hide it, edit the holding and untick "Active" instead.')}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payouts & Returns History Table */}
      <div className="bg-card dark:bg-stone-900 border border-border dark:border-stone-800 rounded-3xl shadow-premium overflow-hidden">
        <div className="px-6 py-5 border-b border-border dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileText className="h-5 w-5 text-[#D4A017]" />
            <div>
              <h2 className="font-serif font-extrabold text-base text-primary dark:text-[#52B788]">
                Returns & Payouts History
              </h2>
              <p className="text-[10px] font-mono text-muted-foreground">
                Audited yield disbursements and scheduled returns across all held plots
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-muted dark:bg-stone-800 text-foreground/80 dark:text-stone-300">
              {financials.length} Record{financials.length === 1 ? '' : 's'}
            </span>
            <Button size="sm" disabled={holdings.length === 0} title={holdings.length === 0 ? 'Add a holding first' : undefined} onClick={() => setPayoutDialog({ open: true, payout: null })}><Plus /> Record payout</Button>
          </div>
        </div>

        {financials.length === 0 ? (
          <div className="p-10 text-center text-xs font-mono text-muted-foreground">
            No financial payout or return records logged yet for this investor&apos;s plots.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border dark:border-stone-800 bg-stone-50/70 dark:bg-stone-950/40 text-muted-foreground uppercase font-mono text-[10px] tracking-wider">
                  <th className="py-3.5 px-5 font-bold">Cycle</th>
                  <th className="py-3.5 px-3 font-bold">Farm & Plot</th>
                  <th className="py-3.5 px-3 font-bold">Crop</th>
                  <th className="py-3.5 px-3 font-bold text-right">Return Amount</th>
                  <th className="py-3.5 px-3 font-bold text-center">Yield ROI %</th>
                  <th className="py-3.5 px-3 font-bold">Payout Date</th>
                  <th className="py-3.5 px-3 font-bold text-center">Status</th>
                  <th className="py-3.5 px-3 font-bold">Notes</th>
                  <th className="py-3.5 px-5 font-bold text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border dark:divide-stone-800">
                {financials.map((fin) => (
                  <tr key={fin.id} className="hover:bg-muted/50 dark:hover:bg-stone-800/40 transition">
                    <td className="py-4 px-5 font-sans font-bold text-primary dark:text-stone-100">
                      {fin.period} {fin.year}
                    </td>
                    <td className="py-4 px-3">
                      <div className="font-semibold text-foreground dark:text-stone-200">{fin.farmName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">Plot {fin.plotNumber}</div>
                    </td>
                    <td className="py-4 px-3 font-mono text-[11px] text-foreground/80 dark:text-stone-300">
                      {fin.cropType}
                    </td>
                    <td className="py-4 px-3 text-right font-extrabold text-primary dark:text-emerald-400">
                      ₦{(fin.payoutAmount || 0).toLocaleString()}
                    </td>
                    <td className="py-4 px-3 text-center font-mono font-extrabold text-[#D4A017]">
                      {fin.roiPercentage}%
                    </td>
                    <td className="py-4 px-3 font-mono text-[11px] text-muted-foreground dark:text-stone-400">
                      {fin.payoutDate || '—'}
                    </td>
                    <td className="py-4 px-3 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 font-mono text-[9px] font-extrabold uppercase rounded-full border ${getStatusBadgeClass(fin.status)}`}
                      >
                        {fin.status}
                      </span>
                    </td>
                    <td className="py-4 px-3 text-muted-foreground dark:text-stone-400 max-w-[240px] truncate" title={fin.notes}>
                      {fin.notes || '—'}
                    </td>
                    <td className="py-4 px-5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label={`Edit payout ${fin.period} ${fin.year}`} title="Edit payout" onClick={() => setPayoutDialog({ open: true, payout: fin })}><Pencil /></Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10"
                        aria-label={`Delete payout ${fin.period} ${fin.year}`}
                        title="Delete payout"
                        onClick={() => deleteRecord(`/api/admin/payouts/${fin.id}`, `Delete the ${fin.period} ${fin.year} payout?`, 'It will be removed from this investor\'s payouts and statements.')}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <HoldingDialog
        token={token}
        open={holdingDialog.open}
        holding={holdingDialog.holding}
        investorId={investor.id}
        investorName={investor.name}
        onClose={() => setHoldingDialog({ open: false, holding: null })}
        onSaved={reload}
      />
      <PayoutDialog
        token={token}
        open={payoutDialog.open}
        payout={payoutDialog.payout}
        plots={holdings.map(h => ({ plotId: h.plotId, label: `${h.farmName} · plot ${h.plotNumber} (${h.sizeHectares} ${h.sizeUnit})` }))}
        onClose={() => setPayoutDialog({ open: false, payout: null })}
        onSaved={reload}
      />
    </div>
  );
}
