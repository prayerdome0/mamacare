// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

/**
 * Boot resilience.
 *
 * Every route depends on the service registry, and the registry imports both the
 * Firebase and the device authentication adapters. Firebase Auth used to be
 * acquired in the constructor of a module-level singleton, so a build without
 * Firebase environment variables threw while the bundle was still evaluating —
 * before any React error boundary existed — and every URL failed, including
 * sign-in and registration. These tests hold the lazy initialisation in place.
 */
describe('application boot', () => {
  it('imports the service registry without throwing when Firebase is not configured', async () => {
    const mod = await import('@/services/session-store');
    expect(() => mod.services()).not.toThrow();
  });

  it('falls back to the device provider and says why, instead of failing', async () => {
    const mod = await import('@/services/session-store');
    const registry = mod.services();
    expect(registry.provider.kind).toBe('local');
    expect(mod.isLocalProvider()).toBe(true);
  });

  it('reports a usable anonymous session state', async () => {
    const { services } = await import('@/services/session-store');
    const state = services().getState();
    expect(['initialising', 'anonymous', 'authenticated']).toContain(state.status);
    expect(state.permissions.canAdministerPlatform).toBe(false);
  });
});
