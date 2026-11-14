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

import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { Download, ShieldCheck, FileText, AlertTriangle, ScrollText, Settings2, Inbox, Loader2 } from 'lucide-react';
import { User, UserRole, DataSubjectRequest, DataSubjectRequestType, AuditLogEntry, BreachIncident, PrivacySettings } from '../types';
import {
  profileSchema,
  ProfileInput,
  dataRequestSchema,
  DataRequestInput,
  breachSchema,
  BreachInput,
  privacySettingsSchema,
  PrivacySettingsInput
} from '../lib/schemas';
import { usePrivacyNotice } from './PrivacyNotice';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input, NativeSelect, Textarea } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { FormField } from './ui/form';
import { DataTable } from './ui/data-table';
import { useConfirm, usePrompt } from './ui/confirm';
import { toast } from './ui/sonner';

interface PrivacyCenterProps {
  user: User;
  token: string;
  onUserUpdated: (user: User) => void;
}

const REQUEST_TYPES: Array<{ value: DataSubjectRequestType; label: string; hint: string }> = [
  { value: 'access', label: 'Access to my data', hint: 'Tip: "Download my data" gives you an instant copy.' },
  { value: 'rectification', label: 'Correct my data', hint: 'Tell us what is wrong. You can edit your contact details yourself.' },
  { value: 'erasure', label: 'Erase my data', hint: 'Your account will be closed. Records the law requires us to keep are retained without your contact details.' },
  { value: 'restriction', label: 'Restrict processing', hint: 'Ask us to stop using your data while an issue is resolved.' },
  { value: 'objection', label: 'Object to processing', hint: 'Object to processing based on our legitimate interests.' },
  { value: 'portability', label: 'Data portability', hint: 'Ask us to send your data to another organisation.' },
  { value: 'withdraw_consent', label: 'Withdraw consent', hint: 'You can also switch off promotional messages yourself.' },
  { value: 'other', label: 'Other privacy question', hint: '' }
];
const typeLabel = (t: string) => REQUEST_TYPES.find(r => r.value === t)?.label || t;
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');
const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed' || status === 'closed' ? 'success' : status === 'rejected' ? 'destructive' : status === 'in_progress' || status === 'contained' ? 'warning' : 'muted';
  return <Badge variant={variant}>{status.replace('_', ' ')}</Badge>;
}

/** fetch wrapper that throws the server's error message */
function useApi(token: string) {
  return async (url: string, method = 'GET', body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };
}

export default function PrivacyCenter({ user, token, onUserUpdated }: PrivacyCenterProps) {
  const isAdmin = user.role === UserRole.ADMIN;
  const api = useApi(token);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-bold text-2xl text-foreground">Privacy &amp; Data</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your rights under the Nigeria Data Protection Act 2023 and other data protection laws.{' '}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline underline-offset-4">
            Read the privacy notice
          </a>
        </p>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine"><ShieldCheck /> My privacy</TabsTrigger>
            <TabsTrigger value="requests"><Inbox /> Requests</TabsTrigger>
            <TabsTrigger value="audit"><ScrollText /> Audit log</TabsTrigger>
            <TabsTrigger value="breaches"><AlertTriangle /> Breaches</TabsTrigger>
            <TabsTrigger value="settings"><Settings2 /> Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="mine"><MyPrivacy user={user} api={api} token={token} onUserUpdated={onUserUpdated} /></TabsContent>
          <TabsContent value="requests"><AdminRequests api={api} /></TabsContent>
          <TabsContent value="audit"><AuditLog api={api} /></TabsContent>
          <TabsContent value="breaches"><Breaches api={api} /></TabsContent>
          <TabsContent value="settings"><PrivacySettingsForm api={api} /></TabsContent>
        </Tabs>
      ) : (
        <MyPrivacy user={user} api={api} token={token} onUserUpdated={onUserUpdated} />
      )}
    </div>
  );
}

type Api = ReturnType<typeof useApi>;

// ---------------------------------------------------------------------------
// Self-service
// ---------------------------------------------------------------------------

