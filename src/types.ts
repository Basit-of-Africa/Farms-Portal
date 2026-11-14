/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = 'admin',
  FARM_MANAGER = 'farm_manager',
  INVESTOR = 'investor'
}

export enum PlotStatus {
  AVAILABLE = 'available',
  ACTIVE = 'active',
  HARVESTING = 'harvesting',
  DORMANT = 'dormant'
}

export enum UpdateType {
  GENERAL = 'general',
  PLANTING = 'planting',
  GROWTH = 'growth',
  HARVEST = 'harvest',
  MAINTENANCE = 'maintenance',
  WEATHER = 'weather',
  PEST = 'pest',
  MILESTONE = 'milestone'
}

export enum DocumentCategory {
  CONTRACT = 'contract',
  CERTIFICATE = 'certificate',
  REPORT = 'report',
  FINANCIAL = 'financial',
  LEGAL = 'legal',
  OTHER = 'other'
}

export enum DocumentVisibility {
  FARM = 'farm',
  PLOT = 'plot'
}

export enum FinancialStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PARTIAL = 'partial',
  OVERDUE = 'overdue'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  phone: string;
  profilePhoto?: string;
  email: string;
  name: string;
  /** scrypt hash on the server; never sent to the client */
  password?: string;
  isActive?: boolean;
  /** Set when the user signs in with a temporary password and must choose a new one */
  mustChangePassword?: boolean;
  /** Server-side session version; bumping it revokes all issued tokens */
  tokenVersion?: number;
  /** Privacy notice acknowledgement and consent records */
  privacy?: UserPrivacy;
}

export interface UserPrivacy {
  /** Version of the privacy notice the user last acknowledged */
  noticeVersion?: string;
  noticeAcknowledgedAt?: string;
  /** Opt-in consent to marketing / promotional messages (never pre-ticked) */
  marketingConsent?: boolean;
  marketingConsentAt?: string;
  /** Set when the account's personal data was erased (anonymised) */
  anonymisedAt?: string;
}

export interface Farm {
  id: string;
  name: string;
  location: string;
  state: string;
  totalPlots: number;
  totalHectares: number;
  description: string;
  coverImage?: string;
  dateEstablished: string;
  isActive: boolean;
  investorCount?: number;
  totalInvestmentReceived?: number;
  myPlotsCount?: number;
  myTotalInvested?: number;
  myPaidReturns?: number;
}

export interface FarmPlot {
  id: string;
  farmId: string;
  plotNumber: string;
  sizeHectares: number;
  sizeUnit?: string;
  cropType: string;
  status: PlotStatus;
}

export interface FarmMapNote {
  id: string;
  farmId: string;
  x: number; // percentage coordinate
  y: number; // percentage coordinate
  note: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
}

export interface InvestorPlot {
  id: string;
  investorId: string;
  plotId: string;
  investmentAmount: number;
  ownershipPercentage: number;
  startDate: string;
  contractRef: string;
  isActive: boolean;
}

export interface FarmManagerAssignment {
  id: string;
  managerId: string;
  farmId: string;
  assignedDate: string;
  isActive: boolean;
}

export interface UpdatePhoto {
  id: string;
  updateId: string;
  image: string; // Base64 or URL
  caption: string;
}

export interface FarmUpdateComment {
  id: string;
  updateId: string;
  parentId: string | null;
  userId: string;
  userName: string;
  userRole: string;
  content: string;
  createdAt: string;
}

export interface FarmUpdate {
  id: string;
  farmId: string;
  postedBy: string; // User ID
  postedByName: string; // User display name
  title: string;
  body: string;
  updateType: UpdateType;
  targetInvestorIds?: string[]; // 1 or more specific investors for personalized updates
  isPublished: boolean;
  createdAt: string;
  updatedAt?: string;
  photos: UpdatePhoto[];
  comments?: FarmUpdateComment[];
}

