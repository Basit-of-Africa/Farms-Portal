/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Sprout, MapPin, FileText, RefreshCw, Send, Upload, Camera, Trash2, Lock, Loader2, ChevronRight, X } from 'lucide-react';
import { User, Farm } from '../types';
import CommentsSection from './CommentsSection';
import { getRelativeTime } from '../utils/time';
import { farmUpdateSchema, FarmUpdateInput, farmDocumentSchema, FarmDocumentInput } from '../lib/schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input, NativeSelect, Textarea } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { FormField } from './ui/form';
import { toast } from './ui/sonner';

interface ManagerDashboardProps {
  user: User;
  token: string;
  onSelectFarm: (farmId: string) => void;
  triggerRefreshSignal: () => void;
  refreshSignal: number;
}

const UPDATE_TYPE_LABEL: Record<string, string> = {
  general: 'General update',
  planting: 'Planting',
  growth: 'Growth report',
  harvest: 'Harvest',
  maintenance: 'Maintenance',
  weather: 'Weather',
  pest: 'Pest control',
  milestone: 'Milestone'
};

const DOC_CATEGORY_LABEL: Record<string, string> = {
  report: 'Report',
  certificate: 'Certificate',
  legal: 'Legal document',
  other: 'Other'
};

export default function ManagerDashboard({ user, token, onSelectFarm, triggerRefreshSignal, refreshSignal }: ManagerDashboardProps) {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [farmId, setFarmId] = useState('');
  const [feed, setFeed] = useState<any[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);

  const auth = { Authorization: `Bearer ${token}` };

  const fetchFeed = async () => {
    try {
      setFeedLoading(true);
      const res = await fetch('/api/updates/manager', { headers: auth });
      if (res.ok) {
        const data = await res.json();
        data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setFeed(data);
      }
    } finally {
      setFeedLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/farms', { headers: auth });
        if (!res.ok) throw new Error('We could not load your farms.');
        const data = await res.json();
        setFarms(data);
        setFarmId(id => id || data[0]?.id || '');
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
    fetchFeed();
  }, [token, refreshSignal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 min-h-[400px]" role="status" aria-label="Loading">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div id="manager-dashboard-container" className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-bold text-2xl text-foreground">Farm manager dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Post updates and documents for the farms you manage. Investors on the farm are notified.</p>
        </div>
        <Badge variant="outline" className="self-start sm:self-auto text-sm py-1">
          {farms.length} {farms.length === 1 ? 'farm' : 'farms'} assigned
        </Badge>
      </div>

      {farms.length === 0 ? (
        <Card className="p-10 text-center flex flex-col items-center gap-2 border-dashed">
          <Sprout className="h-10 w-10 text-muted-foreground opacity-50" aria-hidden="true" />
          <h3 className="font-bold text-lg">No farms assigned yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">An administrator needs to assign you to a farm before you can post updates.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-7 flex flex-col gap-6 xl:order-2">
            <Card className="p-5">
              <FormField id="mgr-farm" label="Which farm are you posting for?">
                <NativeSelect value={farmId} onChange={e => setFarmId(e.target.value)}>
                  {farms.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </NativeSelect>
              </FormField>
            </Card>
            <PostUpdateForm key={`u-${farmId}`} farmId={farmId} farmName={farms.find(f => f.id === farmId)?.name || ''} token={token} onPosted={() => { fetchFeed(); triggerRefreshSignal(); }} />
            <UploadDocumentForm key={`d-${farmId}`} farmId={farmId} token={token} onUploaded={triggerRefreshSignal} />
          </div>

          <div className="xl:col-span-5 flex flex-col gap-6 xl:order-1">
            <section aria-labelledby="mgr-farms" className="flex flex-col gap-3">
              <h2 id="mgr-farms" className="font-bold text-lg">Your farms</h2>
              {farms.map(farm => (
                <button
                  key={farm.id}
                  onClick={() => onSelectFarm(farm.id)}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:shadow-premium-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <img src={farm.coverImage || '/farm-placeholder.svg'} alt="" className="w-16 h-16 rounded-xl object-cover border border-border" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold">{farm.name}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {farm.location}, {farm.state}
                    </span>
                    <span className="block text-sm text-muted-foreground mt-0.5">{farm.totalPlots} plots</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" aria-hidden="true" />
                </button>
              ))}
            </section>

            <section aria-labelledby="mgr-feed" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 id="mgr-feed" className="font-bold text-lg">Recent updates</h2>
                <Button variant="ghost" size="icon" onClick={fetchFeed} disabled={feedLoading} aria-label="Refresh updates">
                  <RefreshCw className={feedLoading ? 'animate-spin' : ''} />
                </Button>
              </div>
              {feed.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">{feedLoading ? 'Loading…' : 'No updates posted yet.'}</Card>
              ) : (
                <div className="flex flex-col gap-4 max-h-[720px] overflow-y-auto pr-1">
                  {feed.map(up => (
                    <Card key={up.id} className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-primary">{up.farmName}</p>
                          <p className="text-xs text-muted-foreground" title={new Date(up.createdAt).toLocaleString()}>{getRelativeTime(up.createdAt)}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Badge variant="success">{UPDATE_TYPE_LABEL[up.updateType] || up.updateType}</Badge>
                          {up.targetInvestorIds?.length > 0 && <Badge variant="muted"><Lock className="h-3 w-3" /> Selected investors</Badge>}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold">{up.title}</h3>
                        <p className="text-sm whitespace-pre-line mt-1">{up.body}</p>
                      </div>
                      {up.photos?.[0] && (
                        <figure>
                          <img src={up.photos[0].image || up.photos[0].url} alt={up.photos[0].caption || `Photo from ${up.title}`} referrerPolicy="no-referrer" loading="lazy" className="w-full h-40 object-cover rounded-xl border border-border" />
                          {up.photos[0].caption && <figcaption className="text-xs text-muted-foreground mt-1">{up.photos[0].caption}</figcaption>}
                        </figure>
                      )}
                      <p className="text-xs text-muted-foreground">Posted by {up.postedByName}</p>
                      <CommentsSection updateId={up.id} comments={up.comments} currentUser={user} token={token} onCommentAdded={fetchFeed} />
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post an update (with optional photo from file or camera, optional targeting)
// ---------------------------------------------------------------------------

function PostUpdateForm({ farmId, farmName, token, onPosted }: { farmId: string; farmName: string; token: string; onPosted: () => void }) {
  const form = useForm<FarmUpdateInput>({ resolver: zodResolver(farmUpdateSchema), defaultValues: { title: '', updateType: 'general', body: '', caption: '' } });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [investors, setInvestors] = useState<User[]>([]);
  const [targeted, setTargeted] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  useEffect(() => {
    if (!farmId) return;
    fetch(`/api/farms/${farmId}/investors`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : []))
      .then(setInvestors)
      .catch(() => setInvestors([]));
  }, [farmId]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };
  useEffect(() => stopCamera, []);
  useEffect(() => {
    if (preview && preview.startsWith('blob:')) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError('We could not open the camera. Check that your browser has permission to use it.');
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      blob => {
        if (!blob) return;
        const file = new File([blob], `field-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setPhoto(file);
        setPreview(URL.createObjectURL(file));
        if (!form.getValues('caption')) form.setValue('caption', `Photo taken ${new Date().toLocaleString()}`);
        stopCamera();
      },
      'image/jpeg',
      0.85
    );
  };

  const clearPhoto = () => {
    setPhoto(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (values: FarmUpdateInput) => {
    if (targeted && targetIds.length === 0) {
      toast.error('Choose at least one investor, or switch off "Only selected investors".');
      return;
    }
    const fd = new FormData();
    fd.append('title', values.title);
    fd.append('body', values.body);
    fd.append('updateType', values.updateType);
    if (photo) {
      fd.append('photos', photo);
      fd.append('captions[0]', values.caption || '');
    }
    if (targeted) fd.append('targetInvestorIds', JSON.stringify(targetIds));
    try {
      const res = await fetch(`/api/updates/farm/${farmId}/new`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The update could not be posted.');
      toast.success(targeted ? `Update posted to ${targetIds.length} selected investor(s).` : `Update posted. Investors on ${farmName} have been notified.`);
      form.reset({ title: '', updateType: values.updateType, body: '', caption: '' });
      clearPhoto();
      setTargeted(false);
      setTargetIds([]);
      onPosted();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const e = form.formState.errors;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Post an update</CardTitle>
        <CardDescription>Share progress, harvest news or problems on the farm.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField id="up-title" label="Title" error={e.title}>
              <Input placeholder="e.g. Harvest of block A completed" {...form.register('title')} />
            </FormField>
            <FormField id="up-type" label="Type of update">
              <NativeSelect {...form.register('updateType')}>
                {Object.entries(UPDATE_TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField id="up-body" label="What happened?" error={e.body}>
            <Textarea rows={4} {...form.register('body')} />
          </FormField>

          <div className="flex flex-col gap-2">
            <Label>Photo (optional)</Label>
            {preview ? (
              <div className="relative rounded-2xl overflow-hidden border border-border max-w-md">
                <img src={preview} alt="Selected photo" className="w-full max-h-56 object-cover" />
                <Button type="button" size="sm" variant="secondary" className="absolute top-2 right-2" onClick={clearPhoto}><Trash2 /> Remove</Button>
              </div>
            ) : cameraOn ? (
              <div className="relative rounded-2xl overflow-hidden bg-black max-w-md aspect-video">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2">
                  <Button type="button" size="sm" onClick={capture}><Camera /> Take photo</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={stopCamera}><X /> Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}><Upload /> Choose a photo</Button>
                <Button type="button" variant="outline" onClick={startCamera}><Camera /> Use camera</Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Choose a photo"
                  onChange={ev => {
                    const f = ev.target.files?.[0] || null;
                    setPhoto(f);
                    setPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
              </div>
            )}
            {cameraError && <p role="alert" className="text-sm text-destructive">{cameraError}</p>}
            {photo && (
              <FormField id="up-caption" label="Photo caption" error={e.caption}>
                <Input placeholder="e.g. Loading harvested bunches, block A" {...form.register('caption')} />
              </FormField>
            )}
          </div>

          <div className="rounded-2xl border border-border p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Checkbox id="up-targeted" checked={targeted} onCheckedChange={v => { setTargeted(!!v); if (!v) setTargetIds([]); }} className="mt-0.5" />
              <Label htmlFor="up-targeted" className="leading-snug cursor-pointer">
                Only selected investors
                <span className="block font-normal text-muted-foreground mt-0.5">Otherwise every investor on this farm sees the update.</span>
              </Label>
            </div>
            {targeted &&
              (investors.length === 0 ? (
                <p className="text-sm text-warning">No investors hold plots on this farm yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {investors.map(inv => {
                    const checked = targetIds.includes(inv.id);
                    return (
                      <label key={inv.id} className={`flex items-center gap-3 rounded-xl border p-2.5 text-sm cursor-pointer ${checked ? 'border-primary bg-accent/40' : 'border-border hover:bg-muted/50'}`}>
                        <Checkbox checked={checked} onCheckedChange={v => setTargetIds(ids => (v ? [...ids, inv.id] : ids.filter(id => id !== inv.id)))} />
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">{inv.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">{inv.email}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
          </div>

          <div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Send />} Post update
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Upload a farm-wide document
// ---------------------------------------------------------------------------

function UploadDocumentForm({ farmId, token, onUploaded }: { farmId: string; token: string; onUploaded: () => void }) {
  const form = useForm<FarmDocumentInput>({ resolver: zodResolver(farmDocumentSchema), defaultValues: { title: '', category: 'report', description: '' } });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const submit = async (values: FarmDocumentInput) => {
    if (!file) {
      setFileError('Choose the file to upload.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', values.title);
    fd.append('category', values.category);
    fd.append('visibility', 'farm');
    fd.append('description', values.description || '');
    try {
      const res = await fetch(`/api/documents/farm/${farmId}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The document could not be uploaded.');
      toast.success(`"${data.title}" uploaded. Investors on this farm can now download it.`);
      form.reset({ title: '', category: values.category, description: '' });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onUploaded();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const e = form.formState.errors;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Upload a document</CardTitle>
        <CardDescription>Shared with all investors on the farm. Financial documents can only be uploaded by an administrator.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField id="doc-title" label="Title" error={e.title}>
              <Input placeholder="e.g. Soil test report, June" {...form.register('title')} />
            </FormField>
            <FormField id="doc-cat" label="Category">
              <NativeSelect {...form.register('category')}>
                {Object.entries(DOC_CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </NativeSelect>
            </FormField>
          </div>
          <FormField id="doc-file" label="File" error={fileError ? { message: fileError } : undefined}>
            <Input
              ref={fileRef}
              type="file"
              className="h-auto py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-secondary-foreground"
              onChange={ev => {
                setFile(ev.target.files?.[0] || null);
                setFileError(null);
              }}
            />
          </FormField>
          <FormField id="doc-desc" label="Description (optional)" error={e.description}>
            <Textarea rows={2} {...form.register('description')} />
          </FormField>
          <div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <Upload />} Upload document
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