function MyPrivacy({ user, api, token, onUserUpdated }: { user: User; api: Api; token: string; onUserUpdated: (u: User) => void }) {
  const notice = usePrivacyNotice();
  const confirmDialog = useConfirm();
  const [requests, setRequests] = useState<DataSubjectRequest[]>([]);

  const profileForm = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, email: user.email, phone: user.phone || '' }
  });
  const requestForm = useForm<DataRequestInput>({ resolver: zodResolver(dataRequestSchema), defaultValues: { type: 'access', details: '' } });
  const reqType = requestForm.watch('type');

  const loadRequests = () => api('/api/privacy/requests').then(setRequests).catch(() => {});
  useEffect(() => {
    loadRequests();
  }, []);

  const saveProfile = async (values: ProfileInput) => {
    try {
      const data = await api('/api/privacy/profile', 'PUT', values);
      onUserUpdated(data.user);
      toast.success('Your details were updated.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleMarketing = async (consent: boolean) => {
    try {
      const data = await api('/api/privacy/marketing-consent', 'PUT', { consent });
      onUserUpdated(data.user);
      toast.success(consent ? 'You opted in to promotional messages.' : 'You will no longer receive promotional messages.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const downloadData = async () => {
    try {
      const res = await fetch('/api/privacy/my-data', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Could not prepare your data export.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const submitRequest = async (values: DataRequestInput) => {
    if (values.type === 'erasure') {
      const ok = await confirmDialog({
        title: 'Ask us to erase your data?',
        description: 'Your account will be closed. Records the law requires us to keep (contracts, financial records) are retained without your contact details.',
        confirmText: 'Submit erasure request',
        destructive: true
      });
      if (!ok) return;
    }
    try {
      const r = await api('/api/privacy/requests', 'POST', values);
      requestForm.reset({ type: values.type, details: '' });
      toast.success(`Request submitted. We will respond by ${fmtDate(r.dueAt)}.`);
      loadRequests();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const pErr = profileForm.formState.errors;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Privacy notice</CardTitle>
          <CardDescription>
            {user.privacy?.noticeAcknowledgedAt
              ? `You acknowledged version ${user.privacy.noticeVersion} on ${fmt(user.privacy.noticeAcknowledgedAt)}.`
              : 'You have not acknowledged the privacy notice yet.'}
            {notice && notice.noticeVersion !== user.privacy?.noticeVersion && ` The current version is ${notice.noticeVersion}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary underline underline-offset-4">
            Open the privacy notice
          </a>
          <div>
            <h3 className="font-semibold text-sm mb-2">Promotional messages</h3>
            <div className="flex items-start gap-3">
              <Checkbox id="marketing" checked={!!user.privacy?.marketingConsent} onCheckedChange={v => toggleMarketing(!!v)} className="mt-0.5" />
              <Label htmlFor="marketing" className="font-normal leading-snug cursor-pointer">
                Send me news about new investment opportunities and offers. Account, investment and payout messages are always sent.
              </Label>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-2">Your data</h3>
            <Button onClick={downloadData}><Download /> Download my data (JSON)</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Correct your contact details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(saveProfile)} className="flex flex-col gap-4" noValidate>
            <FormField id="pv-name" label="Full name" error={pErr.name}>
              <Input autoComplete="name" {...profileForm.register('name')} />
            </FormField>
            <FormField id="pv-email" label="Email" error={pErr.email}>
              <Input type="email" autoComplete="email" {...profileForm.register('email')} />
            </FormField>
            <FormField id="pv-phone" label="Phone" error={pErr.phone} hint="Include the country code, e.g. +234 803 000 0000.">
              <Input type="tel" autoComplete="tel" {...profileForm.register('phone')} />
            </FormField>
            <div>
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>Save details</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Make a privacy request</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={requestForm.handleSubmit(submitRequest)} className="flex flex-col gap-4" noValidate>
            <FormField id="dsr-type" label="What would you like us to do?" hint={REQUEST_TYPES.find(r => r.value === reqType)?.hint || undefined}>
              <NativeSelect {...requestForm.register('type')}>
                {REQUEST_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="dsr-details" label="Details (optional)" error={requestForm.formState.errors.details}>
              <Textarea rows={3} {...requestForm.register('details')} />
            </FormField>
            <div>
              <Button type="submit" disabled={requestForm.formState.isSubmitting}>Submit request</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {requests.map(r => (
                <li key={r.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{typeLabel(r.type)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Submitted {fmt(r.createdAt)} · Due {fmtDate(r.dueAt)}</p>
                  {r.resolutionNote && <p className="text-sm mt-1">{r.resolutionNote}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: request queue
// ---------------------------------------------------------------------------

type AdminRequest = DataSubjectRequest & { userName?: string; userEmail?: string };

function AdminRequests({ api }: { api: Api }) {
  const confirmDialog = useConfirm();
  const prompt = usePrompt();
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const load = () => api('/api/privacy/requests').then(setRequests).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const resolve = async (r: AdminRequest, status: 'in_progress' | 'completed' | 'rejected') => {
    let note = '';
    if (status !== 'in_progress') {
      const answer = await prompt({
        title: status === 'rejected' ? 'Reject this request?' : 'Mark this request as completed?',
        description: 'Your note is emailed to the person, together with how to complain to the NDPC.',
        label: status === 'rejected' ? 'Reason for rejecting' : 'Note to the person (optional)',
        multiline: true,
        required: status === 'rejected',
        confirmText: status === 'rejected' ? 'Reject request' : 'Mark completed'
      });
      if (answer === null) return;
      note = answer;
    }
    try {
      await api(`/api/privacy/requests/${r.id}/resolve`, 'POST', { status, note });
      toast.success('Request updated.');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const erase = async (r: AdminRequest) => {
    const users = await api('/api/admin/users').catch(() => []);
    const username = users.find((u: User) => u.id === r.userId)?.username;
    if (!username) return toast.error('User not found.');
    const ok = await confirmDialog({
      title: `Erase all personal data of ${r.userName}?`,
      description: 'Their account is closed and their identity removed. Contracts and financial records are kept without identifiers. This cannot be undone.',
      confirmText: 'Erase data',
      destructive: true,
      requireText: username
    });
    if (!ok) return;
    try {
      await api(`/api/admin/privacy/users/${r.userId}/anonymise`, 'POST', { confirm: username });
      toast.success('Personal data erased.');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const now = Date.now();
  const columns = useMemo<ColumnDef<AdminRequest>[]>(
    () => [
      {
        accessorKey: 'userName',
        header: 'Person',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold">{row.original.userName || row.original.userId}</div>
            <div className="text-xs text-muted-foreground">{row.original.userEmail}</div>
          </div>
        )
      },
      {
        accessorKey: 'type',
        header: 'Request',
        cell: ({ row }) => (
          <div className="max-w-xs whitespace-normal">
            <div>{typeLabel(row.original.type)}</div>
            {row.original.details && <div className="text-xs text-muted-foreground">{row.original.details}</div>}
          </div>
        )
      },
      {
        accessorKey: 'dueAt',
        header: 'Due',
        cell: ({ row }) => {
          const open = row.original.status === 'open' || row.original.status === 'in_progress';
          const overdue = open && new Date(row.original.dueAt).getTime() < now;
          return <span className={overdue ? 'text-destructive font-bold whitespace-nowrap' : 'whitespace-nowrap'}>{fmtDate(row.original.dueAt)}{overdue && ' (overdue)'}</span>;
        }
      },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue() as string} /> },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.status !== 'open' && r.status !== 'in_progress') return null;
          return (
            <div className="flex flex-wrap gap-1.5">
              {r.status === 'open' && <Button size="sm" variant="outline" onClick={() => resolve(r, 'in_progress')}>Start</Button>}
              <Button size="sm" variant="outline" onClick={() => resolve(r, 'completed')}>Complete</Button>
              <Button size="sm" variant="outline" onClick={() => resolve(r, 'rejected')}>Reject</Button>
              {r.type === 'erasure' && <Button size="sm" variant="destructive" onClick={() => erase(r)}>Erase data</Button>}
            </div>
          );
        }
      }
    ],
    [requests]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data subject requests</CardTitle>
        <CardDescription>Respond before the due date. Verify the person's identity before releasing or erasing data.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={requests} searchPlaceholder="Search requests…" emptyMessage="No requests." />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin: audit trail
// ---------------------------------------------------------------------------

type AuditRow = AuditLogEntry & { actorName?: string };

function AuditLog({ api }: { api: Api }) {
  const [entries, setEntries] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    api('/api/admin/audit-logs?limit=1000')
      .then(d => {
        setEntries(d.entries || []);
        setTotal(d.total || 0);
      })
      .catch(() => {});
  }, []);

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      { accessorKey: 'at', header: 'When', cell: ({ getValue }) => <span className="whitespace-nowrap">{fmt(getValue() as string)}</span> },
      { id: 'who', header: 'Who', accessorFn: e => e.actorName || e.actorId || 'system' },
      { accessorKey: 'action', header: 'Action', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
      { id: 'target', header: 'Target', accessorFn: e => (e.targetType ? `${e.targetType}:${e.targetId}` : ''), cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
      { accessorKey: 'details', header: 'Details', cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
      { accessorKey: 'ip', header: 'IP', cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> }
    ],
    []
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>Sign-ins, access to personal data and administrative changes. Showing the latest {entries.length} of {total}.</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={entries} searchPlaceholder="Search, e.g. privacy or a name…" pageSize={50} emptyMessage="No audit entries yet." />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Admin: breach register
// ---------------------------------------------------------------------------

function Breaches({ api }: { api: Api }) {
  const [list, setList] = useState<BreachIncident[]>([]);
  const form = useForm<BreachInput>({ resolver: zodResolver(breachSchema), defaultValues: { title: '', likelyHighRisk: false } });
  const load = () => api('/api/admin/breaches').then(setList).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const create = async (values: BreachInput) => {
    try {
      await api('/api/admin/breaches', 'POST', { ...values, detectedAt: values.detectedAt || undefined });
      toast.success('Breach logged. The 72-hour clock is shown in the register.');
      form.reset({ title: '', likelyHighRisk: false });
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const update = async (id: string, body: any) => {
    try {
      await api(`/api/admin/breaches/${id}/update`, 'POST', body);
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const e = form.formState.errors;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Log a personal data breach</CardTitle>
          <CardDescription>
            If the breach is likely to put people's rights at risk, notify the Nigeria Data Protection Commission within 72 hours of becoming aware of it,
            and tell affected people immediately if the risk is high. Record every breach here, even if you decide not to notify.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(create)} className="flex flex-col gap-4" noValidate>
            <FormField id="br-title" label="Short title" error={e.title}>
              <Input {...form.register('title')} />
            </FormField>
            <FormField id="br-detected" label="When did you become aware?" hint="Leave empty for now.">
              <Input type="datetime-local" {...form.register('detectedAt')} />
            </FormField>
            <FormField id="br-desc" label="What happened?" error={e.description}>
              <Textarea rows={3} {...form.register('description')} />
            </FormField>
            <FormField id="br-cats" label="Data affected" hint="e.g. names, emails, contracts">
              <Input {...form.register('dataCategories')} />
            </FormField>
            <FormField id="br-count" label="Estimated number of people affected" error={e.estimatedAffected}>
              <Input type="number" min={0} {...form.register('estimatedAffected')} />
            </FormField>
            <FormField id="br-contain" label="Containment and mitigation actions">
              <Textarea rows={2} {...form.register('containmentActions')} />
            </FormField>
            <div className="flex items-start gap-3">
              <Checkbox id="br-risk" checked={form.watch('likelyHighRisk')} onCheckedChange={v => form.setValue('likelyHighRisk', !!v)} className="mt-0.5" />
              <Label htmlFor="br-risk" className="font-normal leading-snug cursor-pointer">Likely high risk to individuals (e.g. fraud, identity theft, sensitive data)</Label>
            </div>
            <div>
              <Button type="submit" disabled={form.formState.isSubmitting}>Log breach</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Breach register</CardTitle>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No breaches recorded.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {list.map(b => {
                const deadline = new Date(b.detectedAt).getTime() + 72 * 3600 * 1000;
                const hoursLeft = Math.round((deadline - Date.now()) / 3600000);
                return (
                  <li key={b.id} className="rounded-2xl border border-border p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{b.title}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aware since {fmt(b.detectedAt)} · about {b.estimatedAffected} people · {b.likelyHighRisk ? 'high risk' : 'not marked high risk'}
                    </p>
                    <p className={`text-sm mt-2 font-semibold ${b.regulatorNotifiedAt ? 'text-success' : hoursLeft < 0 ? 'text-destructive' : 'text-warning'}`}>
                      {b.regulatorNotifiedAt
                        ? `NDPC notified ${fmt(b.regulatorNotifiedAt)}`
                        : hoursLeft < 0
                          ? `72-hour NDPC deadline passed ${-hoursLeft}h ago`
                          : `NDPC deadline in ${hoursLeft}h (${new Date(deadline).toLocaleString()})`}
                    </p>
                    {b.subjectsNotifiedAt && <p className="text-sm text-success">Individuals notified {fmt(b.subjectsNotifiedAt)}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {!b.regulatorNotifiedAt && <Button size="sm" variant="outline" onClick={() => update(b.id, { regulatorNotified: true })}>Mark NDPC notified</Button>}
                      {!b.subjectsNotifiedAt && <Button size="sm" variant="outline" onClick={() => update(b.id, { subjectsNotified: true })}>Mark individuals notified</Button>}
                      {b.status === 'open' && <Button size="sm" variant="outline" onClick={() => update(b.id, { status: 'contained' })}>Contained</Button>}
                      {b.status !== 'closed' && <Button size="sm" variant="outline" onClick={() => update(b.id, { status: 'closed' })}>Close</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin: privacy settings
// ---------------------------------------------------------------------------

function PrivacySettingsForm({ api }: { api: Api }) {
  const confirmDialog = useConfirm();
  const [meta, setMeta] = useState<{ noticeVersion: string; noticeLastUpdated: string } | null>(null);
  const form = useForm<PrivacySettingsInput>({ resolver: zodResolver(privacySettingsSchema) });

  useEffect(() => {
    api('/api/admin/privacy/settings')
      .then((s: PrivacySettings) => {
        setMeta({ noticeVersion: s.noticeVersion, noticeLastUpdated: s.noticeLastUpdated });
        form.reset(s);
      })
      .catch(() => {});
  }, []);

  const save = async (values: PrivacySettingsInput, publishNewVersion = false) => {
    if (publishNewVersion) {
      const ok = await confirmDialog({
        title: 'Publish a new notice version?',
        description: 'Every user will be asked to review the notice again at their next sign-in.',
        confirmText: 'Publish'
      });
      if (!ok) return;
    }
    try {
      const data = await api('/api/admin/privacy/settings', 'PUT', { ...values, publishNewVersion });
      setMeta({ noticeVersion: data.noticeVersion, noticeLastUpdated: data.noticeLastUpdated });
      form.reset(data);
      toast.success(publishNewVersion ? `Published notice version ${data.noticeVersion}.` : 'Privacy settings saved.');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const runRetention = async () => {
    try {
      const data = await api('/api/admin/privacy/run-retention', 'POST');
      toast.success(`Removed ${data.emailsRemoved} old email log entries and ${data.auditRemoved} old audit entries.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!meta) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }

  const e = form.formState.errors;
  const field = (key: keyof PrivacySettingsInput, label: string, type = 'text', hint?: string) => (
    <FormField id={`ps-${key}`} label={label} error={e[key]} hint={hint}>
      <Input type={type} {...form.register(key)} />
    </FormField>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Privacy settings</CardTitle>
        <CardDescription>
          Notice version {meta.noticeVersion}, last updated {meta.noticeLastUpdated}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="rounded-2xl bg-warning/10 p-3 text-sm text-warning">
          The privacy notice is generated from these settings and is a starting template. Have it reviewed by a qualified data protection lawyer or DPO before relying on it.
        </div>
        <form onSubmit={form.handleSubmit(v => save(v))} className="flex flex-col gap-5" noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            {field('controllerName', 'Organisation (data controller) name')}
            {field('controllerEmail', 'Organisation privacy email', 'email')}
            {field('controllerAddress', 'Registered address')}
            {field('dpoName', 'Data Protection Officer name')}
            {field('dpoEmail', 'DPO email', 'email')}
            {field('dpoPhone', 'DPO phone')}
            {field('dsrResponseDays', 'Days to respond to requests', 'number')}
            {field('retentionFinancialRecordsYears', 'Keep financial and contract records (years)', 'number', 'Confirm with your accountant.')}
            {field('retentionEmailLogDays', 'Keep email log (days)', 'number')}
            {field('retentionAuditLogDays', 'Keep audit log (days)', 'number')}
          </div>
          {field('hostingDescription', 'Hosting and transfer details', 'text', 'e.g. "Application hosted on Google Cloud Run, europe-west1"')}
          <FormField id="ps-additionalNoticeText" label="Additional notice text" error={e.additionalNoticeText}>
            <Textarea rows={4} {...form.register('additionalNoticeText')} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={form.formState.isSubmitting}>Save settings</Button>
            <Button type="button" variant="outline" onClick={form.handleSubmit(v => save(v, true))}>Save and publish new notice version</Button>
            <Button type="button" variant="ghost" onClick={runRetention}>Run retention clean-up now</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
