/**
 * Public emergency page.
 *
 * The one page that must work with no account, no data and no JavaScript-heavy
 * components. Everything is server-rendered markup from static configuration:
 * numbers to call, red and amber signs, what to do right now, and an explicit
 * statement that Mama Care cannot help in an emergency.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EmergencyPanel } from '@/components/emergency/emergency-panel';
import { PublicHero } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';

export default function EmergencyPage() {
  useEffect(() => {
    document.title = 'Emergency · Mama Care';
  }, []);

  return (
    <>
      <PublicHero
        eyebrow="Emergency"
        title="If something feels wrong, act now"
        lede="You do not need an appointment, a referral or permission to seek emergency care. Below are the numbers to call, the signs that mean go immediately, and what to take with you."
        image={<AppImage name="referral" alt="An ambulance used to transfer a patient to hospital" ratio="4 / 3" />}
      >
        <a href="tel:112" className="btn btn-primary">
          Call 112
        </a>
        <a href="tel:991" className="btn btn-danger">
          Call 991 ambulance
        </a>
      </PublicHero>

      <section className="shell py-8">
        <EmergencyPanel audience="all" />

        <div className="mt-10">
          <SectionHeading eyebrow="Do not wait for an app" title="What Mama Care cannot do" />
          <Card className="card-pad mt-5 border-risk-red/30 bg-risk-red/5">
            <p className="text-sm leading-relaxed text-ink-800">
              <strong>Mama Care is an information and record-keeping tool. It is not an emergency service.</strong> In a
              life-threatening situation the app will slow you down. Close it, call the emergency number, or go to the
              nearest facility with an emergency unit.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-700">
              Nothing in this app diagnoses a condition, measures your blood pressure, listens to a heartbeat or replaces a
              clinical examination. If you are unsure whether something is serious — treat it as serious. A midwife would
              rather see you unnecessarily than miss something.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/facilities" className="btn btn-secondary btn-sm">
                Find a facility near me
              </Link>
              <Link to="/providers" className="btn btn-secondary btn-sm">
                Message a provider
              </Link>
            </div>
          </Card>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Card className="card-pad">
            <Badge tone="amber">For family members</Badge>
            <h3 className="card-title mt-3">If you are supporting someone in danger</h3>
            <ul className="checklist mt-3">
              {[
                'Call the emergency number while someone else prepares transport.',
                'Do not give food, drink or medication unless a clinician instructs you.',
                'Collect her health booklet (Under-Five or antenatal card) and any Mama Care record.',
                'Note the time symptoms started and anything she has taken.',
                'Stay with her. Do not leave her alone while waiting for help.',
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>

          <Card className="card-pad">
            <Badge tone="brand">For facilities</Badge>
            <h3 className="card-title mt-3">Your listing is out of date</h3>
            <p className="text-sm text-ink-600">
              If your emergency number, opening hours or maternity services have changed, tell us. Wrong information in a
              directory costs someone time they may not have.
            </p>
            <ul className="checklist mt-3">
              {[
                'Email support@mamacare.health with the facility name and what changed.',
                'An administrator verifies the change and republishes the listing.',
                'Verified listings show a green badge so mothers can trust them.',
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-4">
              <Link to="/contact" className="btn btn-secondary btn-sm">
                Contact Mama Care
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </>
  );
}
