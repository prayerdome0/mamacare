import { PublicSection, PublicShell } from '@/components/layout/public-shell';
import { SITE } from '@/config/site-content';
import { Link } from 'react-router-dom';

/**
 * Privacy and data-handling statement. Written to match what the code actually
 * does — no promises the implementation does not keep.
 */
export default function PrivacyPage() {
  return (
    <PublicShell>
      <div className="shell max-w-3xl py-14">
        <p className="section-eyebrow">Privacy and data</p>
        <h1 className="display-2 mt-2.5">How MAMA CARE handles patient information</h1>
        <div className="prose-mamacare mt-6">
          <p>
            MAMA CARE is software operated by a health facility. The facility (or the health authority that runs it) is the data
            controller for every record; this project provides the platform, not a clinical service. Nothing in this page overrides the
            data-protection rules your facility is required to follow.
          </p>

          <h3>What is stored</h3>
          <p>
            Identity and contact details of the mother, her pregnancy dating, observations recorded at each antenatal visit (blood pressure,
            pulse, temperature, respirations, weight, MUAC, fundal height, fetal heart, urine findings, haemoglobin), reported danger signs,
            test results, medications, counselling given, alerts raised with the values that triggered them, referral packets,
            appointments, uploaded documents and reports, and an audit log of privileged actions. Account records for staff hold name,
            work email, role, facility and authentication metadata.
          </p>

          <h3>Who can read it</h3>
          <ul>
            <li>Staff at the facility where the mother is registered or receiving care.</li>
            <li>Clinical staff at another facility while a referral to or from that facility is open.</li>
            <li>The mother herself, through a patient account linked to her record.</li>
            <li>Administrators, for account management and audit review.</li>
          </ul>
          <p>
            These rules are enforced in the database security rules and, in the device-only evaluation build, by the same policy module
            that runs before every read. The interface hides links you cannot use; it is not the protection.
          </p>

          <h3>Where files are stored</h3>
          <p>
            Images and documents are stored in Cloudinary under the <code>mamacare/</code> folder tree. Reports and medical documents are
            uploaded with a non-public access mode and opened through short-lived signed URLs; the database holds only the metadata. If
            Cloudinary is not configured for a deployment, files stay on the device that created them and no copy is uploaded anywhere.
          </p>

          <h3>What is never done</h3>
          <ul>
            <li>No secrets, API keys or private credentials are ever shipped to the browser.</li>
            <li>No patient name, identifier or clinical value is ever published on a public page or in an aggregate chart.</li>
            <li>No clinical conclusion is drawn by the software. Alerts describe a recorded finding and the assessment it requires.</li>
            <li>No raw authentication or database error text is shown to a user; failures are mapped to safe, actionable messages.</li>
          </ul>

          <h3>Retention and removal</h3>
          <p>
            Records are retained according to the facility’s health-records retention policy, which the deployment configures in Settings.
            A mother may ask her facility to correct her details or stop recording; deactivating an account removes access but preserves the
            clinical record and its audit trail, because the entries are made by clinicians under their own professional duty.
          </p>

          <h3>Contact</h3>
          <p>
            Data-protection queries: <a href={`mailto:${SITE.privacyContact}`}>{SITE.privacyContact}</a>. General enquiries:{' '}
            <a href={`mailto:${SITE.org.email}`}>{SITE.org.email}</a>. Access to a record, corrections and deletions are always requested
            from the facility holding it, through the{' '}
            <Link to="/contact">contact page</Link> if you need help doing so.
          </p>
        </div>
      </div>
    </PublicShell>
  );
}
