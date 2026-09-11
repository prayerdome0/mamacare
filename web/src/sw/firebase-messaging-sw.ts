/**
 * Firebase Messaging service worker.
 *
 * Built separately from the app (see `mamacareSwPlugin` in vite.config.ts) so the
 * registration URL is stable at `/firebase-messaging-sw.js` and the Firebase SDK is
 * bundled locally instead of pulled from a CDN — clinic devices are often on a
 * metered or flaky connection.
 *
 * It only ever handles BACKGROUND messages. A focused tab receives messages
 * through the `onMessage` listener in `services/notifications/push-service.ts`,
 * which also refreshes the in-app notification list. No patient data is stored in
 * this worker; the payload carries a title, a body and a route.
 */

/// <reference lib="webworker" />

import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
};

if (config.apiKey && config.projectId && config.appId) {
  const messaging = getMessaging(initializeApp(config));

  onBackgroundMessage(messaging, (payload) => {
    const notification = payload.notification ?? {};
    const title = notification.title ?? 'MAMA CARE';
    const body = notification.body ?? 'You have a new update from your clinic.';
    const route = (payload.data?.route as string | undefined) ?? '/app/alerts';

    // `renotify`/`timestamp` are part of the Notifications API but missing from
    // lib.dom's NotificationOptions, hence the cast.
    const showPromise = self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: payload.data?.tag ?? 'mamacare',
      renotify: true,
      silent: false,
      data: { route },
      timestamp: Date.now(),
    } as NotificationOptions);

    // Keeps the worker alive until the notification is on screen.
    return showPromise.catch(() => undefined);
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const route = (event.notification.data as { route?: string } | undefined)?.route ?? '/app';
    void event.waitUntil(
      (async () => {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = allClients.find((client) => 'focus' in client);
        if (existing) {
          await existing.focus();
          void existing.postMessage({ type: 'navigate', route });
          return;
        }
        await self.clients.openWindow(route);
      })(),
    );
  });
}

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
