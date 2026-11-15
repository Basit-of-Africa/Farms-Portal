/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import pg from 'pg';
import { v2 as cloudinary } from 'cloudinary';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';
import { Firestore } from '@google-cloud/firestore';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  isPasswordHash,
  validatePasswordStrength,
  generateTempPassword,
  initAuthSecret,
  issueToken,
  verifyToken,
  loginRetryAfter,
  recordLoginFailure,
  clearLoginFailures,
  secretStrippingReplacer,
  TOKEN_TTL_SECONDS
} from './server/auth';
import {
  registerPrivacyRoutes,
  recordAudit,
  runRetention,
  redactCredentials,
  Processor
} from './server/privacy';
import { normalizeImportRows, farmKeyOf, NormalizedImportRow } from './server/importNormalize';
import {
  User,
  UserRole,
  Farm,
  FarmPlot,
  FarmMapNote,
  InvestorPlot,
  FarmManagerAssignment,
  FarmUpdate,
  Document,
  DocumentCategory,
  DocumentVisibility,
  FinancialSummary,
  SimulatedEmail,
  PlotStatus,
  UpdateType,
  FinancialStatus,
  SystemSettings,
  AuditLogEntry,
  DataSubjectRequest,
  BreachIncident
} from './src/types';

// Establish folders
const DATA_DIR = path.join(process.cwd(), 'data');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Initialize express
const app = express();

// The Google Cloud SDK can surface internal retry failures as unhandled
// rejections; log them instead of letting them terminate the portal.
process.on('unhandledRejection', (reason: any) => {
  console.error('⚠️ Unhandled promise rejection:', reason?.message || reason);
});
app.use(express.json({ limit: '10mb' }));
// Never serialise password hashes or session versions in API responses
app.set('json replacer', secretStrippingReplacer);
// Baseline security / privacy headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Camera is allowed for this site only (farm managers can photograph field updates)
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), interest-cohort=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // API responses contain personal data: never let browsers or proxies cache them
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Behind a reverse proxy (Cloud Run, Railway, ...) so req.ip reflects the client
app.set('trust proxy', process.env.TRUST_PROXY ? (isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY)) : 1);
// Uploaded files (contracts, deeds, photos, attachments) are personal data:
// only signed-in users may fetch them, and documents follow the same access
// rules as the download endpoint. Auth comes from the session cookie so that
// <img> tags work without exposing tokens in URLs.
app.use('/uploads', (req, res, next) => {
  const user = getAuthenticatedUser(req, true);
  if (!user || user.isActive === false) {
    return res.status(401).send('Unauthenticated');
  }
  let fileUrl: string;
  try {
    fileUrl = '/uploads' + decodeURIComponent(req.path);
  } catch {
    return res.status(400).send('Bad request');
  }
  const doc = db.documents.find(d => d.fileUrl === fileUrl);
  if (doc && !canAccessDocument(user, doc)) {
    return res.status(403).send('Forbidden');
  }
  if (doc) {
    recordAudit(db, user, 'document.downloaded', { targetType: 'document', targetId: doc.id, req });
    saveDb();
  }
  if (!doc && user.role !== UserRole.ADMIN) {
    const relatedEmails = db.simulatedEmails.filter(e => e.attachmentUrl === fileUrl);
    if (relatedEmails.length > 0 && !relatedEmails.some(e => e.recipientId === user.id || e.senderId === user.id)) {
      return res.status(403).send('Forbidden');
    }
  }
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}, express.static(UPLOADS_DIR));

// Super Admin Latency Injection Middleware
app.use((req, res, next) => {
  const settings = getSettings();
  if (settings.simulatedLatency && settings.simulatedLatency > 0 && req.url.startsWith('/api')) {
    setTimeout(next, settings.simulatedLatency);
  } else {
    next();
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Setup lazy Cloudinary configuration
let isCloudinaryConfigured = false;
function getCloudinary() {
  if (!isCloudinaryConfigured && process.env.CLOUDINARY_URL) {
    try {
      cloudinary.config({
        cloudinary_url: process.env.CLOUDINARY_URL
      });
      isCloudinaryConfigured = true;
      console.log('✅ Cloudinary connected successfully via CLOUDINARY_URL');
    } catch (e) {
      console.error('❌ Cloudinary configuration failed:', e);
    }
  }
  return cloudinary;
}

// Setup dynamic SMTP and Brevo email configuration helpers
async function sendSmtpEmail({
  host,
  port,
  secure,
  user,
  pass,
  from,
  to,
  subject,
  text,
  html,
  attachments
}: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: any[];
}) {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    },
    connectionTimeout: 8000,  // Fail-fast connection timeout
    greetingTimeout: 8000,    // Fail-fast greeting timeout
    socketTimeout: 12000      // Fail-fast socket inactivity timeout
  });

  await transporter.sendMail({
    from: from || 'Adubiaro Farms <noreply@adubiaro.com>',
    to,
    subject,
    text,
    html,
    attachments
  });
}

