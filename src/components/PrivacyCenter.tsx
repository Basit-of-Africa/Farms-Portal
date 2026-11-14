/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Privacy & Data centre.
 *  - Everyone: notice status, correct contact details, marketing consent,
 *    download own data, submit and track data subject requests.
 *  - Admins: request queue (with deadlines and erasure), audit trail,
 *    breach register (72-hour clock) and privacy configuration.
 */

import React, { useEffect, useState } from 'react';
import { Download, ShieldCheck, FileText, AlertTriangle, ScrollText, Settings2, Inbox } from 'lucide-react';
import { User, UserRole, DataSubjectRequest, DataSubjectRequestType, AuditLogEntry, BreachIncident, PrivacySettings } from '../types';
import { usePrivacyNotice } from './PrivacyNotice';

interface PrivacyCenterProps {
  user: User;
  token: string;
  onUserUpdated: (user: User) => void;
}

const REQUEST_TYPES: Array<{ value: DataSubjectRequestType; label: string; hint: string }> = [
  { value: 'access', label: 'Access to my data', hint: 'Tip: "Download my data" above gives you an instant copy.' },
  { value: 'rectification', label: 'Correct my data', hint: 'Tell us what is wrong (you can edit your contact details above yourself).' },
  { value: 'erasure', label: 'Erase my data', hint: 'Your account will be closed. Records the law requires us to keep are retained without your contact details.' },
  { value: 'restriction', label: 'Restrict processing', hint: 'Ask us to stop using your data while an issue is resolved.' },
  { value: 'objection', label: 'Object to processing', hint: 'Object to processing based on our legitimate interests.' },
  { value: 'portability', label: 'Data portability', hint: 'Ask us to send your data to another organisation.' },
  { value: 'withdraw_consent', label: 'Withdraw consent', hint: 'You can also switch off promotional messages above.' },
  { value: 'other', label: 'Other privacy question', hint: '' }
];
const typeLabel = (t: string) => REQUEST_TYPES.find(r => r.value === t)?.label || t;

const card = 'bg-white dark:bg-stone-900 border border-[#2D6A4F]/10 dark:border-stone-800 rounded-2xl p-5 md:p-6 shadow-sm';
const input = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30';
const btn = 'px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#1B4332] hover:bg-[#2D6A4F] text-white disabled:opacity-60 cursor-pointer';
const btnSecondary = 'px-3 py-2 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 cursor-pointer';
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');

function statusBadge(status: string) {
  const color =
    status === 'completed' || status === 'closed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    : status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
    : status === 'in_progress' || status === 'contained' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>{status.replace('_', ' ')}</span>;
}

