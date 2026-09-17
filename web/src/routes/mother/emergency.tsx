/**
 * Emergency — in-app.
 *
 * This screen is designed to be read in a panic, by someone who may be alone, on a
 * small screen, in bad light. So: numbers first, the "go now" list second, plain
 * instructions third, and nothing that requires an account, a network or a decision
 * tree.
 *
 * The audience adapts: pregnancy signs while she is pregnant, postnatal and newborn
 * signs after birth, both when it matters.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MessageCircle, NotebookPen, Phone, Siren } from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { careLinkRepo, journalRepo } from '@/services/repositories';
import { EMERGENCY_CONTACTS } from '@/config/site-content';
import { toIsoDate } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { EmergencyNumbers, EmergencyPanel } from '@/components/emergency/emergency-panel';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';
import { Field, TextArea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export default function MotherEmergencyPage() {
  const mother = useMotherContext();
  const navigate = useNavigate();
  const toast = useToast();
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: careLinks } = useAsync(() => careLinkRepo.mine(), { deps: [] });
  const provider = (careLinks ?? []).find((link) => link.status === 'active' && link.providerUserId) ?? null;

  const audience = useMemo<'pregnancy' | 'postnatal' | 'newborn' | 'all'>(() => {
    if (!mother.pregnancy) return 'all';
    if (mother.pregnancy.status === 'delivered') return 'all';
    return 'pregnancy';
  }, [mother.pregnancy]);

  useEffect(() => {
    document.title = 'Emergency · Mama Care';
  }, []);

  const saveNote = async (): Promise<void> => {
    setSaving(true);
    try {
      await journalRepo.create({
        date: toIsoDate(new Date()),
        title: 'Emergency — what happened',
        body: note.trim(),
        mood: null,
        tags: ['emergency'],
        babyId: mother.activeBaby?.id ?? null,
        private: true,
      });
      toast.success('Saved to your journal', 'Only you can read it. It is useful to show a clinician.');
      setNoteOpen(false);
      setNote('');
    } catch {
      toast.error('That did not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Emergency"
        description="If you think something is wrong, act now. You do not need an appointment, a referral or anyone's permission to seek care."
        badge={
          <Badge tone="red">
            <Siren className="size-3" aria-hidden /> Act now
          </Badge>
        }
        actions={
          <div className="actions-wrap">
            <a href={`tel:${EMERGENCY_CONTACTS.ambulance}`} className="btn btn-danger btn-sm">
              <Phone className="size-4" aria-hidden /> Ambulance {EMERGENCY_CONTACTS.ambulance}
            </a>
            {provider ? (
              <Button variant="secondary" size="sm" onClick={() => navigate(`/app/messages?to=${provider.providerUserId}&name=${encodeURIComponent(provider.providerName)}`)} icon={<MessageCircle className="size-4" aria-hidden />}>
                Message {provider.providerName.split(' ')[0]}
              </Button>
            ) : (
              <Link to="/app/facilities" className="btn btn-secondary btn-sm">
                Find a facility
              </Link>
            )}
          </div>
        }
      />

      <Card className="card-pad mb-4 border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]">
        <h2 className="card-title">If any of these are happening right now, go to a facility</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            'Heavy vaginal bleeding, or bleeding with pain',
            'A severe headache with blurred vision or swelling',
            'Convulsions or fits',
            'Baby moving much less, or not at all',
            'Severe abdominal pain that does not settle',
            'Fever with feeling very unwell',
            'Water breaking before labour starts',
            'A newborn who is not feeding, is floppy, or is breathing fast',
          ].map((sign) => (
            <p key={sign} className="flex gap-2 text-sm font-medium text-ink-800">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--color-risk-red)]" aria-hidden />
              {sign}
            </p>
          ))}
        </div>
        <p className="mt-3 text-sm text-ink-700">
          Do not wait to see whether it passes. Do not wait for this app to tell you something you already feel. Go, or
          send someone for help.
        </p>
      </Card>

      <EmergencyPanel audience={audience} />

      <div className="mt-8">
        <SectionHeading eyebrow="Numbers" title="Call these" />
        <div className="mt-4">
          <EmergencyNumbers />
        </div>
        <p className="mt-3 text-sm text-ink-600">{EMERGENCY_CONTACTS.note}</p>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <h3 className="card-title">While you wait for help</h3>
          <ul className="checklist mt-2">
            {[
              'Call the emergency number, and send someone to the road junction to meet the vehicle.',
              'Take your antenatal card or Under-Five card, and this phone.',
              'Note the time symptoms started and anything you have taken.',
              'Do not eat or drink in case you need a procedure.',
              'Do not travel alone if you can avoid it.',
              'If you are bleeding heavily, lie down on your left side while help comes.',
            ].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>

        <Card className="card-pad">
          <h3 className="card-title">Afterwards</h3>
          <p className="mt-1 text-sm text-ink-600">
            Write down what happened while you remember it: the time, the symptoms, who you called, what they said, and
            what treatment was given. It is private to you, and it is genuinely useful at the next visit.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => setNoteOpen(true)} icon={<NotebookPen className="size-4" aria-hidden />}>
              Record what happened
            </Button>
            <Link to="/app/appointments" className="btn btn-secondary btn-sm">
              Add a follow-up visit
            </Link>
          </div>
        </Card>
      </div>

      <Card className="card-pad mt-6 border-ink-200 bg-ink-50">
        <h3 className="card-title">What Mama Care cannot do</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-700">
          This app is an information and record-keeping tool. It is not an emergency service, it cannot measure your blood
          pressure or listen to a heartbeat, and it cannot diagnose anything. In a life-threatening situation it will slow
          you down — close it and call, or go.
        </p>
        <p className="mt-2 text-sm text-ink-600">
          If you are unsure whether something is serious, treat it as serious. A midwife would rather see you
          unnecessarily than miss something.
        </p>
      </Card>

      <Modal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Record what happened"
        description="Saved to your private journal. Nobody else can read it — not a provider, not a supporter."
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveNote()} loading={saving} disabled={note.trim().length < 5}>
              Save to journal
            </Button>
          </>
        }
      >
        <Field label="What happened?" htmlFor="emergency-note" hint="Symptoms, times, who you called, what they said, any treatment given.">
          <TextArea
            id="emergency-note"
            rows={7}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. 03:20 — heavy bleeding started, called 991, ambulance arrived 04:05, taken to UTH labour ward…"
          />
        </Field>
      </Modal>
    </AppShell>
  );
}