async function sendBrevoEmail({
  apiKey,
  senderName,
  senderEmail,
  to,
  subject,
  text,
  html
}: {
  apiKey: string;
  senderName: string;
  senderEmail: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const url = 'https://api.brevo.com/v3/smtp/email';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: senderName || 'Adubiaro Farms',
        email: senderEmail || 'noreply@adubiaro.com'
      },
      to: [{ email: to }],
      subject: subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Brevo API Error (${response.status}): ${errText}`);
  }
}

// Database Scheme
interface DatabaseSchema {
  users: User[];
  farms: Farm[];
  plots: FarmPlot[];
  investorPlots: InvestorPlot[];
  assignments: FarmManagerAssignment[];
  updates: FarmUpdate[];
  documents: Document[];
  financials: FinancialSummary[];
  simulatedEmails: SimulatedEmail[];
  mapNotes?: FarmMapNote[];
  settings?: SystemSettings;
  // Data-protection records (kept across demo resets / clean slate)
  auditLogs?: AuditLogEntry[];
  dataRequests?: DataSubjectRequest[];
  breachIncidents?: BreachIncident[];
}

// Seed helper
function getInitialDb(): DatabaseSchema {
  return {
    users: [
      {
        id: 'user-admin',
        username: 'admin',
        role: UserRole.ADMIN,
        phone: '+2348030012211',
        email: 'admin@adubiaro.com',
        name: 'Basit Ajibade',
        isActive: true
      }
    ],
    farms: [],
    plots: [],
    investorPlots: [],
    assignments: [],
    updates: [],
    documents: [],
    financials: [],
    simulatedEmails: [],
    mapNotes: [],
    auditLogs: [],
    dataRequests: [],
    breachIncidents: [],
    settings: {
      databaseMode: 'auto',
      simulatedLatency: 0,
      enableNotifications: true,
      enableEmailSimulation: true,
      minimumPayoutRoi: 2.5,
      allowedCrops: ['Oil Palm (Tenera Hybrid)', 'Coconut (Dwarf Hybrid)', 'Cocoa (Amelonado)', 'Cashew (Anacardium Occidental)'],
      portalName: 'Adubiaro Farm Portal',
      logoText: 'ADUBIARO',
      accentColor: 'emerald',
      announcementBanner: '',
      bannerType: 'none',
      emailServiceType: 'simulation',
      smtpHost: process.env.EMAIL_HOST || '',
      smtpPort: parseInt(process.env.EMAIL_PORT || '587'),
      smtpSecure: process.env.EMAIL_USE_TLS === 'false' ? false : true,
      smtpUser: process.env.EMAIL_HOST_USER || '',
      smtpPass: process.env.EMAIL_HOST_PASSWORD || '',
      smtpFrom: process.env.DEFAULT_FROM_EMAIL || 'Adubiaro Farms <noreply@adubiaro.com>',
      brevoApiKey: '',
      brevoSenderEmail: 'noreply@adubiaro.com',
      brevoSenderName: 'Adubiaro Farms'
    }
  };
}

let db: DatabaseSchema = getInitialDb();

// Initialize Firebase Firestore client from config
let firestoreDb: any = null;
let firebaseConfig: any = null;
let firebaseDiagnosticResult: {
  isValidConfig: boolean;
  canConnect: boolean;
  errorType: 'none' | 'config' | 'network' | 'auth_permission' | 'unknown';
  errorMessage: string | null;
} = {
  isValidConfig: false,
  canConnect: false,
  errorType: 'none',
  errorMessage: 'Firebase diagnostics have not completed.'
};

try {
  const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');

  if (process.env.FIREBASE_CONFIG) {
    try {
      firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
      console.log('🔄 Initializing Firebase using FIREBASE_CONFIG environment variable...');
    } catch (err) {
      console.error('❌ Failed to parse FIREBASE_CONFIG environment variable:', err);
    }
  } else if (process.env.FIREBASE_PROJECT_ID) {
    console.log('🔄 Initializing Firebase using individual environment variables...');
    firebaseConfig = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID
    };
  } else if (fs.existsSync(firebaseConfigPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    console.log('🔄 Initializing Firebase using firebase-applet-config.json file...');
  }

  // The server SDK needs Google credentials; without them it cannot connect.
  const hasGoogleCredentials = !!(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.K_SERVICE || // Cloud Run provides a runtime service account
    process.env.FIRESTORE_USE_ADC === 'true'
  );

  if (firebaseConfig && !hasGoogleCredentials) {
    console.warn('⚠️ Firebase config found but no Google service-account credentials (FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, or Cloud Run). Firestore cloud backing disabled.');
  } else if (firebaseConfig) {
    // Server-side Firestore SDK: authenticates with a Google service account
    // (FIREBASE_SERVICE_ACCOUNT JSON, GOOGLE_APPLICATION_CREDENTIALS, or the
    // runtime's default credentials on Cloud Run). It is not subject to
    // firestore.rules, which deny all direct client access.
    const dbId = firebaseConfig.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID || '(default)';
    const firestoreOptions: any = {
      projectId: firebaseConfig.projectId,
      ignoreUndefinedProperties: true
    };
    if (dbId && dbId !== '(default)') firestoreOptions.databaseId = dbId;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        firestoreOptions.credentials = { client_email: sa.client_email, private_key: sa.private_key };
        if (!firestoreOptions.projectId) firestoreOptions.projectId = sa.project_id;
      } catch (err) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:', err);
      }
    }
    firestoreDb = new Firestore(firestoreOptions);
    console.log(`✅ Firestore server client initialized on database: "${dbId}".`);
  } else {
    console.warn('⚠️ No Firebase configuration found (neither env vars nor JSON config). Firestore cloud backing disabled.');
  }
} catch (e) {
  console.error('❌ Failed to initialize Firebase Firestore:', e);
}

/**
 * Diagnostic step that verifies the Firebase App configuration object is correctly initialized
 * before attempting any Firestore operations.
 * Error handling clearly distinguishes between network connectivity issues and authentication/permission-denied issues.
 */
async function runFirebaseDiagnostics(config: any): Promise<{
  isValidConfig: boolean;
  canConnect: boolean;
  errorType: 'none' | 'config' | 'network' | 'auth_permission' | 'unknown';
  errorMessage: string | null;
}> {
  console.log('🔍 [Firebase Diagnostic] Starting detailed verification of Firebase App configuration object...');
  
  if (!config) {
    const msg = 'No configuration object found. Firebase credentials are empty.';
    console.warn(`⚠️ [Firebase Diagnostic] ${msg}`);
    return { isValidConfig: false, canConnect: false, errorType: 'config', errorMessage: msg };
  }

  // 1. Verify required keys
  const requiredFields = ['projectId'];
  const missingFields = requiredFields.filter(f => !config[f]);
  if (missingFields.length > 0) {
    const msg = `Configuration lacks necessary Firebase fields: ${missingFields.join(', ')}`;
    console.warn(`⚠️ [Firebase Diagnostic] ${msg}`);
    return { isValidConfig: false, canConnect: false, errorType: 'config', errorMessage: msg };
  }

  console.log('✅ [Firebase Diagnostic] Firebase configuration object verified successfully.');
  console.log(`ℹ️ [Firebase Diagnostic] Target Project: "${config.projectId}", database: "${config.firestoreDatabaseId || '(default)'}"`);

  if (!firestoreDb) {
    const msg = 'Firebase Firestore client was not initialized even though a configuration was provided.';
    console.error(`❌ [Firebase Diagnostic] ${msg}`);
    return { isValidConfig: true, canConnect: false, errorType: 'config', errorMessage: msg };
  }

  // 2. Perform a connection probe (test read) to Firestore to verify connection/permissions
  try {
    console.log('⚡ [Firebase Diagnostic] Performing diagnostic connectivity probe to Firestore...');
    // We attempt to read the settings document. In Firestore Lite, this goes directly to the server.
    await firestoreDb.collection('settings').doc('standalone').get();
    console.log('🎉 [Firebase Diagnostic] Connectivity probe succeeded! Firestore client is fully online and responsive.');
    return { isValidConfig: true, canConnect: true, errorType: 'none', errorMessage: null };
  } catch (error: any) {
    const errMsg = error.message || String(error);
    const errCode = error.code || '';
    
    console.error(`❌ [Firebase Diagnostic] Firestore connectivity probe failed! Error message: "${errMsg}" (Code: ${errCode})`);

    // 3. Classify error type: network connectivity vs authentication/permissions
    const lowercaseMsg = errMsg.toLowerCase();
    const lowercaseCode = String(errCode).toLowerCase();
    
    const isAuthOrPermission = 
      lowercaseMsg.includes('permission') || 
      lowercaseMsg.includes('insufficient') ||
      lowercaseMsg.includes('unauthorized') || 
      lowercaseMsg.includes('unauthenticated') ||
      lowercaseMsg.includes('auth/') || 
      lowercaseMsg.includes('api key') ||
      lowercaseMsg.includes('invalid-credential') ||
      lowercaseMsg.includes('forbidden') ||
      lowercaseCode.includes('permission-denied') || 
      lowercaseCode.includes('unauthenticated');

    const isNetwork = 
      lowercaseMsg.includes('offline') || 
      lowercaseMsg.includes('network') || 
      lowercaseMsg.includes('timeout') || 
      lowercaseMsg.includes('getaddrinfo') || 
      lowercaseMsg.includes('connect') ||
      lowercaseMsg.includes('dns') ||
      lowercaseMsg.includes('econnrefused') || 
      lowercaseMsg.includes('etimedout') ||
      lowercaseMsg.includes('unreachable');

    if (isAuthOrPermission) {
      const diagnosis = 'AUTHENTICATION & PERMISSION ISSUE: Your credentials or API key may be incorrect or lack database privileges, or your Security Rules are preventing this operation. Please verify firestore.rules and your service account permissions.';
      console.error(`🛡️ [Firebase Diagnostic] CLASSIFICATION: ${diagnosis}`);
      return { isValidConfig: true, canConnect: false, errorType: 'auth_permission', errorMessage: `${errMsg} (Classification: ${diagnosis})` };
    } else if (isNetwork) {
      const diagnosis = 'NETWORK CONNECTIVITY ISSUE: Unable to establish a network socket with the Google/Firebase APIs. Please verify your internet connection, DNS configuration, and make sure standard TCP outbound traffic is not blocked.';
      console.error(`🌐 [Firebase Diagnostic] CLASSIFICATION: ${diagnosis}`);
      return { isValidConfig: true, canConnect: false, errorType: 'network', errorMessage: `${errMsg} (Classification: ${diagnosis})` };
    } else {
      const diagnosis = `UNCLASSIFIED INTEGRATION ISSUE: An unexpected error occurred: "${errMsg}".`;
      console.error(`❓ [Firebase Diagnostic] CLASSIFICATION: ${diagnosis}`);
      return { isValidConfig: true, canConnect: false, errorType: 'unknown', errorMessage: `${errMsg} (Classification: ${diagnosis})` };
    }
  }
}

// Helper for retrying Firestore operations with exponential backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 5, delay = 1000): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt > retries) {
        throw error;
      }
      const waitTime = delay * Math.pow(2, attempt - 1);
      console.warn(`⚠️ Firestore operation failed (attempt ${attempt}/${retries}). Retrying in ${waitTime}ms... Error: ${error.message || error}`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Unreachable in retryWithBackoff');
}

// Helper to load complete memory db state from Firestore collections
async function loadDbFromFirestore() {
  if (!firestoreDb) {
    throw new Error('Firestore is not configured.');
  }
  console.log('🔄 Loading persisted state from Firebase Firestore...');
  try {
    const collectionsToLoad = [
      { name: 'users', key: 'users' },
      { name: 'farms', key: 'farms' },
      { name: 'plots', key: 'plots' },
      { name: 'investorPlots', key: 'investorPlots' },
      { name: 'assignments', key: 'assignments' },
      { name: 'updates', key: 'updates' },
      { name: 'documents', key: 'documents' },
      { name: 'financials', key: 'financials' },
      { name: 'simulatedEmails', key: 'simulatedEmails' },
      { name: 'mapNotes', key: 'mapNotes' },
      { name: 'auditLogs', key: 'auditLogs' },
      { name: 'dataRequests', key: 'dataRequests' },
      { name: 'breachIncidents', key: 'breachIncidents' }
    ];

    let loadedSomething = false;
    for (const col of collectionsToLoad) {
      const querySnapshot = await retryWithBackoff<any>(() => firestoreDb.collection(col.name).get(), 4, 1000);
      const items: any[] = [];
      querySnapshot.forEach((docSnapshot: any) => {
        const item = { id: docSnapshot.id, ...docSnapshot.data() };
        items.push(item);
        firestoreLastSaved.set(`${col.name}/${docSnapshot.id}`, JSON.stringify(docSnapshot.data()));
      });
      if (items.length > 0) {
        (db as any)[col.key] = items;
        loadedSomething = true;
      } else {
        (db as any)[col.key] = [];
      }
    }

    // Load settings
    const settingsDoc = await retryWithBackoff<any>(() => firestoreDb.collection('settings').doc('standalone').get(), 4, 1000);
    if (settingsDoc.exists) {
      db.settings = settingsDoc.data() as SystemSettings;
      loadedSomething = true;
    }

    if (loadedSomething) {
      console.log('✅ Loaded data successfully from Firestore!');
      return true;
    } else {
      console.log('ℹ️ Firestore database is empty.');
      return false;
    }
  } catch (err) {
    console.error('❌ Error reading from Firestore:', err);
    throw err; // propagate so initialization logic knows connection failed
  }
}

// Last serialized state written to (or read from) Firestore, keyed "collection/id".
// Used to skip unchanged documents and to delete documents removed in memory.
const firestoreLastSaved = new Map<string, string>();

// Helper to fully synchronize memory DB state to corresponding Firestore paths
async function saveDbToFirestore() {
  if (!firestoreDb) return;
  try {
    const collectionsToSave = [
      { name: 'users', list: db.users },
      { name: 'farms', list: db.farms },
      { name: 'plots', list: db.plots },
      { name: 'investorPlots', list: db.investorPlots },
      { name: 'assignments', list: db.assignments },
      { name: 'updates', list: db.updates },
      { name: 'documents', list: db.documents },
      { name: 'financials', list: db.financials },
      { name: 'simulatedEmails', list: db.simulatedEmails },
      { name: 'mapNotes', list: db.mapNotes || [] },
      { name: 'auditLogs', list: db.auditLogs || [] },
      { name: 'dataRequests', list: db.dataRequests || [] },
      { name: 'breachIncidents', list: db.breachIncidents || [] }
    ];

    for (const col of collectionsToSave) {
      const currentKeys = new Set<string>();
      for (const item of col.list as any[]) {
        if (item && item.id) {
          const { id, ...data } = item;
          const key = `${col.name}/${item.id}`;
          currentKeys.add(key);
          const serialized = JSON.stringify(data);
          // Only write documents that changed since the last sync
          if (firestoreLastSaved.get(key) === serialized) continue;
          // Prevent setting undefined values in Firestore
          const cleanData = JSON.parse(serialized);
          await retryWithBackoff(() => firestoreDb.collection(col.name).doc(item.id).set(cleanData), 3, 1000);
          firestoreLastSaved.set(key, serialized);
        }
      }
      // Propagate deletions (erasure, retention purges, removed records)
      for (const key of Array.from(firestoreLastSaved.keys())) {
        if (key.startsWith(`${col.name}/`) && !currentKeys.has(key)) {
          const docId = key.slice(col.name.length + 1);
          await retryWithBackoff(() => firestoreDb.collection(col.name).doc(docId).delete(), 3, 1000);
          firestoreLastSaved.delete(key);
        }
      }
    }

    if (db.settings) {
      const cleanSettings = JSON.parse(JSON.stringify(db.settings));
      await retryWithBackoff(() => firestoreDb.collection('settings').doc('standalone').set(cleanSettings), 3, 1000);
    }
    console.log('✅ Synchronized memory DB state to Firestore successfully.');
  } catch (err) {
    console.error('❌ Error synchronizing memory DB to Firestore:', err);
    throw err;
  }
}

async function initFirestore() {
  if (!firestoreDb) {
    console.warn('⚠️ No Firestore client available. Falling back to Local Storage (local db.json).');
    firebaseDiagnosticResult = {
      isValidConfig: false,
      canConnect: false,
      errorType: 'config',
      errorMessage: 'No Firebase client or configuration available.'
    };
    loadLocalJsonDb();
    return;
  }

  // Check if explicitly configured for offline/local JSON mode in local settings file
  let isExplicitlyOffline = false;
  try {
    if (fs.existsSync(DB_FILE)) {
      const localDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (localDb && localDb.settings && localDb.settings.databaseMode === 'local_json') {
        isExplicitlyOffline = true;
        console.log('🔌 Database mode is explicitly set to Local JSON (Offline mode). Bypassing Firestore/cloud initialization.');
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not check local settings file for databaseMode:', e);
  }

  if (isExplicitlyOffline) {
    firebaseDiagnosticResult = {
      isValidConfig: true,
      canConnect: false,
      errorType: 'none',
      errorMessage: 'Local JSON Database mode is explicitly enforced (Offline).'
    };
    loadLocalJsonDb();
    return;
  }

  // Run detailed diagnostic connectivity and permission probe!
  const diagnostics = await runFirebaseDiagnostics(firebaseConfig);
  firebaseDiagnosticResult = diagnostics;

  if (!diagnostics.canConnect) {
    console.error(`❌ Firestore Diagnostics failed: [${diagnostics.errorType.toUpperCase()}] ${diagnostics.errorMessage}`);
    console.warn('⚠️ Falling back to Local Storage (local db.json) due to diagnostic connectivity failure.');
    loadLocalJsonDb();
    return;
  }

  // Attempt to connect and fetch data from Firestore with read/write retry logic
  console.log('🛡️ Attempting to connect to Firestore database with retry logic...');
  try {
    const isSuccess = await loadDbFromFirestore();
    
    // Check if the settings doc exists in Firestore to see if we should seed
    let settingsDocExists = false;
    try {
      const settingsDoc = await retryWithBackoff<any>(() => firestoreDb.collection('settings').doc('standalone').get(), 4, 1000);
      settingsDocExists = settingsDoc.exists;
    } catch (err) {
      console.error('❌ Could not verify settings doc in Firestore:', err);
    }
    
    // Seed Firestore only if it is completely empty
    if (!settingsDocExists && db.users.length === 0) {
      console.log('🌱 Firestore is empty. Initializing and seeding Firestore database...');
      db = getInitialDb();
      await saveDbToFirestore();
      console.log('✅ Firestore seeded successfully.');
    } else {
      console.log('ℹ️ Firestore already initialized / seeded. Skipping seeding step.');
    }
  } catch (err: any) {
    console.error('❌ CRITICAL: Failed to establish a reliable connection to Firestore on startup:', err);
    console.warn('⚠️ Falling back to Local Storage (local db.json) to preserve app availability, but warning user.');
    loadLocalJsonDb();
  }
}

function getSettings(): SystemSettings {
  if (!db.settings) {
    db.settings = {
      databaseMode: 'auto',
      simulatedLatency: 0,
      enableNotifications: true,
      enableEmailSimulation: true,
      minimumPayoutRoi: 2.5,
      allowedCrops: ['Oil Palm (Tenera Hybrid)', 'Coconut (Dwarf Hybrid)', 'Cocoa (Amelonado)', 'Cashew (Anacardium Occidental)'],
      portalName: 'Adubiaro Farm Portal',
      logoText: 'ADUBIARO',
      accentColor: 'emerald',
      announcementBanner: '',
      bannerType: 'none'
    };
  }
  return db.settings;
}

let pgPool: pg.Pool | null = null;
let usePostgres = false;
let postgresError: string | null = null;

// Helpers to map rows from PostgreSQL to TypeScript structures
function mapUserFromDb(row: any): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role as UserRole,
    phone: row.phone || undefined,
    email: row.email,
    name: row.name,
    password: row.password || undefined,
    isActive: row.is_active !== false,
    mustChangePassword: row.must_change_password === true,
    tokenVersion: row.token_version || 0,
    privacy: row.privacy || undefined
  };
}

function mapFarmFromDb(row: any): Farm {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    state: row.state,
    totalPlots: Number(row.total_plots || 0),
    totalHectares: Number(row.total_hectares || 0),
    description: row.description || '',
    coverImage: row.cover_image || '',
    dateEstablished: row.date_established || '',
    isActive: Boolean(row.is_active)
  };
}

function mapPlotFromDb(row: any): FarmPlot {
  return {
    id: row.id,
    farmId: row.farm_id,
    plotNumber: row.plot_number,
    sizeHectares: Number(row.size_hectares || 0),
    sizeUnit: row.size_unit || 'acre',
    cropType: row.crop_type,
    status: row.status as PlotStatus
  };
}

function mapInvestorPlotFromDb(row: any): InvestorPlot {
  return {
    id: row.id,
    investorId: row.investor_id,
    plotId: row.plot_id,
    investmentAmount: Number(row.investment_amount || 0),
    ownershipPercentage: Number(row.ownership_percentage || 100),
    startDate: row.start_date,
    contractRef: row.contract_ref || '',
    isActive: Boolean(row.is_active)
  };
}

function mapAssignmentFromDb(row: any): FarmManagerAssignment {
  return {
    id: row.id,
    managerId: row.manager_id,
    farmId: row.farm_id,
    assignedDate: row.assigned_date,
    isActive: Boolean(row.is_active)
  };
}

function mapUpdateFromDb(row: any): FarmUpdate {
  let targetInvestorIds: string[] = [];
  if (row.target_investor_ids) {
    targetInvestorIds = Array.isArray(row.target_investor_ids)
      ? row.target_investor_ids
      : typeof row.target_investor_ids === 'string'
        ? JSON.parse(row.target_investor_ids)
        : JSON.parse(JSON.stringify(row.target_investor_ids));
  }
  let photos: any[] = [];
  if (row.photos) {
    photos = Array.isArray(row.photos)
      ? row.photos
      : typeof row.photos === 'string'
        ? JSON.parse(row.photos)
        : JSON.parse(JSON.stringify(row.photos));
  }
  let comments: any[] = [];
  if (row.comments) {
    comments = Array.isArray(row.comments)
      ? row.comments
      : typeof row.comments === 'string'
        ? JSON.parse(row.comments)
        : JSON.parse(JSON.stringify(row.comments));
  }
  return {
    id: row.id,
    farmId: row.farm_id,
    postedBy: row.posted_by,
    postedByName: row.posted_by_name,
    title: row.title,
    body: row.body,
    updateType: row.update_type as UpdateType,
    targetInvestorIds,
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    photos,
    comments
  };
}

function mapDocumentFromDb(row: any): Document {
  return {
    id: row.id,
    farmId: row.farm_id,
    plotId: row.plot_id || undefined,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    title: row.title,
    fileUrl: row.file_url,
    fileName: row.file_name,
    category: row.category as DocumentCategory,
    visibility: row.visibility as DocumentVisibility,
    description: row.description || undefined,
    uploadedAt: row.uploaded_at,
    storage: row.storage || undefined
  };
}

function mapFinancialFromDb(row: any): FinancialSummary {
  return {
    id: row.id,
    plotId: row.plot_id,
    uploadedBy: row.uploaded_by,
    period: row.period,
    year: Number(row.year),
    roiPercentage: Number(row.roi_percentage || 0),
    payoutAmount: Number(row.payout_amount || 0),
    payoutDate: row.payout_date,
    status: row.status as FinancialStatus,
    notes: row.notes || undefined
  };
}

function mapSimulatedEmailFromDb(row: any): SimulatedEmail {
  return {
    id: row.id,
    to: row.to_address,
    subject: row.subject,
    body: row.body,
    htmlBody: row.html_body,
    sentAt: row.sent_at,
    category: row.category,
    isRead: row.is_read !== undefined ? !!row.is_read : false,
    readAt: row.read_at || undefined,
    senderId: row.sender_id || undefined,
    recipientId: row.recipient_id || undefined,
    farmId: row.farm_id || undefined,
    relatedType: row.related_type || undefined,
    relatedId: row.related_id || undefined,
    attachmentUrl: row.attachment_url || undefined,
    attachmentName: row.attachment_name || undefined,
    attachmentType: row.attachment_type || undefined
  };
}

function mapMapNoteFromDb(row: any): FarmMapNote {
  return {
    id: row.id,
    farmId: row.farm_id,
    x: Number(row.x),
    y: Number(row.y),
    note: row.note,
    authorId: row.author_id,
    authorName: row.author_name,
    authorRole: row.author_role as UserRole,
    createdAt: row.created_at
  };
}

// Truncates all PostgreSQL tables (used primarily during database reset command)
async function resetPostgresDb() {
  if (!pgPool) return;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE simulated_emails, financials, documents, updates, assignments, investor_plots, plots, farms, users CASCADE;');
    await client.query('COMMIT');
    console.log('✅ Truncated all PostgreSQL tables prior to seed restore.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to truncate PostgreSQL tables during reset:', err);
  } finally {
    client.release();
  }
}

// Clears all non-admin data for a production clean slate
async function clearAllButAdminPostgres() {
  if (!pgPool) return;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM users WHERE role != 'ADMIN';");
    await client.query('TRUNCATE TABLE simulated_emails, financials, documents, updates, assignments, investor_plots, plots, farms CASCADE;');
    await client.query('COMMIT');
    console.log('✅ Cleared all non-admin records in PostgreSQL for clean slate.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to clean PostgreSQL tables for clear slate:', err);
  } finally {
    client.release();
  }
}

// Synchronize in-memory changes with PostgreSQL database tables using upserts
async function saveDbToPostgres() {
  if (!pgPool) return;

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    // 1. Synchronize Users
    for (const user of db.users) {
      await client.query(
        `INSERT INTO users (id, username, role, phone, email, name, password, is_active, must_change_password, token_version, privacy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           role = EXCLUDED.role,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           name = EXCLUDED.name,
           password = EXCLUDED.password,
           is_active = EXCLUDED.is_active,
           must_change_password = EXCLUDED.must_change_password,
           token_version = EXCLUDED.token_version,
           privacy = EXCLUDED.privacy`,
        [user.id, user.username, user.role, user.phone || null, user.email, user.name, user.password || null, user.isActive !== false, user.mustChangePassword === true, user.tokenVersion || 0, user.privacy ? JSON.stringify(user.privacy) : null]
      );
    }

    // 2. Synchronize Farms
    for (const farm of db.farms) {
      await client.query(
        `INSERT INTO farms (id, name, location, state, total_plots, total_hectares, description, cover_image, date_established, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           location = EXCLUDED.location,
           state = EXCLUDED.state,
           total_plots = EXCLUDED.total_plots,
           total_hectares = EXCLUDED.total_hectares,
           description = EXCLUDED.description,
           cover_image = EXCLUDED.cover_image,
           date_established = EXCLUDED.date_established,
           is_active = EXCLUDED.is_active`,
        [farm.id, farm.name, farm.location, farm.state, farm.totalPlots, farm.totalHectares, farm.description || null, farm.coverImage || null, farm.dateEstablished || null, farm.isActive]
      );
    }

    // 3. Synchronize Plots
    for (const plot of db.plots) {
      await client.query(
        `INSERT INTO plots (id, farm_id, plot_number, size_hectares, size_unit, crop_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           farm_id = EXCLUDED.farm_id,
           plot_number = EXCLUDED.plot_number,
           size_hectares = EXCLUDED.size_hectares,
           size_unit = EXCLUDED.size_unit,
           crop_type = EXCLUDED.crop_type,
           status = EXCLUDED.status`,
        [plot.id, plot.farmId, plot.plotNumber, plot.sizeHectares, plot.sizeUnit || 'acre', plot.cropType, plot.status]
      );
    }

    // 4. Synchronize Investor Plots
    for (const ip of db.investorPlots) {
      await client.query(
        `INSERT INTO investor_plots (id, investor_id, plot_id, investment_amount, ownership_percentage, start_date, contract_ref, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           investor_id = EXCLUDED.investor_id,
           plot_id = EXCLUDED.plot_id,
           investment_amount = EXCLUDED.investment_amount,
           ownership_percentage = EXCLUDED.ownership_percentage,
           start_date = EXCLUDED.start_date,
           contract_ref = EXCLUDED.contract_ref,
           is_active = EXCLUDED.is_active`,
        [ip.id, ip.investorId, ip.plotId, ip.investmentAmount, ip.ownershipPercentage, ip.startDate, ip.contractRef || null, ip.isActive]
      );
    }

    // 5. Synchronize Assignments
    for (const assign of db.assignments) {
      await client.query(
        `INSERT INTO assignments (id, manager_id, farm_id, assigned_date, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           manager_id = EXCLUDED.manager_id,
           farm_id = EXCLUDED.farm_id,
           assigned_date = EXCLUDED.assigned_date,
           is_active = EXCLUDED.is_active`,
        [assign.id, assign.managerId, assign.farmId, assign.assignedDate, assign.isActive]
      );
    }

    // 6. Synchronize Updates
    for (const up of db.updates) {
      await client.query(
        `INSERT INTO updates (id, farm_id, posted_by, posted_by_name, title, body, update_type, target_investor_ids, is_published, created_at, photos, updated_at, comments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           farm_id = EXCLUDED.farm_id,
           posted_by = EXCLUDED.posted_by,
           posted_by_name = EXCLUDED.posted_by_name,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           update_type = EXCLUDED.update_type,
           target_investor_ids = EXCLUDED.target_investor_ids,
           is_published = EXCLUDED.is_published,
           created_at = EXCLUDED.created_at,
           photos = EXCLUDED.photos,
           updated_at = EXCLUDED.updated_at,
           comments = EXCLUDED.comments`,
        [up.id, up.farmId, up.postedBy, up.postedByName, up.title, up.body, up.updateType, JSON.stringify(up.targetInvestorIds || []), up.isPublished, up.createdAt, JSON.stringify(up.photos || []), up.updatedAt || up.createdAt, JSON.stringify(up.comments || [])]
      );
    }

    // 7. Synchronize Documents
    for (const doc of db.documents) {
      await client.query(
        `INSERT INTO documents (id, farm_id, plot_id, uploaded_by, uploaded_by_name, title, file_url, file_name, category, visibility, description, uploaded_at, storage)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           farm_id = EXCLUDED.farm_id,
           plot_id = EXCLUDED.plot_id,
           uploaded_by = EXCLUDED.uploaded_by,
           uploaded_by_name = EXCLUDED.uploaded_by_name,
           title = EXCLUDED.title,
           file_url = EXCLUDED.file_url,
           file_name = EXCLUDED.file_name,
           category = EXCLUDED.category,
           visibility = EXCLUDED.visibility,
           description = EXCLUDED.description,
           uploaded_at = EXCLUDED.uploaded_at,
           storage = EXCLUDED.storage`,
        [doc.id, doc.farmId, doc.plotId || null, doc.uploadedBy, doc.uploadedByName, doc.title, doc.fileUrl, doc.fileName, doc.category, doc.visibility, doc.description || null, doc.uploadedAt, doc.storage ? JSON.stringify(doc.storage) : null]
      );
    }

    // 8. Synchronize Financials
    for (const fin of db.financials) {
      await client.query(
        `INSERT INTO financials (id, plot_id, uploaded_by, period, year, roi_percentage, payout_amount, payout_date, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           plot_id = EXCLUDED.plot_id,
           uploaded_by = EXCLUDED.uploaded_by,
           period = EXCLUDED.period,
           year = EXCLUDED.year,
           roi_percentage = EXCLUDED.roi_percentage,
           payout_amount = EXCLUDED.payout_amount,
           payout_date = EXCLUDED.payout_date,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes`,
        [fin.id, fin.plotId, fin.uploadedBy, fin.period, fin.year, fin.roiPercentage, fin.payoutAmount, fin.payoutDate, fin.status, fin.notes || null]
      );
    }

    // 9. Synchronize Simulated Emails
    for (const email of db.simulatedEmails) {
      await client.query(
        `INSERT INTO simulated_emails (id, to_address, subject, body, html_body, sent_at, category, is_read, read_at, sender_id, recipient_id, farm_id, related_type, related_id, attachment_url, attachment_name, attachment_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (id) DO UPDATE SET
           to_address = EXCLUDED.to_address,
           subject = EXCLUDED.subject,
           body = EXCLUDED.body,
           html_body = EXCLUDED.html_body,
           sent_at = EXCLUDED.sent_at,
           category = EXCLUDED.category,
           is_read = EXCLUDED.is_read,
           read_at = EXCLUDED.read_at,
           sender_id = EXCLUDED.sender_id,
           recipient_id = EXCLUDED.recipient_id,
           farm_id = EXCLUDED.farm_id,
           related_type = EXCLUDED.related_type,
           related_id = EXCLUDED.related_id,
           attachment_url = EXCLUDED.attachment_url,
           attachment_name = EXCLUDED.attachment_name,
           attachment_type = EXCLUDED.attachment_type`,
        [
          email.id,
          email.to,
          email.subject,
          email.body,
          email.htmlBody,
          email.sentAt,
          email.category,
          !!email.isRead,
          email.readAt || null,
          email.senderId || null,
          email.recipientId || null,
          email.farmId || null,
          email.relatedType || null,
          email.relatedId || null,
          email.attachmentUrl || null,
          email.attachmentName || null,
          email.attachmentType || null
        ]
      );
    }

    // Synchronize map_notes
    const activeNoteIds = (db.mapNotes || []).map(n => n.id);
    if (activeNoteIds.length > 0) {
      await client.query(`DELETE FROM map_notes WHERE id NOT IN (${activeNoteIds.map((_, i) => `$${i + 1}`).join(', ')});`, activeNoteIds);
    } else {
      await client.query('DELETE FROM map_notes;');
    }

    for (const note of (db.mapNotes || [])) {
      await client.query(
        `INSERT INTO map_notes (id, farm_id, x, y, note, author_id, author_name, author_role, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           farm_id = EXCLUDED.farm_id,
           x = EXCLUDED.x,
           y = EXCLUDED.y,
           note = EXCLUDED.note,
           author_id = EXCLUDED.author_id,
           author_name = EXCLUDED.author_name,
           author_role = EXCLUDED.author_role,
           created_at = EXCLUDED.created_at`,
        [note.id, note.farmId, note.x, note.y, note.note, note.authorId, note.authorName, note.authorRole, note.createdAt]
      );
    }

    // Data-protection records and settings (JSON documents)
    const records: Array<{ collection: string; items: any[] }> = [
      { collection: 'auditLogs', items: db.auditLogs || [] },
      { collection: 'dataRequests', items: db.dataRequests || [] },
      { collection: 'breachIncidents', items: db.breachIncidents || [] },
      { collection: 'settings', items: db.settings ? [{ id: 'standalone', ...db.settings }] : [] }
    ];
    for (const rec of records) {
      const ids = rec.items.map(i => i.id);
      await client.query('DELETE FROM app_records WHERE collection = $1 AND NOT (id = ANY($2::varchar[]));', [rec.collection, ids]);
      for (const item of rec.items) {
        await client.query(
          `INSERT INTO app_records (collection, id, data) VALUES ($1, $2, $3)
           ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data`,
          [rec.collection, item.id, JSON.stringify(item)]
        );
      }
    }

    // Propagate deletions so erased or purged records do not come back on restart
    const tableIds: Array<[string, string[]]> = [
      ['users', db.users.map(x => x.id)],
      ['farms', db.farms.map(x => x.id)],
      ['plots', db.plots.map(x => x.id)],
      ['investor_plots', db.investorPlots.map(x => x.id)],
      ['assignments', db.assignments.map(x => x.id)],
      ['updates', db.updates.map(x => x.id)],
      ['documents', db.documents.map(x => x.id)],
      ['financials', db.financials.map(x => x.id)],
      ['simulated_emails', db.simulatedEmails.map(x => x.id)]
    ];
    for (const [table, ids] of tableIds) {
      await client.query(`DELETE FROM ${table} WHERE NOT (id = ANY($1::varchar[]));`, [ids]);
    }

    await client.query('COMMIT');
    console.log('✅ Synchronized memory database state to PostgreSQL successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to sync memory database to PostgreSQL:', err);
  } finally {
    client.release();
  }
}

// Fallback logic for reading local db.json
function loadLocalJsonDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      console.log('✅ Local JSON Database loaded successfully from file');
    } catch (e) {
      db = getInitialDb();
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    }
  } else {
    db = getInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
}

// Helper to verify if PostgreSQL is actively configured and has a valid URL
function isPostgresConfigured(): boolean {
  const dbUrl = process.env.DATABASE_URL;
  return !!(dbUrl && 
    dbUrl !== 'undefined' && 
    dbUrl !== 'null' && 
    dbUrl.trim() && 
    dbUrl !== 'YOUR_DATABASE_URL' && 
    dbUrl !== 'DATABASE_URL_HERE' &&
    !dbUrl.includes('db.example.com'));
}

// Main integration initialization for PostgreSQL
async function initPostgres() {
  // Load local database config first only if we haven't already successfully loaded from Firestore
  if (db.users.length === 0) {
    loadLocalJsonDb();
  }

  const settings = getSettings();
  if (settings.databaseMode === 'local_json') {
    console.log('⚠️ Forced local JSON database mode via Super Admin settings. Bypassing PostgreSQL.');
    usePostgres = false;
    return;
  }

  if (!isPostgresConfigured()) {
    console.log('💡 DATABASE_URL not set or set to dummy value. Running in local JSON file mode.');
    usePostgres = false;
    return;
  }


  try {
    console.log('🔌 Connecting to PostgreSQL database...');
    let hasConnected = false;
    
    try {
      pgPool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      });
      // Verify connections
      const client = await pgPool.connect();
      console.log('🚀 Connected to PostgreSQL successfully (SSL mode enabled)!');
      client.release();
      hasConnected = true;
    } catch (sslErr: any) {
      console.log(`⚠️ PostgreSQL SSL connection failed: ${sslErr.message}. Retrying with completely disabled SSL...`);
      // Clean up the SSL-configured pool
      if (pgPool) {
        await pgPool.end().catch(() => {});
      }
      
      // Remove any SSL-related query options from connectionString to prevent drivers from forcing SSL
      let cleanDbUrl = process.env.DATABASE_URL || '';
      try {
        const parsedUrl = new URL(cleanDbUrl);
        parsedUrl.searchParams.delete('sslmode');
        parsedUrl.searchParams.delete('ssl');
        parsedUrl.searchParams.delete('sslfactory');
        cleanDbUrl = parsedUrl.toString();
      } catch (urlErr) {
        // Simple regex fallback if connection URL isn't standard/parseable by new URL()
        cleanDbUrl = cleanDbUrl
          .replace(/[?&]sslmode=[^&]+/g, '')
          .replace(/[?&]ssl=[^&]+/g, '')
          .replace(/[?&]sslfactory=[^&]+/g, '');
      }

      pgPool = new pg.Pool({
        connectionString: cleanDbUrl,
        ssl: false
      });
      // Verify connection in non-SSL mode
      const client = await pgPool.connect();
      console.log('🚀 Connected to PostgreSQL successfully (SSL mode completely disabled)!');
      client.release();
      hasConnected = true;
    }

    if (!hasConnected) {
      throw new Error('All database connection strategies exhausted.');
    }

    usePostgres = true;

    // Build the schema if not existing
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        role VARCHAR(50) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        password VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        must_change_password BOOLEAN DEFAULT FALSE,
        token_version INTEGER DEFAULT 0,
        privacy JSONB
      );

      CREATE TABLE IF NOT EXISTS app_records (
        collection VARCHAR(50) NOT NULL,
        id VARCHAR(100) NOT NULL,
        data JSONB NOT NULL,
        PRIMARY KEY (collection, id)
      );

      CREATE TABLE IF NOT EXISTS farms (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        location VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        total_plots INT DEFAULT 0,
        total_hectares DOUBLE PRECISION DEFAULT 0.0,
        description TEXT,
        cover_image TEXT,
        date_established VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS plots (
        id VARCHAR(50) PRIMARY KEY,
        farm_id VARCHAR(50) NOT NULL,
        plot_number VARCHAR(50) NOT NULL,
        size_hectares DOUBLE PRECISION NOT NULL,
        size_unit VARCHAR(50) DEFAULT 'acre',
        crop_type VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS investor_plots (
        id VARCHAR(50) PRIMARY KEY,
        investor_id VARCHAR(50) NOT NULL,
        plot_id VARCHAR(50) NOT NULL,
        investment_amount DOUBLE PRECISION NOT NULL,
        ownership_percentage DOUBLE PRECISION DEFAULT 100,
        start_date VARCHAR(50) NOT NULL,
        contract_ref VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id VARCHAR(50) PRIMARY KEY,
        manager_id VARCHAR(50) NOT NULL,
        farm_id VARCHAR(50) NOT NULL,
        assigned_date VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS updates (
        id VARCHAR(50) PRIMARY KEY,
        farm_id VARCHAR(50) NOT NULL,
        posted_by VARCHAR(50) NOT NULL,
        posted_by_name VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        update_type VARCHAR(50) NOT NULL,
        target_investor_ids JSONB DEFAULT '[]',
        is_published BOOLEAN DEFAULT TRUE,
        created_at VARCHAR(100) NOT NULL,
        photos JSONB DEFAULT '[]',
        comments JSONB DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(50) PRIMARY KEY,
        farm_id VARCHAR(50) NOT NULL,
        plot_id VARCHAR(50),
        uploaded_by VARCHAR(50) NOT NULL,
        uploaded_by_name VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL,
        visibility VARCHAR(50) NOT NULL,
        description TEXT,
        uploaded_at VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS financials (
        id VARCHAR(50) PRIMARY KEY,
        plot_id VARCHAR(50) NOT NULL,
        uploaded_by VARCHAR(50) NOT NULL,
        period VARCHAR(50) NOT NULL,
        year INT NOT NULL,
        roi_percentage DOUBLE PRECISION DEFAULT 0.0,
        payout_amount DOUBLE PRECISION DEFAULT 0.0,
        payout_date VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS simulated_emails (
        id VARCHAR(50) PRIMARY KEY,
        to_address VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        html_body TEXT NOT NULL,
        sent_at VARCHAR(100) NOT NULL,
        category VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS map_notes (
        id VARCHAR(50) PRIMARY KEY,
        farm_id VARCHAR(50) NOT NULL,
        x DOUBLE PRECISION NOT NULL,
        y DOUBLE PRECISION NOT NULL,
        note TEXT NOT NULL,
        author_id VARCHAR(50) NOT NULL,
        author_name VARCHAR(100) NOT NULL,
        author_role VARCHAR(50) NOT NULL,
        created_at VARCHAR(100) NOT NULL
      );
    `);

    // Ensure legacy schemas have the password and is_active columns
    await pgPool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
      ALTER TABLE users ALTER COLUMN password TYPE VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy JSONB;
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage JSONB;
      ALTER TABLE updates ADD COLUMN IF NOT EXISTS updated_at VARCHAR(100);
      ALTER TABLE updates ADD COLUMN IF NOT EXISTS comments JSONB DEFAULT '[]';
      ALTER TABLE plots ADD COLUMN IF NOT EXISTS size_unit VARCHAR(50) DEFAULT 'acre';
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS read_at VARCHAR(100);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS sender_id VARCHAR(50);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS recipient_id VARCHAR(50);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS farm_id VARCHAR(50);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS related_type VARCHAR(50);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS related_id VARCHAR(50);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(512);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255);
      ALTER TABLE simulated_emails ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50);
    `);

    // Run empty-check for seeding
    const userCountResult = await pgPool.query('SELECT COUNT(*) FROM users;');
    const userCount = parseInt(userCountResult.rows[0].count);

    if (userCount === 0) {
      console.log('🌱 PostgreSQL database is empty. Seeding from fallback values...');
      let initialData: DatabaseSchema;
      try {
        if (fs.existsSync(DB_FILE)) {
          initialData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } else {
          initialData = getInitialDb();
        }
      } catch (err) {
        initialData = getInitialDb();
      }

      // Seed core DB structures
      db = initialData;
      await saveDbToPostgres();
      console.log('✅ PostgreSQL seeding completed successfully!');
    }

    // Retrieve database state
    console.log('🔄 Loading persisted state from PostgreSQL tables...');
    const usersRes = await pgPool.query('SELECT * FROM users;');
    const farmsRes = await pgPool.query('SELECT * FROM farms;');
    const plotsRes = await pgPool.query('SELECT * FROM plots;');
    const investorPlotsRes = await pgPool.query('SELECT * FROM investor_plots;');
    const assignmentsRes = await pgPool.query('SELECT * FROM assignments;');
    const updatesRes = await pgPool.query('SELECT * FROM updates;');
    const documentsRes = await pgPool.query('SELECT * FROM documents;');
    const financialsRes = await pgPool.query('SELECT * FROM financials;');
    const emailsRes = await pgPool.query('SELECT * FROM simulated_emails ORDER BY sent_at DESC;');
    const mapNotesRes = await pgPool.query('SELECT * FROM map_notes ORDER BY created_at DESC;');
    const recordsRes = await pgPool.query('SELECT collection, data FROM app_records;');
    const recordsOf = (name: string) => recordsRes.rows.filter((r: any) => r.collection === name).map((r: any) => r.data);
    const byNewest = (field: string) => (a: any, b: any) => String(b[field]).localeCompare(String(a[field]));
    const storedSettings = recordsOf('settings')[0];
    if (storedSettings) delete storedSettings.id;

    db = {
      users: usersRes.rows.map(mapUserFromDb),
      farms: farmsRes.rows.map(mapFarmFromDb),
      plots: plotsRes.rows.map(mapPlotFromDb),
      investorPlots: investorPlotsRes.rows.map(mapInvestorPlotFromDb),
      assignments: assignmentsRes.rows.map(mapAssignmentFromDb),
      updates: updatesRes.rows.map(mapUpdateFromDb),
      documents: documentsRes.rows.map(mapDocumentFromDb),
      financials: financialsRes.rows.map(mapFinancialFromDb),
      simulatedEmails: emailsRes.rows.map(mapSimulatedEmailFromDb),
      mapNotes: mapNotesRes.rows.map(mapMapNoteFromDb),
      auditLogs: recordsOf('auditLogs').sort(byNewest('at')),
      dataRequests: recordsOf('dataRequests').sort(byNewest('createdAt')),
      breachIncidents: recordsOf('breachIncidents').sort(byNewest('detectedAt')),
      // Settings were previously not stored in PostgreSQL; keep the loaded ones
      settings: storedSettings || db.settings
    };

    postgresError = null;
    console.log(`✅ Loaded ${db.users.length} users, ${db.farms.length} estates, ${db.plots.length} plots from PostgreSQL!`);
  } catch (err: any) {
    usePostgres = false;
    postgresError = err instanceof Error ? err.stack || err.message : String(err);
    
    const settings = getSettings();
    if (settings.databaseMode === 'postgres_forced') {
      console.error('❌ Failed to initialize PostgreSQL connection in FORCED database mode:', err);
    } else {
      console.log(`💡 Note: PostgreSQL is not reachable, seamlessly continuing in persistent Cloud/Local database mode: ${err.message || err}`);
    }
    // Fall back to local JSON file only if Firestore failed to retrieve any user data
    if (db.users.length === 0) {
      loadLocalJsonDb();
    }
  }
}

function saveDb() {
  // Always maintain an active local JSON backup file
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('❌ Failed to save local file-based DB copy:', err);
  }

  // Push updates to Firestore
  if (firestoreDb) {
    saveDbToFirestore().catch(err => {
      console.error('❌ Failed to synchronize database changes with Firestore:', err);
    });
  }

  // Push updates to PostgreSQL if activated
  if (usePostgres && pgPool) {
    saveDbToPostgres().catch(err => {
      console.error('❌ Failed to synchronize database changes with PostgreSQL:', err);
    });
  }
}

/** Escapes text before it is placed in email HTML. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Simulated real-time triggers for notification emails
async function dispatchEmail(
  to: string,
  subject: string,
  textBody: string,
  htmlBody: string,
  category: string,
  extra?: {
    senderId?: string;
    recipientId?: string;
    farmId?: string;
    relatedType?: 'update' | 'document' | 'financial' | 'welcome';
    relatedId?: string;
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentType?: string;
    /** The message contains a credential (e.g. temporary password) */
    containsCredentials?: boolean;
  }
) {
  const settings = getSettings();
  // When the email is really delivered, the stored copy never keeps credentials
  const redactStoredCopy = !!extra?.containsCredentials && (settings.emailServiceType || 'simulation') !== 'simulation';

  // 1. Appends to internal simulated log (always record so admins can see in outbox tab)
  const newEmail: SimulatedEmail = {
    id: 'email-' + Date.now().toString() + '-' + Math.floor(Math.random() * 1000),
    to,
    subject,
    body: redactStoredCopy ? redactCredentials(textBody) : textBody,
    htmlBody: redactStoredCopy ? redactCredentials(htmlBody) : htmlBody,
    sentAt: new Date().toISOString(),
    category,
    deliveryStatus: 'simulated',
    isRead: false,
    ...extra
  };
  db.simulatedEmails.unshift(newEmail);

  // 2. Real dispatch based on configuration
  const svc = settings.emailServiceType || 'simulation';

  if (svc === 'smtp') {
    if (settings.smtpHost) {
      try {
        const attachments = extra?.attachmentUrl ? [
          {
            filename: extra.attachmentName || 'attachment',
            path: extra.attachmentUrl.startsWith('/') 
              ? path.join(process.cwd(), extra.attachmentUrl) 
              : extra.attachmentUrl
          }
        ] : undefined;

        await sendSmtpEmail({
          host: settings.smtpHost,
          port: settings.smtpPort || 587,
          secure: settings.smtpSecure !== false,
          user: settings.smtpUser || '',
          pass: settings.smtpPass || '',
          from: settings.smtpFrom || 'Adubiaro Farms <noreply@adubiaro.com>',
          to,
          subject,
          text: textBody,
          html: htmlBody,
          attachments
        });
        newEmail.deliveryStatus = 'delivered';
        console.log(`📧 Fully routed REAL SMTP Email to ${to}: ${subject}`);
      } catch (e: any) {
        newEmail.deliveryStatus = 'failed';
        newEmail.deliveryError = e.message || String(e);
        console.error('📧 SMTP Send issue (logged in simulated outbox):', e);
      }
    } else {
      newEmail.deliveryStatus = 'failed';
      newEmail.deliveryError = 'SMTP service enabled but SMTP Hostname is not configured.';
      console.warn('⚠️ SMTP Email service enabled but no host configured.');
    }
  } else if (svc === 'brevo') {
    if (settings.brevoApiKey) {
      try {
        await sendBrevoEmail({
          apiKey: settings.brevoApiKey,
          senderName: settings.brevoSenderName || 'Adubiaro Farms',
          senderEmail: settings.brevoSenderEmail || 'noreply@adubiaro.com',
          to,
          subject,
          text: textBody,
          html: htmlBody
        });
        newEmail.deliveryStatus = 'delivered';
        console.log(`📧 Fully routed REAL Brevo API Email to ${to}: ${subject}`);
      } catch (e: any) {
        newEmail.deliveryStatus = 'failed';
        newEmail.deliveryError = e.message || String(e);
        console.error('📧 Brevo API Send issue (logged in simulated outbox):', e);
      }
    } else {
      newEmail.deliveryStatus = 'failed';
      newEmail.deliveryError = 'Brevo service enabled but API Key is not configured.';
      console.warn('⚠️ Brevo Email service enabled but no API Key configured.');
    }
  } else {
    newEmail.deliveryStatus = 'simulated';
    console.log(`📧 Simulated Email recorded in outbox to ${to}: ${subject}`);
  }

  // Persist the state after the dispatch is complete
  saveDb();
}

// AUTHENTICATION MIDDLEWARE
const SESSION_COOKIE = 'adubiaro_session';

function readCookie(req: express.Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/**
 * HttpOnly session cookie used only for fetching files (images, document
 * downloads). All API calls still require the Authorization header, so the
 * cookie cannot be used for cross-site request forgery.
 */
function setSessionCookie(req: express.Request, res: express.Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || process.env.NODE_ENV === 'production',
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/'
  });
}

function getAuthenticatedUser(req: express.Request, allowCookie = false): User | null {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else if (allowCookie) {
    token = readCookie(req, SESSION_COOKIE);
  }
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const foundUser = db.users.find(u => u.id === payload.sub);
  if (!foundUser) return null;
  // Tokens are revoked by bumping the user's tokenVersion (password change/reset)
  if ((foundUser.tokenVersion || 0) !== payload.tv) return null;
  return foundUser;
}

// Routes a user with a pending forced password change may still call
const PASSWORD_CHANGE_ALLOWED_PATHS = new Set(['/api/auth/change-password', '/api/user/me']);

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  if (user.isActive === false) {
    return res.status(403).json({ error: 'This account has been deactivated. Please contact support.' });
  }
  if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED_PATHS.has(req.path)) {
    return res.status(403).json({ error: 'You must change your temporary password before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  // Attach user to req as custom property
  (req as any).user = user;
  next();
}

/** Like requireAuth, but also accepts the session cookie (read-only file downloads). */
function requireAuthAllowCookie(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = getAuthenticatedUser(req, true);
  if (!user || user.isActive === false || user.mustChangePassword) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  (req as any).user = user;
  next();
}

/** Whether a user may view a document (shared by downloads and /uploads). */
function canAccessDocument(user: User, doc: Document): boolean {
  if (user.role === UserRole.ADMIN) return true;
  if (user.role === UserRole.FARM_MANAGER) {
    // Farm managers can see general docs for farms they manage, but not financial ones
    const managesFarm = db.assignments.some(a => a.managerId === user.id && a.farmId === doc.farmId && a.isActive);
    return managesFarm && doc.category !== DocumentCategory.FINANCIAL;
  }
  if (user.role === UserRole.INVESTOR) {
    const plotIds = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive).map(ip => ip.plotId);
    const ownsPlotInFarm = db.plots.some(p => p.farmId === doc.farmId && plotIds.includes(p.id));
    if (!ownsPlotInFarm) return false;
    if (doc.visibility === DocumentVisibility.FARM) return true;
    return doc.visibility === DocumentVisibility.PLOT && !!doc.plotId && plotIds.includes(doc.plotId);
  }
  return false;
}

/** Investor ids linked to farms the manager is actively assigned to. */
function investorIdsForManager(managerId: string): Set<string> {
  const farmIds = new Set(db.assignments.filter(a => a.managerId === managerId && a.isActive).map(a => a.farmId));
  const plotIds = new Set(db.plots.filter(p => farmIds.has(p.farmId)).map(p => p.id));
  return new Set(db.investorPlots.filter(ip => plotIds.has(ip.plotId)).map(ip => ip.investorId));
}

/** User object safe to send to the client. */
function publicUser(user: User) {
  const { password: _password, tokenVersion: _tv, ...rest } = user as any;
  return rest;
}

/**
 * Whether `actor` may modify `target`'s account. Admins may manage anyone;
 * farm managers may only manage investor accounts.
 */
function canManageUser(actor: User, target: User): boolean {
  if (actor.role === UserRole.ADMIN) return true;
  if (actor.role === UserRole.FARM_MANAGER) return target.role === UserRole.INVESTOR;
  return false;
}

/** Sets a new (hashed) password and revokes the user's existing sessions. */
function setUserPassword(user: User, plain: string, mustChange: boolean) {
  user.password = hashPassword(plain);
  user.mustChangePassword = mustChange;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
}

/**
 * Credential migration, run after the database is loaded or replaced:
 *  - hashes any legacy plaintext passwords
 *  - guarantees at least one admin can sign in (ADMIN_INITIAL_PASSWORD, or a
 *    generated one-time password printed to the server log)
 * Returns true if anything changed.
 */
function migrateUserCredentials(): boolean {
  let changed = false;
  for (const u of db.users) {
    if (needsRehash(u.password)) {
      u.password = hashPassword(u.password as string);
      changed = true;
    }
  }

  const activeAdmins = db.users.filter(u => u.role === UserRole.ADMIN && u.isActive !== false);
  if (activeAdmins.length > 0 && !activeAdmins.some(u => isPasswordHash(u.password))) {
    const admin = activeAdmins[0];
    const envPassword = process.env.ADMIN_INITIAL_PASSWORD;
    const initial = envPassword && !validatePasswordStrength(envPassword) ? envPassword : generateTempPassword();
    setUserPassword(admin, initial, true);
    changed = true;
    if (envPassword && initial === envPassword) {
      console.warn(`🔐 Admin "${admin.username}" had no password; set it from ADMIN_INITIAL_PASSWORD. It must be changed at first login.`);
    } else {
      if (envPassword) console.warn('⚠️ ADMIN_INITIAL_PASSWORD is too weak (min 8 chars, letters and numbers); ignoring it.');
      console.warn('================================================================');
      console.warn(`🔐 Admin "${admin.username}" had no password. One-time password: ${initial}`);
      console.warn('   Sign in with it and you will be asked to choose a new one.');
      console.warn('================================================================');
    }
  }

  const locked = db.users.filter(u => !isPasswordHash(u.password));
  if (locked.length > 0) {
    console.warn(`🔒 ${locked.length} account(s) have no password and cannot sign in until an admin sets one: ${locked.map(u => u.username).join(', ')}`);
  }
  return changed;
}

// API ROUTING

// Auth - Login
app.post('/api/auth/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = req.body?.password;
  const ip = req.ip || 'unknown';

  const retryAfter = loginRetryAfter(ip, username);
  if (retryAfter > 0) {
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Too many failed sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).` });
  }

  const user = db.users.find(u => u.username === username);
  const isMatch = verifyPassword(password, user?.password);

  if (!user || !isMatch) {
    recordLoginFailure(ip, username);
    if (user) recordAudit(db, null, 'auth.login_failed', { targetType: 'user', targetId: user.id, req });
    return res.status(400).json({ error: 'Invalid login credentials' });
  }

  if (user.isActive === false) {
    return res.status(403).json({ error: 'This account has been deactivated. Please contact support.' });
  }

  clearLoginFailures(ip, username);

  if (needsRehash(user.password)) {
    user.password = hashPassword(password);
    saveDb();
  }

  const token = issueToken(user.id, user.tokenVersion || 0);
  setSessionCookie(req, res, token);
  recordAudit(db, user, 'auth.login', { targetType: 'user', targetId: user.id, req });
  saveDb();
  res.json({ token, user: publicUser(user), mustChangePassword: !!user.mustChangePassword });
});

// Auth - Change own password (also completes a forced temporary-password change)
app.post('/api/auth/change-password', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const { currentPassword, newPassword } = req.body || {};

  if (!verifyPassword(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  const weakness = validatePasswordStrength(newPassword);
  if (weakness) {
    return res.status(400).json({ error: weakness });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ error: 'New password must be different from the current password.' });
  }

  setUserPassword(user, newPassword, false);
  // The temporary password is no longer needed anywhere: scrub stored copies
  for (const email of db.simulatedEmails) {
    if (email.recipientId === user.id && email.containsCredentials) {
      email.body = redactCredentials(email.body);
      email.htmlBody = redactCredentials(email.htmlBody);
      email.containsCredentials = false;
    }
  }

  recordAudit(db, user, 'auth.password_changed', { targetType: 'user', targetId: user.id, req });
  saveDb();

  // Existing sessions were revoked; hand back a fresh token for this one
  const token = issueToken(user.id, user.tokenVersion || 0);
  setSessionCookie(req, res, token);
  res.json({ success: true, token, user: publicUser(user) });
});

// Auth - Current User Status (also refreshes the file-download session cookie)
app.get('/api/user/me', requireAuth, (req, res) => {
  const authHeader = req.headers.authorization || '';
  setSessionCookie(req, res, authHeader.slice('Bearer '.length).trim());
  res.json({ user: publicUser((req as any).user) });
});

// Auth - Sign out (clears the file-download session cookie)
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ success: true });
});

