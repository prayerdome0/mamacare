/**
 * Firebase client bootstrap.
 *
 * Configuration comes exclusively from `VITE_FIREBASE_*` environment variables
 * (the public Web SDK config). Nothing here contains a service account, an API
 * secret, or an FCM registration token — privileged work is delegated to the
 * API service, which verifies the ID token minted here.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, browserSessionPersistence, setPersistence, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { AppError } from '@/lib/errors';
import { firebase as firebaseEnv, integrations } from '@/config/env';

export const isFirebaseConfigured = (): boolean => integrations.firebase.configured;

let app: FirebaseApp | null = null;
let authRef: Auth | null = null;
let dbRef: Firestore | null = null;
let functionsRef: Functions | null = null;

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

export function getFns(): Functions {
  if (!functionsRef) {
    const instance = getFirebaseApp();
    const region = (import.meta.env?.VITE_FUNCTIONS_REGION as string | undefined) || 'us-central1';
    functionsRef = getFunctions(instance, region);
  }
  return functionsRef;
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
