/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Data-protection features supporting the Nigeria Data Protection Act 2023
 * (NDPA) and the NDPC General Application and Implementation Directive 2025
 * (GAID), the EU/UK GDPR and similar laws:
 *
 *  - privacy notice (transparency) and versioned acknowledgement
 *  - opt-in marketing consent that can be withdrawn at any time
 *  - data subject rights: access/portability export, self-service
 *    rectification, and a tracked request queue (erasure, restriction,
 *    objection, ...) with response deadlines
 *  - erasure by anonymisation, keeping records the law requires us to retain
 *  - audit trail of access to personal data and administrative actions
 *  - retention limits enforced by a scheduled purge
 *  - personal data breach register with the 72-hour regulator deadline
 *
 * These are technical controls. They do not replace legal advice, a DPO,
 * NDPC registration/audit filings, or contracts with processors.
 */

import crypto from 'crypto';
import express from 'express';
import {
  User,
  UserRole,
  SystemSettings,
  PrivacySettings,
  AuditLogEntry,
  DataSubjectRequest,
  DataSubjectRequestType,
  BreachIncident,
  FarmPlot,
  Farm,
  InvestorPlot,
  FinancialSummary,
  Document,
  FarmUpdate,
  SimulatedEmail,
  FarmMapNote,
  DocumentVisibility
} from '../src/types';

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  controllerName: 'Adubiaro Farms',
  controllerAddress: '',
  controllerEmail: '',
  dpoName: '',
  dpoEmail: '',
  dpoPhone: '',
  noticeVersion: '1.0',
  noticeLastUpdated: '2026-11-14',
  hostingDescription: '',
  additionalNoticeText: '',
  dsrResponseDays: 30,
  retentionEmailLogDays: 365,
  retentionAuditLogDays: 730,
  retentionFinancialRecordsYears: 6
};

export function getPrivacySettings(settings: SystemSettings): PrivacySettings {
  return { ...DEFAULT_PRIVACY_SETTINGS, ...(settings.privacy || {}) };
}

export interface PrivacyDb {
  users: User[];
  farms: Farm[];
  plots: FarmPlot[];
  investorPlots: InvestorPlot[];
  updates: FarmUpdate[];
  documents: Document[];
  financials: FinancialSummary[];
  simulatedEmails: SimulatedEmail[];
  mapNotes?: FarmMapNote[];
  auditLogs?: AuditLogEntry[];
  dataRequests?: DataSubjectRequest[];
  breachIncidents?: BreachIncident[];
}

export interface Processor {
  name: string;
  purpose: string;
  location: string;
}

