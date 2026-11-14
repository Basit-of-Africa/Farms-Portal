/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Public privacy notice (transparency obligations under the NDPA 2023 / GAID
 * 2025, GDPR Art. 13-14 and similar laws). Content is generated from the
 * admin's privacy settings and the processors actually configured.
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { PrivacySettings } from '../types';

export interface PrivacyNoticeData extends PrivacySettings {
  portalName: string;
  processors: Array<{ name: string; purpose: string; location: string }>;
}

export function usePrivacyNotice(refresh = 0) {
  const [notice, setNotice] = useState<PrivacyNoticeData | null>(null);
  useEffect(() => {
    fetch('/api/privacy/notice')
      .then(r => (r.ok ? r.json() : null))
      .then(setNotice)
      .catch(() => setNotice(null));
  }, [refresh]);
  return notice;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="font-bold text-base text-[#1B4332] dark:text-emerald-400 mb-2">{title}</h2>
      <div className="text-sm leading-relaxed text-stone-700 dark:text-stone-300 space-y-2">{children}</div>
    </section>
  );
}

export function PrivacyNoticeContent({ notice }: { notice: PrivacyNoticeData }) {
  const controller = notice.controllerName || notice.portalName || 'The portal operator';
  const contact = notice.dpoEmail || notice.controllerEmail;
  return (
    <div>
      <p className="text-xs text-stone-500 mb-6">
        Version {notice.noticeVersion} · Last updated {notice.noticeLastUpdated}
      </p>

      <Section title="1. Who we are">
        <p>
          <b>{controller}</b> is the data controller for the personal data processed through this investor portal.
          {notice.controllerAddress && <> Address: {notice.controllerAddress}.</>}
          {notice.controllerEmail && <> Email: {notice.controllerEmail}.</>}
        </p>
        {(notice.dpoName || notice.dpoEmail) && (
          <p>
            Data Protection Officer: {notice.dpoName}
            {notice.dpoEmail && <> · {notice.dpoEmail}</>}
            {notice.dpoPhone && <> · {notice.dpoPhone}</>}
          </p>
        )}
      </Section>

      <Section title="2. Personal data we process">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Identity and contact:</b> name, username, email address, phone number, profile photo.</li>
          <li><b>Investment and contract:</b> plots held, investment amounts, ownership percentages, start dates, contract references, land and ownership documents.</li>
          <li><b>Financial:</b> payout amounts, returns (ROI), payout dates and status.</li>
          <li><b>Communications:</b> emails and messages sent to you through the portal, comments and notes you post.</li>
          <li><b>Security and technical:</b> sign-in activity, IP address and an audit trail of actions on records, a sign-in token kept in your browser's local storage and a strictly necessary session cookie. We do not use advertising or analytics cookies.</li>
        </ul>
      </Section>

      <Section title="3. Why we use it and our lawful basis">
        <ul className="list-disc pl-5 space-y-1">
          <li><b>To perform our contract with you</b>: managing your farm investment, allocating plots, sharing farm updates and documents, and reporting and paying returns.</li>
          <li><b>To comply with legal obligations</b>: tax, accounting, anti-money-laundering and record-keeping requirements.</li>
          <li><b>Legitimate interests</b>: keeping the portal secure, preventing fraud, keeping audit records and handling disputes. You may object to processing based on legitimate interests.</li>
          <li><b>Consent</b>: promotional messages, only if you opt in. You can withdraw consent at any time; this does not affect earlier processing.</li>
        </ul>
        <p>We do not make decisions about you based solely on automated processing.</p>
      </Section>

      <Section title="4. Who we share it with">
        <p>
          Farm managers see the details of investors on the farms they manage (not financial documents). Administrators see what they need to run the portal.
          We share data with authorities only where the law requires it. <b>We do not sell personal data.</b>
        </p>
        <p>We use the following service providers (data processors), bound by contract to protect your data:</p>
        {notice.processors.length > 0 ? (
          <ul className="list-disc pl-5 space-y-1">
            {notice.processors.map(p => (
              <li key={p.name}>
                <b>{p.name}</b>: {p.purpose}. Location: {p.location}.
              </li>
            ))}
          </ul>
        ) : (
          <p>No third-party processors are currently configured beyond our hosting provider.</p>
        )}
        {notice.hostingDescription && <p>Hosting: {notice.hostingDescription}</p>}
      </Section>

      <Section title="5. International transfers">
        <p>
          Some providers above may store or process data outside Nigeria (and outside your own country). Where this happens we rely on the
          safeguards permitted by the Nigeria Data Protection Act 2023 and, where applicable, the GDPR, such as adequacy decisions or
          contractual clauses that require an adequate level of protection. Contact us for details of the safeguards used.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <ul className="list-disc pl-5 space-y-1">
          <li>Account and contact data: while your account is active, then erased on request (subject to the records below).</li>
          <li>Contracts, investment and financial records: {notice.retentionFinancialRecordsYears} years after the relationship ends, as required by tax and accounting law.</li>
          <li>Email and message logs: {notice.retentionEmailLogDays} days.</li>
          <li>Security audit records (including IP addresses): {notice.retentionAuditLogDays} days.</li>
        </ul>
      </Section>

      <Section title="7. How we protect it">
        <p>
          Passwords are stored as one-way hashes, connections are encrypted (HTTPS), access is limited by role, uploaded documents are only
          available to signed-in users entitled to them, and actions on personal data are logged. If a breach is likely to put your rights at
          risk we will notify the Nigeria Data Protection Commission within 72 hours, and tell you without delay where the risk is high.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>Subject to legal limits, you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>be informed about how your data is used (this notice);</li>
          <li>access your data and receive a copy in a portable, machine-readable format;</li>
          <li>have inaccurate data corrected;</li>
          <li>have your data erased, or its use restricted;</li>
          <li>object to processing, including for direct marketing;</li>
          <li>withdraw consent at any time.</li>
        </ul>
        <p>
          Signed-in users can download their data, correct their details, manage consent and submit requests on the <b>Privacy &amp; Data</b> page.
          {contact && <> You can also email {contact}.</>} We respond within {notice.dsrResponseDays} days.
        </p>
        <p>
          You may complain to the <b>Nigeria Data Protection Commission</b> (ndpc.gov.ng) or, if you live elsewhere, to your local data protection
          authority (for example in the EU/EEA or the UK).
        </p>
      </Section>

      <Section title="9. Children">
        <p>The portal is for adult investors and staff. We do not knowingly collect data about children.</p>
      </Section>

      <Section title="10. Changes to this notice">
        <p>When we change this notice we update the version and date above and ask signed-in users to review it again.</p>
      </Section>

      {notice.additionalNoticeText && (
        <Section title="11. Additional information">
          <p className="whitespace-pre-line">{notice.additionalNoticeText}</p>
        </Section>
      )}
    </div>
  );
}

export default function PrivacyNoticePage() {
  const notice = usePrivacyNotice();
  return (
    <div className="min-h-screen bg-[#FBF9F4] dark:bg-stone-950 px-4 py-10">
      <div className="max-w-3xl mx-auto bg-white dark:bg-stone-900 rounded-3xl border border-[#2D6A4F]/10 dark:border-stone-800 shadow-sm p-6 md:p-10">
        <a href="/" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2D6A4F] dark:text-emerald-400 mb-6 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to portal
        </a>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="h-7 w-7 text-[#2D6A4F] dark:text-emerald-400" />
          <h1 className="font-bold text-2xl text-[#1B4332] dark:text-white">Privacy Notice</h1>
        </div>
        {notice ? <PrivacyNoticeContent notice={notice} /> : <p className="text-sm text-stone-500">Loading…</p>}
      </div>
    </div>
  );
}
