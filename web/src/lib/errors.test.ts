import { describe, expect, it } from 'vitest';
import { AppError, describeError, errorDisplay, toAppError, withRetry } from '@/lib/errors';

const authError = (code: string): Error & { code: string } => Object.assign(new Error(`Firebase: ${code}`), { code });

describe('authentication error messages', () => {
  it('speaks to the person, not the provider', () => {
    expect(toAppError(authError('auth/invalid-credential')).message).toBe('Invalid email or password.');
    expect(toAppError(authError('auth/invalid-login-credentials')).message).toBe('Invalid email or password.');
    expect(toAppError(authError('auth/wrong-password')).message).toBe('Invalid email or password.');
    expect(toAppError(authError('auth/user-not-found')).message).toContain('This account does not exist');
    expect(toAppError(authError('auth/email-already-in-use')).message).toContain('This email is already registered');
    expect(toAppError(authError('auth/network-request-failed')).message).toBe('Unable to connect to the server. Check your connection and try again.');
    expect(toAppError(authError('auth/too-many-requests')).message).toContain('Too many attempts');
    expect(toAppError(authError('auth/too-many-requests')).code).toBe('RATE_LIMIT');
  });

  it('explains deployment mistakes instead of leaking them', () => {
    expect(toAppError(authError('auth/unauthorized-domain')).message).toContain('not authorised for sign-in');
    expect(toAppError(authError('auth/configuration-not-found')).message).toContain('not configured');
    expect(toAppError(authError('auth/operation-not-allowed')).message).toContain('not enabled');
    expect(toAppError(authError('auth/invalid-api-key')).message).toContain('configuration');
  });

  it('never echoes an unknown provider message to the user', () => {
    const fallback = toAppError(new Error('INTERNAL: transport handshake failure at 0x7f'), 'Unable to create your account. Please try again.');
    expect(fallback.message).toBe('Unable to create your account. Please try again.');
    expect(fallback.message).not.toContain('0x7f');
    expect(fallback.code).toBe('UNKNOWN');
  });

  it('maps Firestore failures onto actionable sentences', () => {
    expect(toAppError({ code: 'permission-denied' }).message).toBe('You do not have permission to perform this action.');
    expect(toAppError({ code: 'unavailable' }).code).toBe('NETWORK');
    expect(toAppError({ code: 'failed-precondition' }).message).toContain('index');
    expect(errorDisplay(new AppError('Try later.', 'NETWORK')).retryable).toBe(true);
  });

  it('keeps technical detail available to developers', () => {
    const described = describeError(authError('auth/unauthorized-domain'));
    expect(described.code).toBe('auth/unauthorized-domain');
    expect(described.name).toBe('Error');
    expect(described.message).toContain('auth/unauthorized-domain');
  });
});

describe('retry policy', () => {
  it('retries network failures and gives up on validation failures', async () => {
    let flaky = 0;
    const value = await withRetry(async () => {
      flaky += 1;
      if (flaky < 2) throw new AppError('unreachable', 'NETWORK');
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(flaky).toBe(2);

    await expect(withRetry(async () => {
      throw new AppError('bad input', 'VALIDATION');
    })).rejects.toThrow('bad input');
  });
});