export interface PrivacyContext {
  getDb(): PrivacyDb;
  saveDb(): void;
  getSettings(): SystemSettings;
  setPrivacySettings(p: PrivacySettings): void;
  requireAuth: express.RequestHandler;
  publicUser(u: User): any;
  /** Third parties that currently receive personal data, based on configuration */
  describeProcessors(): Processor[];
  sendEmail(to: string, subject: string, text: string, html: string, category: string, extra?: { recipientId?: string; senderId?: string }): void;
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export function recordAudit(
  db: PrivacyDb,
  actor: User | null,
  action: string,
  opts: { targetType?: string; targetId?: string; details?: string; req?: express.Request } = {}
): void {
  if (!db.auditLogs) db.auditLogs = [];
  db.auditLogs.unshift({
    id: newId('audit'),
    at: new Date().toISOString(),
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action,
    targetType: opts.targetType,
    targetId: opts.targetId,
    details: opts.details,
    ip: opts.req?.ip
  });
}

// ---------------------------------------------------------------------------
// Right of access / portability
// ---------------------------------------------------------------------------

const CREDENTIAL_LINE = /(Temporary Password:\s*)(<code>)?[^\s<]+(<\/code>)?/gi;

export function redactCredentials(text: string): string {
  return (text || '').replace(CREDENTIAL_LINE, (_m, label, open, close) => `${label}${open || ''}[redacted]${close || ''}`);
}

export function buildSubjectDataExport(db: PrivacyDb, user: User, ctx: PrivacyContext) {
  const p = getPrivacySettings(ctx.getSettings());
  const holdings = db.investorPlots.filter(ip => ip.investorId === user.id);
  const plotIds = new Set(holdings.map(h => h.plotId));
  const plotById = new Map(db.plots.map(pl => [pl.id, pl]));
  const farmById = new Map(db.farms.map(f => [f.id, f]));
  const email = (user.email || '').toLowerCase();

  return {
    exportedAt: new Date().toISOString(),
    format: 'Adubiaro Portal personal data export (JSON, machine-readable)',
    controller: { name: p.controllerName, email: p.controllerEmail, dpoEmail: p.dpoEmail },
    profile: ctx.publicUser(user),
    investments: holdings.map(h => {
      const plot = plotById.get(h.plotId);
      return {
        ...h,
        plotNumber: plot?.plotNumber,
        cropType: plot?.cropType,
        sizeHectares: plot?.sizeHectares,
        farm: plot ? farmById.get(plot.farmId)?.name : undefined
      };
    }),
    financials: db.financials.filter(f => plotIds.has(f.plotId)),
    documentsAvailableToYou: db.documents
      .filter(d => d.plotId ? plotIds.has(d.plotId) : db.plots.some(pl => pl.farmId === d.farmId && plotIds.has(pl.id)) && d.visibility === DocumentVisibility.FARM)
      .map(d => ({ id: d.id, title: d.title, category: d.category, fileName: d.fileName, uploadedAt: d.uploadedAt })),
    commentsYouWrote: db.updates.flatMap(u => (u.comments || []).filter(c => c.userId === user.id).map(c => ({ updateId: u.id, updateTitle: u.title, content: c.content, createdAt: c.createdAt }))),
    updatesYouPosted: db.updates.filter(u => u.postedBy === user.id).map(u => ({ id: u.id, title: u.title, body: u.body, createdAt: u.createdAt })),
    mapNotesYouWrote: (db.mapNotes || []).filter(n => n.authorId === user.id),
    messagesSentToYou: db.simulatedEmails
      .filter(e => e.recipientId === user.id || (email && e.to?.toLowerCase() === email))
      .map(e => ({ subject: e.subject, sentAt: e.sentAt, category: e.category, body: redactCredentials(e.body) })),
    yourDataRequests: (db.dataRequests || []).filter(r => r.userId === user.id),
    activityLog: (db.auditLogs || [])
      .filter(a => a.actorId === user.id || a.targetId === user.id)
      .map(a => ({ at: a.at, action: a.action, byYou: a.actorId === user.id, ip: a.actorId === user.id ? a.ip : undefined }))
  };
}

// ---------------------------------------------------------------------------
// Right to erasure (anonymisation)
// ---------------------------------------------------------------------------

/**
 * Removes or irreversibly replaces the user's identifying data. Investment,
 * contract and financial records are kept (without identifiers beyond the
 * internal id) because tax, accounting and contract law require them to be
 * retained; the privacy notice explains this.
 */
export function anonymiseUser(db: PrivacyDb, user: User): void {
  const short = user.id.slice(-6);
  const oldEmail = (user.email || '').toLowerCase();
  const label = `Erased user ${short}`;

  user.name = label;
  user.username = `erased-${user.id}`;
  user.email = `erased-${short}@invalid.local`;
  user.phone = '';
  delete (user as any).profilePhoto;
  delete user.password;
  user.mustChangePassword = false;
  user.isActive = false;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.privacy = { anonymisedAt: new Date().toISOString(), marketingConsent: false };

  // Messages addressed to the person are deleted (they contain contact details)
  db.simulatedEmails = db.simulatedEmails.filter(
    e => !(e.recipientId === user.id || (oldEmail && e.to?.toLowerCase() === oldEmail))
  );
  // Content they authored stays (other people's threads), but is de-identified
  for (const u of db.updates) {
    if (u.postedBy === user.id) u.postedByName = label;
    for (const c of u.comments || []) if (c.userId === user.id) c.userName = label;
  }
  for (const n of db.mapNotes || []) if (n.authorId === user.id) n.authorName = label;
  for (const d of db.documents) if (d.uploadedBy === user.id) d.uploadedByName = label;
  // Remove IP addresses linked to this person from the audit trail
  for (const a of db.auditLogs || []) if (a.actorId === user.id) delete a.ip;
}

// ---------------------------------------------------------------------------
// Storage limitation (retention)
// ---------------------------------------------------------------------------

export function runRetention(db: PrivacyDb, settings: SystemSettings): { emailsRemoved: number; auditRemoved: number } {
  const p = getPrivacySettings(settings);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let emailsRemoved = 0;
  let auditRemoved = 0;

  if (p.retentionEmailLogDays > 0) {
    const cutoff = now - p.retentionEmailLogDays * day;
    const before = db.simulatedEmails.length;
    db.simulatedEmails = db.simulatedEmails.filter(e => new Date(e.sentAt).getTime() >= cutoff);
    emailsRemoved = before - db.simulatedEmails.length;
  }
  if (p.retentionAuditLogDays > 0 && db.auditLogs) {
    const cutoff = now - p.retentionAuditLogDays * day;
    const before = db.auditLogs.length;
    db.auditLogs = db.auditLogs.filter(a => new Date(a.at).getTime() >= cutoff);
    auditRemoved = before - db.auditLogs.length;
  }
  return { emailsRemoved, auditRemoved };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const DSR_TYPES: DataSubjectRequestType[] = ['access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'withdraw_consent', 'other'];
const DSR_LABELS: Record<DataSubjectRequestType, string> = {
  access: 'Access to my data',
  rectification: 'Correct my data',
  erasure: 'Erase my data',
  restriction: 'Restrict processing',
  objection: 'Object to processing',
  portability: 'Data portability',
  withdraw_consent: 'Withdraw consent',
  other: 'Other privacy request'
};

function adminOnly(req: express.Request, res: express.Response): User | null {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    res.status(403).json({ error: 'Admin access required.' });
    return null;
  }
  return user;
}

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function registerPrivacyRoutes(app: express.Express, ctx: PrivacyContext): void {
  const { requireAuth } = ctx;

  // Public: privacy notice data (rendered by the /privacy page)
  app.get('/api/privacy/notice', (req, res) => {
    const p = getPrivacySettings(ctx.getSettings());
    res.json({ ...p, portalName: ctx.getSettings().portalName, processors: ctx.describeProcessors() });
  });

  // Acknowledge the current privacy notice (and optionally opt in to marketing)
  app.post('/api/privacy/acknowledge', requireAuth, (req, res) => {
    const db = ctx.getDb();
    const user = (req as any).user as User;
    const p = getPrivacySettings(ctx.getSettings());
    const now = new Date().toISOString();
    user.privacy = { ...(user.privacy || {}), noticeVersion: p.noticeVersion, noticeAcknowledgedAt: now };
    if (typeof req.body?.marketingConsent === 'boolean') {
      user.privacy.marketingConsent = req.body.marketingConsent;
      user.privacy.marketingConsentAt = now;
    }
    recordAudit(db, user, 'privacy.notice_acknowledged', { targetType: 'user', targetId: user.id, details: `version=${p.noticeVersion}; marketing=${!!user.privacy.marketingConsent}`, req });
    ctx.saveDb();
    res.json({ user: ctx.publicUser(user) });
  });

  // Give or withdraw marketing consent
  app.put('/api/privacy/marketing-consent', requireAuth, (req, res) => {
    const db = ctx.getDb();
    const user = (req as any).user as User;
    if (typeof req.body?.consent !== 'boolean') return res.status(400).json({ error: 'consent must be true or false.' });
    user.privacy = { ...(user.privacy || {}), marketingConsent: req.body.consent, marketingConsentAt: new Date().toISOString() };
    recordAudit(db, user, req.body.consent ? 'privacy.marketing_opt_in' : 'privacy.marketing_opt_out', { targetType: 'user', targetId: user.id, req });
    ctx.saveDb();
    res.json({ user: ctx.publicUser(user) });
  });

  // Right of rectification: update own contact details
  app.put('/api/privacy/profile', requireAuth, (req, res) => {
    const db = ctx.getDb();
    const user = (req as any).user as User;
    const name = str(req.body?.name, 100);
    const email = str(req.body?.email, 100);
    const phone = str(req.body?.phone, 30);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    const changed: string[] = [];
    if (name && name !== user.name) { user.name = name; changed.push('name'); }
    if (email && email !== user.email) { user.email = email; changed.push('email'); }
    if (typeof req.body?.phone === 'string' && phone !== (user.phone || '')) { user.phone = phone; changed.push('phone'); }
    if (changed.length) {
      recordAudit(db, user, 'privacy.profile_rectified', { targetType: 'user', targetId: user.id, details: `fields=${changed.join(',')}`, req });
      ctx.saveDb();
    }
    res.json({ user: ctx.publicUser(user) });
  });

  // Right of access / portability: download everything we hold about me
  app.get('/api/privacy/my-data', requireAuth, (req, res) => {
    const db = ctx.getDb();
    const user = (req as any).user as User;
    const data = buildSubjectDataExport(db, user, ctx);
    recordAudit(db, user, 'privacy.data_exported', { targetType: 'user', targetId: user.id, req });
    ctx.saveDb();
    res.setHeader('Content-Disposition', `attachment; filename="my-personal-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(data);
  });

  // Data subject requests: list (own, or all for admins)
  app.get('/api/privacy/requests', requireAuth, (req, res) => {
    const db = ctx.getDb();
    const user = (req as any).user as User;
    const all = db.dataRequests || [];
    if (user.role === UserRole.ADMIN) {
      const users = new Map(db.users.map(u => [u.id, u]));
      return res.json(all.map(r => ({ ...r, userName: users.get(r.userId)?.name, userEmail: users.get(r.userId)?.email })));
    }
    res.json(all.filter(r => r.userId === user.id));
  });

  // Submit a data subject request
  app.post('/api/privacy/requests', requireAuth, (req, res) => {
    const db = ctx.getDb();
    const user = (req as any).user as User;
    const type = req.body?.type as DataSubjectRequestType;
    const details = str(req.body?.details);
    if (!DSR_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown request type.' });
    const p = getPrivacySettings(ctx.getSettings());
    const now = new Date();
    const request: DataSubjectRequest = {
      id: newId('dsr'),
      userId: user.id,
      type,
      details,
      status: 'open',
      createdAt: now.toISOString(),
      dueAt: new Date(now.getTime() + p.dsrResponseDays * 24 * 60 * 60 * 1000).toISOString()
    };
    if (!db.dataRequests) db.dataRequests = [];
    db.dataRequests.unshift(request);
    recordAudit(db, user, 'privacy.request_submitted', { targetType: 'data_request', targetId: request.id, details: `type=${type}`, req });
    ctx.saveDb();

    const label = DSR_LABELS[type];
    const due = request.dueAt.slice(0, 10);
    ctx.sendEmail(
      user.email,
      `We received your privacy request (${label})`,
      `Hello ${user.name},\n\nWe received your request "${label}" (reference ${request.id}). We will respond by ${due}.\n\nIf you did not make this request, please contact us immediately.`,
      `<p>Hello ${escapeHtml(user.name)},</p><p>We received your request <b>${escapeHtml(label)}</b> (reference <code>${request.id}</code>). We will respond by <b>${due}</b>.</p><p>If you did not make this request, please contact us immediately.</p>`,
      'Privacy Request',
      { recipientId: user.id }
    );
    const notifyTo = p.dpoEmail || p.controllerEmail;
    const admins = notifyTo ? [{ email: notifyTo, id: undefined as string | undefined }] : db.users.filter(u => u.role === UserRole.ADMIN && u.isActive !== false).map(u => ({ email: u.email, id: u.id }));
    for (const a of admins) {
      ctx.sendEmail(
        a.email,
        `New data subject request: ${label} (due ${due})`,
        `A new data subject request was submitted.\nType: ${label}\nReference: ${request.id}\nDue: ${due}\n\nReview it under Privacy & Data → Requests in the portal.`,
        `<p>A new data subject request was submitted.</p><p>Type: <b>${escapeHtml(label)}</b><br/>Reference: <code>${request.id}</code><br/>Due: <b>${due}</b></p><p>Review it under <b>Privacy &amp; Data → Requests</b> in the portal.</p>`,
        'Privacy Request',
        { recipientId: a.id }
      );
    }
    res.status(201).json(request);
  });

  // Admin: update request status
  app.post('/api/privacy/requests/:id/resolve', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const request = (db.dataRequests || []).find(r => r.id === req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found.' });
    const status = req.body?.status;
    if (!['in_progress', 'completed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const note = str(req.body?.note);
    if (status === 'rejected' && !note) return res.status(400).json({ error: 'Explain why the request is rejected (the person will be told).' });
    request.status = status;
    request.resolutionNote = note || request.resolutionNote;
    if (status !== 'in_progress') {
      request.resolvedAt = new Date().toISOString();
      request.resolvedBy = admin.id;
    }
    recordAudit(db, admin, `privacy.request_${status}`, { targetType: 'data_request', targetId: request.id, details: `type=${request.type}; subject=${request.userId}`, req });
    ctx.saveDb();

    const subject = db.users.find(u => u.id === request.userId);
    if (subject && status !== 'in_progress' && !subject.privacy?.anonymisedAt) {
      const label = DSR_LABELS[request.type];
      const outcome = status === 'completed' ? 'has been completed' : 'could not be fulfilled';
      const p = getPrivacySettings(ctx.getSettings());
      const complaint = 'If you are not satisfied, you may lodge a complaint with the Nigeria Data Protection Commission (ndpc.gov.ng) or the data protection authority where you live.';
      ctx.sendEmail(
        subject.email,
        `Update on your privacy request (${label})`,
        `Hello ${subject.name},\n\nYour request "${label}" (reference ${request.id}) ${outcome}.${note ? `\n\nNote: ${note}` : ''}\n\n${complaint}${p.dpoEmail ? `\nContact our Data Protection Officer: ${p.dpoEmail}` : ''}`,
        `<p>Hello ${escapeHtml(subject.name)},</p><p>Your request <b>${escapeHtml(label)}</b> (reference <code>${request.id}</code>) ${outcome}.</p>${note ? `<p>Note: ${escapeHtml(note)}</p>` : ''}<p>${complaint}</p>${p.dpoEmail ? `<p>Contact our Data Protection Officer: ${escapeHtml(p.dpoEmail)}</p>` : ''}`,
        'Privacy Request',
        { recipientId: subject.id }
      );
    }
    res.json(request);
  });

  // Admin: erase (anonymise) a user's personal data
  app.post('/api/admin/privacy/users/:id/anonymise', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const target = db.users.find(u => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.id === admin.id) return res.status(400).json({ error: 'You cannot erase your own account.' });
    if (target.role === UserRole.ADMIN && db.users.filter(u => u.role === UserRole.ADMIN && u.isActive !== false && u.id !== target.id).length === 0) {
      return res.status(400).json({ error: 'Cannot erase the last active administrator.' });
    }
    if (target.privacy?.anonymisedAt) return res.status(400).json({ error: 'This account has already been erased.' });
    const confirmation = str(req.body?.confirm, 200);
    if (confirmation !== target.username) return res.status(400).json({ error: 'Type the username to confirm erasure.' });

    // Tell the person before their contact details are removed
    const p = getPrivacySettings(ctx.getSettings());
    ctx.sendEmail(
      target.email,
      'Your personal data has been erased',
      `Hello ${target.name},\n\nAs requested, your personal data on our investor portal has been erased and your account closed. Records we are legally required to keep (such as contracts and financial records, retained for ${p.retentionFinancialRecordsYears} years) are kept without your contact details.`,
      `<p>Hello ${escapeHtml(target.name)},</p><p>As requested, your personal data on our investor portal has been erased and your account closed. Records we are legally required to keep (such as contracts and financial records, retained for ${p.retentionFinancialRecordsYears} years) are kept without your contact details.</p>`,
      'Privacy Request'
    );

    anonymiseUser(db, target);
    for (const r of db.dataRequests || []) {
      if (r.userId === target.id && r.type === 'erasure' && (r.status === 'open' || r.status === 'in_progress')) {
        r.status = 'completed';
        r.resolvedAt = new Date().toISOString();
        r.resolvedBy = admin.id;
        r.resolutionNote = 'Personal data erased (anonymised). Legally required records retained without identifiers.';
      }
    }
    recordAudit(db, admin, 'privacy.user_anonymised', { targetType: 'user', targetId: target.id, req });
    ctx.saveDb();
    res.json({ success: true, user: ctx.publicUser(target) });
  });

  // Admin: audit trail
  app.get('/api/admin/audit-logs', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const action = str(req.query.action, 100);
    const userId = str(req.query.userId, 100);
    const limit = Math.min(parseInt(String(req.query.limit || '200'), 10) || 200, 1000);
    let logs = db.auditLogs || [];
    if (action) logs = logs.filter(l => l.action.includes(action));
    if (userId) logs = logs.filter(l => l.actorId === userId || l.targetId === userId);
    const users = new Map(db.users.map(u => [u.id, u]));
    res.json({
      total: logs.length,
      entries: logs.slice(0, limit).map(l => ({ ...l, actorName: l.actorId ? users.get(l.actorId)?.name : undefined }))
    });
  });

  // Admin: breach register
  app.get('/api/admin/breaches', requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json(ctx.getDb().breachIncidents || []);
  });

  app.post('/api/admin/breaches', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const title = str(req.body?.title, 200);
    if (!title) return res.status(400).json({ error: 'A short title is required.' });
    const detected = req.body?.detectedAt ? new Date(req.body.detectedAt) : new Date();
    if (isNaN(detected.getTime())) return res.status(400).json({ error: 'Invalid detection time.' });
    const now = new Date().toISOString();
    const incident: BreachIncident = {
      id: newId('breach'),
      title,
      description: str(req.body?.description, 5000),
      detectedAt: detected.toISOString(),
      reportedBy: admin.id,
      dataCategories: str(req.body?.dataCategories, 500),
      estimatedAffected: Math.max(0, parseInt(req.body?.estimatedAffected, 10) || 0),
      likelyHighRisk: !!req.body?.likelyHighRisk,
      containmentActions: str(req.body?.containmentActions, 5000),
      status: 'open',
      createdAt: now,
      updatedAt: now
    };
    if (!db.breachIncidents) db.breachIncidents = [];
    db.breachIncidents.unshift(incident);
    recordAudit(db, admin, 'privacy.breach_logged', { targetType: 'breach', targetId: incident.id, req });
    ctx.saveDb();
    res.status(201).json(incident);
  });

  app.post('/api/admin/breaches/:id/update', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const incident = (db.breachIncidents || []).find(b => b.id === req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });
    const b = req.body || {};
    if (typeof b.description === 'string') incident.description = str(b.description, 5000);
    if (typeof b.dataCategories === 'string') incident.dataCategories = str(b.dataCategories, 500);
    if (b.estimatedAffected !== undefined) incident.estimatedAffected = Math.max(0, parseInt(b.estimatedAffected, 10) || 0);
    if (typeof b.likelyHighRisk === 'boolean') incident.likelyHighRisk = b.likelyHighRisk;
    if (typeof b.containmentActions === 'string') incident.containmentActions = str(b.containmentActions, 5000);
    if (b.regulatorNotified === true && !incident.regulatorNotifiedAt) incident.regulatorNotifiedAt = new Date().toISOString();
    if (b.subjectsNotified === true && !incident.subjectsNotifiedAt) incident.subjectsNotifiedAt = new Date().toISOString();
    if (['open', 'contained', 'closed'].includes(b.status)) incident.status = b.status;
    incident.updatedAt = new Date().toISOString();
    recordAudit(db, admin, 'privacy.breach_updated', { targetType: 'breach', targetId: incident.id, details: `status=${incident.status}`, req });
    ctx.saveDb();
    res.json(incident);
  });

  // Admin: privacy configuration
  app.get('/api/admin/privacy/settings', requireAuth, (req, res) => {
    if (!adminOnly(req, res)) return;
    res.json(getPrivacySettings(ctx.getSettings()));
  });

  app.put('/api/admin/privacy/settings', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const current = getPrivacySettings(ctx.getSettings());
    const b = req.body || {};
    const next: PrivacySettings = { ...current };
    for (const key of ['controllerName', 'controllerAddress', 'controllerEmail', 'dpoName', 'dpoEmail', 'dpoPhone', 'hostingDescription', 'additionalNoticeText'] as const) {
      if (typeof b[key] === 'string') next[key] = str(b[key], key === 'additionalNoticeText' ? 10000 : 500);
    }
    const num = (v: unknown, min: number, max: number, fallback: number) => {
      const n = parseInt(String(v), 10);
      return isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
    };
    next.dsrResponseDays = num(b.dsrResponseDays, 1, 90, current.dsrResponseDays);
    next.retentionEmailLogDays = num(b.retentionEmailLogDays, 30, 3650, current.retentionEmailLogDays);
    next.retentionAuditLogDays = num(b.retentionAuditLogDays, 180, 3650, current.retentionAuditLogDays);
    next.retentionFinancialRecordsYears = num(b.retentionFinancialRecordsYears, 1, 20, current.retentionFinancialRecordsYears);
    // Publishing a new notice version makes every user re-acknowledge it
    if (b.publishNewVersion === true) {
      const [major, minor] = current.noticeVersion.split('.').map(n => parseInt(n, 10) || 0);
      next.noticeVersion = `${major}.${minor + 1}`;
      next.noticeLastUpdated = new Date().toISOString().slice(0, 10);
    }
    ctx.setPrivacySettings(next);
    recordAudit(ctx.getDb(), admin, 'privacy.settings_updated', { details: b.publishNewVersion ? `notice=${next.noticeVersion}` : undefined, req });
    ctx.saveDb();
    res.json(next);
  });

  app.post('/api/admin/privacy/run-retention', requireAuth, (req, res) => {
    const admin = adminOnly(req, res);
    if (!admin) return;
    const db = ctx.getDb();
    const result = runRetention(db, ctx.getSettings());
    recordAudit(db, admin, 'privacy.retention_run', { details: `emails=${result.emailsRemoved}; audit=${result.auditRemoved}`, req });
    ctx.saveDb();
    res.json(result);
  });
}
