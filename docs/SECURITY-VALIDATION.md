# Security and clinical validation

Two gates, one document: the **access matrix** (must be true before any patient data is
entered) and the **clinical rule sign-off** (must be complete before alerts are used to
drive care).

## 1 · Access matrix

The matrix is expressed three times — `web/src/services/policy/policy.ts`,
`firestore.rules`, and the guards in `functions/src/routes/*`. A change in one must appear in
all three, with the tests below passing.

| Action | MOTHER | COMMUNITY_HEALTH_WORKER | NURSE / MIDWIFE | FACILITY_SUPERVISOR | ADMIN |
| --- | --- | --- | --- | --- | --- |
| Read public site | ✅ | ✅ | ✅ | ✅ | ✅ |
| See own profile | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read mother record | own only | own facility | own facility | facility group | all |
| Register a mother | ❌ | ✅ (own facility) | ✅ | ✅ | ✅ |
| Amend clinical details (allergies, blood group, risk) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Record / amend an ANC visit | ❌ | ❌ (appointments, alerts, referrals only) | ✅ | ✅ | ✅ |
| Acknowledge or resolve an alert | ❌ | own facility | own facility | own facility | all |
| Raise a referral | ❌ | as origin | as origin | origin or receiving | all |
| Change a referral status | ❌ | origin while awaiting receipt | origin or receiving per status | receiving facility | all |
| Upload a document | own record only | ✅ | ✅ | ✅ | ✅ |
| Open a patient document | own only | access list | access list | access list | all |
| Delete a document | ❌ | uploader only | uploader only | ❌ (needs admin) | ✅ |
| Generate a facility/district report | ❌ | ❌ | ❌ | ✅ | ✅ |
| Read audit logs | ❌ | ❌ | ❌ | own facility | all |
| Change role / facility / account status | ❌ | ❌ | ❌ | ❌ | ✅ (API only, reason required) |
| Change system settings or clinical rules | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sign in as ADMIN from self-registration | ❌ | ❌ | ❌ | ❌ | ❌ — bootstrap allow-list or an existing admin only |

### Checks to run against a deployed project

1. **Mother isolation.** With a mother's account, request another mother's record by id from
   the console. Expected: `permission-denied`, and an empty roster list.
2. **Facility isolation.** A midwife at Facility A reading Facility B's `mothers` document →
   denied; listing returns only A's rows. The same actor may read B's document **only** if a
   referral names B as origin or receiver.
3. **Privilege fields.** As a midwife, `update('users', ownUid, { role: 'ADMIN' })` →
   rejected by both `policy.ts` and the rules. As a mother, `update('mothers', ownId,
   { riskLevel: 'GREEN' })` → rejected.
4. **Append-only audit.** `update`/`delete` on `audit_logs` must fail for every role,
   including ADMIN. Creating an entry whose `actorId` is someone else must fail.
5. **Settings and rules.** Any non-admin write to `settings` or `alert_rules` must fail; the
   web app must not even offer the control.
6. **Unapproved account.** A freshly registered health worker can read only their own
   profile; every clinical collection is denied until an administrator approves them.
7. **Revocation.** Demote or suspend an account in the admin console, then reuse its open
   session: the next `/api/*` call must fail with "sign in again" (`privilegeVersion`
   mismatch), and `auth.revokeRefreshTokens` must have been called.
8. **Media.** `POST /api/media/sign` with `folder: "etc"` or a public id outside
   `mamacare/…` → 403. `sign-url` for a document whose access list excludes you → 403. The
   string `CLOUDINARY_API_SECRET` must never appear in a built asset:
   `grep -r "api_secret" web/dist` → no matches.
9. **Session and transport.** `localStorage` holds no patient data (device mode keeps it in
   IndexedDB with a documented reset); ID tokens are read per request, never cached in a
   global; the auth session persistence preference follows the "remember this device" choice.
10. **Error surface.** Force a failure (invalid reset code, duplicate appointment) and
    confirm the message is the mapped text, not `Firebase: Error (auth/…)`.
11. **Contact form.** Over-limit requests return 429; the honeypot field silently discards
    scripted submissions; the relay never accepts a body-supplied reply-to for arbitrary
    addresses.
12. **No secrets in the repository.** `git ls-files | grep -E "\.env$|serviceAccount|\.pem$"`
    → empty; `.gitignore` keeps `web/.env*` (except `.env.example`), `functions/.env`,
    `web/public/firebase-messaging-sw.js` and build output out.

## 2 · Clinical rule validation

The shipped rule set is a **starting point, not a validated protocol**. The alert wording is
deliberately non-diagnostic ("*Potential danger sign identified. Immediate clinical
assessment required.*") and each rule carries `approvedBy` / `approvedAt`.

For every rule in Admin → Settings → Clinical rules:

* [ ] Threshold(s) and operator match the guideline the deployment follows (and the national
      protocol where one exists).
* [ ] The AND/OR grouping matches how a clinician would actually judge the case (a single
      abnormal value is often not enough).
* [ ] Gestational windows are correct for the population (e.g. movements from ~24–28 weeks,
      fundal-height expectations by week).
* [ ] Level (RED/AMBER) and the expected response time match the facility's capacity.
* [ ] Wording describes the observation and the required assessment; it never states a
      diagnosis, a drug dose, or a prognosis.
* [ ] Recommended action names the protocol step, not an individual clinical decision.
* [ ] False-positive and false-negative behaviour has been reviewed against a sample of real
      (de-identified) visits.
* [ ] Escalation path is defined: who is notified, after how long, and what happens if nobody
      responds.
* [ ] Sign-off recorded with name, role, date, and the guideline version relied on.

Then the surrounding behaviour:

* [ ] Saving a visit that matches a rule raises the alert, notifies the assigned officer and
      appears in the mother's record — and nothing is auto-resolved.
* [ ] Resolving an alert requires a written action; the resolution is visible on the record.
* [ ] A missed appointment raises a follow-up alert, not a clinical one.
* [ ] The banner "rule set pending clinical validation" disappears only when every enabled
      rule is signed off (`rulesRequireSignOff`).
* [ ] Mothers see a plain-language "your clinic would like to see you" card, never a
      threshold or a diagnosis.

## 3 · Data protection review

* [ ] Retention period agreed and written into Settings → Data retention (and mirrored in the
      privacy notice).
* [ ] Deletion process for closed records defined (records are closed, never hard-deleted).
* [ ] Photo consent verified at registration; portraits are only ever in `mamacare/profiles`
      with signed delivery.
* [ ] Aggregate reports contain no names, phone numbers, addresses or ids — check a generated
      facility PDF.
* [ ] SMS content reviewed: no results, no diagnosis, and it must be safe if the phone is read
      by someone else.
* [ ] Shared-device policy written for facility tablets (sign out, no saved passwords,
      screen lock).
* [ ] Audit-log review cadence agreed with the facility (who reads it, how often, and what
      triggers a review).
* [ ] A named clinical owner and a named technical owner exist for this deployment.

## 4 · Sign-off block

Complete before any patient record is entered into a live deployment.

```
Deployment / facility:  ____________________________
Access matrix (section 1) verified by:  ____________  Date: ________
Clinical rules (section 2) approved by:  ____________  Date: ________
  Role / licence: ________________________________
Data protection (section 3) approved by:  ___________  Date: ________
Next scheduled review of the rule set:  ____________
```

Until the clinical block is signed, treat the platform as record-keeping and
follow-up support only: alerts may be raised and seen, but must not be the sole basis for a
care decision.