// Privacy & data protection (notice, consent, data subject rights, audit, breaches)
registerPrivacyRoutes(app, {
  getDb: () => db,
  saveDb,
  getSettings,
  setPrivacySettings: p => {
    getSettings().privacy = p;
  },
  requireAuth,
  publicUser,
  describeProcessors,
  sendEmail: (to, subject, text, html, category, extra) => {
    dispatchEmail(to, subject, text, html, category, extra).catch(err => console.error('Privacy email failed:', err));
  }
});

/** Third parties that receive personal data under the current configuration. */
function describeProcessors(): Processor[] {
  const list: Processor[] = [];
  const settings = getSettings();
  const outside = 'may be outside Nigeria';
  if (firestoreDb) {
    list.push({ name: 'Google Cloud Firestore (Google LLC)', purpose: 'Database storage of portal records', location: `Google Cloud data centre for the configured project (${outside})` });
  }
  if (usePostgres && process.env.DATABASE_URL) {
    let host = 'database provider';
    try { host = new URL(process.env.DATABASE_URL).hostname; } catch { /* ignore */ }
    list.push({ name: `PostgreSQL database hosting (${host})`, purpose: 'Database storage of portal records', location: `Provider's data centre (${outside})` });
  }
  if (process.env.CLOUDINARY_URL) {
    list.push({ name: 'Cloudinary Ltd.', purpose: 'Storage of uploaded documents, photos and attachments', location: `Cloudinary data centres (${outside})` });
  }
  if (settings.emailServiceType === 'smtp' && settings.smtpHost) {
    list.push({ name: `Email provider (${settings.smtpHost})`, purpose: 'Delivery of account and portfolio emails', location: outside });
  }
  if (settings.emailServiceType === 'brevo') {
    list.push({ name: 'Brevo (Sendinblue SAS)', purpose: 'Delivery of account and portfolio emails', location: 'European Union' });
  }
  return list;
}

// Admin System Stats Dashboard
app.get('/api/admin/system-stats', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const totalInvestors = db.users.filter(u => u.role === UserRole.INVESTOR).length;
  const totalManagers = db.users.filter(u => u.role === UserRole.FARM_MANAGER).length;
  const totalFarms = db.farms.length;
  const totalActiveFarms = db.farms.filter(f => f.isActive).length;
  const totalPlotsCount = db.plots.length;
  
  // Calculate total investments
  const totalInvestment = db.investorPlots.reduce((sum, p) => sum + p.investmentAmount, 0);
  const totalActiveInvestmentCount = db.investorPlots.filter(ip => ip.isActive).length;
  const totalActiveInvestmentAmount = db.investorPlots.filter(ip => ip.isActive).reduce((sum, p) => sum + p.investmentAmount, 0);
  
  // Calculate total paid and pending payouts
  let totalPaidPayouts = 0;
  let totalPendingPayouts = 0;
  db.financials.forEach(fin => {
    if (fin.status === FinancialStatus.PAID) {
      totalPaidPayouts += fin.payoutAmount;
    } else if (fin.status === FinancialStatus.PENDING) {
      totalPendingPayouts += fin.payoutAmount;
    }
  });

  // Calculate payouts this month
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  let totalPayoutsThisMonth = 0;
  db.financials.forEach(fin => {
    if (fin.payoutDate) {
      const pDate = new Date(fin.payoutDate);
      if (!isNaN(pDate.getTime()) && pDate.getFullYear() === curYear && pDate.getMonth() === curMonth) {
        totalPayoutsThisMonth += fin.payoutAmount;
      }
    }
  });

  res.json({
    totalInvestors,
    totalManagers,
    totalFarms,
    totalActiveFarms,
    totalPlotsCount,
    totalInvestment,
    totalActiveInvestmentCount,
    totalActiveInvestmentAmount,
    totalPaidPayouts,
    totalPendingPayouts,
    totalPayoutsThisMonth,
    plots: db.plots,
    investorPlots: db.investorPlots,
    assignments: db.assignments
  });
});

