/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Admin editing of holdings (an investor's ownership of a plot on a farm)
 * and payouts (returns recorded against a plot for a period).
 */

import express from 'express';
import { User, UserRole, FarmPlot, InvestorPlot, FinancialSummary, FinancialStatus, PlotStatus, SystemSettings } from '../src/types';
import { holdingSchema, payoutSchema, firstIssue } from '../src/lib/schemas';
import { recordAudit } from './privacy';

export interface HoldingsContext {
  getDb(): any;
  saveDb(): void;
  getSettings(): SystemSettings;
  requireAuth: express.RequestHandler;
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Keeps the farm's plot count and land total in step with its plots. */
export function recomputeFarmTotals(db: any, farmId: string) {
  const farm = db.farms.find((f: any) => f.id === farmId);
  if (!farm) return;
  const plots = db.plots.filter((p: FarmPlot) => p.farmId === farmId);
  farm.totalPlots = plots.length;
  farm.totalHectares = Number(plots.reduce((s: number, p: FarmPlot) => s + (Number(p.sizeHectares) || 0), 0).toFixed(2));
}

function adminOnly(req: express.Request, res: express.Response): User | null {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    res.status(403).json({ error: 'Admin access required.' });
    return null;
  }
  return user;
}

export function registerHoldingRoutes(app: express.Express, ctx: HoldingsContext) {
  const { requireAuth } = ctx;

  // Create a holding: attaches to an existing unowned plot with the same number, or creates the plot
  app.post('/api/admin/holdings', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const parsed = holdingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const v = parsed.data;

    const investor = db.users.find((u: User) => u.id === v.investorId);
    if (!investor) return res.status(404).json({ error: 'Investor not found.' });
    if (investor.privacy?.anonymisedAt) return res.status(400).json({ error: 'This account has been erased.' });
    const farm = db.farms.find((f: any) => f.id === v.farmId);
    if (!farm) return res.status(404).json({ error: 'Farm not found.' });

    let plot: FarmPlot | undefined;
    if (v.plotNumber) {
      plot = db.plots.find(
        (p: FarmPlot) =>
          p.farmId === farm.id &&
          p.plotNumber.toLowerCase() === v.plotNumber.toLowerCase() &&
          !db.investorPlots.some((ip: InvestorPlot) => ip.plotId === p.id && ip.isActive !== false)
      );
      if (!plot && db.plots.some((p: FarmPlot) => p.farmId === farm.id && p.plotNumber.toLowerCase() === v.plotNumber.toLowerCase())) {
        return res.status(400).json({ error: `Plot ${v.plotNumber} on ${farm.name} is already owned. Use a different plot number, or leave it blank to create one.` });
      }
    }
    if (plot) {
      plot.sizeHectares = v.size;
      plot.sizeUnit = v.sizeUnit;
      plot.cropType = v.cropType;
      plot.status = PlotStatus.ACTIVE;
    } else {
      const count = db.plots.filter((p: FarmPlot) => p.farmId === farm.id).length;
      plot = {
        id: newId('plot'),
        farmId: farm.id,
        plotNumber: v.plotNumber || `P-${farm.id.replace('farm-', '').slice(-4).toUpperCase()}-${count + 1}`,
        sizeHectares: v.size,
        sizeUnit: v.sizeUnit,
        cropType: v.cropType,
        status: PlotStatus.ACTIVE
      };
      db.plots.push(plot);
    }

    const holding: InvestorPlot = {
      id: newId('invplot'),
      investorId: investor.id,
      plotId: plot.id,
      investmentAmount: v.investmentAmount,
      ownershipPercentage: v.ownershipPercentage,
      startDate: v.startDate || new Date().toISOString().slice(0, 10),
      contractRef: v.contractRef || `CON-${Date.now().toString().slice(-6)}`,
      isActive: v.isActive !== false
    };
    db.investorPlots.push(holding);
    recomputeFarmTotals(db, farm.id);
    recordAudit(db, admin, 'holding.created', { targetType: 'user', targetId: investor.id, details: `holding=${holding.id}; farm=${farm.id}`, req });
    ctx.saveDb();
    res.status(201).json({ holding, plot });
  });

  // Edit a holding (and its plot's details)
  app.put('/api/admin/holdings/:id', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const holding: InvestorPlot | undefined = db.investorPlots.find((h: InvestorPlot) => h.id === req.params.id);
    if (!holding) return res.status(404).json({ error: 'Holding not found.' });
    const plot: FarmPlot | undefined = db.plots.find((p: FarmPlot) => p.id === holding.plotId);
    const parsed = holdingSchema.safeParse({ ...req.body, investorId: req.body.investorId || holding.investorId, farmId: req.body.farmId || plot?.farmId || '' });
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const v = parsed.data;

    const investor = db.users.find((u: User) => u.id === v.investorId);
    if (!investor) return res.status(404).json({ error: 'Investor not found.' });
    const farm = db.farms.find((f: any) => f.id === v.farmId);
    if (!farm) return res.status(404).json({ error: 'Farm not found.' });

    const coOwners = db.investorPlots.filter((h: InvestorPlot) => h.plotId === holding.plotId && h.id !== holding.id && h.isActive !== false);
    const oldFarmId = plot?.farmId;
    if (plot) {
      if (plot.farmId !== farm.id && coOwners.length > 0) {
        return res.status(400).json({ error: 'This plot has other owners, so it cannot be moved to another farm. Create a new holding instead.' });
      }
      if (v.plotNumber && v.plotNumber !== plot.plotNumber && db.plots.some((p: FarmPlot) => p.id !== plot.id && p.farmId === farm.id && p.plotNumber.toLowerCase() === v.plotNumber.toLowerCase())) {
        return res.status(400).json({ error: `Plot number ${v.plotNumber} is already used on ${farm.name}.` });
      }
      plot.farmId = farm.id;
      if (v.plotNumber) plot.plotNumber = v.plotNumber;
      plot.sizeHectares = v.size;
      plot.sizeUnit = v.sizeUnit;
      plot.cropType = v.cropType;
    }
    holding.investorId = investor.id;
    holding.investmentAmount = v.investmentAmount;
    holding.ownershipPercentage = v.ownershipPercentage;
    if (v.startDate) holding.startDate = v.startDate;
    if (v.contractRef) holding.contractRef = v.contractRef;
    holding.isActive = v.isActive !== false;

    recomputeFarmTotals(db, farm.id);
    if (oldFarmId && oldFarmId !== farm.id) recomputeFarmTotals(db, oldFarmId);
    recordAudit(db, admin, 'holding.updated', { targetType: 'user', targetId: investor.id, details: `holding=${holding.id}`, req });
    ctx.saveDb();
    res.json({ holding, plot });
  });

  // Delete a holding. The plot is removed too when nobody else owns it and it has no payouts.
  app.delete('/api/admin/holdings/:id', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const idx = db.investorPlots.findIndex((h: InvestorPlot) => h.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Holding not found.' });
    const [holding] = db.investorPlots.splice(idx, 1);
    const plot = db.plots.find((p: FarmPlot) => p.id === holding.plotId);
    let plotRemoved = false;
    if (plot && !db.investorPlots.some((h: InvestorPlot) => h.plotId === plot.id) && !db.financials.some((f: FinancialSummary) => f.plotId === plot.id)) {
      db.plots = db.plots.filter((p: FarmPlot) => p.id !== plot.id);
      plotRemoved = true;
    }
    if (plot) recomputeFarmTotals(db, plot.farmId);
    recordAudit(db, admin, 'holding.deleted', { targetType: 'user', targetId: holding.investorId, details: `holding=${holding.id}; plotRemoved=${plotRemoved}`, req });
    ctx.saveDb();
    res.json({ success: true, plotRemoved });
  });

  // Payouts ----------------------------------------------------------------

  const checkPayout = (db: any, v: any, excludeId?: string): string | null => {
    if (!db.plots.some((p: FarmPlot) => p.id === v.plotId)) return 'Plot not found.';
    const minRoi = ctx.getSettings().minimumPayoutRoi || 0;
    if (v.status === 'paid' && v.roiPercentage < minRoi) return `The return (${v.roiPercentage}%) is below the minimum of ${minRoi}% set in Settings.`;
    const duplicate = db.financials.some(
      (f: FinancialSummary) => f.id !== excludeId && f.plotId === v.plotId && String(f.period).toLowerCase() === v.period.toLowerCase() && Number(f.year) === v.year
    );
    if (duplicate) return `A payout for ${v.period} ${v.year} already exists for this plot.`;
    return null;
  };

  app.post('/api/admin/payouts', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const parsed = payoutSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const v = parsed.data;
    const problem = checkPayout(db, v);
    if (problem) return res.status(400).json({ error: problem });
    const payout: FinancialSummary = {
      id: newId('fin'),
      plotId: v.plotId,
      uploadedBy: admin.id,
      period: v.period,
      year: v.year,
      roiPercentage: v.roiPercentage,
      payoutAmount: v.payoutAmount,
      payoutDate: v.payoutDate || new Date().toISOString().slice(0, 10),
      status: v.status as FinancialStatus,
      notes: v.notes || ''
    };
    db.financials.push(payout);
    recordAudit(db, admin, 'financial.created', { targetType: 'payout', targetId: payout.id, req });
    ctx.saveDb();
    res.status(201).json(payout);
  });

  app.put('/api/admin/payouts/:id', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const payout: FinancialSummary | undefined = db.financials.find((f: FinancialSummary) => f.id === req.params.id);
    if (!payout) return res.status(404).json({ error: 'Payout not found.' });
    const parsed = payoutSchema.safeParse({ ...req.body, plotId: req.body.plotId || payout.plotId });
    if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed) });
    const v = parsed.data;
    const problem = checkPayout(db, v, payout.id);
    if (problem) return res.status(400).json({ error: problem });
    Object.assign(payout, {
      plotId: v.plotId,
      period: v.period,
      year: v.year,
      roiPercentage: v.roiPercentage,
      payoutAmount: v.payoutAmount,
      payoutDate: v.payoutDate || payout.payoutDate,
      status: v.status,
      notes: v.notes || ''
    });
    recordAudit(db, admin, 'financial.updated', { targetType: 'payout', targetId: payout.id, req });
    ctx.saveDb();
    res.json(payout);
  });

  app.delete('/api/admin/payouts/:id', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const before = db.financials.length;
    db.financials = db.financials.filter((f: FinancialSummary) => f.id !== req.params.id);
    if (db.financials.length === before) return res.status(404).json({ error: 'Payout not found.' });
    recordAudit(db, admin, 'financial.deleted', { targetType: 'payout', targetId: req.params.id, req });
    ctx.saveDb();
    res.json({ success: true });
  });
}
