// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '@/services/api/client';

/**
 * The API service is optional for the core application: uploads fall back to
 * device storage, reminders queue with a stated reason. What it must never do is
 * pretend a reply is data when it is not one.
 *
 * On a static host with no Node runtime (Vercel) — or behind a login wall — the
 * API paths return the single-page application's HTML. Parsing that as JSON, or
 * passing it to a caller as a result, is exactly the class of silent failure that
 * makes a product look broken in the field.
 */

const respond = (body: string, init: { status?: number; contentType?: string } = {}): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, {
      status: init.status ?? 200,
      headers: { 'content-type': init.contentType ?? 'text/html' },
    })),
  );
};

const client = (): ApiClient => {
  const instance = new ApiClient();
  instance.setTokenProvider(async () => 'test-token');
  return instance;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a reply that is not JSON from the API service', () => {
  it('is reported as an unreachable service, even with a 200 status', async () => {
    respond('<!doctype html><html><body><div id="root"></div></body></html>');
    await expect(client().request('/media/sign')).rejects.toMatchObject({
      message: 'The secure file service is unreachable. Please try again.',
      retryable: true,
    });
  });

  it('is not leaked to the caller as a payload', async () => {
    respond('<html>Host error</html>');
    await expect(client().request('/admin/users')).rejects.toThrow('unreachable');
  });

  it('still returns real JSON untouched', async () => {
    respond(JSON.stringify({ url: 'https://media.example/x.jpg', expiresAt: 1 }), { contentType: 'application/json' });
    await expect(client().request('/media/sign')).resolves.toEqual({ url: 'https://media.example/x.jpg', expiresAt: 1 });
  });

  it('still maps a JSON error body to a friendly message', async () => {
    respond(JSON.stringify({ message: 'Only administrators may do that.' }), { status: 403, contentType: 'application/json' });
    await expect(client().request('/admin/users')).rejects.toMatchObject({ message: 'Only administrators may do that.', code: 'FORBIDDEN' });
  });
});