// Global Search (Filtered according to roles)
app.get('/api/search', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const query = (req.query.q as string || '').trim().toLowerCase();

  if (!query) {
    return res.json({
      farms: [],
      plots: [],
      investorPlots: [],
      documents: [],
      financials: []
    });
  }

  // Define collections to match
  let matchedFarms: Farm[] = [];
  let matchedPlots: FarmPlot[] = [];
  let matchedInvestorPlots: InvestorPlot[] = [];
  let matchedDocuments: Document[] = [];
  let matchedFinancials: FinancialSummary[] = [];

  if (user.role === UserRole.ADMIN) {
    // 1. Farms
    matchedFarms = db.farms.filter(f => 
      f.name.toLowerCase().includes(query) ||
      f.location.toLowerCase().includes(query) ||
      f.state.toLowerCase().includes(query) ||
      f.description.toLowerCase().includes(query)
    );

    // 2. Plots
    matchedPlots = db.plots.filter(p => 
      p.plotNumber.toLowerCase().includes(query) ||
      p.cropType.toLowerCase().includes(query) ||
      p.status.toLowerCase().includes(query)
    );

    // 3. Investor Plots
    matchedInvestorPlots = db.investorPlots.filter(ip => {
      const investorUser = db.users.find(u => u.id === ip.investorId);
      const investorName = investorUser ? investorUser.name.toLowerCase() : '';
      const investorEmail = investorUser ? investorUser.email.toLowerCase() : '';
      return ip.contractRef.toLowerCase().includes(query) ||
             investorName.includes(query) ||
             investorEmail.includes(query);
    });

    // 4. Documents
    matchedDocuments = db.documents.filter(d => 
      d.title.toLowerCase().includes(query) ||
      d.fileName.toLowerCase().includes(query) ||
      d.description.toLowerCase().includes(query) ||
      d.category.toLowerCase().includes(query)
    );

    // 5. Financials
    matchedFinancials = db.financials.filter(f => 
      f.period.toLowerCase().includes(query) ||
      f.notes.toLowerCase().includes(query) ||
      f.status.toLowerCase().includes(query) ||
      f.year.toString().includes(query)
    );
  } else if (user.role === UserRole.FARM_MANAGER) {
    // Get assigned farm IDs
    const assignedFarmIds = db.assignments
      .filter(a => a.managerId === user.id && a.isActive)
      .map(a => a.farmId);

    // 1. Farms
    matchedFarms = db.farms.filter(f => 
      assignedFarmIds.includes(f.id) && (
        f.name.toLowerCase().includes(query) ||
        f.location.toLowerCase().includes(query) ||
        f.state.toLowerCase().includes(query) ||
        f.description.toLowerCase().includes(query)
      )
    );

    // 2. Plots
    matchedPlots = db.plots.filter(p => 
      assignedFarmIds.includes(p.farmId) && (
        p.plotNumber.toLowerCase().includes(query) ||
        p.cropType.toLowerCase().includes(query) ||
        p.status.toLowerCase().includes(query)
      )
    );

    // 3. Investor Plots (Restrict to assigned farms' plots)
    const assignedPlotIds = db.plots.filter(p => assignedFarmIds.includes(p.farmId)).map(p => p.id);
    matchedInvestorPlots = db.investorPlots.filter(ip => 
      assignedPlotIds.includes(ip.plotId) && (
        ip.contractRef.toLowerCase().includes(query) ||
        (db.users.find(u => u.id === ip.investorId)?.name.toLowerCase().includes(query) || false)
      )
    );

    // 4. Documents (Only assigned farms' documents)
    matchedDocuments = db.documents.filter(d => 
      assignedFarmIds.includes(d.farmId) && (
        d.title.toLowerCase().includes(query) ||
        d.fileName.toLowerCase().includes(query) ||
        d.description.toLowerCase().includes(query) ||
        d.category.toLowerCase().includes(query)
      )
    );

    // 5. Financials: FARM MANAGERS ARE RESTRICTED. Return empty.
    matchedFinancials = [];
  } else if (user.role === UserRole.INVESTOR) {
    // Get owned plot IDs
    const investorPlotsList = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive);
    const ownedPlotIds = investorPlotsList.map(ip => ip.plotId);
    
    // Find farms for those owned plots
    const ownedPlotFarms = db.plots.filter(p => ownedPlotIds.includes(p.id)).map(p => p.farmId);

    // 1. Farms
    matchedFarms = db.farms.filter(f => 
      ownedPlotFarms.includes(f.id) && (
        f.name.toLowerCase().includes(query) ||
        f.location.toLowerCase().includes(query) ||
        f.state.toLowerCase().includes(query) ||
        f.description.toLowerCase().includes(query)
      )
    );

    // 2. Plots
    matchedPlots = db.plots.filter(p => 
      ownedPlotIds.includes(p.id) && (
        p.plotNumber.toLowerCase().includes(query) ||
        p.cropType.toLowerCase().includes(query) ||
        p.status.toLowerCase().includes(query)
      )
    );

    // 3. Investor Plots (Only their own)
    matchedInvestorPlots = investorPlotsList.filter(ip => 
      ip.contractRef.toLowerCase().includes(query)
    );

    // 4. Documents (Only visible documents for their farms/plots)
    matchedDocuments = db.documents.filter(d => {
      const matchesQuery = d.title.toLowerCase().includes(query) ||
                           d.fileName.toLowerCase().includes(query) ||
                           d.description.toLowerCase().includes(query) ||
                           d.category.toLowerCase().includes(query);
      if (!matchesQuery) return false;

      // Access checks:
      if (d.visibility === DocumentVisibility.FARM) {
        return ownedPlotFarms.includes(d.farmId);
      } else if (d.visibility === DocumentVisibility.PLOT && d.plotId) {
        return ownedPlotIds.includes(d.plotId);
      }
      return false;
    });

    // 5. Financials (Only theirs)
    matchedFinancials = db.financials.filter(f => 
      ownedPlotIds.includes(f.plotId) && (
        f.period.toLowerCase().includes(query) ||
        f.notes.toLowerCase().includes(query) ||
        f.status.toLowerCase().includes(query) ||
        f.year.toString().includes(query)
      )
    );
  }

  res.json({
    farms: matchedFarms,
    plots: matchedPlots,
    investorPlots: matchedInvestorPlots,
    documents: matchedDocuments,
    financials: matchedFinancials
  });
});

// List Farms (Filtered according to roles)
app.get('/api/farms', requireAuth, (req, res) => {
  const user = (req as any).user as User;

  const enrichFarm = (farm: Farm) => {
    const farmPlots = db.plots.filter(p => p.farmId === farm.id);
    const farmPlotIds = farmPlots.map(p => p.id);
    const computedPlots = farmPlots.length;
    const computedHectares = farmPlots.reduce((s, p) => s + (Number(p.sizeHectares) || 0), 0);

    const base = {
      ...farm,
      totalPlots: computedPlots > 0 ? computedPlots : farm.totalPlots,
      totalHectares: computedHectares > 0 ? Number(computedHectares.toFixed(2)) : farm.totalHectares
    };

    if (user.role === UserRole.ADMIN) {
      const activeHoldings = db.investorPlots.filter(ip => farmPlotIds.includes(ip.plotId) && ip.isActive !== false);
      const uniqueInvestors = new Set(activeHoldings.map(ip => ip.investorId));
      const totalInvestmentReceived = activeHoldings.reduce((s, ip) => s + (Number(ip.investmentAmount) || 0), 0);
      return {
        ...base,
        investorCount: uniqueInvestors.size,
        totalInvestmentReceived
      };
    }

    return base;
  };

  if (user.role === UserRole.ADMIN) {
    return res.json(db.farms.map(enrichFarm));
  }

  if (user.role === UserRole.FARM_MANAGER) {
    // Get farms assigned to this manager
    const assignedFarmIds = db.assignments
      .filter(a => a.managerId === user.id && a.isActive)
      .map(a => a.farmId);
    const assignedFarms = db.farms.filter(f => assignedFarmIds.includes(f.id));
    return res.json(assignedFarms.map(enrichFarm));
  }

  if (user.role === UserRole.INVESTOR) {
    // Get farms where investor owns plots
    const investorPlotsList = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive !== false);
    const plotIds = investorPlotsList.map(ip => ip.plotId);
    const ownedPlotFarms = db.plots.filter(p => plotIds.includes(p.id)).map(p => p.farmId);
    const ownedFarms = db.farms.filter(f => ownedPlotFarms.includes(f.id));
    return res.json(ownedFarms.map(enrichFarm));
  }

  res.json([]);
});

// Investor Portfolio Aggregate Endpoint (returns all farms, plots, capital invested, and earned returns for the logged-in investor)
app.get('/api/investor/portfolio', requireAuth, (req, res) => {
  const user = (req as any).user as User;

  const activeHoldings = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive !== false);
  const ownedPlotIds = Array.from(new Set(activeHoldings.map(ip => ip.plotId)));

  const myFinancials = db.financials.filter(fin => ownedPlotIds.includes(fin.plotId));

  const holdings = activeHoldings.map(h => {
    const plot = db.plots.find(p => p.id === h.plotId);
    const farm = plot ? db.farms.find(f => f.id === plot.farmId) : null;
    const plotPaidReturns = myFinancials
      .filter(fin => fin.plotId === h.plotId && fin.status === FinancialStatus.PAID)
      .reduce((sum, fin) => sum + (Number(fin.payoutAmount) || 0), 0);

    return {
      ...h,
      plotNumber: plot?.plotNumber || 'Unspecified',
      cropType: plot?.cropType || 'Oil Palm',
      sizeHectares: Number(plot?.sizeHectares) || 0,
      sizeUnit: plot?.sizeUnit || 'acre',
      plotStatus: plot?.status || PlotStatus.ACTIVE,
      farmId: farm?.id || null,
      farmName: farm?.name || 'Adubiaro Estate',
      farmLocation: farm?.location || '',
      farmState: farm?.state || '',
      paidReturns: plotPaidReturns
    };
  });

  const farmMap = new Map<string, any>();
  holdings.forEach(h => {
    if (!h.farmId) return;
    if (!farmMap.has(h.farmId)) {
      const farmObj = db.farms.find(f => f.id === h.farmId);
      if (!farmObj) return;
      farmMap.set(h.farmId, {
        ...farmObj,
        myPlotsCount: 0,
        myTotalInvested: 0,
        myPaidReturns: 0
      });
    }
    const entry = farmMap.get(h.farmId);
    entry.myPlotsCount += 1;
    entry.myTotalInvested += Number(h.investmentAmount) || 0;
  });

  myFinancials.forEach(fin => {
    const plot = db.plots.find(p => p.id === fin.plotId);
    if (plot && farmMap.has(plot.farmId) && fin.status === FinancialStatus.PAID) {
      farmMap.get(plot.farmId).myPaidReturns += Number(fin.payoutAmount) || 0;
    }
  });

  const farms = Array.from(farmMap.values());
  const totalCapital = holdings.reduce((sum, h) => sum + (Number(h.investmentAmount) || 0), 0);
  const totalHectares = holdings.reduce((sum, h) => sum + (Number(h.sizeHectares) || 0), 0);
  const totalPaidReturns = myFinancials
    .filter(fin => fin.status === FinancialStatus.PAID)
    .reduce((sum, fin) => sum + (Number(fin.payoutAmount) || 0), 0);
  const totalPendingReturns = myFinancials
    .filter(fin => fin.status !== FinancialStatus.PAID)
    .reduce((sum, fin) => sum + (Number(fin.payoutAmount) || 0), 0);

  res.json({
    farms,
    holdings,
    summary: {
      totalFarms: farms.length,
      totalPlots: holdings.length,
      totalCapital,
      totalHectares,
      totalPaidReturns,
      totalPendingReturns
    }
  });
});

// Get Updates Feed for Supervisor/Manager Dashboard
app.get('/api/updates/manager', requireAuth, (req, res) => {
  const user = (req as any).user as User;

  let assignedFarmIds: string[] = [];
  if (user.role === UserRole.ADMIN) {
    assignedFarmIds = db.farms.map(f => f.id);
  } else if (user.role === UserRole.FARM_MANAGER) {
    assignedFarmIds = db.assignments
      .filter(a => a.managerId === user.id && a.isActive)
      .map(a => a.farmId);
  } else {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Filter updates for these farms
  const managerUpdates = db.updates.filter(u => assignedFarmIds.includes(u.farmId));
  
  // Attach farm names to the response items
  const updatesWithFarmInfo = managerUpdates.map(u => {
    const farm = db.farms.find(f => f.id === u.farmId);
    return {
      ...u,
      farmName: farm ? farm.name : 'Unknown Estate'
    };
  });

  res.json(updatesWithFarmInfo);
});

// Post a comment / reply to a farm update (nested comment threading)
app.post('/api/updates/:updateId/comments', requireAuth, async (req, res) => {
  const { updateId } = req.params;
  const { content, parentId } = req.body;
  const user = (req as any).user as User;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  const update = db.updates.find(u => u.id === updateId);
  if (!update) {
    return res.status(404).json({ error: 'Farm update not found' });
  }

  // Check access authorization
  let authorized = false;
  if (user.role === UserRole.ADMIN) {
    authorized = true;
  } else if (user.role === UserRole.FARM_MANAGER) {
    authorized = db.assignments.some(a => a.managerId === user.id && a.farmId === update.farmId && a.isActive);
  } else if (user.role === UserRole.INVESTOR) {
    const investorPlotsList = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive);
    const plotIds = investorPlotsList.map(ip => ip.plotId);
    const ownsPlotInFarm = db.plots.some(p => p.farmId === update.farmId && plotIds.includes(p.id));
    const isTargeted = !update.targetInvestorIds || update.targetInvestorIds.length === 0 || update.targetInvestorIds.includes(user.id);
    if (ownsPlotInFarm && isTargeted) {
      authorized = true;
    }
  }

  if (!authorized) {
    return res.status(403).json({ error: 'You are not authorized to comment on this update' });
  }

  if (!update.comments) {
    update.comments = [];
  }

  const newComment = {
    id: 'comment-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    updateId,
    parentId: parentId || null,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  update.comments.push(newComment);
  
  // Persist update changes
  saveDb();

  res.status(201).json(newComment);
});

// Delete a comment / reply thread
app.delete('/api/updates/:updateId/comments/:commentId', requireAuth, async (req, res) => {
  const { updateId, commentId } = req.params;
  const user = (req as any).user as User;

  const update = db.updates.find(u => u.id === updateId);
  if (!update) {
    return res.status(404).json({ error: 'Farm update not found' });
  }

  if (!update.comments) {
    update.comments = [];
  }

  const commentIndex = update.comments.findIndex(c => c.id === commentId);
  if (commentIndex === -1) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const comment = update.comments[commentIndex];

  // Authorized if user is author or Admin
  if (comment.userId !== user.id && user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'You are not authorized to delete this comment' });
  }

  // Delete comment
  update.comments.splice(commentIndex, 1);

  // Recursively delete sub-threaded replies
  const deleteChildComments = (pId: string) => {
    if (!update.comments) return;
    const children = update.comments.filter(c => c.parentId === pId);
    children.forEach(child => {
      const idx = update.comments!.findIndex(c => c.id === child.id);
      if (idx !== -1) {
        update.comments!.splice(idx, 1);
        deleteChildComments(child.id);
      }
    });
  };
  deleteChildComments(commentId);

  saveDb();

  res.json({ success: true, message: 'Comment and replies deleted successfully' });
});

// Single Farm Details API (with Updates, Documents, Plots checked cleanly)
app.get('/api/farms/:id', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const farmId = req.params.id;

  const farm = db.farms.find(f => f.id === farmId);
  if (!farm) {
    return res.status(404).json({ error: 'Farm not found' });
  }

  // 1. Roles access boundary check
  let accessAllowed = false;
  let assignedAsManager = false;

  if (user.role === UserRole.ADMIN) {
    accessAllowed = true;
  } else if (user.role === UserRole.FARM_MANAGER) {
    assignedAsManager = db.assignments.some(
      a => a.managerId === user.id && a.farmId === farmId && a.isActive
    );
    if (assignedAsManager) {
      accessAllowed = true;
    }
  } else if (user.role === UserRole.INVESTOR) {
    const investorPlotsList = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive);
    const plotIds = investorPlotsList.map(ip => ip.plotId);
    const ownsPlotInFarm = db.plots.some(p => p.farmId === farmId && plotIds.includes(p.id));
    if (ownsPlotInFarm) {
      accessAllowed = true;
    }
  }

  if (!accessAllowed) {
    return res.status(403).json({ error: 'Access denied to this farm estate' });
  }

  // 2. Gather plots
  let plots = db.plots.filter(p => p.farmId === farmId);
  // If role is investor, format/filter plots so they only see details of their owned plots
  if (user.role === UserRole.INVESTOR) {
    const investorPlotsList = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive);
    const plotIds = investorPlotsList.map(ip => ip.plotId);
    plots = plots.filter(p => plotIds.includes(p.id));
  }

  // 3. Gather updates
  let updates = db.updates.filter(u => u.farmId === farmId && u.isPublished);
  if (user.role === UserRole.INVESTOR) {
    updates = updates.filter(u => {
      return !u.targetInvestorIds || u.targetInvestorIds.length === 0 || u.targetInvestorIds.includes(user.id);
    });

    let changed = false;
    db.simulatedEmails.forEach(email => {
      if (
        email.to.toLowerCase() === user.email.toLowerCase() &&
        email.farmId === farmId &&
        email.relatedType === 'update' &&
        !email.isRead
      ) {
        email.isRead = true;
        email.readAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) {
      saveDb();
    }
  }

  // 4. Gather documents
  let documents = db.documents.filter(d => d.farmId === farmId);
  if (user.role === UserRole.FARM_MANAGER) {
    // Farm managers can see documents in general, but since they shouldn't see sensitive financials, they filter those categories
    documents = documents.filter(d => d.category !== DocumentCategory.FINANCIAL);
  } else if (user.role === UserRole.INVESTOR) {
    // Investors can see farm-wide, or specific plot documents matching their holdings
    const investorPlotsList = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive);
    const plotIds = investorPlotsList.map(ip => ip.plotId);
    documents = documents.filter(
      d => d.visibility === DocumentVisibility.FARM || (d.plotId && plotIds.includes(d.plotId))
    );
  }

  // Gather plot investment details for investors / admin / managers
  const allFarmPlots = db.plots.filter(p => p.farmId === farmId);
  const allFarmPlotIds = allFarmPlots.map(p => p.id);

  let investorHoldings: any[] = [];
  let farmInvestors: any[] = [];
  let totalEstateInvestment = 0;

  if (user.role === UserRole.INVESTOR) {
    const holdings = db.investorPlots.filter(
      ip => ip.investorId === user.id && ip.isActive !== false && allFarmPlotIds.includes(ip.plotId)
    );
    investorHoldings = holdings.map(h => {
      const p = allFarmPlots.find(plot => plot.id === h.plotId);
      return {
        ...h,
        plotNumber: p?.plotNumber,
        cropType: p?.cropType,
        sizeHectares: p?.sizeHectares,
        sizeUnit: p?.sizeUnit || 'acre',
        farmName: farm.name
      };
    });
    totalEstateInvestment = investorHoldings.reduce((sum, h) => sum + (Number(h.investmentAmount) || 0), 0);
  } else if (user.role === UserRole.ADMIN || user.role === UserRole.FARM_MANAGER) {
    const holdings = db.investorPlots.filter(ip => ip.isActive !== false && allFarmPlotIds.includes(ip.plotId));
    investorHoldings = holdings.map(h => {
      const p = allFarmPlots.find(plot => plot.id === h.plotId);
      const ownerUser = db.users.find(u => u.id === h.investorId);
      return {
        ...h,
        investmentAmount: user.role === UserRole.ADMIN ? h.investmentAmount : undefined,
        plotNumber: p?.plotNumber,
        cropType: p?.cropType,
        sizeHectares: p?.sizeHectares,
        sizeUnit: p?.sizeUnit || 'acre',
        investorName: ownerUser?.name || 'Unknown'
      };
    });

    const investorMap = new Map<string, any>();
    holdings.forEach(h => {
      const ownerUser = db.users.find(u => u.id === h.investorId);
      if (!ownerUser) return;
      const p = allFarmPlots.find(plot => plot.id === h.plotId);
      if (!investorMap.has(ownerUser.id)) {
        investorMap.set(ownerUser.id, {
          id: ownerUser.id,
          name: ownerUser.name,
          username: ownerUser.username,
          email: ownerUser.email,
          phone: ownerUser.phone || '',
          isActive: ownerUser.isActive !== false,
          plotsCount: 0,
          plotNumbers: [] as string[],
          totalSize: 0,
          sizeUnits: new Set<string>(),
          totalInvested: 0
        });
      }
      const entry = investorMap.get(ownerUser.id);
      entry.plotsCount += 1;
      if (p?.plotNumber) entry.plotNumbers.push(p.plotNumber);
      entry.totalSize += Number(p?.sizeHectares) || 0;
      entry.sizeUnits.add(p?.sizeUnit || 'acre');
      entry.totalInvested += Number(h.investmentAmount) || 0;
    });

    farmInvestors = Array.from(investorMap.values()).map(inv => {
      const { totalInvested, sizeUnits, ...rest } = inv;
      const unitsArr = Array.from(sizeUnits);
      return {
        ...rest,
        totalSize: Number(inv.totalSize.toFixed(2)),
        sizeUnit: unitsArr.length === 1 ? unitsArr[0] : 'acres/plots',
        ...(user.role === UserRole.ADMIN ? { totalInvested } : {})
      };
    });

    if (user.role === UserRole.ADMIN) {
      totalEstateInvestment = holdings.reduce((sum, h) => sum + (Number(h.investmentAmount) || 0), 0);
    }
  }

  res.json({
    farm: {
      ...farm,
      totalPlots: allFarmPlots.length > 0 ? allFarmPlots.length : farm.totalPlots,
      totalHectares: allFarmPlots.length > 0
        ? Number(allFarmPlots.reduce((s, p) => s + (Number(p.sizeHectares) || 0), 0).toFixed(2))
        : farm.totalHectares
    },
    plots,
    updates,
    documents,
    investorHoldings,
    farmInvestors,
    ...(user.role === UserRole.ADMIN || user.role === UserRole.INVESTOR ? { totalEstateInvestment } : {}),
    mapNotes: (db.mapNotes || []).filter(mn => mn.farmId === farmId)
  });
});

// Add a Map Note/Pin to a farm (Admins and Farm Managers only)
app.post('/api/farms/:id/map-notes', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const farmId = req.params.id;

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Only admins and farm managers are authorized to pin notes' });
  }

  const { x, y, note } = req.body;
  if (x === undefined || y === undefined || !note || !note.trim()) {
    return res.status(400).json({ error: 'Coordinates x, y, and note content are required' });
  }

  const newNote: FarmMapNote = {
    id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    farmId,
    x: Number(x),
    y: Number(y),
    note: note.trim(),
    authorId: user.id,
    authorName: user.name,
    authorRole: user.role,
    createdAt: new Date().toISOString()
  };

  if (!db.mapNotes) {
    db.mapNotes = [];
  }
  db.mapNotes.push(newNote);
  saveDb();

  res.status(201).json(newNote);
});

// Delete a Map Note/Pin (Admins and Farm Managers only)
app.delete('/api/farms/:id/map-notes/:noteId', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const noteId = req.params.noteId;

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Only admins and farm managers are authorized to delete pinned notes' });
  }

  if (!db.mapNotes) {
    db.mapNotes = [];
  }

  const noteIndex = db.mapNotes.findIndex(n => n.id === noteId);
  if (noteIndex === -1) {
    return res.status(404).json({ error: 'Pinned note not found' });
  }

  const note = db.mapNotes[noteIndex];
  // Allow if admin or if manager is the author or manager is assigned to the farm
  let authorized = user.role === UserRole.ADMIN || note.authorId === user.id;
  if (!authorized && user.role === UserRole.FARM_MANAGER) {
    authorized = db.assignments.some(a => a.managerId === user.id && a.farmId === note.farmId && a.isActive);
  }

  if (!authorized) {
    return res.status(403).json({ error: 'You are not authorized to delete this note' });
  }

  db.mapNotes.splice(noteIndex, 1);
  saveDb();

  res.json({ success: true, message: 'Pinned note deleted successfully' });
});

