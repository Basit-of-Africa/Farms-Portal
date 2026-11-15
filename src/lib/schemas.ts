/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Validation rules shared by the browser forms (react-hook-form) and the
 * Express API, so both always agree on what is valid.
 */

import { z } from 'zod';

export const passwordSchema = z
  .string({ required_error: 'Enter a password.' })
  .min(8, 'Password must be at least 8 characters long.')
  .max(128, 'Password must be at most 128 characters long.')
  .refine(pw => /[A-Za-z]/.test(pw) && /[0-9]/.test(pw), 'Password must contain at least one letter and one number.');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Repeat the new password.')
  })
  .refine(v => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'The new passwords do not match.' })
  .refine(v => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'New password must be different from the current password.' });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.')
});
export type LoginInput = z.infer<typeof loginSchema>;

export const emailSchema = z.string().trim().max(100).email('Please enter a valid email address.');

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your full name.').max(100, 'Name is too long.'),
  email: emailSchema,
  phone: z.string().trim().max(30, 'Phone number is too long.').optional().default('')
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const dataRequestTypes = ['access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'withdraw_consent', 'other'] as const;
export const dataRequestSchema = z.object({
  type: z.enum(dataRequestTypes),
  details: z.string().trim().max(2000, 'Please keep details under 2000 characters.').optional().default('')
});
export type DataRequestInput = z.infer<typeof dataRequestSchema>;

export const breachSchema = z.object({
  title: z.string().trim().min(1, 'A short title is required.').max(200),
  detectedAt: z.string().optional().default(''),
  description: z.string().trim().max(5000).optional().default(''),
  dataCategories: z.string().trim().max(500).optional().default(''),
  estimatedAffected: z.coerce.number().int().min(0, 'Cannot be negative.').optional().default(0),
  containmentActions: z.string().trim().max(5000).optional().default(''),
  likelyHighRisk: z.boolean().optional().default(false)
});
export type BreachInput = z.infer<typeof breachSchema>;

const optionalEmail = z.union([z.literal(''), emailSchema]);
export const privacySettingsSchema = z.object({
  controllerName: z.string().trim().min(1, 'Enter the organisation name.').max(500),
  controllerEmail: optionalEmail,
  controllerAddress: z.string().trim().max(500),
  dpoName: z.string().trim().max(500),
  dpoEmail: optionalEmail,
  dpoPhone: z.string().trim().max(500),
  hostingDescription: z.string().trim().max(500),
  additionalNoticeText: z.string().max(10000),
  dsrResponseDays: z.coerce.number().int().min(1, 'At least 1 day.').max(90, 'At most 90 days.'),
  retentionEmailLogDays: z.coerce.number().int().min(30, 'At least 30 days.').max(3650),
  retentionAuditLogDays: z.coerce.number().int().min(180, 'At least 180 days.').max(3650),
  retentionFinancialRecordsYears: z.coerce.number().int().min(1).max(20)
});
export type PrivacySettingsInput = z.infer<typeof privacySettingsSchema>;

/** First validation message, for API error responses. */
export function firstIssue(result: { success: boolean; error?: z.ZodError }): string {
  return result.error?.issues[0]?.message || 'Invalid input.';
}

export const updateTypes = ['general', 'planting', 'growth', 'harvest', 'maintenance', 'weather', 'pest', 'milestone'] as const;
export const farmUpdateSchema = z.object({
  title: z.string().trim().min(1, 'Give the update a title.').max(200, 'Keep the title under 200 characters.'),
  updateType: z.enum(updateTypes),
  body: z.string().trim().min(1, 'Describe what happened.').max(5000, 'Keep the update under 5000 characters.'),
  caption: z.string().trim().max(200, 'Keep the caption under 200 characters.').optional().default('')
});
export type FarmUpdateInput = z.infer<typeof farmUpdateSchema>;

export const documentCategories = ['report', 'certificate', 'contract', 'legal', 'financial', 'other'] as const;
export const farmDocumentSchema = z.object({
  title: z.string().trim().min(1, 'Give the document a title.').max(200),
  category: z.enum(documentCategories),
  description: z.string().trim().max(1000).optional().default('')
});
export type FarmDocumentInput = z.infer<typeof farmDocumentSchema>;
