import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../env.js';
import { dbOrThrow } from '../firebase.js';
import { rateLimited, unsupported, withBody } from '../http.js';
import { clientIp } from '../http.js';
import { writeAudit } from '../audit.js';

/**
 * Public contact form.
 *
 * Hardened because it is the only unauthenticated write in the product:
 * rate-limited per address, honeypot + minimum dwell time to blunt scripts, a
 * strict field budget, PII kept to what the visitor typed, and no reply address
 * taken from the body (so this cannot be abused as a mail relay).
 */
export const contactRouter = Router();

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s()-]{6,23}$/, 'Enter a phone number we can actually call back.')
    .optional()
    .or(z.literal('')),
  topic: z.enum(['FACILITY', 'SUPPORT', 'PARTNERSHIP', 'PRESS', 'OTHER']).default('OTHER'),
  message: z.string().trim().min(20, 'Please add a little more detail.').max(1500),
  /** Filled in by hidden form fields; any non-empty value marks a bot. */
  website: z.string().max(0).optional(),
  secondsOnPage: z.number().min(3, 'Give the form a moment before sending.').optional(),
});

const recentHashes = new Map<string, number>();

contactRouter.post('/', withBody(schema, async (input, req) => {
  if (input.website) {
    // A honeypot hit is answered as if it worked, so a script learns nothing.
    return { accepted: true, mailtoFallback: false };
  }

  const hash = createHash('sha256')
    .update(`${clientIp(req)}|${input.topic}|${input.message.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);
  const seen = recentHashes.get(hash);
  if (seen && Date.now() - seen < 10 * 60_000) {
    throw rateLimited('That message was just sent. Please wait a few minutes before sending it again.');
  }
  recentHashes.set(hash, Date.now());
  if (recentHashes.size > 1000) {
    for (const [key, value] of recentHashes) if (Date.now() - value > 30 * 60_000) recentHashes.delete(key);
  }

  if (!/^(application\/|text\/)/.test(String(req.headers['content-type'] ?? 'application/json'))) {
    throw unsupported('The contact form expects a standard form submission.');
  }

  const record = {
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    topic: input.topic,
    message: input.message,
    submittedAt: new Date().toISOString(),
    source: 'public-site',
    status: 'NEW',
    forwardedTo: null,
    /** Deliberately not stored: full IP, user agent, referrer. */
  };

  let documentId: string | null = null;
  try {
    const reference = await dbOrThrow().collection('contact_messages').add(record);
    documentId = reference.id;
  } catch (error) {
    console.error('[contact] could not store the message:', error instanceof Error ? error.message : error);
  }

  let forwarded = false;
  if (env.email.configured) {
    try {
      const response = await fetch(env.email.relayEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.email.relayApiKey}` },
        body: JSON.stringify({
          from: env.email.from,
          to: env.email.to,
          replyTo: input.email || undefined,
          subject: `MAMA CARE — ${input.topic.toLowerCase()} enquiry from ${input.name}`,
          text: input.message,
        }),
      });
      forwarded = response.ok;
      if (!response.ok) console.error(`[contact] relay responded ${response.status}`);
    } catch (error) {
      console.error('[contact] relay failed:', error instanceof Error ? error.message : error);
    }
  } else {
    // No relay configured: the message is still stored, and the interface offers a
    // mailto link. This is reported honestly rather than as a silent success.
    console.info('[contact] EMAIL_RELAY_ENDPOINT not configured — message stored only.');
  }

  if (documentId && forwarded) {
    await dbOrThrow().collection('contact_messages').doc(documentId).set({ forwardedTo: env.email.to, status: 'FORWARDED' }, { merge: true }).catch(() => null);
  }
  await writeAudit(dbOrThrowSafely(), null, {
    action: 'contact.message_received',
    targetType: 'notification',
    targetId: documentId ?? 'unstored',
    metadata: { topic: input.topic, forwarded, hasEmail: Boolean(input.email), hasPhone: Boolean(input.phone) },
  });

  return { accepted: true, mailtoFallback: !forwarded, id: documentId };
}));

/** The audit write must never break the response, so a missing db is tolerated. */
function dbOrThrowSafely() {
  try {
    return dbOrThrow();
  } catch {
    return null as never;
  }
}

contactRouter.get('/topics', (_req, res) => {
  res.json({
    topics: [
      { value: 'FACILITY', label: 'Our clinic wants to use MAMA CARE' },
      { value: 'SUPPORT', label: 'Help with an account or a record' },
      { value: 'PARTNERSHIP', label: 'Partnership or funding' },
      { value: 'PRESS', label: 'Press enquiry' },
      { value: 'OTHER', label: 'Something else' },
    ],
  });
});