// List investors of a farm (Admin/Manager assigned only)
app.get('/api/farms/:id/investors', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const farmId = req.params.id;

  let authorized = false;
  if (user.role === UserRole.ADMIN) {
    authorized = true;
  } else if (user.role === UserRole.FARM_MANAGER) {
    authorized = db.assignments.some(
      a => a.managerId === user.id && a.farmId === farmId && a.isActive
    );
  }

  if (!authorized) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Find all plots belonging to the farm
  const farmPlots = db.plots.filter(p => p.farmId === farmId);
  const farmPlotIds = farmPlots.map(p => p.id);

  // Find all active investorPlot relationships mapping to those plots
  const ownerships = db.investorPlots.filter(ip => farmPlotIds.includes(ip.plotId) && ip.isActive);
  const investorIds = [...new Set(ownerships.map(ip => ip.investorId))];

  // Map to distinct users who are investors
  const investors = db.users.filter(u => u.role === UserRole.INVESTOR && investorIds.includes(u.id));
  res.json(investors);
});

// Post farm update (Admin/Manager assigned only)
app.post('/api/updates/farm/:id/new', requireAuth, upload.array('photos', 5), async (req, res) => {
  const user = (req as any).user as User;
  const farmId = req.params.id;
  const { title, body, updateType } = req.body;

  let targetInvestorIds: string[] = [];
  if (req.body.targetInvestorIds) {
    if (typeof req.body.targetInvestorIds === 'string') {
      try {
        targetInvestorIds = JSON.parse(req.body.targetInvestorIds);
      } catch (e) {
        targetInvestorIds = req.body.targetInvestorIds.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(req.body.targetInvestorIds)) {
      targetInvestorIds = req.body.targetInvestorIds;
    }
  }

  const farm = db.farms.find(f => f.id === farmId);
  if (!farm) {
    return res.status(404).json({ error: 'Farm not found' });
  }

  let authorized = false;
  if (user.role === UserRole.ADMIN) {
    authorized = true;
  } else if (user.role === UserRole.FARM_MANAGER) {
    authorized = db.assignments.some(
      a => a.managerId === user.id && a.farmId === farmId && a.isActive
    );
  }

  if (!authorized) {
    return res.status(403).json({ error: 'Not authorized to post updates for this farm' });
  }

  const uploadedFiles = (req.files as Express.Multer.File[]) || [];
  const updatePhotosList: any[] = [];
  const updateId = 'update-' + Date.now();

  const cld = getCloudinary();
  for (let i = 0; i < uploadedFiles.length; i++) {
    const file = uploadedFiles[i];
    let fileUrl = `/uploads/${file.filename}`;

    if (process.env.CLOUDINARY_URL) {
      try {
        const cldRes = await cld.uploader.upload(file.path, {
          folder: 'farm_estate_updates'
        });
        fileUrl = cldRes.secure_url;
        // Clean local temp file
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error('Cloudinary upload failure, using local route instead', e);
      }
    }

    updatePhotosList.push({
      id: `uphoto-${updateId}-${i}`,
      updateId,
      image: fileUrl,
      caption: req.body.captions?.[i] || ''
    });
  }

  const newUpdate: FarmUpdate = {
    id: updateId,
    farmId,
    postedBy: user.id,
    postedByName: user.name,
    title,
    body,
    updateType: (updateType as UpdateType) || UpdateType.GENERAL,
    targetInvestorIds,
    isPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    photos: updatePhotosList
  };

  db.updates.unshift(newUpdate);
  saveDb();

  // EMAIL TRIGGER 1: New farm update posted → email all investors who own plots in that farm (or selected target ones if personalized)
  const investorPlotsOnFarm = db.plots.filter(p => p.farmId === farmId);
  const investorIdsOnFarm = db.investorPlots
    .filter(ip => ip.isActive && investorPlotsOnFarm.some(p => p.id === ip.plotId))
    .map(ip => ip.investorId);
  
  const distinctInvestors = db.users.filter(u => u.role === UserRole.INVESTOR && investorIdsOnFarm.includes(u.id));

  let finalNotifiedInvestors = distinctInvestors;
  if (targetInvestorIds && targetInvestorIds.length > 0) {
    finalNotifiedInvestors = distinctInvestors.filter(u => targetInvestorIds.includes(u.id));
  }

  // Dispatch emails asynchronously
  finalNotifiedInvestors.forEach(investor => {
    dispatchEmail(
      investor.email,
      `New Update: ${farm.name} — ${newUpdate.title}`,
      `Hello ${investor.name},\n\nA new farm update has been posted:\nType: ${newUpdate.updateType}\nDate: ${new Date(newUpdate.createdAt).toLocaleDateString()}\n\nSummary:\n${newUpdate.body.substring(0, 200)}...\n\nPlease log in to the portal to view full photographs and records details.`,
      `<h3>New Update Released on ${farm.name}</h3>
       <p>Dear ${investor.name},</p>
       <p>A new estate chronicle has been added directly from the field:</p>
       <table style="padding: 10px; background-color: #F8F4EC; border-radius: 6px; width: 100%;">
         <tr><td><b>Update:</b></td><td>${newUpdate.title}</td></tr>
         <tr><td><b>Category:</b></td><td><span style="background-color:#52B788;color:white;padding:3px 6px;border-radius:4px;font-size:12px;">${newUpdate.updateType.toUpperCase()}</span></td></tr>
         <tr><td><b>Posted By:</b></td><td>${newUpdate.postedByName}</td></tr>
         <tr><td><b>Date:</b></td><td>${new Date(newUpdate.createdAt).toDateString()}</td></tr>
       </table>
       <p style="margin-top:20px; font-style: italic; border-left: 3px solid #1B4332; padding-left: 10px;">
         "${newUpdate.body.substring(0, 250)}..."
       </p>
       <p><a href="${process.env.APP_URL || 'https://ai.studio/build'}" style="background-color:#1B4332;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Access Investor Portal</a></p>`,
      'Farm Update',
      {
        senderId: user.id,
        recipientId: investor.id,
        farmId: farm.id,
        relatedType: 'update',
        relatedId: newUpdate.id
      }
    );
  });

  res.status(201).json(newUpdate);
});

// Upload farm Document (Admin/Manager assigned only)
app.post('/api/documents/farm/:id/upload', requireAuth, upload.single('file'), async (req, res) => {
  const user = (req as any).user as User;
  const farmId = req.params.id;
  const { title, category, visibility, description, plotId } = req.body;

  const farm = db.farms.find(f => f.id === farmId);
  if (!farm) {
    return res.status(404).json({ error: 'Farm not found' });
  }

  let authorized = false;
  if (user.role === UserRole.ADMIN) {
    authorized = true;
  } else if (user.role === UserRole.FARM_MANAGER) {
    authorized = db.assignments.some(
      a => a.managerId === user.id && a.farmId === farmId && a.isActive
    );
  }

  if (!authorized) {
    return res.status(403).json({ error: 'Not authorized to upload files for this farm' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Please attach a valid file' });
  }

  let fileUrl = `/uploads/${req.file.filename}`;
  const fileName = req.file.originalname;
  let storage: Document['storage'];
  const newDocId = 'doc-' + Date.now();

  const cld = getCloudinary();
  if (process.env.CLOUDINARY_URL) {
    try {
      // Stored as a *private* asset: only reachable through signed, expiring URLs
      const cldRes = await cld.uploader.upload(req.file.path, {
        folder: 'farm_estate_documents',
        resource_type: 'auto',
        type: 'private'
      });
      storage = { provider: 'cloudinary', publicId: cldRes.public_id, resourceType: cldRes.resource_type, format: cldRes.format, deliveryType: 'private' };
      fileUrl = `/api/documents/${newDocId}/download`;
      fs.unlinkSync(req.file.path);
    } catch (e) {
      console.error('Cloudinary document uploaded locally fallback', e);
    }
  }

  const newDoc: Document = {
    id: newDocId,
    storage,
    farmId,
    plotId: visibility === DocumentVisibility.PLOT ? plotId : undefined,
    uploadedBy: user.id,
    uploadedByName: user.name,
    title,
    fileUrl,
    fileName,
    category: (category as DocumentCategory) || DocumentCategory.OTHER,
    visibility: (visibility as DocumentVisibility) || DocumentVisibility.FARM,
    description: description || '',
    uploadedAt: new Date().toISOString()
  };

  db.documents.push(newDoc);
  saveDb();

  // EMAIL TRIGGER 2: New document uploaded → email affected investors
  let targetedInvestors: User[] = [];
  if (newDoc.visibility === DocumentVisibility.PLOT && newDoc.plotId) {
    const ownerships = db.investorPlots.filter(ip => ip.plotId === newDoc.plotId && ip.isActive);
    const investorIds = ownerships.map(ip => ip.investorId);
    targetedInvestors = db.users.filter(u => u.role === UserRole.INVESTOR && investorIds.includes(u.id));
  } else {
    // Farm-wide document: email all investors that hold plots on this farm
    const plotsInFarm = db.plots.filter(p => p.farmId === farmId);
    const plotIds = plotsInFarm.map(p => p.id);
    const farmInvestorsIds = db.investorPlots.filter(ip => ip.isActive && plotIds.includes(ip.plotId)).map(ip => ip.investorId);
    targetedInvestors = db.users.filter(u => u.role === UserRole.INVESTOR && farmInvestorsIds.includes(u.id));
  }

  targetedInvestors.forEach(investor => {
    dispatchEmail(
      investor.email,
      `New Document Available: ${newDoc.title}`,
      `Hello ${investor.name},\n\nA new document is available regarding your farmlands:\nTitle: ${newDoc.title}\nCategory: ${newDoc.category}\n\nPlease access the private client portal to download this file securely.`,
      `<h3>New Secure Document Published</h3>
       <p>Dear ${investor.name},</p>
       <p>A new secure regulatory or status document has been uploaded for your attention:</p>
       <table style="padding: 10px; background-color: #F8F4EC; border-radius: 6px; width: 100%;">
         <tr><td><b>Title:</b></td><td>${newDoc.title}</td></tr>
         <tr><td><b>Category:</b></td><td><span style="background-color:#1B4332;color:white;padding:3px 6px;border-radius:4px;font-size:12px;">${newDoc.category.toUpperCase()}</span></td></tr>
         <tr><td><b>File Name:</b></td><td>${newDoc.fileName}</td></tr>
         <tr><td><b>Estate:</b></td><td>${farm.name}</td></tr>
         ${newDoc.plotId ? `<tr><td><b>Target Plot:</b></td><td>${db.plots.find(p => p.id === newDoc.plotId)?.plotNumber || 'N/A'}</td></tr>` : ''}
       </table>
       <p>To safely access and download your document, please authenticately log in to the portal.</p>
       <p><a href="${process.env.APP_URL || 'https://ai.studio/build'}" style="background-color:#1B4332;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Log In & Download Securely</a></p>`,
      'Document Upload',
      {
        senderId: user.id,
        recipientId: investor.id,
        farmId: farm.id,
        relatedType: 'document',
        relatedId: newDoc.id
      }
    );
  });

  res.status(201).json(newDoc);
});

// Secure Document download check & serving
app.get('/api/documents/:id/download', requireAuthAllowCookie, (req, res) => {
  const user = (req as any).user as User;
  const docId = req.params.id;

  const doc = db.documents.find(d => d.id === docId);
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Access check
  const isAuthorized = canAccessDocument(user, doc);

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Forbidden — You do not have permission to download this secure document' });
  }

  // Mark related simulated emails as read/opened when downloaded by the investor
  if (user.role === UserRole.INVESTOR) {
    db.simulatedEmails.forEach(email => {
      if (
        email.to.toLowerCase() === user.email.toLowerCase() &&
        (email.relatedId === docId || (email.relatedType === 'document' && email.relatedId === docId))
      ) {
        email.isRead = true;
        email.readAt = new Date().toISOString();
      }
    });
    saveDb();
  }

  recordAudit(db, user, 'document.downloaded', { targetType: 'document', targetId: doc.id, req });
  saveDb();

  // Privately stored cloud file: redirect to a short-lived signed download URL
  if (doc.storage?.provider === 'cloudinary') {
    const cld = getCloudinary();
    const signedUrl = cld.utils.private_download_url(doc.storage.publicId, doc.storage.format || '', {
      resource_type: doc.storage.resourceType,
      type: doc.storage.deliveryType,
      expires_at: Math.floor(Date.now() / 1000) + 120,
      attachment: true
    } as any);
    return res.redirect(signedUrl);
  }

  // Legacy documents stored at a (public) cloud URL
  if (doc.fileUrl && /^https?:\/\//.test(doc.fileUrl)) {
    return res.redirect(doc.fileUrl);
  }

  // Handle serving the actual file or a mock file stream if they uploaded standard seeds
  if (doc.fileUrl && doc.fileUrl.startsWith('/uploads/')) {
    const filePath = path.join(process.cwd(), doc.fileUrl);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
      return res.sendFile(filePath);
    }
  }

  // Fallback stream for built-in or simulated documents
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
  res.send(Buffer.from(`%PDF-1.4\n%-- Adubiaro Secure Server Verification --\n1 0 obj\n<< /Title (${doc.title}) >>\nstream\nSecure investor portal document content.\nUploaded At: ${doc.uploadedAt}\nFile reference: ${doc.id}\nendstream\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<< /Root 1 0 R >>\n%%EOF`));
});

// Investor individual portfolio / financial payout summaries
app.get('/api/financials/my', requireAuth, (req, res) => {
  const user = (req as any).user as User;

  // STRICT RULEBoundary: Farm Manager cannot access financials AT ALL
  if (user.role === UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Farm managers are restricted from accessing financial dashboards.' });
  }

  if (user.role === UserRole.ADMIN) {
    // Admin sees everything
    const allPayouts = db.financials.map(fin => {
      const plot = db.plots.find(p => p.id === fin.plotId);
      const farm = plot ? db.farms.find(f => f.id === plot.farmId) : null;
      const ownerShip = db.investorPlots.find(ip => ip.plotId === fin.plotId && ip.isActive);
      const investorName = ownerShip ? (db.users.find(u => u.id === ownerShip.investorId)?.name || 'Unknown') : 'Unassigned';
      return {
        ...fin,
        plotNumber: plot?.plotNumber,
        cropType: plot?.cropType,
        farmName: farm?.name,
        investorName
      };
    });
    return res.json(allPayouts);
  }

  if (user.role === UserRole.INVESTOR) {
    // Investor sees only their owned plots' summaries
    const ownerships = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive);
    const ownedPlotIds = ownerships.map(ip => ip.plotId);
    
    const summaries = db.financials
      .filter(f => ownedPlotIds.includes(f.plotId))
      .map(fin => {
        const plot = db.plots.find(p => p.id === fin.plotId);
        const farm = plot ? db.farms.find(f => f.id === plot.farmId) : null;
        return {
          ...fin,
          plotNumber: plot?.plotNumber,
          cropType: plot?.cropType,
          farmName: farm?.name
        };
      });

    // Mark related simulated emails as read/opened
    let changed = false;
    db.simulatedEmails.forEach(email => {
      if (
        email.to.toLowerCase() === user.email.toLowerCase() &&
        email.relatedType === 'financial' &&
        !email.isRead
      ) {
        email.isRead = true;
        email.readAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) {
      saveDb();
    }

    return res.json(summaries);
  }

  res.json([]);
});

// Upload/Post Financial record (Admin only)
app.post('/api/financials/upload', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin credentials required to publish financials' });
  }

  const { plotId, period, year, roiPercentage, payoutAmount, payoutDate, notes, status } = req.body;

  const settings = getSettings();
  const fileRoi = parseFloat(roiPercentage || '0');
  if (fileRoi < settings.minimumPayoutRoi) {
    return res.status(400).json({ error: `Transaction rejected: Financial ROI of ${fileRoi}% is below the active System Minimum ROI limit (${settings.minimumPayoutRoi}%) established in Settings.` });
  }

  // Check unique together constraint [plotId + period + year]
  const alreadyExists = db.financials.some(
    fin => fin.plotId === plotId && fin.period === period && fin.year === parseInt(year)
  );

  if (alreadyExists) {
    return res.status(400).json({ error: `A financial record for Plot, Period ${period}, and Year ${year} already exists.` });
  }

  const newFin: FinancialSummary = {
    id: 'fin-' + Date.now(),
    plotId,
    uploadedBy: user.id,
    period,
    year: parseInt(year),
    roiPercentage: parseFloat(roiPercentage || '0'),
    payoutAmount: parseFloat(payoutAmount || '0'),
    payoutDate: payoutDate || new Date().toISOString().split('T')[0],
    status: (status as FinancialStatus) || FinancialStatus.PENDING,
    notes: notes || ''
  };

  db.financials.push(newFin);
  recordAudit(db, user, 'financial.published', { req });
  saveDb();

  // EMAIL TRIGGER 3: Financial record added → email the specific plot investor
  const plot = db.plots.find(p => p.id === plotId);
  const investorPlotSetting = db.investorPlots.find(ip => ip.plotId === plotId && ip.isActive);
  if (investorPlotSetting) {
    const investor = db.users.find(u => u.id === investorPlotSetting.investorId && u.role === UserRole.INVESTOR);
    if (investor) {
      dispatchEmail(
        investor.email,
        `Financial Summary Available: ${newFin.period} ${newFin.year} — Plot ${plot?.plotNumber}`,
        `Hello ${investor.name},\n\nA financial summary is now available with the following:\nAmount: ₦${newFin.payoutAmount}\nStatus: ${newFin.status}\nDue Date: ${newFin.payoutDate}\n\nPlease visit the portal to inspect detail metrics or log transaction records.`,
        `<h3>New Financial Payout Summary Ready</h3>
         <p>Dear ${investor.name},</p>
         <p>A payout ledger has been audited and compiled for your property:</p>
         <table style="padding: 10px; background-color: #F8F4EC; border-radius: 6px; width: 100%;">
           <tr><td><b>Plot:</b></td><td>${plot?.plotNumber || 'N/A'}</td></tr>
           <tr><td><b>Billing Period:</b></td><td>${newFin.period} ${newFin.year}</td></tr>
           <tr><td><b>Audited ROI:</b></td><td>${newFin.roiPercentage}%</td></tr>
           <tr><td><b>Net Payout:</b></td><td><b>₦${newFin.payoutAmount.toLocaleString()}</b></td></tr>
           <tr><td><b>Payment Status:</b></td><td><span style="background-color:${newFin.status === 'paid' ? '#52B788' : '#D4A017'};color:white;padding:3px 6px;border-radius:4px;font-size:12px;">${newFin.status.toUpperCase()}</span></td></tr>
           <tr><td><b>payout Scheduled Date:</b></td><td>${newFin.payoutDate}</td></tr>
         </table>
         <p>Log in using your secure dashboard credentials to request disbursement or review balance certificates.</p>
         <p><a href="${process.env.APP_URL || 'https://ai.studio/build'}" style="background-color:#1B4332;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Access Financial Dashboard</a></p>`,
        'Financial Addition',
        {
          senderId: user.id,
          recipientId: investor.id,
          farmId: plot?.farmId,
          relatedType: 'financial',
          relatedId: newFin.id
        }
      );
    }
  }

  res.status(201).json(newFin);
});

// Admin command: Manage user creation (Admin only)
app.post('/api/users/create', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Restricted to super administrators.' });
  }

  const { username, name, email, phone, role, password } = req.body;

  if (!username || !name || !email) {
    return res.status(400).json({ error: 'Username, name and email are required.' });
  }

  // Unique username validation
  const existingUser = db.users.find(u => u.username === username);
  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const providedPassword = typeof password === 'string' && password.trim() !== '' ? password.trim() : null;
  if (providedPassword) {
    const weakness = validatePasswordStrength(providedPassword);
    if (weakness) return res.status(400).json({ error: weakness });
  }
  // Temporary password: either the one the admin chose, or a random one
  const tempPassword = providedPassword || generateTempPassword();

  const newUserId = 'user-' + Date.now();
  const createdUser: User = {
    id: newUserId,
    username,
    name,
    email,
    phone,
    role: (role as UserRole) || UserRole.INVESTOR,
    password: hashPassword(tempPassword),
    mustChangePassword: true,
    tokenVersion: 0
  };

  db.users.push(createdUser);
  recordAudit(db, user, 'user.created', { req });
  saveDb();

  // Welcome email with login details (same template as bulk imports)
  sendWelcomeEmail(createdUser, tempPassword, user).catch(err => console.error('Welcome email failed:', err));

  // The temporary password is shown once to the admin (it is also emailed)
  res.status(201).json({ ...publicUser(createdUser), temporaryPassword: tempPassword });
});


interface ImportOptions {
  /** Validate and report only; nothing is saved and no emails are sent */
  dryRun?: boolean;
  /** Email login details to newly created accounts (default true) */
  sendWelcomeEmails?: boolean;
  /** Skip rows that exactly duplicate an earlier row */
  skipDuplicateRows?: boolean;
}

function sendWelcomeEmail(createdUser: User, tempPassword: string, sender: User) {
  return dispatchEmail(
    createdUser.email,
    'Welcome to Adubiaro Farm Estates Portal',
    `Hello ${createdUser.name},\n\nYour profile has been provisioned on Adubiaro Estates.\nUsername: ${createdUser.username}\nTemporary Password: ${tempPassword}\n\nPlease click the link to configure your dashboard securely.`,
    `<h3>Welcome to Adubiaro Estates Private Portal</h3>
     <p>Dear ${createdUser.name},</p>
     <p>An account has been set up for you on our private investor portal.</p>
     <table style="padding: 10px; background-color: #F8F4EC; border-radius: 6px; width: 100%;">
       <tr><td><b>Username:</b></td><td>${createdUser.username}</td></tr>
       <tr><td><b>Temporary Password:</b></td><td><code>${tempPassword}</code></td></tr>
       <tr><td><b>Email:</b></td><td>${createdUser.email}</td></tr>
     </table>
     <p>You will be asked to choose your own password when you first sign in.</p>
     <p><a href="${process.env.APP_URL || 'https://ai.studio/build'}" style="background-color:#1B4332;color:white;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Sign in</a></p>`,
    'Welcome Registration',
    {
      senderId: sender.id,
      recipientId: createdUser.id,
      relatedType: 'welcome',
      relatedId: createdUser.id,
      containsCredentials: true
    }
  );
}

