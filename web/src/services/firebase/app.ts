/**
 * Firebase client bootstrap.
 *
 * Configuration comes from `VITE_FIREBASE_*` environment variables (the public Web
 * SDK config), with the project's own values committed as defaults so a fresh clone
 * runs. Nothing here contains a service account or an API secret: this build has no
 * backend of its own, so authorisation is enforced by `firestore.rules` and
 * `storage.rules` against the token minted here.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, browserSessionPersistence, setPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { AppError } from '@/lib/errors';
import { firebase as firebaseEnv, integrations } from '@/config/env';

export const isFirebaseConfigured = (): boolean => integrations.firebase.configured;

let app: FirebaseApp | null = null;
let authRef: Auth | null = null;
let dbRef: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new AppError(
      'Firebase is not configured for this deployment. Set the VITE_FIREBASE_* variables in web/.env.local and restart the app.',
      'CONFIGURATION',
    );
  }
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseEnv);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authRef) authRef = getAuth(getFirebaseApp());
  return authRef;
}

export function getDb(): Firestore {
  if (!dbRef) dbRef = getFirestore(getFirebaseApp());
  return dbRef;
}

/**
 * "Sign me out when I close the tab" — used on shared clinic workstations so a
 * later user cannot resume the previous session.
 */
export async function applyPersistencePreference(rememberDevice: boolean): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    await setPersistence(auth, rememberDevice ? browserLocalPersistence : browserSessionPersistence);
  } catch {
    throw new AppError(
      'This browser blocked secure session storage. Use a normal browser window (not private mode) and try again.',
      'CONFIGURATION',
    );
  }
}
