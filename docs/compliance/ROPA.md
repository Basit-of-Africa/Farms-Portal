# Record of Processing Activities (ROPA)

**Controller:** Adubiaro Farms *(complete the legal entity name, address and DPO details)*
**Last reviewed:** 2026-11-14. Review at least once a year and whenever processing changes.

| # | Activity | Data subjects | Personal data | Purpose | Lawful basis | Recipients / processors | Transfers outside Nigeria | Retention | Security measures |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Investor account management | Investors | Name, username, email, phone, profile photo, password hash | Provide portal access | Contract | Hosting provider, database (Firestore/PostgreSQL) | Depends on hosting region | While active; erased on request | Hashed passwords, signed sessions, role-based access, audit log |
| 2 | Investment and plot allocation | Investors | Plots, investment amounts, ownership %, start dates, contract references | Administer the investment contract | Contract; legal obligation | Admins; farm managers (own farms only) | As above | Duration of contract + financial retention period (default 6 years) | Role checks, minimisation for managers |
| 3 | Land/contract document vault | Investors | Deeds, certificates, contracts, invoices | Provide and keep contractual documents | Contract; legal obligation | Cloudinary (private storage) or local server | Cloudinary region | Financial retention period | Authenticated, permission-checked downloads; private cloud storage; access audited |
| 4 | Returns and payouts reporting | Investors | Payout amounts, ROI, dates, status | Report and pay returns | Contract; legal obligation (tax/accounting) | Admins | As above | Financial retention period | Admin-only publishing; audit log |
| 5 | Farm updates and comments | Investors, managers | Comments, names, roles, photos | Keep investors informed | Contract; legitimate interest | Users on the same farm | As above | Life of the farm record; de-identified on erasure | Farm-scoped access |
| 6 | Service emails | Investors, staff | Email address, name, message content | Account, document and payout notifications | Contract | Email provider (SMTP/Brevo) | Provider region (Brevo: EU) | Email log retention (default 365 days) | Credentials removed from stored copies |
| 7 | Marketing messages | Investors who opted in | Email, name | Promote new opportunities | Consent (withdrawable) | Email provider | As above | Until consent is withdrawn | Consent checked on every send |
| 8 | Security and audit logging | All users | User id, role, action, IP address, timestamp | Security, fraud prevention, accountability | Legitimate interest; legal obligation | Admins | As above | Audit retention (default 730 days) | Admin-only access; IPs removed on erasure |
| 9 | Data subject request handling | Requesters | Request type, details, outcome | Meet data subject rights | Legal obligation | Admins / DPO | As above | Kept as evidence of compliance | Admin-only |
| 10 | Breach register | Affected people (aggregate) | Description, categories, counts | Meet breach notification duties | Legal obligation | Admins / DPO, NDPC when notified | No | Kept as evidence of compliance | Admin-only |

**Special category / sensitive data:** none intended. Do not upload national ID numbers, BVN, health data or similar unless a DPIA has been completed and a lawful basis documented.

**Children:** not intended for anyone under 18.