function executeBulkInvestorImport(investors: any[], currentUser: User, options: ImportOptions = {}) {
  const dryRun = !!options.dryRun;
  const sendWelcomeEmails = options.sendWelcomeEmails !== false;
  const { rows, globalWarnings } = normalizeImportRows(
    investors,
    {
      existingUsers: db.users.map(u => ({ username: u.username, email: u.email, name: u.name })),
      existingFarms: db.farms.map(f => ({ id: f.id, name: f.name, location: f.location, state: f.state }))
    },
    { skipDuplicateRows: options.skipDuplicateRows }
  );

  // Plaintext temporary passwords for new accounts, kept only long enough to email them
  const tempPasswords = new Map<string, string>();
  const results = {
    dryRun,
    total: investors.length,
    successCount: 0,
    failCount: 0,
    skippedCount: 0,
    usersCreatedCount: 0,
    existingUsersMatchedCount: 0,
    farmsCreatedCount: 0,
    farmsCreated: [] as string[],
    plotsCreatedCount: 0,
    totalInvestment: 0,
    welcomeEmailsSent: 0,
    added: [] as any[],
    errors: [] as { row: number; username?: string; name?: string; error: string }[],
    warnings: [] as { row: number; name?: string; message: string }[],
    globalWarnings,
    rows: [] as Array<{ row: number; status: 'new_user' | 'existing_user' | 'skipped' | 'error'; name: string; email: string; username: string; farm: string; size: string; crop: string; amount: number }>
  };

  const isManager = currentUser.role === UserRole.FARM_MANAGER;
  const managedFarmIds = new Set(db.assignments.filter(a => a.managerId === currentUser.id && a.isActive).map(a => a.farmId));

  const usersToAdd: User[] = [];
  const plotsToAdd: FarmPlot[] = [];
  const investorPlotsToAdd: InvestorPlot[] = [];
  const farmsToAdd: Farm[] = [];
  const plotUpdates: Array<() => void> = [];
  const affectedFarmIds = new Set<string>();
  const matchedExisting = new Set<string>();
  const findFarm = (list: Farm[], r: NormalizedImportRow) =>
    list.find(f => (r.farmId && f.id === r.farmId) || farmKeyOf(f.name) === r.farmKey);

  for (const r of rows) {
    const rowNum = r.rowNum;
    r.warnings.forEach(message => results.warnings.push({ row: rowNum, name: r.name, message }));
    const sizeLabel = `${r.size} ${r.sizeUnit}${r.size === 1 ? '' : 's'}`;
    const report = (status: 'new_user' | 'existing_user' | 'skipped' | 'error') =>
      results.rows.push({ row: rowNum, status, name: r.name, email: r.email, username: r.username, farm: r.farmName, size: r.farmName ? sizeLabel : '', crop: r.farmName ? r.cropType : '', amount: r.investmentAmount });

    if (r.errors.length > 0) {
      results.failCount++;
      r.errors.forEach(error => results.errors.push({ row: rowNum, username: r.username || undefined, name: r.name || undefined, error }));
      report('error');
      continue;
    }
    if (r.skip) {
      results.skippedCount++;
      report('skipped');
      continue;
    }

    const hasAllocationData = Boolean(r.farmName || r.farmId) || Boolean(r.plotNumber) || r.investmentAmount > 0;

    // Resolve the farm (exact id or normalised name match only)
    let matchedFarm: Farm | undefined;
    if (r.farmName || r.farmId) {
      matchedFarm = findFarm(db.farms, r) || findFarm(farmsToAdd, r);
      if (isManager && (!matchedFarm || !managedFarmIds.has(matchedFarm.id))) {
        results.failCount++;
        results.errors.push({ row: rowNum, username: r.username, name: r.name, error: `Farm managers can only import investors into farms they manage ("${r.farmName}").` });
        report('error');
        continue;
      }
      if (!matchedFarm) {
        if (r.farmId && !r.farmName) {
          results.failCount++;
          results.errors.push({ row: rowNum, username: r.username, name: r.name, error: `Farm id "${r.farmId}" was not found.` });
          report('error');
          continue;
        }
        matchedFarm = {
          id: `farm-${Date.now()}-${rowNum}-${Math.random().toString(36).slice(2, 6)}`,
          name: r.farmName,
          location: r.farmLocation || 'Not specified',
          state: r.farmState || 'Not specified',
          totalPlots: 0,
          totalHectares: 0,
          description: r.farmDescription || '',
          coverImage: '/farm-placeholder.svg',
          dateEstablished: r.farmDateEstablished || new Date().toISOString().split('T')[0],
          isActive: true
        };
        farmsToAdd.push(matchedFarm);
        results.farmsCreatedCount++;
        results.farmsCreated.push(matchedFarm.name);
      }
    } else if (hasAllocationData) {
      results.failCount++;
      results.errors.push({ row: rowNum, username: r.username, name: r.name, error: 'A plot or amount was given without a farm name.' });
      report('error');
      continue;
    }

    // Find or create the investor account (matched by email, then username)
    let targetUser: User | undefined =
      usersToAdd.find(u => u.email.toLowerCase() === r.email) ||
      db.users.find(u => u.email.toLowerCase() === r.email) ||
      (!r.usernameGenerated ? usersToAdd.find(u => u.username.toLowerCase() === r.username.toLowerCase()) || db.users.find(u => u.username.toLowerCase() === r.username.toLowerCase()) : undefined);

    let isNewUser = false;
    if (targetUser) {
      if (targetUser.email.toLowerCase() !== r.email) {
        results.failCount++;
        results.errors.push({ row: rowNum, username: r.username, name: r.name, error: `Username "${r.username}" already belongs to a different email address.` });
        report('error');
        continue;
      }
      if (targetUser.privacy?.anonymisedAt) {
        results.failCount++;
        results.errors.push({ row: rowNum, username: r.username, name: r.name, error: 'This email belongs to an erased account.' });
        report('error');
        continue;
      }
      if (!hasAllocationData) {
        results.failCount++;
        results.errors.push({ row: rowNum, username: r.username, name: r.name, error: `A user with email "${r.email}" is already registered and the row has no holding to add.` });
        report('error');
        continue;
      }
      if (!usersToAdd.includes(targetUser) && !matchedExisting.has(targetUser.id)) {
        matchedExisting.add(targetUser.id);
        results.existingUsersMatchedCount++;
      }
    } else {
      const uidSuffix = `${Date.now()}-${rowNum}-${Math.random().toString(36).slice(2, 6)}`;
      const suppliedPassword = r.password ? String(r.password).trim() : '';
      const tempPassword = suppliedPassword && !validatePasswordStrength(suppliedPassword) ? suppliedPassword : generateTempPassword();
      tempPasswords.set(`user-${uidSuffix}`, tempPassword);
      targetUser = {
        id: `user-${uidSuffix}`,
        username: r.username,
        name: r.name,
        email: r.email,
        phone: r.phone,
        role: UserRole.INVESTOR,
        password: dryRun ? undefined : hashPassword(tempPassword),
        mustChangePassword: true,
        tokenVersion: 0,
        isActive: true
      };
      usersToAdd.push(targetUser);
      results.usersCreatedCount++;
      isNewUser = true;
    }

    if (matchedFarm) {
      let assignedPlotId: string | null = null;

      // Attach to an existing unowned plot with the same number in this farm
      if (r.plotNumber) {
        const existingUnownedPlot = db.plots.find(p =>
          p.farmId === matchedFarm!.id &&
          p.plotNumber.toLowerCase() === r.plotNumber.toLowerCase() &&
          !db.investorPlots.some(ip => ip.plotId === p.id && ip.isActive !== false) &&
          !investorPlotsToAdd.some(ip => ip.plotId === p.id)
        );
        if (existingUnownedPlot) {
          assignedPlotId = existingUnownedPlot.id;
          plotUpdates.push(() => {
            existingUnownedPlot.status = PlotStatus.ACTIVE;
            existingUnownedPlot.sizeHectares = r.size;
            existingUnownedPlot.sizeUnit = r.sizeUnit;
            existingUnownedPlot.cropType = r.cropType;
          });
        }
      }

      if (!assignedPlotId) {
        let pNum = r.plotNumber;
        if (!pNum) {
          const existingPlotsCount = db.plots.filter(p => p.farmId === matchedFarm!.id).length;
          const pendingCount = plotsToAdd.filter(p => p.farmId === matchedFarm!.id).length;
          pNum = `P-${matchedFarm.id.replace('farm-', '').slice(-4).toUpperCase()}-${existingPlotsCount + pendingCount + 1}`;
        }
        assignedPlotId = `plot-${Date.now()}-${rowNum}-${Math.random().toString(36).slice(2, 6)}`;
        plotsToAdd.push({
          id: assignedPlotId,
          farmId: matchedFarm.id,
          plotNumber: pNum,
          sizeHectares: r.size,
          sizeUnit: r.sizeUnit,
          cropType: r.cropType,
          status: PlotStatus.ACTIVE
        });
      }

      investorPlotsToAdd.push({
        id: `invplot-${Date.now()}-${rowNum}-${Math.random().toString(36).slice(2, 6)}`,
        investorId: targetUser.id,
        plotId: assignedPlotId,
        investmentAmount: r.investmentAmount,
        ownershipPercentage: r.ownershipPercentage,
        startDate: r.startDate || new Date().toISOString().split('T')[0],
        contractRef: r.contractRef ? String(r.contractRef).trim() : `CON-BLK-${Date.now().toString().slice(-5)}-${rowNum}`,
        isActive: true
      });
      affectedFarmIds.add(matchedFarm.id);
      results.plotsCreatedCount++;
      results.totalInvestment += r.investmentAmount;
    }

    results.successCount++;
    results.added.push({ id: targetUser.id, username: targetUser.username, name: targetUser.name, email: targetUser.email });
    report(isNewUser ? 'new_user' : 'existing_user');
  }

  if (dryRun) {
    return results;
  }

  // Persist changes if any succeeded
  if (usersToAdd.length > 0 || plotsToAdd.length > 0 || investorPlotsToAdd.length > 0 || farmsToAdd.length > 0) {
    db.farms.push(...farmsToAdd);
    db.users.push(...usersToAdd);
    plotUpdates.forEach(apply => apply());
    db.plots.push(...plotsToAdd);
    db.investorPlots.push(...investorPlotsToAdd);

    // Recompute estate totals for affected farms
    affectedFarmIds.forEach(fId => {
      const farm = db.farms.find(f => f.id === fId);
      if (farm) {
        const farmPlots = db.plots.filter(p => p.farmId === fId);
        farm.totalPlots = farmPlots.length;
        farm.totalHectares = Number(
          farmPlots.reduce((s, p) => s + (Number(p.sizeHectares) || 0), 0).toFixed(2)
        );
      }
    });

    recordAudit(db, currentUser, 'data.import_investors', {
      details: `users=${usersToAdd.length}; holdings=${investorPlotsToAdd.length}; farms=${farmsToAdd.length}; welcomeEmails=${sendWelcomeEmails}`
    });
    saveDb();

    if (sendWelcomeEmails) {
      for (const createdUser of usersToAdd) {
        sendWelcomeEmail(createdUser, tempPasswords.get(createdUser.id) || '(contact your administrator)', currentUser)
          .catch(err => console.error('Welcome email failed:', err));
        results.welcomeEmailsSent++;
      }
    }
  }

  return results;
}

// Admin command: Manage bulk user creation (Admin only)
app.post('/api/admin/users/bulk-upload', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Restricted to super administrators.' });
  }

  const { investors } = req.body;
  if (!Array.isArray(investors)) {
    return res.status(400).json({ error: 'Payload must contain an "investors" array.' });
  }

  const results = executeBulkInvestorImport(investors, currentUser, {
    dryRun: req.body.dryRun === true,
    sendWelcomeEmails: req.body.sendWelcomeEmails !== false,
    skipDuplicateRows: req.body.skipDuplicateRows === true
  });
  res.status(200).json(results);
});

// New endpoint for bulk-importing users, farm estates, and plot assignments from CSV/JSON parsing
app.post('/api/import/data', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Restricted to super administrators and managers.' });
  }

  let investors = req.body.investors || req.body.records || req.body.data;
  if (!investors && Array.isArray(req.body)) {
    investors = req.body;
  }

  if (!Array.isArray(investors)) {
    return res.status(400).json({ error: 'Payload must contain a list of records in "investors", "records", "data", or as a top-level array.' });
  }

  const results = executeBulkInvestorImport(investors, currentUser, {
    dryRun: req.body.dryRun === true,
    sendWelcomeEmails: req.body.sendWelcomeEmails !== false,
    skipDuplicateRows: req.body.skipDuplicateRows === true
  });
  res.status(200).json(results);
});

// Endpoint for exporting all user data, farm estates, and plot assignments as a unified structure
app.get('/api/export/data', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Restricted to super administrators and managers.' });
  }

  const exportData: any[] = [];

  // Data minimisation: managers may only export investors on farms they manage
  const managerScope = currentUser.role === UserRole.FARM_MANAGER ? investorIdsForManager(currentUser.id) : null;
  recordAudit(db, currentUser, 'data.export_investors', { details: managerScope ? `scope=manager:${managerScope.size}` : 'scope=all', req });
  saveDb();

  // Loop through all users
  db.users.forEach(u => {
    if (managerScope && !managerScope.has(u.id)) return;
    // Find all plots assigned to this user
    const matchedInvestorPlots = db.investorPlots.filter(ip => ip.investorId === u.id);

    if (matchedInvestorPlots.length === 0) {
      // Export user profile without plots
      exportData.push({
        username: u.username,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        password: '', // do not expose actual passwords for security
        role: u.role,
        farmEstate: '',
        farmLocation: '',
        farmState: '',
        farmDescription: '',
        farmDateEstablished: '',
        plotNumber: '',
        sizeHectares: '',
        sizeUnit: '',
        cropType: '',
        investmentAmount: ''
      });
    } else {
      // Create a row for each plot assignment
      matchedInvestorPlots.forEach(ip => {
        const plot = db.plots.find(p => p.id === ip.plotId);
        const farm = plot ? db.farms.find(f => f.id === plot.farmId) : undefined;

        exportData.push({
          username: u.username,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          password: '',
          role: u.role,
          farmEstate: farm ? farm.name : '',
          farmLocation: farm ? farm.location : '',
          farmState: farm ? farm.state : '',
          farmDescription: farm ? farm.description || '' : '',
          farmDateEstablished: farm ? farm.dateEstablished || '' : '',
          plotNumber: plot ? plot.plotNumber : '',
          sizeHectares: plot ? plot.sizeHectares : '',
          sizeUnit: plot ? plot.sizeUnit : '',
          cropType: plot ? plot.cropType : '',
          investmentAmount: ip.investmentAmount || ''
        });
      });
    }
  });

  res.status(200).json(exportData);
});

// Admin Route to list system users list
app.get('/api/admin/users', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }
  if (user.role === UserRole.FARM_MANAGER) {
    // Data minimisation: managers only see investors on farms they manage
    const allowed = investorIdsForManager(user.id);
    return res.json(db.users.filter(u => u.id === user.id || (u.role === UserRole.INVESTOR && allowed.has(u.id))));
  }
  res.json(db.users);
});

// Admin Route to retrieve full investor profile (farms, plots, amount invested, returns earned)
app.get('/api/admin/investors/:id/profile', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Administrator clearance required to view investor profiles.' });
  }

  const targetUser = db.users.find(u => u.id === req.params.id);
  if (!targetUser) {
    return res.status(404).json({ error: 'Investor profile not found' });
  }

  const { password: _password, ...safeInvestor } = targetUser as any;
  recordAudit(db, currentUser, 'user.profile_viewed', { targetType: 'user', targetId: targetUser.id, req });

  const investorHoldingsRaw = db.investorPlots.filter(ip => ip.investorId === targetUser.id);
  const ownedPlotIds = Array.from(new Set(investorHoldingsRaw.map(ip => ip.plotId)));

  const investorFinancials = db.financials
    .filter(fin => ownedPlotIds.includes(fin.plotId))
    .map(fin => {
      const plot = db.plots.find(p => p.id === fin.plotId);
      const farm = plot ? db.farms.find(f => f.id === plot.farmId) : null;
      return {
        ...fin,
        plotNumber: plot?.plotNumber || 'N/A',
        cropType: plot?.cropType || 'Unspecified',
        farmId: farm?.id || null,
        farmName: farm?.name || 'Unassigned Farm'
      };
    });

  const holdings = investorHoldingsRaw.map(ip => {
    const plot = db.plots.find(p => p.id === ip.plotId);
    const farm = plot ? db.farms.find(f => f.id === plot.farmId) : null;
    const plotFinancials = investorFinancials.filter(f => f.plotId === ip.plotId);
    const paidReturns = plotFinancials
      .filter(f => f.status === FinancialStatus.PAID)
      .reduce((sum, f) => sum + (f.payoutAmount || 0), 0);
    const pendingReturns = plotFinancials
      .filter(f => f.status !== FinancialStatus.PAID)
      .reduce((sum, f) => sum + (f.payoutAmount || 0), 0);

    return {
      ...ip,
      plotNumber: plot?.plotNumber || 'Unspecified',
      sizeHectares: plot?.sizeHectares || 0,
      sizeUnit: plot?.sizeUnit || 'acre',
      cropType: plot?.cropType || 'Unspecified',
      plotStatus: plot?.status || 'active',
      farmId: farm?.id || null,
      farmName: farm?.name || 'Unassigned Estate',
      farmLocation: farm?.location || '',
      farmState: farm?.state || '',
      farmCoverImage: farm?.coverImage || '',
      paidReturns,
      pendingReturns
    };
  });

  const farmMap = new Map<string, any>();
  holdings.forEach(h => {
    const key = h.farmId || 'unassigned';
    if (!farmMap.has(key)) {
      const farmObj = h.farmId ? db.farms.find(f => f.id === h.farmId) : null;
      farmMap.set(key, {
        id: farmObj?.id || null,
        name: farmObj?.name || h.farmName,
        location: farmObj?.location || '',
        state: farmObj?.state || '',
        coverImage: farmObj?.coverImage || '',
        description: farmObj?.description || '',
        dateEstablished: farmObj?.dateEstablished || '',
        isActive: farmObj?.isActive ?? true,
        plotsCount: 0,
        activePlotsCount: 0,
        totalInvested: 0,
        totalPaidReturns: 0,
        totalPendingReturns: 0,
        cropTypes: new Set<string>(),
        holdings: []
      });
    }
    const entry = farmMap.get(key);
    entry.plotsCount += 1;
    if (h.isActive !== false) {
      entry.activePlotsCount += 1;
      entry.totalInvested += h.investmentAmount || 0;
    }
    if (h.cropType) entry.cropTypes.add(h.cropType);
    entry.holdings.push(h);
  });

  investorFinancials.forEach(fin => {
    const key = fin.farmId || 'unassigned';
    const entry = farmMap.get(key);
    if (entry) {
      if (fin.status === FinancialStatus.PAID) {
        entry.totalPaidReturns += fin.payoutAmount || 0;
      } else {
        entry.totalPendingReturns += fin.payoutAmount || 0;
      }
    }
  });

  const farms = Array.from(farmMap.values()).map(f => ({
    ...f,
    cropTypes: Array.from(f.cropTypes)
  }));

  const activeHoldings = holdings.filter(h => h.isActive !== false);
  const totalInvested = activeHoldings.reduce((sum, h) => sum + (h.investmentAmount || 0), 0);
  const totalPaidReturns = investorFinancials
    .filter(f => f.status === FinancialStatus.PAID)
    .reduce((sum, f) => sum + (f.payoutAmount || 0), 0);
  const totalPendingReturns = investorFinancials
    .filter(f => f.status !== FinancialStatus.PAID)
    .reduce((sum, f) => sum + (f.payoutAmount || 0), 0);
  const totalReturnsAll = totalPaidReturns + totalPendingReturns;
  const averageRoiPercentage = investorFinancials.length > 0
    ? Number((investorFinancials.reduce((sum, f) => sum + (f.roiPercentage || 0), 0) / investorFinancials.length).toFixed(1))
    : 0;
  const cumulativeRoiOnCapital = totalInvested > 0
    ? Number(((totalPaidReturns / totalInvested) * 100).toFixed(1))
    : 0;

  res.json({
    investor: safeInvestor,
    summary: {
      totalFarms: farms.filter(f => f.id !== null).length,
      totalPlots: activeHoldings.length,
      totalInvested,
      totalPaidReturns,
      totalPendingReturns,
      totalReturnsAll,
      averageRoiPercentage,
      cumulativeRoiOnCapital
    },
    farms,
    holdings,
    financials: investorFinancials
  });
});

// Admin Route to toggle active status of a user
app.post('/api/admin/users/:id/toggle-active', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }

  const targetUserId = req.params.id;
  if (targetUserId === currentUser.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }

  const targetUser = db.users.find(u => u.id === targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!canManageUser(currentUser, targetUser)) {
    return res.status(403).json({ error: 'Farm managers can only activate or deactivate investor accounts.' });
  }

  // Toggle active
  targetUser.isActive = targetUser.isActive === false ? true : false;
  recordAudit(db, currentUser, 'user.active_toggled', { req, targetType: 'user', targetId: req.params.id });
  saveDb();

  res.json({ success: true, user: publicUser(targetUser) });
});

// Admin Route to update a user's details
app.post('/api/admin/users/:id/update', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }

  const targetUserId = req.params.id;
  const targetUser = db.users.find(u => u.id === targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!canManageUser(currentUser, targetUser)) {
    return res.status(403).json({ error: 'Farm managers can only edit investor accounts.' });
  }

  const { name, email, phone, username, role, isActive, password } = req.body;

  if (role && currentUser.role !== UserRole.ADMIN && role !== UserRole.INVESTOR) {
    return res.status(403).json({ error: 'Only administrators can assign staff roles.' });
  }
  if (targetUser.id === currentUser.id && role && role !== currentUser.role) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }
  if (targetUser.id === currentUser.id && isActive === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }
  const newPassword = typeof password === 'string' ? password.trim() : '';
  if (newPassword) {
    const weakness = validatePasswordStrength(newPassword);
    if (weakness) return res.status(400).json({ error: weakness });
  }

  if (username && username !== targetUser.username) {
    const existingUser = db.users.find(u => u.username === username);
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    targetUser.username = username;
  }

  if (name) targetUser.name = name;
  if (email) targetUser.email = email;
  if (phone) targetUser.phone = phone;
  if (role) targetUser.role = role as UserRole;
  if (typeof isActive === 'boolean') targetUser.isActive = isActive;
  // A password set by someone else is temporary: the user must change it at next sign-in.
  if (newPassword) setUserPassword(targetUser, newPassword, targetUser.id !== currentUser.id);

  recordAudit(db, currentUser, 'user.updated', { req, targetType: 'user', targetId: req.params.id });
  saveDb();
  res.json({ success: true, user: publicUser(targetUser) });
});

// Admin Route to perform bulk actions on users
app.post('/api/admin/users/bulk-action', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }

  const { userIds, action, value } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'No user IDs selected.' });
  }

  if (!action) {
    return res.status(400).json({ error: 'No action selected.' });
  }

  let updatedCount = 0;
  const previousStates: Array<{ id: string; role: UserRole; isActive: boolean }> = [];

  // Email fresh temporary login details (e.g. after an import done without welcome emails)
  if (action === 'send-login-details') {
    if (currentUser.role !== UserRole.ADMIN) {
      return res.status(403).json({ error: 'Only administrators can send login details.' });
    }
    let sent = 0;
    for (const id of userIds) {
      const target = db.users.find(u => u.id === id);
      if (!target || target.id === currentUser.id || target.isActive === false || target.privacy?.anonymisedAt) continue;
      const tempPassword = generateTempPassword();
      setUserPassword(target, tempPassword, true);
      sendWelcomeEmail(target, tempPassword, currentUser).catch(err => console.error('Login details email failed:', err));
      sent++;
    }
    recordAudit(db, currentUser, 'user.login_details_sent', { details: `count=${sent}`, req });
    saveDb();
    return res.json({ success: true, count: sent, previousStates: [] });
  }

  if (action === 'update-role' && currentUser.role !== UserRole.ADMIN && value !== UserRole.INVESTOR) {
    return res.status(403).json({ error: 'Only administrators can assign staff roles.' });
  }
  if (action === 'update-role' && !Object.values(UserRole).includes(value)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  userIds.forEach(id => {
    const targetUser = db.users.find(u => u.id === id);
    if (targetUser && canManageUser(currentUser, targetUser)) {
      // Record original state in case we want to undo
      const originalState = {
        id: targetUser.id,
        role: targetUser.role,
        isActive: targetUser.isActive !== false
      };

      let changed = false;

      if (action === 'update-role') {
        if (targetUser.id === currentUser.id && value !== currentUser.role) {
          return; // Prevent self-demotion
        }
        if (targetUser.role !== value) {
          targetUser.role = value as UserRole;
          changed = true;
        }
      } else if (action === 'disable-account') {
        if (targetUser.id === currentUser.id) {
          return; // Prevent disabling self
        }
        if (targetUser.isActive !== false) {
          targetUser.isActive = false;
          changed = true;
        }
      } else if (action === 'enable-account') {
        if (targetUser.isActive === false) {
          targetUser.isActive = true;
          changed = true;
        }
      }

      if (changed) {
        previousStates.push(originalState);
        updatedCount++;
      }
    }
  });

  if (updatedCount > 0) {
    recordAudit(db, currentUser, 'user.bulk_action', { req });
    saveDb();
  }

  res.json({ success: true, count: updatedCount, previousStates });
});

