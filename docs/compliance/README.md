# Data Protection Compliance

This folder documents how the Adubiaro Farm Portal supports compliance with:

- **Nigeria Data Protection Act 2023 (NDPA)** and the **NDPC General Application and Implementation Directive 2025 (GAID)**, in force since 19 September 2025, which replaced the NDPR 2019
- **EU GDPR / UK GDPR**: relevant if any investors live in the EU, EEA or UK (for example diaspora investors)
- Similar laws elsewhere, such as Ghana's Data Protection Act 2012, Kenya's Data Protection Act 2019 and South Africa's POPIA. Their principles closely match the ones above.

> **Important:** software can only provide the *technical* controls. Compliance also needs organisational steps: a DPO, NDPC registration and audit filings, contracts with processors, staff training and legal review. These are listed under "Organisational actions" below. This document is not legal advice. Have it reviewed by a qualified data protection lawyer or a licensed Data Protection Compliance Organisation (DPCO).

## Contents

| Document | Purpose |
|---|---|
| [ROPA.md](ROPA.md) | Record of processing activities |
| [breach-response-plan.md](breach-response-plan.md) | What to do when personal data is lost, leaked or accessed without authorisation (72-hour rule) |
| [data-subject-requests.md](data-subject-requests.md) | How to handle access, correction, erasure and other requests |
| [dpia-template.md](dpia-template.md) | Data Protection Impact Assessment template |

## Requirement → implementation map

| Principle / obligation | How the portal supports it | Where |
|---|---|---|
| **Transparency** (privacy notice) | Public `/privacy` page generated from admin settings and the processors actually configured. Users must acknowledge each notice version before using the portal. | `src/components/PrivacyNotice.tsx`, `PrivacyAcknowledgeModal.tsx` |
| **Lawful basis / consent** | Contract and legal obligation for core processing. Marketing requires an unticked, opt-in consent that can be withdrawn at any time, and promotional broadcasts skip anyone who hasn't opted in. Consent is recorded with a timestamp. | `server/privacy.ts`, `/api/admin/broadcast` |
| **Right of access & portability** | "Download my data" produces a machine-readable JSON export of everything held about the user. | `GET /api/privacy/my-data` |
| **Right to rectification** | Users correct their own name, email and phone. | `PUT /api/privacy/profile` |
| **Erasure, restriction, objection** | Tracked request queue with due dates (default 30 days), emails to the requester and DPO, and admin actions. Erasure anonymises the person and keeps legally required records without their identifiers. | `/api/privacy/requests`, `/api/admin/privacy/users/:id/anonymise` |
| **Data minimisation / need-to-know** | Farm managers only see, export and message investors on farms they manage, and can't open financial documents. Investors only see their own plots and documents. | `investorIdsForManager`, `canAccessDocument` in `server.ts` |
| **Storage limitation** | Configurable retention for email logs and audit logs, enforced daily and on startup. Deletions now reach Firestore and PostgreSQL; previously deleted records came back after a restart. | `runRetention`, `saveDbToFirestore`, `saveDbToPostgres` |
| **Integrity & confidentiality** | Hashed passwords, signed expiring sessions, login throttling, role checks, protected file downloads (no public URLs for uploaded documents), private Cloudinary storage for documents, security headers, `no-store` caching for API responses, credentials removed from stored emails. | `server/auth.ts`, `/uploads` guard, document download |
| **Accountability** | Audit trail of sign-ins, access to personal data (profiles, documents, exports) and administrative changes. It records ids, not names. | `/api/admin/audit-logs`, Privacy & Data → Audit log |
| **Breach notification** | Breach register showing the 72-hour NDPC deadline, tracking regulator and individual notifications. | Privacy & Data → Breaches |
| **Cross-border transfers** | The notice lists each processor and where it is located. Admins describe hosting regions. | Privacy & Data → Settings |
| **No third-party tracking** | Fonts are self-hosted (Google Fonts removed). There are no analytics or advertising cookies; only a strictly necessary session cookie and a local-storage sign-in token are used. | `src/index.css` |

## Organisational actions (owner: management / DPO)

These can't be done in code. Confirm the details, thresholds and deadlines with your lawyer or DPCO.

1. **Designate a Data Protection Officer** and enter their details under Privacy & Data → Settings.
2. **Register with the NDPC** if Adubiaro qualifies as a *data controller of major importance*. Then **file Compliance Audit Returns** as the GAID requires, through a licensed DPCO.
3. **Complete a DPIA** using [dpia-template.md](dpia-template.md). The portal processes financial data and identity documents at scale.
4. **Sign data processing agreements** with each processor: hosting, Google Cloud, Cloudinary, the email provider and the database host. Document the safeguards for transfers outside Nigeria (and outside the EU/UK where GDPR applies).
5. **Fill in the privacy settings**: legal entity name, address, privacy email, hosting regions and retention periods. Confirm the retention period for financial records with your accountant; the default is 6 years.
6. **Have the generated privacy notice reviewed** by counsel. Add anything else they need under "Additional notice text". Use "Publish new notice version" whenever it changes.
7. **Train staff** (admins and farm managers) on confidentiality, the breach plan and handling data requests.
8. **Review access** every quarter: deactivate leavers and check manager–farm assignments.
9. **Deploy the locked-down Firestore rules** (`firebase deploy --only firestore:rules`) and keep `AUTH_SECRET` and service-account keys in a secrets manager.

## Known residual risks / follow-ups

- **Older public files:** documents uploaded to Cloudinary *before* this change are still public URLs. Re-upload them, or migrate them to `type: private`.
- **Message attachments:** attachments on direct messages and broadcasts sent through Cloudinary stay public, because email clients need to display them. Avoid attaching personal documents to messages; use the document vault instead.
- **Local JSON file:** `data/db.json` and the backups in `data/backups/` hold personal data unencrypted on the server disk. Restrict server access, encrypt the disk, and include backups in retention. Moving to a single database (step 2 of the roadmap) will remove these files.
- **Simulation email mode:** while email is in simulation mode, temporary passwords stay visible to admins in the outbox until the user changes them. Real email modes store a redacted copy.
- **Browser token storage:** the sign-in token is kept in `localStorage`, so a cross-site scripting bug could expose it. Keep dependencies patched; a later change could move it to an HttpOnly cookie with CSRF protection.
- **Unsplash images:** default placeholder images load from `images.unsplash.com`, which reveals visitor IP addresses to Unsplash. Replace them with self-hosted images.
- **Identity checks:** the portal doesn't verify the identity of someone making a request beyond their sign-in. Staff must verify identity before releasing or erasing data for requests received by email.
