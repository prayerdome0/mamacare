import { getMessaging } from 'firebase-admin/messaging';
import { env } from './env.js';
import { notConfigured, upstream } from './http.js';

/**
 * Outbound channels.
 *
 * Both are written so that a deployment without credentials fails *loudly and
 * specifically* — a 503 naming the environment variable — instead of silently
 * pretending a message was delivered. Nothing here invents a token, a phone
 * number or a “demo” success.
 */

export interface PushPayload {
  title: string;
  body: string;
  route?: string;
  tag?: string;
  level?: 'info' | 'success' | 'warning' | 'critical';
}

export interface PushResult {
  requested: number;
  sent: number;
  failed: number;
  invalidTokens: string[];
}

/**
 * Sends to registration tokens discovered in `devices` for one user.
 *
 * Tokens are never hard-coded anywhere: they are produced by the browser when the
 * person opts in, stored per device, and pruned here when FCM reports them invalid.
 */
export async function sendPush(tokens: string[], payload: PushPayload): Promise<PushResult> {
  const unique = [...new Set(tokens.filter((token) => typeof token === 'string' && token.length > 20))];
  if (unique.length === 0) return { requested: 0, sent: 0, failed: 0, invalidTokens: [] };

  const messaging = getMessaging();
  const responses = await messaging
    .sendEachForMulticast({
      tokens: unique,
      notification: { title: payload.title, body: payload.body },
      webpush: {
        headers: { TTL: '3600', Urgency: 'high' },
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: payload.tag ?? 'mamacare',
          renotify: true,
          requireInteraction: payload.level === 'critical',
          data: { route: payload.route ?? '/app/alerts' },
        },
        fcmOptions: { link: payload.route ?? '/app/alerts' },
      },
      android: { priority: payload.level === 'critical' ? 'high' : 'normal', notification: { channelId: 'mamacare-default' } },
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // A project without FCM configured reports a specific error; surface the fix.
      throw upstream(`Push delivery failed: ${shorten(message)}`);
    });

  const invalidTokens: string[] = [];
  let sent = 0;
  responses.responses.forEach((response, index) => {
    if (response.success) {
      sent += 1;
      return;
    }
    const code = response.error?.code ?? '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
      const token = unique[index];
      if (token) invalidTokens.push(token);
    }
  });

  return { requested: unique.length, sent, failed: unique.length - sent, invalidTokens };
}

export interface SmsMessage {
  to: string;
  text: string;
  /** Optional provider reference for reconciliation. */
  reference?: string;
}

export interface SmsResult {
  queued: boolean;
  providerId: string | null;
  status: 'SENT' | 'QUEUED';
  reason: string | null;
}

/**
 * SMS through the approved provider. The provider is chosen by configuration, so a
 * deployment swaps Twilio for a local aggregator without touching the app.
 */
export async function sendSms(message: SmsMessage): Promise<SmsResult> {
  const to = message.to.replace(/[^\d+]/g, '');
  if (to.length < 8) throw notConfigured('The destination number', ['a valid mother phone number on the appointment record']);

  switch (env.sms.provider) {
    case 'twilio': {
      const body = new URLSearchParams({ To: to, From: env.sms.from, Body: message.text.slice(0, 480) });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.sms.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${env.sms.accountSid}:${env.sms.authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      const text = await response.text();
      if (!response.ok) {
        console.error(`[sms] twilio rejected the send (${response.status}): ${shorten(text)}`);
        throw upstream('The SMS provider rejected this message. The appointment reminder stays queued for a retry.');
      }
      const parsed = JSON.parse(text) as { sid?: string; status?: string };
      return { queued: false, providerId: parsed.sid ?? null, status: 'SENT', reason: parsed.status ?? null };
    }
    case 'http': {
      const response = await fetch(env.sms.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.sms.apiKey}` },
        body: JSON.stringify({ to, text: message.text.slice(0, 480), reference: message.reference }),
      });
      if (!response.ok) {
        console.error(`[sms] gateway responded ${response.status}`);
        throw upstream('The SMS gateway did not accept this message. It stays queued for a retry.');
      }
      const parsed = (await response.json().catch(() => ({}))) as { id?: string };
      return { queued: false, providerId: parsed.id ?? null, status: 'SENT', reason: null };
    }
    case 'queue-only':
      // Some deployments only want the row written for an external sender.
      return { queued: true, providerId: null, status: 'QUEUED', reason: 'queue-only' };
    default:
      throw notConfigured('SMS delivery', ['SMS_PROVIDER', 'SMS_ENDPOINT_URL and SMS_API_KEY (or the Twilio variables)']);
  }
}

const shorten = (value: string): string => (value.length > 240 ? `${value.slice(0, 240)}…` : value);

export const channelStatus = (): { push: boolean; sms: 'twilio' | 'http' | 'queue-only' | 'none' } => ({
  push: Boolean(env.firebaseProjectId),
  sms: env.sms.configured
    ? (env.sms.provider as 'twilio' | 'http')
    : env.sms.provider === 'queue-only'
      ? 'queue-only'
      : 'none',
});
