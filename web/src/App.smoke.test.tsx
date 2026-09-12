// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';

/**
 * Application smoke tests.
 *
 * These mount the real application — real router, real providers, real service
 * registry — in a DOM, at the URLs a person types. They exist because compiling
 * is not evidence: the failures that produced blank pages and the interface's
 * error screen in production were runtime failures during module evaluation and
 * first render, and only a render can catch those.
 */

// React 19 asks the environment to declare that `act` is supported.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function mount(): void {
  container = document.createElement('div');
  container.id = 'root';
  document.body.appendChild(container);
  root = createRoot(container);
}

async function renderAt(path: string): Promise<void> {
  window.history.pushState({}, '', path);
  await act(async () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });

  // Route chunks are lazy, and the test runner transforms each one on first use,
  // which can take a second. Poll until the boot placeholder is gone (or give up
  // after a generous timeout) instead of guessing at a delay.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const current = container.textContent ?? '';
    if (current.length > 0 && !/Loading your workspace/i.test(current)) return;
  }
}

const text = (): string => container.textContent ?? '';
/** Drawers and modals render through a portal, so they live on the body. */
const portalText = (): string => document.body.textContent ?? '';

/** React-controlled inputs need the native setter, then a real input event. */
async function type(selector: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`No field matching ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function submitForm(): Promise<void> {
  const form = container.querySelector('form');
  if (!form) throw new Error('No form to submit');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mount();
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('the application boots and opens on the public site', () => {
  it('renders the homepage at / without signing in, and never a login wall', async () => {
    await renderAt('/');

    expect(text()).not.toMatch(/unexpected error/i);
    expect(text().length).toBeGreaterThan(200);
    expect(text()).toMatch(/MAMA CARE/i);
    // The public header and the way into the account screens are both present.
    expect(text()).toMatch(/Sign in|Create an account|Get started/i);
    // A registration form must not be the first screen.
    expect(text()).not.toMatch(/Confirm password/i);
  });

  it('renders the registration page with the Zambian defaults shown', async () => {
    await renderAt('/register');
    expect(text()).not.toMatch(/unexpected error/i);
    expect(text()).toMatch(/Create .*(account|profile)/i);
    expect(container.querySelectorAll('input').length).toBeGreaterThan(3);

    // Zambia is the deployment default, and the form says so where it matters:
    // the country selector, the dialling hint and the phone example.
    const countryField = container.querySelector('#country');
    expect(countryField, 'a country field must exist').not.toBeNull();
    expect(text()).toMatch(/Zambia/);
    expect(text()).toMatch(/\+260/);

    // No duplicate country inputs — one selector, one phone field.
    const selects = [...container.querySelectorAll('select')];
    expect(selects.filter((select) => /country/i.test(select.id || select.getAttribute('name') || '')).length).toBeLessThanOrEqual(1);
    expect(container.querySelectorAll('input[type="tel"]').length).toBeLessThanOrEqual(1);
  });

  it('opens the main menu from the homepage and lists the real pages', async () => {
    await renderAt('/');
    const trigger = [...container.querySelectorAll('button')].find((button) => /menu/i.test(button.textContent ?? ''));
    expect(trigger, 'the header must offer a menu button').toBeTruthy();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const menu = portalText();
    // A signed-out visitor sees the public pages and the two ways into an
    // account — workspace items (records, training, messages, profile) appear
    // only once there is an account to show them for.
    for (const label of [
      'Home',
      'About the platform',
      'Services',
      'How it works',
      'Maternal health guidance',
      'Emergency guidance',
      'For clinics',
      'For mothers',
      'Resources & reading',
      'Sign in',
      'Create an account',
      'Questions & answers',
      'Contact support',
      'Service status',
    ]) {
      expect(menu, `main menu should offer "${label}"`).toContain(label);
    }
    // Pages that do not exist are not advertised.
    expect(menu).not.toMatch(/Investment|Opportunit/i);
  });

  it('renders the sign-in page with its form and no crash', async () => {
    await renderAt('/signin');
    expect(text()).not.toMatch(/unexpected error/i);
    expect(container.querySelectorAll('form').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('input[type="password"]').length).toBe(1);
  });

  it('renders the diagnostics page used to explain a deployment', async () => {
    await renderAt('/status');
    expect(text()).not.toMatch(/unexpected error/i);
    expect(text()).toMatch(/status|environment|deployment/i);
  });

  it('renders a friendly not-found page for an unknown address', async () => {
    await renderAt('/this-page-does-not-exist');
    expect(text()).not.toMatch(/unexpected error/i);
    expect(text()).toMatch(/not found|does not exist|could not be found/i);
  });

  /**
   * The reported symptom: opening the sign-in or registration screen produced the
   * interface's own "500 — unexpected error" page on some devices. Those two
   * screens were the only ones that touched storage while rendering, and a browser
   * that refuses `localStorage` (Safari private windows, partitioned iframes,
   * blocked cookies) made that read throw inside render. Both screens must now
   * render normally, with a warning, in that environment.
   */
  it('still renders sign-in and registration when the browser refuses storage', async () => {
    const blocked = (): never => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(blocked);
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(blocked);

    for (const path of ['/signin', '/register']) {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      mount();
      await renderAt(path);

      const shown = text();
      expect(shown, `${path} must not show the 500 error page`).not.toMatch(/500 — unexpected error|Something broke while loading/i);
      expect(shown.length, `${path} must render content`).toBeGreaterThan(200);
      expect(container.querySelectorAll('input[type="password"]').length, `${path} must still offer its form`).toBeGreaterThan(0);
    }
  });

  it('answers a wrong password in plain language, through the real form', async () => {
    await renderAt('/signin');
    await type('#email', 'nobody@example.org');
    await type('#password', 'WrongPassword1');
    await submitForm();

    const shown = text();
    expect(shown).not.toMatch(/unexpected error/i);
    // Never a raw provider code, and never a silent failure.
    expect(shown).not.toMatch(/auth\/(invalid-credential|user-not-found|wrong-password)/);
    expect(shown).toMatch(/Invalid email or password|incorrect|does not exist/i);
  });

  it('shows the public supporting pages without a crash', async () => {
    for (const path of [
      '/maternal-health',
      '/emergency',
      '/faq',
      '/privacy',
      '/contact',
      '/about',
      '/services',
      '/how-it-works',
      '/for-clinics',
      '/for-mothers',
      '/resources',
    ]) {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      mount();
      await renderAt(path);
      const shown = text();
      expect(shown, `page ${path}`).not.toMatch(/unexpected error/i);
      // A route that resolved but rendered nothing would also pass the check
      // above, so require real content from each page.
      expect(shown.length, `page ${path} must render content`).toBeGreaterThan(400);
    }
  });

  /**
   * The six informational pages must each render their own subject and the
   * public header, and must be reachable from the header navigation rather than
   * only by typing an address.
   */
  it('renders each informational page with its own subject and the public header', async () => {
    const expectations: Array<[string, RegExp]> = [
      ['/about', /A pregnancy record that survives the next visit/i],
      ['/services', /What the platform does, and what your facility offers/i],
      ['/how-it-works', /One record, from registration to the six-week check/i],
      ['/for-clinics', /Adopting MAMA CARE at a facility/i],
      ['/for-mothers', /Your own record, on your own phone/i],
      ['/resources', /Reading for each stage, and the guidance behind it/i],
    ];

    for (const [path, subject] of expectations) {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      mount();
      await renderAt(path);

      const shown = text();
      expect(shown, `${path} must state its subject`).toMatch(subject);
      // Every page opens with the breadcrumb trail and carries the site chrome.
      expect(shown, `${path} must carry the public header`).toMatch(/MAMA CARE/i);
      expect(container.querySelector('a[href="/"]'), `${path} must link back home`).not.toBeNull();
      expect(container.querySelector('footer'), `${path} must render the footer`).not.toBeNull();
    }
  });

  it('lists the informational pages in the header navigation', async () => {
    await renderAt('/');
    const nav = container.querySelector('nav[aria-label="Primary"]');
    expect(nav, 'the public header must render a primary nav').not.toBeNull();

    const hrefs = [...(nav?.querySelectorAll('a') ?? [])].map((anchor) => anchor.getAttribute('href'));
    for (const expected of ['/about', '/services', '/how-it-works', '/maternal-health', '/emergency', '/contact']) {
      expect(hrefs, `header nav should link to ${expected}`).toContain(expected);
    }
    // The footer offers the audience pages and the resources library.
    for (const expected of ['/for-clinics', '/for-mothers', '/resources', '/privacy', '/faq', '/status']) {
      expect(
        [...container.querySelectorAll('footer a')].map((anchor) => anchor.getAttribute('href')),
        `footer should link to ${expected}`,
      ).toContain(expected);
    }
  });

  /**
   * The services page reads the facility services catalogue and the clinics page
   * reads the facility directory — both through the real data layer. A
   * signed-out visitor on a deployment with nothing published must still get a
   * readable page, not an error screen or a crash.
   */
  it('degrades to a readable state when a deployment publishes no catalogue or directory', async () => {
    for (const path of ['/services', '/for-clinics', '/resources']) {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      mount();
      await renderAt(path);

      const shown = text();
      expect(shown, `${path} must not show the interface error page`).not.toMatch(
        /500 — unexpected error|Something broke while loading/i,
      );
      expect(shown, `${path} must explain the state instead of failing`).toMatch(
        /No services published|No facilities published|Nothing published|opens with an account|could not be read/i,
      );
    }
  });
});