// Admin Route to bulk-undo previous user states
app.post('/api/admin/users/bulk-undo', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }

  const { previousStates } = req.body;
  if (!Array.isArray(previousStates) || previousStates.length === 0) {
    return res.status(400).json({ error: 'No previous states supplied for undo.' });
  }

  let undoneCount = 0;
  previousStates.forEach(state => {
    const targetUser = db.users.find(u => u.id === state?.id);
    if (!targetUser || !canManageUser(currentUser, targetUser)) return;
    if (!Object.values(UserRole).includes(state.role)) return;
    if (currentUser.role !== UserRole.ADMIN && state.role !== UserRole.INVESTOR) return;
    if (targetUser.id === currentUser.id && (state.role !== currentUser.role || state.isActive === false)) return;
    {
      targetUser.role = state.role;
      targetUser.isActive = state.isActive !== false;
      undoneCount++;
    }
  });

  if (undoneCount > 0) {
    recordAudit(db, currentUser, 'user.bulk_undo', { req });
    saveDb();
  }

  res.json({ success: true, count: undoneCount });
});

// Admin Route to message a user directly
app.post('/api/admin/users/:id/message', requireAuth, upload.single('attachment'), async (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }

  const targetUserId = req.params.id;
  const targetUser = db.users.find(u => u.id === targetUserId);
  if (!targetUser || targetUser.privacy?.anonymisedAt) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (currentUser.role === UserRole.FARM_MANAGER && targetUser.id !== currentUser.id && !investorIdsForManager(currentUser.id).has(targetUser.id)) {
    return res.status(403).json({ error: 'Farm managers can only message investors on farms they manage.' });
  }

  const { subject, body } = req.body;
  if (!subject || !body) {
    return res.status(400).json({ error: 'Subject and body are required.' });
  }

  let fileUrl = '';
  let fileName = '';
  let fileType = '';

  if (req.file) {
    const file = req.file;
    fileName = file.originalname;
    fileUrl = `/uploads/${file.filename}`;
    fileType = file.mimetype.startsWith('video/') ? 'video' : 'image';

    if (process.env.CLOUDINARY_URL) {
      try {
        const cld = getCloudinary();
        const cldRes = await cld.uploader.upload(file.path, {
          folder: 'direct_messages',
          resource_type: 'auto'
        });
        fileUrl = cldRes.secure_url;
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error('Cloudinary message upload failure, using local route instead', e);
      }
    }
  }

  let mediaHtml = '';
  if (fileUrl) {
    if (fileType === 'image') {
      mediaHtml = `
        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
          <p style="font-size: 12px; color: #555; margin-bottom: 8px;"><b>Attached Image:</b> ${fileName}</p>
          <img src="${fileUrl}" style="max-width: 100%; border-radius: 8px; border: 1px solid #ddd;" alt="${fileName}" />
          <p style="font-size: 11px; margin-top: 5px;"><a href="${fileUrl}" target="_blank" style="color: #1B4332; text-decoration: underline;">View Full Image</a></p>
        </div>
      `;
    } else {
      mediaHtml = `
        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
          <p style="font-size: 12px; color: #555; margin-bottom: 8px;"><b>Attached Video:</b> ${fileName}</p>
          <div style="padding: 12px; background-color: #f9f9f9; border-radius: 8px; border: 1px solid #eee;">
            <a href="${fileUrl}" target="_blank" style="color: #1B4332; font-weight: bold; text-decoration: underline;">▶ Play Attached Video</a>
          </div>
        </div>
      `;
    }
  }

  const textBody = fileUrl ? `${body}\n\n[Attachment: ${fileName} - ${fileUrl}]` : body;

  try {
    await dispatchEmail(
      targetUser.email,
      subject,
      textBody,
      `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
        <h3 style="color: #1B4332; margin-top: 0;">Message from ${currentUser.name} (${currentUser.role === UserRole.ADMIN ? 'Administrator' : 'Farm Manager'})</h3>
        <p>${escapeHtml(String(body)).replace(/\n/g, '<br/>')}</p>
        ${mediaHtml}
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 11px; color: #888;">This email is dispatched from Adubiaro Farm Estates Private Portal.</p>
      </div>`,
      'Direct Communication',
      {
        senderId: currentUser.id,
        recipientId: targetUser.id,
        relatedType: 'welcome',
        relatedId: targetUser.id,
        attachmentUrl: fileUrl || undefined,
        attachmentName: fileName || undefined,
        attachmentType: fileType || undefined
      }
    );
    recordAudit(db, currentUser, 'message.sent_to_user', { targetType: 'user', targetId: targetUser.id, req });
    saveDb();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to dispatch email' });
  }
});

// Admin Route to broadcast message/attachment to multiple investors in one action
app.post('/api/admin/broadcast', requireAuth, upload.single('attachment'), async (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }

  const { recipientIds, subject, body } = req.body;
  // Promotional (marketing) messages only go to users who opted in
  const isMarketing = req.body.isMarketing === true || req.body.isMarketing === 'true';
  if (!recipientIds) {
    return res.status(400).json({ error: 'Recipient IDs are required.' });
  }
  if (!subject || !body) {
    return res.status(400).json({ error: 'Subject and body are required.' });
  }

  const ids = recipientIds.split(',').map((id: string) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return res.status(400).json({ error: 'At least one valid recipient must be selected.' });
  }

  let fileUrl = '';
  let fileName = '';
  let fileType = '';

  if (req.file) {
    const file = req.file;
    fileName = file.originalname;
    fileUrl = `/uploads/${file.filename}`;
    fileType = file.mimetype.startsWith('video/') ? 'video' : 'image';

    if (process.env.CLOUDINARY_URL) {
      try {
        const cld = getCloudinary();
        const cldRes = await cld.uploader.upload(file.path, {
          folder: 'broadcast_messages',
          resource_type: 'auto'
        });
        fileUrl = cldRes.secure_url;
        fs.unlinkSync(file.path);
      } catch (e) {
        console.error('Cloudinary broadcast upload failure, using local route instead', e);
      }
    }
  }

  let mediaHtml = '';
  if (fileUrl) {
    if (fileType === 'image') {
      mediaHtml = `
        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
          <p style="font-size: 12px; color: #555; margin-bottom: 8px;"><b>Attached Image:</b> ${fileName}</p>
          <img src="${fileUrl}" style="max-width: 100%; border-radius: 8px; border: 1px solid #ddd;" alt="${fileName}" />
          <p style="font-size: 11px; margin-top: 5px;"><a href="${fileUrl}" target="_blank" style="color: #1B4332; text-decoration: underline;">View Full Image</a></p>
        </div>
      `;
    } else {
      mediaHtml = `
        <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
          <p style="font-size: 12px; color: #555; margin-bottom: 8px;"><b>Attached Video:</b> ${fileName}</p>
          <div style="padding: 12px; background-color: #f9f9f9; border-radius: 8px; border: 1px solid #eee;">
            <a href="${fileUrl}" target="_blank" style="color: #1B4332; font-weight: bold; text-decoration: underline;">▶ Play Attached Video</a>
          </div>
        </div>
      `;
    }
  }

  const textBody = fileUrl ? `${body}\n\n[Attachment: ${fileName} - ${fileUrl}]` : body;
  const htmlBody = `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px;">
    <h3 style="color: #1B4332; margin-top: 0;">Broadcast Message from ${currentUser.name} (${currentUser.role === UserRole.ADMIN ? 'Administrator' : 'Farm Manager'})</h3>
    <p>${escapeHtml(String(body)).replace(/\n/g, '<br/>')}</p>
    ${mediaHtml}
    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
    <p style="font-size: 11px; color: #888;">This email is dispatched from Adubiaro Farm Estates Private Portal.${isMarketing ? ' You receive promotional messages because you opted in. You can withdraw consent at any time under Privacy &amp; Data in the portal.' : ''}</p>
  </div>`;

  let sentCount = 0;
  let skippedNoConsent = 0;
  const managerScope = currentUser.role === UserRole.FARM_MANAGER ? investorIdsForManager(currentUser.id) : null;
  for (const id of ids) {
    const targetUser = db.users.find(u => u.id === id);
    if (!targetUser || targetUser.privacy?.anonymisedAt) continue;
    // Managers may only message investors on farms they manage
    if (managerScope && !managerScope.has(targetUser.id)) continue;
    // Promotional messages require opt-in consent (NDPA / GDPR / e-privacy rules)
    if (isMarketing && !targetUser.privacy?.marketingConsent) {
      skippedNoConsent++;
      continue;
    }

    try {
      await dispatchEmail(
        targetUser.email,
        subject,
        textBody,
        htmlBody,
        'Broadcast Communication',
        {
          senderId: currentUser.id,
          recipientId: targetUser.id,
          relatedType: 'welcome',
          relatedId: targetUser.id,
          attachmentUrl: fileUrl || undefined,
          attachmentName: fileName || undefined,
          attachmentType: fileType || undefined
        }
      );
      sentCount++;
    } catch (err) {
      console.error(`Failed to send broadcast email to ${targetUser.email}:`, err);
    }
  }

  recordAudit(db, currentUser, 'message.broadcast', { details: `sent=${sentCount}; marketing=${isMarketing}; skippedNoConsent=${skippedNoConsent}`, req });
  saveDb();
  res.json({ success: true, count: sentCount, skippedNoConsent });
});

// Admin Route to delete a user
app.delete('/api/admin/users/:id', requireAuth, (req, res) => {
  const currentUser = (req as any).user as User;
  if (currentUser.role !== UserRole.ADMIN && currentUser.role !== UserRole.FARM_MANAGER) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }

  const targetUserId = req.params.id;
  if (targetUserId === currentUser.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  const userIndex = db.users.findIndex(u => u.id === targetUserId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const deletedUser = db.users[userIndex];
  if (!canManageUser(currentUser, deletedUser)) {
    return res.status(403).json({ error: 'Farm managers can only delete investor accounts.' });
  }
  db.users.splice(userIndex, 1);
  recordAudit(db, currentUser, 'user.deleted', { req, targetType: 'user', targetId: req.params.id });
  saveDb();

  res.json({ success: true, deletedUser: publicUser(deletedUser) });
});

// Admin route to manage plots, link to farms, assign plots to investors
app.post('/api/admin/plots/create', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { farmId, plotNumber, sizeHectares, sizeUnit, cropType, InvestorId, investmentAmount } = req.body;

  const farm = db.farms.find(f => f.id === farmId);
  if (!farm) {
    return res.status(404).json({ error: 'Farm not found' });
  }

  const plotId = 'plot-' + Date.now();
  const newPlot: FarmPlot = {
    id: plotId,
    farmId,
    plotNumber,
    sizeHectares: parseFloat(sizeHectares || '1.0'),
    sizeUnit: sizeUnit || 'acre',
    cropType: cropType || 'Oil Palm',
    status: PlotStatus.ACTIVE
  };

  db.plots.push(newPlot);

  if (InvestorId) {
    const invPlot: InvestorPlot = {
      id: 'invplot-' + Date.now(),
      investorId: InvestorId,
      plotId,
      investmentAmount: parseFloat(investmentAmount || '20000'),
      ownershipPercentage: 100,
      startDate: new Date().toISOString().split('T')[0],
      contractRef: 'CON-' + Date.now().toString().substring(7),
      isActive: true
    };
    db.investorPlots.push(invPlot);
  }

  // Update total plots dynamically
  farm.totalPlots = db.plots.filter(p => p.farmId === farmId).length;
  farm.totalHectares = db.plots.filter(p => p.farmId === farmId).reduce((s, p) => s + p.sizeHectares, 0);

  saveDb();
  res.status(201).json({ plot: newPlot });
});

// Admin route to create a farm estate
app.post('/api/admin/farms/create', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, location, state, coverImage, description, dateEstablished, isActive } = req.body;

  if (!name || !location || !state) {
    return res.status(400).json({ error: 'Name, location and state are required.' });
  }

  const farmId = 'farm-' + Date.now();
  const newFarm: Farm = {
    id: farmId,
    name,
    location,
    state,
    totalPlots: 0,
    totalHectares: 0,
    description: description || '',
    coverImage: coverImage || 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=800',
    dateEstablished: dateEstablished || new Date().toISOString().split('T')[0],
    isActive: isActive !== undefined ? Boolean(isActive) : true
  };

  db.farms.push(newFarm);
  saveDb();
  res.status(201).json(newFarm);
});

// Admin route to update an existing farm estate
app.post('/api/admin/farms/:id/update', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const farmId = req.params.id;
  const farm = db.farms.find(f => f.id === farmId);
  if (!farm) {
    return res.status(404).json({ error: 'Farm estate not found' });
  }

  const { name, location, state, coverImage, description, dateEstablished, isActive } = req.body;

  if (name !== undefined) farm.name = name;
  if (location !== undefined) farm.location = location;
  if (state !== undefined) farm.state = state;
  if (coverImage !== undefined) farm.coverImage = coverImage;
  if (description !== undefined) farm.description = description;
  if (dateEstablished !== undefined) farm.dateEstablished = dateEstablished;
  if (isActive !== undefined) farm.isActive = Boolean(isActive);

  // Re-calculate total plots and total hectares
  farm.totalPlots = db.plots.filter(p => p.farmId === farmId).length;
  farm.totalHectares = db.plots.filter(p => p.farmId === farmId).reduce((s, p) => s + p.sizeHectares, 0);

  saveDb();
  res.json(farm);
});

// Admin route to assign farm manager mapping
app.post('/api/admin/assignments/create', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { managerId, farmId } = req.body;
  
  const alreadyAssigned = db.assignments.find(a => a.managerId === managerId && a.farmId === farmId && a.isActive);
  if (alreadyAssigned) {
    return res.status(400).json({ error: 'Manager is already assigned to this farm.' });
  }

  const newAssign: FarmManagerAssignment = {
    id: 'assign-' + Date.now(),
    managerId,
    farmId,
    assignedDate: new Date().toISOString().split('T')[0],
    isActive: true
  };

  db.assignments.push(newAssign);
  saveDb();
  res.json(newAssign);
});

// Admin route to send a test email to verify credentials
app.post('/api/admin/email/test', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const {
    emailServiceType,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    smtpFrom,
    brevoApiKey,
    brevoSenderEmail,
    brevoSenderName,
    testRecipient
  } = req.body;

  if (!testRecipient) {
    return res.status(400).json({ error: 'Test recipient email is required.' });
  }

  const storedSettings = getSettings();
  const actualSmtpPass = smtpPass === '__SECURE_PLACEHOLDER__' ? (storedSettings.smtpPass || '') : (smtpPass || '');
  const actualBrevoApiKey = brevoApiKey === '__SECURE_PLACEHOLDER__' ? (storedSettings.brevoApiKey || '') : (brevoApiKey || '');

  const subject = 'Adubiaro Farm Portal — Email Integration Test Successful!';
  const textBody = 'Hello! This is a test email from your Adubiaro Farm Portal admin dashboard to verify that your email integration settings are configured correctly. If you received this, everything is working perfectly!';
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <h2 style="color: #1B4332; margin-top: 0;">🎉 Email Setup Successful!</h2>
      <p>Dear Administrator,</p>
      <p>This is an automated test email dispatched from your <strong>Adubiaro Farm Portal Control Center</strong>.</p>
      <div style="background-color: #f4fbf7; border-left: 4px solid #2D6A4F; padding: 15px; margin: 15px 0; border-radius: 4px;">
        <strong>Configuration Verified:</strong><br/>
        • <strong>Selected Method:</strong> ${String(emailServiceType).toUpperCase()}<br/>
        • <strong>Sender Address:</strong> ${emailServiceType === 'smtp' ? (smtpFrom || 'noreply@adubiaro.com') : `${brevoSenderName || 'Adubiaro Farms'} &lt;${brevoSenderEmail || 'noreply@adubiaro.com'}&gt;`}<br/>
        • <strong>Verified At:</strong> ${new Date().toLocaleString()}
      </div>
      <p>Your portal notifications, investor welcome alerts, password settings, and payout alerts will now route seamlessly through this active profile!</p>
      <p style="font-size: 11px; color: #888; margin-top: 25px; border-top: 1px solid #eee; padding-top: 10px;">
        Sent from Adubiaro Farm Estate Portal Super Admin panel.
      </p>
    </div>
  `;

  // Initialize test log object early
  const testSim: SimulatedEmail = {
    id: 'test-email-' + Date.now().toString(),
    to: testRecipient,
    subject,
    body: textBody,
    htmlBody,
    sentAt: new Date().toISOString(),
    category: 'System Integration Test',
    deliveryStatus: 'simulated'
  };

  try {
    if (emailServiceType === 'smtp') {
      if (!smtpHost) throw new Error('SMTP Host is required');
      await sendSmtpEmail({
        host: smtpHost,
        port: parseInt(smtpPort || '587'),
        secure: smtpSecure !== false,
        user: smtpUser || '',
        pass: actualSmtpPass,
        from: smtpFrom || 'Adubiaro Farms <noreply@adubiaro.com>',
        to: testRecipient,
        subject,
        text: textBody,
        html: htmlBody
      });
      testSim.deliveryStatus = 'delivered';
    } else if (emailServiceType === 'brevo') {
      if (!actualBrevoApiKey) throw new Error('Brevo API Key is required');
      await sendBrevoEmail({
        apiKey: actualBrevoApiKey,
        senderName: brevoSenderName || 'Adubiaro Farms',
        senderEmail: brevoSenderEmail || 'noreply@adubiaro.com',
        to: testRecipient,
        subject,
        text: textBody,
        html: htmlBody
      });
      testSim.deliveryStatus = 'delivered';
    } else {
      console.log(`📧 Test Email simulation to ${testRecipient}`);
      testSim.deliveryStatus = 'simulated';
    }

    // Record and save successful test in the outbox
    db.simulatedEmails.unshift(testSim);
    saveDb();

    res.json({ success: true, message: `Test email successfully routed and sent to ${testRecipient}!` });
  } catch (err: any) {
    console.error('❌ Test email send error:', err);
    let errorMsg = err.message || 'Unknown error occurred during test send.';
    if (
      err.code === 'ETIMEDOUT' ||
      errorMsg.toLowerCase().includes('timeout') ||
      errorMsg.toLowerCase().includes('connect')
    ) {
      errorMsg = `SMTP Connection Timeout/Failed: "${errorMsg}". Note: Cloud containers (e.g. Cloud Run) block standard outbound SMTP ports (25, 465, 587) by default to prevent spam. We highly recommend switching your 'Integration Channel Method' to 'Brevo SMTP Third-Party API' which communicates securely over standard HTTPS (port 443) and is fully supported in this cloud sandbox environment!`;
    }

    // Record the failure in simulated outbox logs so that administrators can review details
    testSim.deliveryStatus = 'failed';
    testSim.deliveryError = errorMsg;
    db.simulatedEmails.unshift(testSim);
    saveDb();

    res.status(500).json({ error: errorMsg });
  }
});

// Route to get list of emails sent (simulated outbox logs with precise role-based access)
app.get('/api/emails/outbox', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (user.role === UserRole.ADMIN) {
    // Super Admin can see all messages/emails
    return res.json(db.simulatedEmails);
  }

  if (user.role === UserRole.FARM_MANAGER) {
    // Farm Managers should see only messages/emails they shared with their attached investors
    const managedFarmIds = db.assignments
      .filter(a => a.managerId === user.id && a.isActive)
      .map(a => a.farmId);
    
    const managedPlotIds = db.plots
      .filter(p => managedFarmIds.includes(p.farmId))
      .map(p => p.id);
    
    const managedInvestorPlots = db.investorPlots
      .filter(ip => ip.isActive && managedPlotIds.includes(ip.plotId));
    
    const attachedInvestorIds = [...new Set(managedInvestorPlots.map(ip => ip.investorId))];
    
    const attachedInvestorEmails = db.users
      .filter(u => attachedInvestorIds.includes(u.id) && u.role === UserRole.INVESTOR)
      .map(u => u.email.toLowerCase());

    const filtered = db.simulatedEmails.filter(email => {
      const toLower = (email.to || '').toLowerCase();
      return (
        attachedInvestorEmails.includes(toLower) ||
        email.senderId === user.id ||
        (email.farmId && managedFarmIds.includes(email.farmId))
      );
    });
    return res.json(filtered);
  }

  if (user.role === UserRole.INVESTOR) {
    // Simulated Outbox should only show messages meant for the particular user alone
    const filtered = db.simulatedEmails.filter(email => {
      return (email.to || '').toLowerCase() === user.email.toLowerCase();
    });
    return res.json(filtered);
  }

  res.json([]);
});

// Endpoint to manually mark a simulated email as read/viewed by an investor
app.post('/api/emails/:id/mark-read', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  const { id } = req.params;
  const email = db.simulatedEmails.find(e => e.id === id);
  if (!email) {
    return res.status(404).json({ error: 'Email not found' });
  }

  if (user.role === UserRole.INVESTOR && email.to.toLowerCase() !== user.email.toLowerCase()) {
    return res.status(403).json({ error: 'Access denied to read receipt confirmation' });
  }

  email.isRead = true;
  email.readAt = new Date().toISOString();
  saveDb();
  res.json({ success: true, email });
});

// Route to get user-specific alerts/notifications
app.get('/api/notifications', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const settings = getSettings();
  if (!settings.enableNotifications) {
    return res.json([]);
  }

  const notifications: any[] = [];

  // 1. Gather investor plots/farms if needed
  const myInvestorPlots = db.investorPlots.filter(ip => ip.investorId === user.id && ip.isActive);
  const myPlotIds = myInvestorPlots.map(ip => ip.plotId);
  const myInvestorFarmsList = db.plots.filter(p => myPlotIds.includes(p.id));
  const myInvestorFarmIds = [...new Set(myInvestorFarmsList.map(p => p.farmId))];

  // 2. Gather manager farms if needed
  const myAssignments = db.assignments.filter(a => a.managerId === user.id && a.isActive);
  const myManagedFarmIds = myAssignments.map(a => a.farmId);

  // Gather ROI Payouts
  if (user.role === UserRole.ADMIN) {
    db.financials.forEach(fin => {
      const plot = db.plots.find(p => p.id === fin.plotId);
      const farm = plot ? db.farms.find(f => f.id === plot.farmId) : null;
      notifications.push({
        id: `roi-${fin.id}`,
        type: 'roi_payout',
        title: 'ROI Payout Published',
        message: `A payout of ₦${fin.payoutAmount.toLocaleString()} (${fin.roiPercentage}% ROI) for Plot #${plot?.plotNumber || 'N/A'} has been published.`,
        date: fin.payoutDate || new Date().toISOString(),
        relatedId: fin.id,
        meta: {
          farmId: farm?.id || '',
          farmName: farm?.name || 'N/A',
          plotNumber: plot?.plotNumber || 'N/A',
          roiPercentage: fin.roiPercentage,
          payoutAmount: fin.payoutAmount,
          period: fin.period,
          year: fin.year,
          status: fin.status
        }
      });
    });
  } else if (user.role === UserRole.INVESTOR) {
    // Only where the investor owns the plot
    const investorFinancials = db.financials.filter(fin => myPlotIds.includes(fin.plotId));
    investorFinancials.forEach(fin => {
      const plot = db.plots.find(p => p.id === fin.plotId);
      const farm = plot ? db.farms.find(f => f.id === plot.farmId) : null;
      notifications.push({
        id: `roi-${fin.id}`,
        type: 'roi_payout',
        title: 'ROI Payout Received',
        message: `Your plot #${plot?.plotNumber || 'N/A'} of crop "${plot?.cropType || 'N/A'}" received a payout of ₦${fin.payoutAmount.toLocaleString()} (${fin.roiPercentage}% ROI) for ${fin.period} ${fin.year}.`,
        date: fin.payoutDate || new Date().toISOString(),
        relatedId: fin.id,
        meta: {
          farmId: farm?.id || '',
          farmName: farm?.name || 'N/A',
          plotNumber: plot?.plotNumber || 'N/A',
          roiPercentage: fin.roiPercentage,
          payoutAmount: fin.payoutAmount,
          period: fin.period,
          year: fin.year,
          status: fin.status
        }
      });
    });
  } // FARM_MANAGER gets 0 ROI payout notifications.

  // Gather Farm Updates
  db.updates.filter(u => u.isPublished).forEach(u => {
    let visible = false;
    if (user.role === UserRole.ADMIN) {
      visible = true;
    } else if (user.role === UserRole.FARM_MANAGER) {
      visible = myManagedFarmIds.includes(u.farmId);
    } else if (user.role === UserRole.INVESTOR) {
      const isMyFarm = myInvestorFarmIds.includes(u.farmId);
      const isTargeted = !u.targetInvestorIds || u.targetInvestorIds.length === 0 || u.targetInvestorIds.includes(user.id);
      visible = isMyFarm && isTargeted;
    }

    if (visible) {
      const farm = db.farms.find(f => f.id === u.farmId);
      notifications.push({
        id: `update-${u.id}`,
        type: 'farm_update',
        title: u.title,
        message: `New farm update under category "${u.updateType}" has been posted in ${farm?.name || 'Farm'}.`,
        date: u.createdAt || new Date().toISOString(),
        relatedId: u.id,
        meta: {
          farmId: u.farmId,
          farmName: farm?.name || 'N/A',
          body: u.body,
          updateType: u.updateType,
          postedByName: u.postedByName
        }
      });
    }
  });

  // Gather Documents
  db.documents.forEach(d => {
    let visible = false;
    if (user.role === UserRole.ADMIN) {
      visible = true;
    } else if (user.role === UserRole.FARM_MANAGER) {
      // Must not be sensitive financial doc, and must build on their assigned farm
      visible = myManagedFarmIds.includes(d.farmId) && d.category !== DocumentCategory.FINANCIAL;
    } else if (user.role === UserRole.INVESTOR) {
      const isMyFarm = myInvestorFarmIds.includes(d.farmId);
      // Farm visibility level OR plot visibility matching their owned plot id
      const isDocVisible = d.visibility === DocumentVisibility.FARM || (d.plotId && myPlotIds.includes(d.plotId));
      visible = isMyFarm && isDocVisible;
    }

    if (visible) {
      const farm = db.farms.find(f => f.id === d.farmId);
      notifications.push({
        id: `doc-${d.id}`,
        type: 'document_upload',
        title: `Document Uploaded: ${d.title}`,
        message: `A new ${d.category} document ("${d.fileName}") was added to ${farm?.name || 'Farm'}.`,
        date: d.uploadedAt || new Date().toISOString(),
        relatedId: d.id,
        meta: {
          farmId: d.farmId,
          farmName: farm?.name || 'N/A',
          category: d.category,
          fileName: d.fileName,
          description: d.description,
          fileUrl: `/api/documents/${d.id}/download`
        }
      });
    }
  });

  // Gather direct messages/emails sent to the user
  const directEmails = db.simulatedEmails.filter(email => {
    const isRecipient = email.recipientId === user.id || (email.to && email.to.toLowerCase() === user.email.toLowerCase());
    const isDuplicate = email.relatedType === 'update' || email.relatedType === 'document' || email.relatedType === 'financial';
    return isRecipient && !isDuplicate;
  });

  directEmails.forEach(email => {
    const sender = db.users.find(u => u.id === email.senderId);
    const senderName = sender ? sender.name : (email.senderId ? 'Administrator' : 'System');
    notifications.push({
      id: `email-${email.id}`,
      type: 'message_received',
      title: email.subject || 'New Message Received',
      message: email.body ? (email.body.length > 150 ? email.body.substring(0, 150) + '...' : email.body) : 'You have received a new message/mail.',
      date: email.sentAt || new Date().toISOString(),
      relatedId: email.id,
      meta: {
        senderId: email.senderId,
        senderName,
        subject: email.subject,
        body: email.body,
        attachmentUrl: email.attachmentUrl,
        attachmentName: email.attachmentName,
        attachmentType: email.attachmentType,
        category: email.category
      }
    });
  });

  // Sort by date descending
  notifications.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json(notifications);
});