export interface Document {
  id: string;
  farmId: string;
  plotId?: string; // Null if visible to all farm investors
  uploadedBy: string; // User ID
  uploadedByName: string;
  title: string;
  fileUrl: string; // Can be Cloudinary URL or local data URL
  fileName: string;
  category: DocumentCategory;
  visibility: DocumentVisibility;
  description: string;
  uploadedAt: string;
  /** Private cloud storage reference (files are never exposed via a public URL) */
  storage?: { provider: 'cloudinary'; publicId: string; resourceType: string; format?: string; deliveryType: string };
}

export interface FinancialSummary {
  id: string;
  plotId: string; // plot FK
  uploadedBy: string; // Admin User ID
  period: string; // Q1, Q2, Q3, Q4, annual
  year: number;
  roiPercentage: number;
  payoutAmount: number;
  payoutDate: string;
  status: FinancialStatus;
  notes: string;
}

export interface SimulatedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  htmlBody: string;
  sentAt: string;
  category: string;
  deliveryStatus?: 'simulated' | 'delivered' | 'failed';
  deliveryError?: string;
  senderId?: string;
  recipientId?: string;
  farmId?: string;
  relatedType?: 'update' | 'document' | 'financial' | 'welcome';
  relatedId?: string;
  isRead?: boolean;
  readAt?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  /** Message contained a credential; real deliveries store a redacted copy */
  containsCredentials?: boolean;
}

export interface SystemSettings {
  databaseMode: 'auto' | 'local_json' | 'postgres_forced';
  simulatedLatency: number;
  enableNotifications: boolean;
  enableEmailSimulation: boolean;
  minimumPayoutRoi: number;
  allowedCrops: string[];
  portalName: string;
  logoText: string;
  accentColor: string;
  announcementBanner: string;
  bannerType: 'info' | 'warning' | 'success' | 'none';
  emailServiceType?: 'simulation' | 'smtp' | 'brevo';
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  brevoApiKey?: string;
  brevoSenderEmail?: string;
  brevoSenderName?: string;
  privacy?: PrivacySettings;
}

/** Data-protection configuration (NDPA 2023 / GAID 2025, GDPR and similar laws). */
export interface PrivacySettings {
  controllerName: string;
  controllerAddress: string;
  controllerEmail: string;
  dpoName: string;
  dpoEmail: string;
  dpoPhone: string;
  /** Bump to require every user to re-acknowledge the notice */
  noticeVersion: string;
  noticeLastUpdated: string;
  /** Where data is hosted / transferred, shown in the notice */
  hostingDescription: string;
  /** Extra organisation-specific text appended to the notice */
  additionalNoticeText: string;
  /** Days to answer a data subject request */
  dsrResponseDays: number;
  /** Retention periods */
  retentionEmailLogDays: number;
  retentionAuditLogDays: number;
  retentionFinancialRecordsYears: number;
}

export interface AuditLogEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  /** Non-identifying context only (ids, counts) - never names, emails or phone numbers */
  details?: string;
  ip?: string;
}

export type DataSubjectRequestType =
  | 'access'
  | 'rectification'
  | 'erasure'
  | 'restriction'
  | 'objection'
  | 'portability'
  | 'withdraw_consent'
  | 'other';

export interface DataSubjectRequest {
  id: string;
  userId: string;
  type: DataSubjectRequestType;
  details: string;
  status: 'open' | 'in_progress' | 'completed' | 'rejected';
  createdAt: string;
  dueAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface BreachIncident {
  id: string;
  title: string;
  description: string;
  /** When the organisation became aware of the breach (starts the 72-hour clock) */
  detectedAt: string;
  reportedBy: string;
  dataCategories: string;
  estimatedAffected: number;
  likelyHighRisk: boolean;
  containmentActions: string;
  regulatorNotifiedAt?: string;
  subjectsNotifiedAt?: string;
  status: 'open' | 'contained' | 'closed';
  createdAt: string;
  updatedAt: string;
}
