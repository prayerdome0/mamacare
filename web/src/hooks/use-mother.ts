/**
 * Mother context.
 *
 * One hook resolves everything the mother-facing screens need about *this* user:
 * her profile, her current pregnancy, the gestational age derived from it, whether
 * the app should be in Pregnancy mode or Mother & Baby mode, her babies, her next
 * appointment and today's reminders.
 *
 * Gestational age is always derived at read time from the dating anchor, never
 * stored — a record written at 12 weeks would otherwise still say 12 weeks a
 * month later.
 */

import { useCallback, useEffect, useState } from 'react';
import { gestationalAge, type GestationalAge } from '@/lib/obstetrics';
import { errorDisplay } from '@/lib/errors';
import { useSession } from '@/providers/app-providers';
import {
  appointmentRepo,
  babyRepo,
  notificationRepo,
  pregnancyRepo,
  reminderRepo,
  todayReminders,
} from '@/services/repositories';
import type { Appointment, Baby, Pregnancy, Reminder, UserProfile } from '@/types/domain';

export type MotherMode = 'setup' | 'pregnancy' | 'postnatal';

export interface MotherContext {
  profile: UserProfile | null;
  pregnancy: Pregnancy | null;
  ga: GestationalAge | null;
  mode: MotherMode;
  babies: Baby[];
  activeBaby: Baby | null;
  nextAppointment: Appointment | null;
  reminders: Reminder[];
  dueToday: Reminder[];
  unreadNotifications: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setActiveBabyId: (id: string) => void;
}

const EMPTY: MotherContext = {
  profile: null,
  pregnancy: null,
  ga: null,
  mode: 'setup',
  babies: [],
  activeBaby: null,
  nextAppointment: null,
  reminders: [],
  dueToday: [],
  unreadNotifications: 0,
  loading: true,
  error: null,
  refresh: () => undefined,
  setActiveBabyId: () => undefined,
};

export function useMotherContext(): MotherContext {
  const { actor, profile } = useSession();
  const [state, setState] = useState<Omit<MotherContext, 'refresh' | 'setActiveBabyId'>>({
    ...EMPTY,
    loading: Boolean(actor),
  });
  const [tick, setTick] = useState(0);
  const [activeBabyId, setActiveBabyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!actor) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [pregnancy, babies, nextAppointment, reminders, notifications] = await Promise.all([
        pregnancyRepo.current(actor.uid).catch(() => null),
        babyRepo.list(actor.uid).catch(() => [] as Baby[]),
        appointmentRepo.next(actor.uid).catch(() => null),
        reminderRepo.list(actor.uid).catch(() => [] as Reminder[]),
        notificationRepo.list(actor.uid, 25).catch(() => ({ rows: [], total: 0, unread: 0 })),
      ]);

      const delivered = pregnancy?.status === 'delivered';
      const mode: MotherMode = !pregnancy ? 'setup' : delivered ? 'postnatal' : 'pregnancy';
      const ga = pregnancy
        ? gestationalAge({
            lmpDate: pregnancy.lmpDate,
            eddDate: pregnancy.eddDate,
            asOf: delivered && pregnancy.deliveryDate ? new Date(pregnancy.deliveryDate) : new Date(),
          })
        : null;
      const dueToday = await todayReminders(reminders).catch(() => [] as Reminder[]);

      setState({
        profile,
        pregnancy,
        ga: ga && ga.valid ? ga : null,
        mode: babies.length > 0 && mode !== 'pregnancy' ? 'postnatal' : mode,
        babies,
        activeBaby: null, // resolved below so `activeBabyId` is honoured
        nextAppointment,
        reminders,
        dueToday,
        unreadNotifications: notifications.unread,
        loading: false,
        error: null,
      });
    } catch (error) {
      const display = errorDisplay(error);
      setState((current) => ({ ...current, loading: false, error: display.message }));
    }
  }, [actor, profile]);

  useEffect(() => {
    void load();
    // Re-check every five minutes so the week number and "due today" stay honest
    // while the app is left open on a phone.
    const handle = setInterval(() => void load(), 5 * 60_000);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, tick]);

  const activeBaby =
    state.babies.find((baby) => baby.id === activeBabyId) ?? state.babies[0] ?? null;

  return {
    ...state,
    activeBaby,
    refresh: () => setTick((value) => value + 1),
    setActiveBabyId: (id: string) => setActiveBabyId(id),
  };
}

/** Greeting that matches the time of day, used on the dashboard. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** First name only — the dashboard says "Good morning, Chileshe", never the full name. */
export const firstName = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? 'Mama';