// Reset command (simulates seed_demo)
app.post('/api/admin/reset-db', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin authentication required.' });
  }
  if (usePostgres) {
    await resetPostgresDb();
  }
  const complianceRecords = { auditLogs: db.auditLogs, dataRequests: db.dataRequests, breachIncidents: db.breachIncidents };
  db = getInitialDb();
  // Keep the admin performing the reset so they are not locked out
  db.users = [user];
  // Data-protection records must survive resets
  Object.assign(db, complianceRecords);
  recordAudit(db, user, 'system.database_reset', { req });
  migrateUserCredentials();
  saveDb();
  res.json({ message: 'Database successfully restored to original seed demo values.' });
});

// Clean Slate command (Wipe demo data, transition to live/production)
app.post('/api/admin/clean-slate', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin authentication required.' });
  }

  try {
    if (usePostgres) {
      await clearAllButAdminPostgres();
    }

    // Filter memory db state
    db.users = db.users.filter(u => u.role === UserRole.ADMIN);
    db.farms = [];
    db.plots = [];
    db.investorPlots = [];
    db.assignments = [];
    db.updates = [];
    db.documents = [];
    db.financials = [];
    db.simulatedEmails = [];

    recordAudit(db, user, 'system.clean_slate', { req });
    saveDb();
    res.json({ message: 'Database successfully migrated to clean slate. Ready for live production data!' });
  } catch (err: any) {
    console.error('❌ Failed to transition database to clean slate:', err);
    res.status(500).json({ error: 'Could not perform clean slate operations.' });
  }
});

// SYSTEM BACKUPS AND MAINTENANCE MANAGER
interface BackupLog {
  id: string;
  timestamp: string;
  backupType: 'scheduled' | 'manual';
  fileName: string;
  fileSize: string;
  status: 'success' | 'failed';
}

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_LOGS_FILE = path.join(DATA_DIR, 'backup_logs.json');

function getInitialBackupLogs(): BackupLog[] {
  const logs: BackupLog[] = [];
  const baseTime = new Date('2026-06-18T00:00:00-07:00');
  for (let i = 0; i < 5; i++) {
    const historicalTime = new Date(baseTime.getTime() - i * 24 * 60 * 60 * 1000);
    historicalTime.setHours(2, 15, 0, 0);
    
    logs.push({
      id: `bk-${historicalTime.getTime()}`,
      timestamp: historicalTime.toISOString(),
      backupType: 'scheduled',
      fileName: `db-backup-${historicalTime.getTime()}.json`,
      fileSize: '12.4 KB',
      status: 'success'
    });
  }
  return logs;
}

function loadBackupLogs(): BackupLog[] {
  if (!fs.existsSync(BACKUPS_DIR)) {
    try {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    } catch (e) {
      console.error('Failed to create backups directory:', e);
    }
  }
  if (fs.existsSync(BACKUP_LOGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BACKUP_LOGS_FILE, 'utf8'));
    } catch {
      const initial = getInitialBackupLogs();
      try {
        fs.writeFileSync(BACKUP_LOGS_FILE, JSON.stringify(initial, null, 2));
      } catch (e) {
        console.error('Failed to write default backup logs:', e);
      }
      return initial;
    }
  } else {
    const initial = getInitialBackupLogs();
    try {
      fs.writeFileSync(BACKUP_LOGS_FILE, JSON.stringify(initial, null, 2));
    } catch (e) {
      console.error('Failed to write default backup logs:', e);
    }
    return initial;
  }
}

function saveBackupLogs(logs: BackupLog[]) {
  try {
    fs.writeFileSync(BACKUP_LOGS_FILE, JSON.stringify(logs, null, 2));
  } catch (e) {
    console.error('Failed to write backup logs:', e);
  }
}

app.get('/api/admin/backups', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const logs = loadBackupLogs();
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  res.json(logs);
});

app.post('/api/admin/backups/create', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const logs = loadBackupLogs();
    const timestamp = new Date().toISOString();
    const id = `bk-${Date.now()}`;
    const fileName = `db-backup-${Date.now()}.json`;
    const filePath = path.join(BACKUPS_DIR, fileName);

    // Save actual snapshot copy of db as raw json
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2));

    let fileSizeInKB = '12.0 KB';
    try {
      const stats = fs.statSync(filePath);
      fileSizeInKB = (stats.size / 1024).toFixed(2) + ' KB';
    } catch (e) {
      console.error('Failed to read backup file stats:', e);
    }

    const newLog: BackupLog = {
      id,
      timestamp,
      backupType: 'manual',
      fileName,
      fileSize: fileSizeInKB,
      status: 'success'
    };

    logs.unshift(newLog);
    saveBackupLogs(logs);

    res.json({
      message: 'Active database snapshot archived successfully.',
      backup: newLog,
      logs
    });
  } catch (err: any) {
    console.error('❌ Manual backup creation error:', err);
    res.status(500).json({ error: 'System backup engine failed.' });
  }
});

app.get('/api/admin/db-status', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  let dbHost = 'N/A';
  let dbPort = '5432';
  let dbName = 'N/A';
  if (isPostgresConfigured() && process.env.DATABASE_URL) {
    try {
      const parseUrl = new URL(process.env.DATABASE_URL);
      dbHost = parseUrl.hostname;
      dbPort = parseUrl.port || '5432';
      dbName = parseUrl.pathname.replace(/^\//, '');
    } catch {
      const match = process.env.DATABASE_URL.match(/@([^:\/]+)(?::(\d+))?\/([^?]+)/);
      if (match) {
        dbHost = match[1];
        dbPort = match[2] || '5432';
        dbName = match[3];
      }
    }
  }

  res.json({
    usePostgres,
    postgresError,
    dbHost,
    dbPort,
    dbName,
    configured: isPostgresConfigured(),
    firebase: {
      initialized: !!firestoreDb,
      configSource: process.env.FIREBASE_CONFIG ? 'env_json' : (process.env.FIREBASE_API_KEY ? 'env_vars' : (fs.existsSync(path.join(process.cwd(), 'firebase-applet-config.json')) ? 'config_file' : 'none')),
      projectId: firebaseConfig?.projectId || null,
      databaseId: firebaseConfig?.firestoreDatabaseId || '(default)',
      diagnosticResult: firebaseDiagnosticResult
    }
  });
});

app.get('/api/admin/settings', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const settings = getSettings();
  const maskedSettings = {
    ...settings,
    smtpPass: settings.smtpPass ? '__SECURE_PLACEHOLDER__' : '',
    brevoApiKey: settings.brevoApiKey ? '__SECURE_PLACEHOLDER__' : ''
  };
  res.json(maskedSettings);
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const currentSettings = getSettings();
  const newSettings = req.body;

  if (newSettings.databaseMode !== undefined) currentSettings.databaseMode = newSettings.databaseMode;
  if (newSettings.simulatedLatency !== undefined) currentSettings.simulatedLatency = parseInt(newSettings.simulatedLatency !== null ? newSettings.simulatedLatency : '0');
  if (newSettings.enableNotifications !== undefined) currentSettings.enableNotifications = Boolean(newSettings.enableNotifications);
  if (newSettings.enableEmailSimulation !== undefined) currentSettings.enableEmailSimulation = Boolean(newSettings.enableEmailSimulation);
  if (newSettings.minimumPayoutRoi !== undefined) currentSettings.minimumPayoutRoi = parseFloat(newSettings.minimumPayoutRoi !== null ? newSettings.minimumPayoutRoi : '0');
  if (newSettings.allowedCrops !== undefined) currentSettings.allowedCrops = Array.isArray(newSettings.allowedCrops) ? newSettings.allowedCrops : currentSettings.allowedCrops;
  if (newSettings.portalName !== undefined) currentSettings.portalName = newSettings.portalName;
  if (newSettings.logoText !== undefined) currentSettings.logoText = newSettings.logoText;
  if (newSettings.accentColor !== undefined) currentSettings.accentColor = newSettings.accentColor;
  if (newSettings.announcementBanner !== undefined) currentSettings.announcementBanner = newSettings.announcementBanner;
  if (newSettings.bannerType !== undefined) currentSettings.bannerType = newSettings.bannerType;
  if (newSettings.emailServiceType !== undefined) currentSettings.emailServiceType = newSettings.emailServiceType;
  if (newSettings.smtpHost !== undefined) currentSettings.smtpHost = newSettings.smtpHost;
  if (newSettings.smtpPort !== undefined) currentSettings.smtpPort = parseInt(newSettings.smtpPort !== null ? newSettings.smtpPort : '587');
  if (newSettings.smtpSecure !== undefined) currentSettings.smtpSecure = Boolean(newSettings.smtpSecure);
  if (newSettings.smtpUser !== undefined) currentSettings.smtpUser = newSettings.smtpUser;
  if (newSettings.smtpPass !== undefined) {
    if (newSettings.smtpPass !== '__SECURE_PLACEHOLDER__' && newSettings.smtpPass !== '') {
      currentSettings.smtpPass = newSettings.smtpPass;
    } else if (newSettings.smtpPass === '') {
      currentSettings.smtpPass = '';
    }
  }
  if (newSettings.smtpFrom !== undefined) currentSettings.smtpFrom = newSettings.smtpFrom;
  if (newSettings.brevoApiKey !== undefined) {
    if (newSettings.brevoApiKey !== '__SECURE_PLACEHOLDER__' && newSettings.brevoApiKey !== '') {
      currentSettings.brevoApiKey = newSettings.brevoApiKey;
    } else if (newSettings.brevoApiKey === '') {
      currentSettings.brevoApiKey = '';
    }
  }
  if (newSettings.brevoSenderEmail !== undefined) currentSettings.brevoSenderEmail = newSettings.brevoSenderEmail;
  if (newSettings.brevoSenderName !== undefined) currentSettings.brevoSenderName = newSettings.brevoSenderName;

  // React to database mode shift on the fly
  if (currentSettings.databaseMode === 'local_json') {
    usePostgres = false;
  } else if (currentSettings.databaseMode === 'postgres_forced' || currentSettings.databaseMode === 'auto') {
    if (!usePostgres && isPostgresConfigured()) {
      initPostgres().catch(err => console.error('Failed to rebuild Postgres connection during settings shift:', err));
    }
  }

  recordAudit(db, user, 'system.settings_updated', { req });
  saveDb();
  const responseSettings = {
    ...currentSettings,
    smtpPass: currentSettings.smtpPass ? '__SECURE_PLACEHOLDER__' : '',
    brevoApiKey: currentSettings.brevoApiKey ? '__SECURE_PLACEHOLDER__' : ''
  };
  res.json(responseSettings);
});

app.get('/api/admin/database/export', requireAuth, (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  recordAudit(db, user, 'system.database_exported', { req });
  saveDb();

  // Create export payload
  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    db: db
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=adubiaro-db-export-${Date.now()}.json`);
  res.send(JSON.stringify(payload, null, 2));
});

app.post('/api/admin/database/import', requireAuth, async (req, res) => {
  const user = (req as any).user as User;
  if (user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const { db: importedDb } = req.body;

    if (!importedDb) {
      return res.status(400).json({ error: 'Invalid payload structure: missing "db" block.' });
    }

    // Basic structure validation to prevent corrupted uploads
    const requiredKeys = ['users', 'settings', 'farms', 'plots', 'investors', 'payouts', 'alerts', 'financials'];
    const missingKeys = requiredKeys.filter(key => !importedDb[key] || (!Array.isArray(importedDb[key]) && key !== 'settings'));
    
    if (missingKeys.length > 0) {
      return res.status(400).json({ error: `Import failed: database validation failed. Missing keys: ${missingKeys.join(', ')}` });
    }

    // Replace in-memory database
    // Keep the current data-protection records (merged with any in the backup)
    const mergeById = <T extends { id: string }>(a: T[] = [], b: T[] = []) => {
      const map = new Map<string, T>();
      [...b, ...a].forEach(item => item && item.id && map.set(item.id, item));
      return Array.from(map.values());
    };
    importedDb.auditLogs = mergeById(db.auditLogs, importedDb.auditLogs).sort((x: any, y: any) => String(y.at).localeCompare(String(x.at)));
    importedDb.dataRequests = mergeById(db.dataRequests, importedDb.dataRequests);
    importedDb.breachIncidents = mergeById(db.breachIncidents, importedDb.breachIncidents);
    db = importedDb;
    migrateUserCredentials();

    // Persist immediately across active channels
    recordAudit(db, user, 'system.database_imported', { req });
    saveDb();

    // Log the import backup event
    const logs = loadBackupLogs();
    const timestamp = new Date().toISOString();
    const id = `bk-import-${Date.now()}`;
    const fileName = `db-import-restore-${Date.now()}.json`;
    const filePath = path.join(BACKUPS_DIR, fileName);

    // Save as local backup log copy
    try {
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(db, null, 2));
    } catch (e) {
      console.error('Failed to write copy of imported database:', e);
    }

    const newLog: BackupLog = {
      id,
      timestamp,
      backupType: 'manual',
      fileName,
      fileSize: (JSON.stringify(db).length / 1024).toFixed(2) + ' KB',
      status: 'success'
    };

    logs.unshift(newLog);
    saveBackupLogs(logs);

    res.json({
      success: true,
      message: 'System database state fully restored and synchronized successfully!',
      timestamp
    });
  } catch (err: any) {
    console.error('❌ Database state import error:', err);
    res.status(500).json({ error: `Failed to restore database state: ${err.message || 'Unknown error'}` });
  }
});

app.get('/api/portal/settings', (req, res) => {
  const settings = getSettings();
  res.json({
    portalName: settings.portalName,
    logoText: settings.logoText,
    accentColor: settings.accentColor,
    announcementBanner: settings.announcementBanner,
    bannerType: settings.bannerType,
    allowedCrops: settings.allowedCrops
  });
});

// INTEGRATE VITE NODE DEV SERVER MIDDLEWARE
async function startServer() {
  initAuthSecret(DATA_DIR);
  await initFirestore();
  await initPostgres();

  // Automatically clear out any pre-seeded demo data on startup to enforce clean state
  console.log('🧹 Checking and removing any pre-seeded demo data on startup...');
  let dataRemoved = false;

  if (db.users && db.users.some(u => ['user-manager1', 'user-investor1', 'user-investor2'].includes(u.id))) {
    db.users = db.users.filter(u => !['user-manager1', 'user-investor1', 'user-investor2'].includes(u.id));
    dataRemoved = true;
  }
  if (db.farms && db.farms.some(f => f.id === 'farm-01')) {
    db.farms = db.farms.filter(f => f.id !== 'farm-01');
    dataRemoved = true;
  }
  if (db.plots && db.plots.some(p => ['plot-01', 'plot-02', 'plot-03'].includes(p.id))) {
    db.plots = db.plots.filter(p => !['plot-01', 'plot-02', 'plot-03'].includes(p.id));
    dataRemoved = true;
  }
  if (db.investorPlots && db.investorPlots.some(ip => ['invplot-01', 'invplot-02', 'invplot-03'].includes(ip.id))) {
    db.investorPlots = db.investorPlots.filter(ip => !['invplot-01', 'invplot-02', 'invplot-03'].includes(ip.id));
    dataRemoved = true;
  }
  if (db.assignments && db.assignments.some(a => a.id === 'assign-01')) {
    db.assignments = db.assignments.filter(a => a.id !== 'assign-01');
    dataRemoved = true;
  }
  if (db.updates && db.updates.some(up => ['update-01', 'update-02', 'update-03'].includes(up.id))) {
    db.updates = db.updates.filter(up => !['update-01', 'update-02', 'update-03'].includes(up.id));
    dataRemoved = true;
  }
  if (db.documents && db.documents.some(d => ['doc-01', 'doc-02'].includes(d.id))) {
    db.documents = db.documents.filter(d => !['doc-01', 'doc-02'].includes(d.id));
    dataRemoved = true;
  }
  if (db.financials && db.financials.some(fin => ['fin-01', 'fin-02', 'fin-03'].includes(fin.id))) {
    db.financials = db.financials.filter(fin => !['fin-01', 'fin-02', 'fin-03'].includes(fin.id));
    dataRemoved = true;
  }
  if (db.simulatedEmails && db.simulatedEmails.some(em => em.id === 'email-01')) {
    db.simulatedEmails = db.simulatedEmails.filter(em => em.id !== 'email-01');
    dataRemoved = true;
  }

  if (dataRemoved) {
    console.log('🧹 Demo data records detected. Purging from database and saving clean slate...');
  } else {
    console.log('✨ No pre-seeded demo data records found on startup.');
  }

  // Storage limitation: purge records older than the configured retention periods
  const retention = runRetention(db, getSettings());
  if (retention.emailsRemoved || retention.auditRemoved) {
    console.log(`🗑️ Retention purge removed ${retention.emailsRemoved} email log entries and ${retention.auditRemoved} audit entries.`);
    dataRemoved = true;
  }
  setInterval(() => {
    const result = runRetention(db, getSettings());
    if (result.emailsRemoved || result.auditRemoved) {
      recordAudit(db, null, 'privacy.retention_run', { details: `emails=${result.emailsRemoved}; audit=${result.auditRemoved}` });
      saveDb();
    }
  }, 24 * 60 * 60 * 1000).unref();

  // Hash legacy plaintext passwords and make sure an admin can sign in
  const credentialsChanged = migrateUserCredentials();
  if (dataRemoved || credentialsChanged) {
    saveDb();
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production Assets serving
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Portal backend running at http://localhost:${PORT}`);
  });
}

startServer();
