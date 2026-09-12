import { Contact, Send, Smartphone } from 'lucide-react';
import { PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { ContactForm } from '@/routes/public/contact-form';
import { SITE } from '@/config/site-content';

export default function ContactPage() {
  return (
    <PublicShell>
      <div className="shell grid gap-10 py-14 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <p className="section-eyebrow">Contact</p>
          <h1 className="display-2 mt-2.5">Talk to the MAMA CARE team</h1>
          <p className="lede mt-4">
            Deployment questions, configuration help, data-protection queries and clinical governance reviews. Please do not send patient
            information, clinical results or passwords through this form.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="card p-4">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-800">
                <Contact className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[0.72rem] font-semibold tracking-[0.1em] text-ink-500 uppercase">General</p>
              <a href={`mailto:${SITE.org.email}`} className="text-[0.92rem] font-semibold text-brand-800 hover:underline">
                {SITE.org.email}
              </a>
              <p className="caption mt-1">Deployments, onboarding, product questions.</p>
            </div>
            <div className="card p-4">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-800">
                <Smartphone className="size-4" aria-hidden />
              </span>
              <p className="mt-3 text-[0.72rem] font-semibold tracking-[0.1em] text-ink-500 uppercase">Telephone</p>
              <p className="text-[0.92rem] font-semibold text-ink-900 tnum">{SITE.org.phone}</p>
              <p className="caption mt-1">{SITE.org.hours}</p>
            </div>
          </div>

          <div className="mt-8 card p-5">
            <h2 className="h3">Facility and deployment information we need</h2>
            <ul className="muted mt-2.5 space-y-1.5 text-sm">
              <li>• Facility name, type and district, and the number of deliveries per month.</li>
              <li>• How many midwives, nurses and community health workers would use it, and on what devices.</li>
              <li>• Whether records are already digital anywhere (DHIS2, EMR, paper registers) and what must be reconciled.</li>
              <li>• Who the responsible clinical authority is for approving the alert thresholds and report templates.</li>
              <li>• Whether mothers have phones with data, and whether an SMS provider is already contracted.</li>
            </ul>
            <p className="caption mt-4 border-t border-ink-200 pt-3">
              The message form posts to this deployment’s API service when one is configured. Without it, write directly to{' '}
              <a href={`mailto:${SITE.org.email}`} className="font-semibold text-brand-800 hover:underline">
                {SITE.org.email}
              </a>
              .
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5 sm:p-6">
            <h2 className="h3">Send a message</h2>
            <p className="muted mt-1">We reply within two working days. For clinical emergencies use the emergency page instead.</p>
            <div className="mt-4">
              <ContactForm compact />
            </div>
          </div>
          <AppImage name="clinicEnvironment" ratio="16 / 10" caption="A facility records room — the workspace is designed for shared clinic devices." />
          <div className="card p-5">
            <h3 className="h3">Ready to start?</h3>
            <p className="muted mt-1.5">Register your facility team. Accounts are created with the least-privileged role and approved by an administrator before any patient record is visible.</p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <ButtonLink to="/register" size="sm">Create an account</ButtonLink>
              <ButtonLink to="/signin" size="sm" variant="secondary">Staff sign in</ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