export default function PrivacyCenter({ user, token, onUserUpdated }: PrivacyCenterProps) {
  const isAdmin = user.role === UserRole.ADMIN;
  const [tab, setTab] = useState<'mine' | 'requests' | 'audit' | 'breaches' | 'settings'>('mine');
  const auth = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...auth, 'Content-Type': 'application/json' };

  const tabs = [
    { id: 'mine', label: 'My privacy', icon: ShieldCheck },
    ...(isAdmin
      ? [
          { id: 'requests', label: 'Requests', icon: Inbox },
          { id: 'audit', label: 'Audit log', icon: ScrollText },
          { id: 'breaches', label: 'Breaches', icon: AlertTriangle },
          { id: 'settings', label: 'Settings', icon: Settings2 }
        ]
      : [])
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl text-[#1B4332] dark:text-white">Privacy &amp; Data</h1>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          Your rights under the Nigeria Data Protection Act 2023 and other data protection laws.{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#2D6A4F] dark:text-emerald-400 underline">Read the privacy notice</a>
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer border ${
                tab === t.id ? 'bg-[#1B4332] text-white border-[#1B4332]' : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'mine' && <MyPrivacy user={user} auth={auth} jsonHeaders={jsonHeaders} onUserUpdated={onUserUpdated} />}
      {tab === 'requests' && isAdmin && <AdminRequests jsonHeaders={jsonHeaders} auth={auth} />}
      {tab === 'audit' && isAdmin && <AuditLog auth={auth} />}
      {tab === 'breaches' && isAdmin && <Breaches auth={auth} jsonHeaders={jsonHeaders} />}
      {tab === 'settings' && isAdmin && <PrivacySettingsForm auth={auth} jsonHeaders={jsonHeaders} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Self-service
// ---------------------------------------------------------------------------

function MyPrivacy({ user, auth, jsonHeaders, onUserUpdated }: { user: User; auth: any; jsonHeaders: any; onUserUpdated: (u: User) => void }) {
  const notice = usePrivacyNotice();
  const [profile, setProfile] = useState({ name: user.name, email: user.email, phone: user.phone || '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [requests, setRequests] = useState<DataSubjectRequest[]>([]);
  const [reqType, setReqType] = useState<DataSubjectRequestType>('access');
  const [reqDetails, setReqDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRequests = () =>
    fetch('/api/privacy/requests', { headers: auth }).then(r => (r.ok ? r.json() : [])).then(setRequests).catch(() => {});
  useEffect(() => { loadRequests(); }, []);

  const call = async (url: string, method: string, body?: any) => {
    const res = await fetch(url, { method, headers: jsonHeaders, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await call('/api/privacy/profile', 'PUT', profile);
      onUserUpdated(data.user);
      setMessage({ ok: true, text: 'Your details were updated.' });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const toggleMarketing = async (consent: boolean) => {
    try {
      const data = await call('/api/privacy/marketing-consent', 'PUT', { consent });
      onUserUpdated(data.user);
      setMessage({ ok: true, text: consent ? 'You opted in to promotional messages.' : 'You will no longer receive promotional messages.' });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    }
  };

  const downloadData = async () => {
    try {
      const res = await fetch('/api/privacy/my-data', { headers: auth });
      if (!res.ok) throw new Error('Could not prepare your data export.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    }
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reqType === 'erasure' && !window.confirm('Erasure closes your account. Records the law requires us to keep are retained without your contact details. Continue?')) return;
    setBusy(true);
    try {
      const r = await call('/api/privacy/requests', 'POST', { type: reqType, details: reqDetails });
      setReqDetails('');
      setMessage({ ok: true, text: `Request submitted. We will respond by ${new Date(r.dueAt).toLocaleDateString()}.` });
      loadRequests();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const hint = REQUEST_TYPES.find(r => r.value === reqType)?.hint;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {message && (
        <div className={`lg:col-span-2 p-3 rounded-xl text-sm font-medium ${message.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
          {message.text}
        </div>
      )}

      <div className={card}>
        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mb-3 flex items-center gap-2"><FileText className="h-4 w-4" /> Privacy notice</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {user.privacy?.noticeAcknowledgedAt
            ? <>You acknowledged version {user.privacy.noticeVersion} on {fmt(user.privacy.noticeAcknowledgedAt)}.</>
            : 'You have not acknowledged the privacy notice yet.'}
          {notice && notice.noticeVersion !== user.privacy?.noticeVersion && <> The current version is {notice.noticeVersion}.</>}
        </p>
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-sm font-semibold text-[#2D6A4F] dark:text-emerald-400 underline">Open the privacy notice</a>

        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mt-6 mb-3">Promotional messages</h2>
        <label className="flex items-start gap-3 text-sm text-stone-600 dark:text-stone-300 cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={!!user.privacy?.marketingConsent} onChange={e => toggleMarketing(e.target.checked)} />
          <span>Send me news about new investment opportunities and offers. Account, investment and payout messages are always sent.</span>
        </label>

        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mt-6 mb-3">Your data</h2>
        <button onClick={downloadData} className={`${btn} inline-flex items-center gap-2`}>
          <Download className="h-4 w-4" /> Download my data (JSON)
        </button>
      </div>

      <form onSubmit={saveProfile} className={card}>
        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mb-3">Correct your contact details</h2>
        <div className="space-y-3">
          <div>
            <label htmlFor="pv-name" className="block text-xs font-semibold text-stone-500 mb-1">Full name</label>
            <input id="pv-name" className={input} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="pv-email" className="block text-xs font-semibold text-stone-500 mb-1">Email</label>
            <input id="pv-email" type="email" className={input} value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="pv-phone" className="block text-xs font-semibold text-stone-500 mb-1">Phone</label>
            <input id="pv-phone" className={input} value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
          </div>
          <button type="submit" disabled={busy} className={btn}>Save details</button>
        </div>
      </form>

      <form onSubmit={submitRequest} className={card}>
        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mb-3">Make a privacy request</h2>
        <div className="space-y-3">
          <select aria-label="Request type" className={input} value={reqType} onChange={e => setReqType(e.target.value as DataSubjectRequestType)}>
            {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {hint && <p className="text-xs text-stone-500">{hint}</p>}
          <textarea aria-label="Request details" className={input} rows={3} placeholder="Details (optional)" value={reqDetails} onChange={e => setReqDetails(e.target.value)} />
          <button type="submit" disabled={busy} className={btn}>Submit request</button>
        </div>
      </form>

      <div className={card}>
        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mb-3">Your requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-stone-500">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {requests.map(r => (
              <li key={r.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{typeLabel(r.type)}</span>
                  {statusBadge(r.status)}
                </div>
                <p className="text-xs text-stone-500 mt-0.5">Submitted {fmt(r.createdAt)} · Due {new Date(r.dueAt).toLocaleDateString()}</p>
                {r.resolutionNote && <p className="text-xs text-stone-600 dark:text-stone-300 mt-1">{r.resolutionNote}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: request queue
// ---------------------------------------------------------------------------

function AdminRequests({ jsonHeaders, auth }: { jsonHeaders: any; auth: any }) {
  const [requests, setRequests] = useState<Array<DataSubjectRequest & { userName?: string; userEmail?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () => fetch('/api/privacy/requests', { headers: auth }).then(r => r.json()).then(setRequests).catch(() => {});
  useEffect(() => { load(); }, []);

  const resolve = async (r: DataSubjectRequest, status: string) => {
    const note = status === 'in_progress' ? '' : window.prompt(status === 'rejected' ? 'Reason for rejecting (sent to the person):' : 'Note to the person (optional):') ?? null;
    if (note === null) return;
    const res = await fetch(`/api/privacy/requests/${r.id}/resolve`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ status, note }) });
    const data = await res.json();
    if (!res.ok) setError(data.error); else { setError(null); load(); }
  };

  const erase = async (r: DataSubjectRequest & { userName?: string }) => {
    const username = window.prompt(`Erase all personal data of ${r.userName}? This cannot be undone. Type their username to confirm:`);
    if (!username) return;
    const res = await fetch(`/api/admin/privacy/users/${r.userId}/anonymise`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ confirm: username }) });
    const data = await res.json();
    if (!res.ok) setError(data.error); else { setError(null); load(); }
  };

  const now = Date.now();
  return (
    <div className={card}>
      <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mb-1">Data subject requests</h2>
      <p className="text-xs text-stone-500 mb-4">Respond before the due date. Verify the requester's identity before releasing or erasing data.</p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {requests.length === 0 ? <p className="text-sm text-stone-500">No requests.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-stone-500"><th className="py-2 pr-3">Person</th><th className="pr-3">Request</th><th className="pr-3">Due</th><th className="pr-3">Status</th><th>Actions</th></tr></thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {requests.map(r => {
                const open = r.status === 'open' || r.status === 'in_progress';
                const overdue = open && new Date(r.dueAt).getTime() < now;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="py-2.5 pr-3"><div className="font-semibold">{r.userName || r.userId}</div><div className="text-xs text-stone-500">{r.userEmail}</div></td>
                    <td className="pr-3 py-2.5"><div>{typeLabel(r.type)}</div>{r.details && <div className="text-xs text-stone-500 max-w-xs">{r.details}</div>}</td>
                    <td className={`pr-3 py-2.5 whitespace-nowrap ${overdue ? 'text-red-600 font-bold' : ''}`}>{new Date(r.dueAt).toLocaleDateString()}{overdue && ' (overdue)'}</td>
                    <td className="pr-3 py-2.5">{statusBadge(r.status)}</td>
                    <td className="py-2.5">
                      {open && (
                        <div className="flex flex-wrap gap-1.5">
                          {r.status === 'open' && <button className={btnSecondary} onClick={() => resolve(r, 'in_progress')}>Start</button>}
                          <button className={btnSecondary} onClick={() => resolve(r, 'completed')}>Complete</button>
                          <button className={btnSecondary} onClick={() => resolve(r, 'rejected')}>Reject</button>
                          {r.type === 'erasure' && <button className={`${btnSecondary} !bg-red-600 !text-white`} onClick={() => erase(r)}>Erase data</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: audit trail
// ---------------------------------------------------------------------------

function AuditLog({ auth }: { auth: any }) {
  const [entries, setEntries] = useState<Array<AuditLogEntry & { actorName?: string }>>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const load = () => {
    const q = filter ? `?action=${encodeURIComponent(filter)}` : '';
    fetch(`/api/admin/audit-logs${q}`, { headers: auth }).then(r => r.json()).then(d => { setEntries(d.entries || []); setTotal(d.total || 0); }).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  return (
    <div className={card}>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400">Audit log</h2>
          <p className="text-xs text-stone-500">Sign-ins, access to personal data and administrative changes. Showing {entries.length} of {total}.</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); load(); }} className="flex gap-2">
          <input aria-label="Filter by action" className={input} placeholder="Filter, e.g. privacy or user." value={filter} onChange={e => setFilter(e.target.value)} />
          <button className={btnSecondary} type="submit">Filter</button>
        </form>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-stone-500"><th className="py-2 pr-3">When</th><th className="pr-3">Who</th><th className="pr-3">Action</th><th className="pr-3">Target</th><th className="pr-3">Details</th><th>IP</th></tr></thead>
          <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
            {entries.map(e => (
              <tr key={e.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{fmt(e.at)}</td>
                <td className="pr-3">{e.actorName || (e.actorId ? e.actorId : 'system')}</td>
                <td className="pr-3 font-mono">{e.action}</td>
                <td className="pr-3">{e.targetType ? `${e.targetType}:${e.targetId}` : ''}</td>
                <td className="pr-3">{e.details}</td>
                <td className="font-mono">{e.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: breach register
// ---------------------------------------------------------------------------

function Breaches({ auth, jsonHeaders }: { auth: any; jsonHeaders: any }) {
  const [list, setList] = useState<BreachIncident[]>([]);
  const [form, setForm] = useState({ title: '', description: '', dataCategories: '', estimatedAffected: '', likelyHighRisk: false, containmentActions: '', detectedAt: '' });
  const [error, setError] = useState<string | null>(null);
  const load = () => fetch('/api/admin/breaches', { headers: auth }).then(r => r.json()).then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/breaches', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...form, detectedAt: form.detectedAt || undefined }) });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setError(null);
    setForm({ title: '', description: '', dataCategories: '', estimatedAffected: '', likelyHighRisk: false, containmentActions: '', detectedAt: '' });
    load();
  };
  const update = async (id: string, body: any) => {
    await fetch(`/api/admin/breaches/${id}/update`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
    load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={create} className={card}>
        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mb-1">Log a personal data breach</h2>
        <p className="text-xs text-stone-500 mb-4">
          If the breach is likely to risk people's rights, notify the Nigeria Data Protection Commission within 72 hours of becoming aware of it,
          and tell affected people immediately if the risk is high. Record every breach here, even if you decide not to notify.
        </p>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <input aria-label="Title" className={input} placeholder="Short title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
          <label className="block text-xs font-semibold text-stone-500">When did you become aware? (leave empty for now)
            <input type="datetime-local" className={`${input} mt-1`} value={form.detectedAt} onChange={e => setForm({ ...form, detectedAt: e.target.value })} />
          </label>
          <textarea aria-label="What happened" className={input} rows={3} placeholder="What happened?" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <input aria-label="Data affected" className={input} placeholder="Data affected (e.g. names, emails, contracts)" value={form.dataCategories} onChange={e => setForm({ ...form, dataCategories: e.target.value })} />
          <input aria-label="People affected" type="number" min={0} className={input} placeholder="Estimated number of people affected" value={form.estimatedAffected} onChange={e => setForm({ ...form, estimatedAffected: e.target.value })} />
          <textarea aria-label="Containment" className={input} rows={2} placeholder="Containment and mitigation actions" value={form.containmentActions} onChange={e => setForm({ ...form, containmentActions: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.likelyHighRisk} onChange={e => setForm({ ...form, likelyHighRisk: e.target.checked })} /> Likely high risk to individuals (e.g. fraud, identity theft, sensitive data)</label>
          <button type="submit" className={btn}>Log breach</button>
        </div>
      </form>

      <div className={card}>
        <h2 className="font-bold text-sm text-[#1B4332] dark:text-emerald-400 mb-3">Breach register</h2>
        {list.length === 0 ? <p className="text-sm text-stone-500">No breaches recorded.</p> : (
          <ul className="space-y-4">
            {list.map(b => {
              const deadline = new Date(b.detectedAt).getTime() + 72 * 3600 * 1000;
              const hoursLeft = Math.round((deadline - Date.now()) / 3600000);
              return (
                <li key={b.id} className="border border-stone-100 dark:border-stone-800 rounded-xl p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{b.title}</span>
                    {statusBadge(b.status)}
                  </div>
                  <p className="text-xs text-stone-500 mt-1">Aware since {fmt(b.detectedAt)} · ~{b.estimatedAffected} people · {b.likelyHighRisk ? 'high risk' : 'risk not marked high'}</p>
                  <p className={`text-xs mt-1 font-semibold ${b.regulatorNotifiedAt ? 'text-emerald-700' : hoursLeft < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                    {b.regulatorNotifiedAt ? `NDPC notified ${fmt(b.regulatorNotifiedAt)}` : hoursLeft < 0 ? `72-hour NDPC deadline passed ${-hoursLeft}h ago` : `NDPC deadline in ${hoursLeft}h (${new Date(deadline).toLocaleString()})`}
                  </p>
                  {b.subjectsNotifiedAt && <p className="text-xs text-emerald-700">Individuals notified {fmt(b.subjectsNotifiedAt)}</p>}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {!b.regulatorNotifiedAt && <button className={btnSecondary} onClick={() => update(b.id, { regulatorNotified: true })}>Mark NDPC notified</button>}
                    {!b.subjectsNotifiedAt && <button className={btnSecondary} onClick={() => update(b.id, { subjectsNotified: true })}>Mark individuals notified</button>}
                    {b.status === 'open' && <button className={btnSecondary} onClick={() => update(b.id, { status: 'contained' })}>Contained</button>}
                    {b.status !== 'closed' && <button className={btnSecondary} onClick={() => update(b.id, { status: 'closed' })}>Close</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: privacy settings
// ---------------------------------------------------------------------------

function PrivacySettingsForm({ auth, jsonHeaders }: { auth: any; jsonHeaders: any }) {
  const [s, setS] = useState<PrivacySettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { fetch('/api/admin/privacy/settings', { headers: auth }).then(r => r.json()).then(setS).catch(() => {}); }, []);
  if (!s) return <p className="text-sm text-stone-500">Loading…</p>;

  const save = async (publishNewVersion = false) => {
    if (publishNewVersion && !window.confirm('Publish a new notice version? Every user will be asked to review it at their next sign-in.')) return;
    const res = await fetch('/api/admin/privacy/settings', { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ ...s, publishNewVersion }) });
    const data = await res.json();
    if (res.ok) { setS(data); setMessage(publishNewVersion ? `Published notice version ${data.noticeVersion}.` : 'Saved.'); } else setMessage(data.error);
  };
  const runRetention = async () => {
    const res = await fetch('/api/admin/privacy/run-retention', { method: 'POST', headers: auth });
    const data = await res.json();
    setMessage(`Retention purge removed ${data.emailsRemoved} email log entries and ${data.auditRemoved} audit entries.`);
  };

  const field = (key: keyof PrivacySettings, label: string, type = 'text') => (
    <label className="block text-xs font-semibold text-stone-500">
      {label}
      <input type={type} className={`${input} mt-1`} value={String(s[key] ?? '')} onChange={e => setS({ ...s, [key]: type === 'number' ? Number(e.target.value) : e.target.value })} />
    </label>
  );

  return (
    <div className={card}>
      <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs">
        The privacy notice is generated from these settings and is a starting template. Have it reviewed by a qualified data protection
        lawyer or DPO before relying on it. Notice version {s.noticeVersion}, last updated {s.noticeLastUpdated}.
      </div>
      {message && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {field('controllerName', 'Organisation (data controller) name')}
        {field('controllerEmail', 'Organisation privacy email', 'email')}
        {field('controllerAddress', 'Registered address')}
        {field('dpoName', 'Data Protection Officer name')}
        {field('dpoEmail', 'DPO email', 'email')}
        {field('dpoPhone', 'DPO phone')}
        {field('dsrResponseDays', 'Days to respond to requests', 'number')}
        {field('retentionFinancialRecordsYears', 'Keep financial/contract records (years)', 'number')}
        {field('retentionEmailLogDays', 'Keep email log (days)', 'number')}
        {field('retentionAuditLogDays', 'Keep audit log (days)', 'number')}
      </div>
      <label className="block text-xs font-semibold text-stone-500 mt-3">
        Hosting and transfer details (e.g. "Application hosted on Google Cloud Run, europe-west1")
        <input className={`${input} mt-1`} value={s.hostingDescription} onChange={e => setS({ ...s, hostingDescription: e.target.value })} />
      </label>
      <label className="block text-xs font-semibold text-stone-500 mt-3">
        Additional notice text
        <textarea rows={4} className={`${input} mt-1`} value={s.additionalNoticeText} onChange={e => setS({ ...s, additionalNoticeText: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-2 mt-4">
        <button className={btn} onClick={() => save(false)}>Save settings</button>
        <button className={btnSecondary} onClick={() => save(true)}>Save and publish new notice version</button>
        <button className={btnSecondary} onClick={runRetention}>Run retention purge now</button>
      </div>
    </div>
  );
}
