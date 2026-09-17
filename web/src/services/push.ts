/**
 * Browser push (Firebase Cloud Messaging).
 *
 * Foreground messages arrive through `onMessage` and become an in-app toast plus a
 * row in the notification list. Background messages are handled by the separately
 * compiled service worker at `/firebase-messaging-sw.js`, which shows the system
 * notification and opens the route in `data.route`.
 *
 * The registration token is stored per device in `devices` so a scheduled job can
 * send reminders later. No health data is ever put in a push payload: the payload
 * carries a title, a body and a route, and the detail lives in the app.
 *
 * Every failure path returns a plain reason instead of throwing — a user who
 * declines the browser permission must not see an error, they should see "push is
 * off, in-app reminders still work".
 */

import { app, integrations } from '@/config/env';
import { logProviderError } from '@/lib/errors';
import { services } from '@/services/session-store';
import { deviceRepo, notificationRepo } from '@/services/repositories';
import type { NotificationKind } from '@/types/domain';

export type PushState =
  | { status: 'unsupported'; reason: string }
  | { status: 'unconfigured'; reason: string }
  | { status: 'default'; reason: string }
  | { status: 'denied'; reason: string }
  | { status: 'granted'; token: string | null }
  | { status: 'error'; reason: string };

let messagingPromise: Promise<import('firebase/messaging').Messaging | null> | null = null;
let onMessageUnsubscribe: (() => void) | null = null;

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'Notification' in window && 'PushManager' in window;

async function messaging(): Promise<import('firebase/messaging').Messaging | null> {
  if (!integrations.firebase.configured || !app.fcmVapidKey) return null;
  if (!messagingPromise) {
    messagingPromise = (async () => {
      try {
        const [{ getMessaging }, { getFirebaseApp }] = await Promise.all([
          import('firebase/messaging'),
          import('@/services/firebase/app'),
        ]);
        return getMessaging(getFirebaseApp());
      } catch (error) {
        logProviderError('messaging init', error);
        return null;
      }
    })();
  }
  return messagingPromise;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) {
    return { status: 'unsupported', reason: 'This browser does not support web push notifications.' };
  }
  if (!integrations.push.configured) {
    return { status: 'unconfigured', reason: 'Push is not configured for this deployment (no VAPID key).' };
  }
  const permission = Notification.permission;
  if (permission === 'denied') {
    return {
      status: 'denied',
      reason: 'Notifications are blocked for this site. Allow them in your browser settings to receive reminders.',
    };
  }
  if (permission === 'default') {
    return { status: 'default', reason: 'Ask this device to allow notifications to receive appointment and medication reminders.' };
  }
  return { status: 'granted', token: null };
}

/**
 * Requests permission and registers the device. Safe to call repeatedly: it is a
 * no-op when permission is already granted and the token is already stored.
 */
export async function enablePush(userId: string): Promise<PushState> {
  if (!pushSupported()) {
    return { status: 'unsupported', reason: 'This browser does not support web push notifications.' };
  }
  const instance = await messaging();
  if (!instance) {
    return { status: 'unconfigured', reason: 'Push is not available in this build.' };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        status: permission === 'denied' ? 'denied' : 'default',
        reason:
          permission === 'denied'
            ? 'Notifications are blocked for this site. In-app reminders still work.'
            : 'You have not allowed notifications yet. In-app reminders still work.',
      };
    }
    const { getToken } = await import('firebase/messaging');
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    const token = await getToken(instance, {
      vapidKey: app.fcmVapidKey,
      ...(registration ? { serviceWorkerRegistration: registration } : {}),
    });
    if (token) await deviceRepo.register(userId, token).catch(() => undefined);
    attachForegroundListener(instance);
    return { status: 'granted', token };
  } catch (error) {
    logProviderError('push registration', error);
    return {
      status: 'error',
      reason:
        'Notifications could not be turned on. This usually means the browser blocked the request, or the push certificate does not match this Firebase project. In-app reminders still work.',
    };
  }
}

export async function disablePush(userId: string): Promise<void> {
  try {
    const instance = await messaging();
    if (instance) {
      const { getToken, deleteToken } = await import('firebase/messaging');
      const token = await getToken(instance, { vapidKey: app.fcmVapidKey }).catch(() => null);
      if (token) {
        await deleteToken(instance).catch(() => undefined);
        await deviceRepo.unregister(token).catch(() => undefined);
      }
    }
  } catch (error) {
    logProviderError('push disable', error);
  }
  onMessageUnsubscribe?.();
  onMessageUnsubscribe = null;
  void userId;
}

/** Routes a foreground message into the notification list and the toast layer. */
function attachForegroundListener(instance: import('firebase/messaging').Messaging): void {
  if (onMessageUnsubscribe) return;
  void import('firebase/messaging')
    .then(({ onMessage }) => {
      onMessageUnsubscribe = onMessage(instance, (payload) => {
        const notification = payload.notification ?? {};
        const title = notification.title ?? 'Mama Care';
        const body = notification.body ?? '';
        const route = (payload.data?.route as string | undefined) ?? (payload.data?.link as string | undefined) ?? null;
        const kind = ((payload.data?.kind as NotificationKind | undefined) ?? 'system') as NotificationKind;
        const actor = services().actorRef();

        if (actor) {
          void notificationRepo
            .push({ userId: actor.uid, title, body, kind, link: route, deliveredByPush: true })
            .catch(() => undefined);
        }

        // A focused tab shows the message itself; the service worker only handles
        // background delivery.
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          void navigator.serviceWorker?.ready
            .then((registration) =>
              registration.showNotification(title, {
                body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                tag: (payload.data?.tag as string | undefined) ?? 'mamacare',
                data: { route },
              }),
            )
            .catch(() => undefined);
        }

        window.dispatchEvent(new CustomEvent('mamacare:push', { detail: { title, body, route, kind } }));
      });
    })
    .catch((error) => logProviderError('push listener', error));
}

/** Subscribes to foreground messages without requesting permission. */
export async function watchForegroundMessages(): Promise<() => void> {
  const instance = await messaging();
  if (!instance) return () => undefined;
  attachForegroundListener(instance);
  return () => {
    onMessageUnsubscribe?.();
    onMessageUnsubscribe = null;
  };
}
