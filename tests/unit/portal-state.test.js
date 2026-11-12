// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPage } from '../helpers.js';
import { trackPendingSave } from '@/utils/pending-saves.js';

const { signOutUser } = vi.hoisted(() => ({ signOutUser: vi.fn() }));
vi.mock('@/auth/session.js', () => ({ signOutUser: (...args) => signOutUser(...args) }));

import { mountPortalState, signOutThroughPortal } from '@/ui/portal-state.js';

describe('shared portal states', () => {
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    document.body.replaceChildren();
    signOutUser.mockReset();
  });

  it('saves filled form drafts and waits for pending operations before signing out', async () => {
    loadPage('instructor/dashboard.html');
    const input = document.createElement('input');
    input.id = 'classTitle';
    input.name = 'title';
    input.value = 'Reading group';
    document.querySelector('#classForm').append(input);
    let finishWrite;
    trackPendingSave(() => new Promise((resolve) => { finishWrite = resolve; }));
    signOutUser.mockResolvedValue();
    const navigate = vi.fn();
    const state = mountPortalState({ uid: 'user-1', navigate });

    const signingOut = signOutThroughPortal();
    expect(signOutUser).not.toHaveBeenCalled();
    await Promise.resolve();
    finishWrite();
    await signingOut;

    const draft = sessionStorage.getItem(`cfl:portal-drafts:user-1:${window.location.pathname}`);
    expect(JSON.parse(draft).classForm.classTitle).toBe('Reading group');
    expect(signOutUser).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/login?reason=signed-out');
    state.dispose();
  });

  it('shows and clears the no-internet state as connectivity changes', () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const state = mountPortalState({ uid: 'user-2', navigate: vi.fn() });
    const notice = document.querySelector('.portal-state-notice--offline');
    expect(notice.hidden).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(notice.hidden).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(notice.hidden).toBe(true);
    state.dispose();
  });

  it('uses the existing loading and empty messages as immediate shared states', async () => {
    loadPage('instructor/dashboard.html');
    const loading = document.querySelector('#instructorBio');
    const emptyList = document.createElement('ul');
    const empty = document.createElement('li');
    empty.textContent = 'No assigned students yet.';
    emptyList.append(empty);
    document.body.append(emptyList);
    const state = mountPortalState({ uid: 'user-3', navigate: vi.fn() });

    expect(loading.dataset.state).toBe('loading');
    expect(empty.classList.contains('empty-state')).toBe(true);

    loading.textContent = 'Profile loaded';
    await vi.waitFor(() => expect(loading.dataset.state).toBeUndefined());
    state.dispose();
  });

  it('restores a same-account draft after the protected page has initialized', async () => {
    loadPage('instructor/dashboard.html');
    const input = document.createElement('input');
    input.id = 'classTitle';
    input.name = 'title';
    document.querySelector('#classForm').append(input);
    sessionStorage.setItem(
      `cfl:portal-drafts:user-4:${window.location.pathname}`,
      JSON.stringify({ classForm: { classTitle: 'Draft class' } }),
    );
    const state = mountPortalState({ uid: 'user-4', navigate: vi.fn() });

    await vi.waitFor(() => expect(input.value).toBe('Draft class'));
    expect(sessionStorage.getItem(`cfl:portal-drafts:user-4:${window.location.pathname}`)).toBeNull();
    state.dispose();
  });
});
