/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin dialogs to add/edit an investor's holding (plot on a farm) and to
 * add/edit a payout (return) recorded against a plot.
 */

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { holdingSchema, HoldingInput, payoutSchema, PayoutInput } from '../lib/schemas';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input, NativeSelect, Textarea } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { FormField, FormError } from './ui/form';
import { toast } from './ui/sonner';

async function api(token: string, url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The change could not be saved.');
  return data;
}

// ---------------------------------------------------------------------------
// Holding
// ---------------------------------------------------------------------------

export interface HoldingRecord {
  id: string;
  farmId: string | null;
  plotNumber: string;
  sizeHectares: number;
  sizeUnit: string;
  cropType: string;
  investmentAmount: number;
  ownershipPercentage: number;
  startDate?: string;
  contractRef?: string;
  isActive?: boolean;
}

interface HoldingDialogProps {
  token: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Editing an existing holding when set */
  holding?: HoldingRecord | null;
  /** Fix the investor (investor profile) or let the admin choose (farm page) */
  investorId?: string;
  investorName?: string;
  /** Pre-select the farm (farm page) */
  farmId?: string;
}

export function HoldingDialog({ token, open, onClose, onSaved, holding, investorId, investorName, farmId }: HoldingDialogProps) {
  const [farms, setFarms] = useState<Array<{ id: string; name: string }>>([]);
  const [investors, setInvestors] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const editing = !!holding;

  const form = useForm<HoldingInput>({ resolver: zodResolver(holdingSchema) });

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    form.reset({
      investorId: investorId || '',
      farmId: holding?.farmId || farmId || '',
      plotNumber: holding?.plotNumber || '',
      size: holding ? Number(holding.sizeHectares) || 1 : 1,
      sizeUnit: ((holding?.sizeUnit || 'acre').toLowerCase() as HoldingInput['sizeUnit']),
      cropType: holding?.cropType || '',
      investmentAmount: holding ? Number(holding.investmentAmount) || 0 : 0,
      ownershipPercentage: holding ? Number(holding.ownershipPercentage) || 100 : 100,
      startDate: holding?.startDate || new Date().toISOString().slice(0, 10),
      contractRef: holding?.contractRef || '',
      isActive: holding ? holding.isActive !== false : true
    });
    fetch('/api/farms', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setFarms((Array.isArray(d) ? d : d.farms || []).map((f: any) => ({ id: f.id, name: f.name })).sort((a: any, b: any) => a.name.localeCompare(b.name))))
      .catch(() => {});
    if (!investorId) {
      fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setInvestors(d.filter((u: any) => u.role === 'investor' && !u.privacy?.anonymisedAt).map((u: any) => ({ id: u.id, name: u.name, email: u.email })).sort((a: any, b: any) => a.name.localeCompare(b.name))))
        .catch(() => {});
    }
  }, [open, holding?.id]);

  const submit = async (values: HoldingInput) => {
    setServerError(null);
    try {
      if (editing) await api(token, `/api/admin/holdings/${holding!.id}`, 'PUT', values);
      else await api(token, '/api/admin/holdings', 'POST', values);
      toast.success(editing ? 'Holding updated.' : 'Holding added. It now shows on the investor and the farm.');
      onSaved();
      onClose();
    } catch (err: any) {
      setServerError(err.message);
    }
  };

  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit holding' : 'Add holding'}</DialogTitle>
          <DialogDescription>
            {investorName ? `${investorName}'s ` : ''}ownership of a plot on a farm. Changes show straight away on the investor's dashboard and on the farm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4 overflow-y-auto min-h-0 -mx-1 px-1" noValidate>
          <FormError message={serverError} />
          {!investorId && (
            <FormField id="h-investor" label="Investor" error={e.investorId}>
              <NativeSelect {...form.register('investorId')}>
                <option value="">Choose an investor…</option>
                {investors.map(i => <option key={i.id} value={i.id}>{i.name} ({i.email})</option>)}
              </NativeSelect>
            </FormField>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField id="h-farm" label="Farm" error={e.farmId}>
              <NativeSelect {...form.register('farmId')}>
                <option value="">Choose a farm…</option>
                {farms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </NativeSelect>
            </FormField>
            <FormField id="h-plot" label="Plot number (optional)" error={e.plotNumber} hint={editing ? undefined : 'Leave blank to create one automatically.'}>
              <Input {...form.register('plotNumber')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <FormField id="h-size" label="Size" error={e.size}>
              <Input type="number" step="any" min="0" inputMode="decimal" {...form.register('size')} />
            </FormField>
            <FormField id="h-unit" label="Unit">
              <NativeSelect {...form.register('sizeUnit')}>
                <option value="acre">Acres</option>
                <option value="hectare">Hectares</option>
                <option value="plot">Plots</option>
              </NativeSelect>
            </FormField>
            <FormField id="h-crop" label="Crop" error={e.cropType} className="col-span-2 sm:col-span-1">
              <Input placeholder="e.g. Oil Palm" {...form.register('cropType')} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField id="h-amount" label="Amount invested (₦)" error={e.investmentAmount}>
              <Input type="number" step="any" min="0" inputMode="decimal" {...form.register('investmentAmount')} />
            </FormField>
            <FormField id="h-own" label="Ownership of the plot (%)" error={e.ownershipPercentage}>
              <Input type="number" step="any" min="0" max="100" inputMode="decimal" {...form.register('ownershipPercentage')} />
            </FormField>
            <FormField id="h-start" label="Start date" error={e.startDate}>
              <Input type="date" {...form.register('startDate')} />
            </FormField>
          </div>
          <FormField id="h-contract" label="Contract reference (optional)" error={e.contractRef}>
            <Input {...form.register('contractRef')} />
          </FormField>
          {editing && (
            <div className="flex items-start gap-3">
              <Checkbox id="h-active" checked={form.watch('isActive')} onCheckedChange={v => form.setValue('isActive', !!v)} className="mt-0.5" />
              <Label htmlFor="h-active" className="leading-snug cursor-pointer">
                Active
                <span className="block font-normal text-muted-foreground">Untick when the investment has ended. It stays in the records but is hidden from the investor and the farm.</span>
              </Label>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <Loader2 className="animate-spin" />} {editing ? 'Save changes' : 'Add holding'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Payout
// ---------------------------------------------------------------------------

export interface PayoutRecord {
  id: string;
  plotId: string;
  period: string;
  year: number;
  payoutAmount: number;
  roiPercentage: number;
  payoutDate?: string;
  status: string;
  notes?: string;
}

interface PayoutDialogProps {
  token: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  payout?: PayoutRecord | null;
  /** Plots the payout can be recorded against */
  plots: Array<{ plotId: string; label: string }>;
}

export function PayoutDialog({ token, open, onClose, onSaved, payout, plots }: PayoutDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const editing = !!payout;
  const form = useForm<PayoutInput>({ resolver: zodResolver(payoutSchema) });

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    const now = new Date();
    form.reset({
      plotId: payout?.plotId || plots[0]?.plotId || '',
      period: payout?.period || `Q${Math.floor(now.getMonth() / 3) + 1}`,
      year: payout?.year || now.getFullYear(),
      payoutAmount: payout ? Number(payout.payoutAmount) || 0 : 0,
      roiPercentage: payout ? Number(payout.roiPercentage) || 0 : 0,
      payoutDate: payout?.payoutDate || now.toISOString().slice(0, 10),
      status: ((payout?.status as PayoutInput['status']) || 'pending'),
      notes: payout?.notes || ''
    });
  }, [open, payout?.id]);

  const submit = async (values: PayoutInput) => {
    setServerError(null);
    try {
      if (editing) await api(token, `/api/admin/payouts/${payout!.id}`, 'PUT', values);
      else await api(token, '/api/admin/payouts', 'POST', values);
      toast.success(editing ? 'Payout updated.' : 'Payout recorded.');
      onSaved();
      onClose();
    } catch (err: any) {
      setServerError(err.message);
    }
  };

  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit payout' : 'Record a payout'}</DialogTitle>
          <DialogDescription>A return paid (or due) to the plot's owner for a period.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4 overflow-y-auto min-h-0 -mx-1 px-1" noValidate>
          <FormError message={serverError} />
          <FormField id="p-plot" label="Plot" error={e.plotId}>
            <NativeSelect {...form.register('plotId')}>
              {plots.map(p => <option key={p.plotId} value={p.plotId}>{p.label}</option>)}
            </NativeSelect>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="p-period" label="Period" error={e.period} hint="e.g. Q1, H1 or Annual">
              <Input list="payout-periods" {...form.register('period')} />
            </FormField>
            <datalist id="payout-periods">
              {['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'Annual'].map(p => <option key={p} value={p} />)}
            </datalist>
            <FormField id="p-year" label="Year" error={e.year}>
              <Input type="number" inputMode="numeric" {...form.register('year')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="p-amount" label="Amount (₦)" error={e.payoutAmount}>
              <Input type="number" step="any" min="0" inputMode="decimal" {...form.register('payoutAmount')} />
            </FormField>
            <FormField id="p-roi" label="Return (%)" error={e.roiPercentage}>
              <Input type="number" step="any" min="0" inputMode="decimal" {...form.register('roiPercentage')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="p-date" label="Payout date" error={e.payoutDate}>
              <Input type="date" {...form.register('payoutDate')} />
            </FormField>
            <FormField id="p-status" label="Status">
              <NativeSelect {...form.register('status')}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="partial">Part paid</option>
                <option value="overdue">Overdue</option>
              </NativeSelect>
            </FormField>
          </div>
          <FormField id="p-notes" label="Notes (optional)" error={e.notes}>
            <Textarea rows={2} {...form.register('notes')} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={form.formState.isSubmitting || plots.length === 0}>{form.formState.isSubmitting && <Loader2 className="animate-spin" />} {editing ? 'Save changes' : 'Record payout'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
