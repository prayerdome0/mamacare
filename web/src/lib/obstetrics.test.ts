import { describe, expect, it } from 'vitest';
import {
  DAYS_IN_PREGNANCY,
  ageFromDob,
  eddFromLmp,
  gestationalAge,
  lmpFromEdd,
  shortGestationalAge,
  suggestNextAppointment,
  trimesterLabel,
} from './obstetrics';
import { formatPatientId, isPatientId, normalizePatientId, newId, slugify } from './ids';
import { MAX_IMAGE_BYTES, passwordField, passwordPolicy, validateFile } from './validation';

describe('gestational dating', () => {
  it('derives the due date as 280 days from the last menstrual period', () => {
    const edd = eddFromLmp('2026-01-01');
    expect(edd).toBe('2026-10-08');
    expect(lmpFromEdd(edd)).toBe('2026-01-01');
    expect(DAYS_IN_PREGNANCY).toBe(280);
  });

  it('computes weeks and days at a given date', () => {
    const ga = gestationalAge({ lmpDate: '2026-01-01', asOf: new Date('2026-08-12T12:00:00Z') });
    expect(ga.valid).toBe(true);
    expect(ga.weeks).toBe(31);
    expect(ga.days).toBe(6);
    expect(ga.trimester).toBe(3);
    expect(ga.progressPct).toBeGreaterThan(75);
    expect(ga.progressPct).toBeLessThan(100);
    expect(shortGestationalAge(ga)).toBe('31+6');
    expect(trimesterLabel(ga)).toMatch(/third/i);
  });

  it('works back from an estimated due date when the LMP is unknown', () => {
    const ga = gestationalAge({ eddDate: '2026-10-08', asOf: new Date('2026-08-12T12:00:00Z') });
    expect(ga.weeks).toBe(31);
    expect(ga.valid).toBe(true);
  });

  it('uses a clinician-documented gestational age as a floor', () => {
    const ga = gestationalAge({
      lmpDate: '2026-01-20',
      asOf: new Date('2026-08-12T12:00:00Z'),
      documented: { weeks: 34, days: 0, at: '2026-08-01' },
    });
    expect(ga.weeks).toBeGreaterThanOrEqual(34);
  });

  it('refuses to invent a dating when the inputs are unusable', () => {
    expect(gestationalAge({ asOf: new Date('2026-08-12') }).valid).toBe(false);
    expect(gestationalAge({ lmpDate: 'not-a-date', asOf: new Date() }).valid).toBe(false);
  });

  it('flags post-dated pregnancies and clamps the progress bar, not the dating', () => {
    const late = gestationalAge({ lmpDate: '2026-01-01', asOf: new Date('2026-10-20T12:00:00Z') });
    expect(late.weeks).toBe(41);
    expect(late.postTerm).toBe(false); // 41+0 is late-term, the 42-week threshold is configurable
    expect(late.progressPct).toBeLessThanOrEqual(100);
    const post = gestationalAge({ lmpDate: '2026-01-01', asOf: new Date('2026-10-27T12:00:00Z') });
    expect(post.weeks).toBe(42);
    expect(post.postTerm).toBe(true);
    expect(post.progressPct).toBe(100);
  });

  it('suggests the next visit on the routine schedule for the gestation', () => {
    const ga = gestationalAge({ lmpDate: '2026-01-01', asOf: new Date('2026-08-12T12:00:00Z') });
    const next = suggestNextAppointment({ ga, eddDate: '2026-10-08' });
    expect(next).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Never in the past, never after the due date.
    expect(next >= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(next <= '2026-10-08').toBe(true);
  });

  it('derives an age from a date of birth only when one exists', () => {
    expect(ageFromDob('2000-02-29', new Date('2026-08-12'))).toBe(26);
    expect(ageFromDob(null)).toBeNull();
  });
});

describe('identifiers', () => {
  it('formats the canonical patient id with a padded sequence', () => {
    expect(formatPatientId(245)).toBe('MC-000245');
    expect(formatPatientId(7, 'LUS')).toBe('LUS-000007');
  });

  it('recognises and normalises a patient id, and rejects a name', () => {
    expect(isPatientId('mc-000245')).toBe(true);
    expect(normalizePatientId(' mc-245 ')).toBe('MC-000245');
    expect(isPatientId('Banda Mary')).toBe(false);
  });

  it('generates distinct client references and slugs', () => {
    expect(newId('visit')).not.toBe(newId('visit'));
    expect(newId('visit').startsWith('visit_')).toBe(true);
    expect(slugify('Chazoma Health Centre!')).toBe('chazoma-health-centre');
  });
});

describe('input validation', () => {
  it('rejects an image over the size limit and accepts one under it', () => {
    const tooBig = { name: 'scan.png', type: 'image/png', size: MAX_IMAGE_BYTES + 1 };
    expect(validateFile(tooBig, { maxBytes: MAX_IMAGE_BYTES })).toMatch(/size|large/i);
    expect(validateFile({ name: 'scan.png', type: 'image/png', size: 400_000 }, { maxBytes: MAX_IMAGE_BYTES })).toBeNull();
  });

  it('rejects a disallowed file type before anything is uploaded', () => {
    const message = validateFile({ name: 'notes.txt', type: 'text/plain', size: 20 }, { accept: ['image/png'] });
    expect(message).toMatch(/type|format|not.*allowed|accept/i);
  });

  it('enforces the documented password policy', () => {
    expect(passwordPolicy.minLength).toBe(10);
    expect('MamaCare!2026'.length).toBeGreaterThanOrEqual(passwordPolicy.minLength);
    expect(passwordPolicy.pattern.test('MamaCare!2026')).toBe(true);
    expect(passwordPolicy.pattern.test('mamacare2026')).toBe(false); // no uppercase
    expect(passwordPolicy.pattern.test('MAMACAREXXXX')).toBe(false); // no digit
    // Length and character mix are separate checks: the pattern is the character
    // rule, `minLength` is enforced by the field schema.
    expect('Short1'.length).toBeLessThan(passwordPolicy.minLength);
    expect(passwordField.safeParse('Short1').success).toBe(false);
    expect(passwordPolicy.message).toMatch(/10 characters/);
  });
});
