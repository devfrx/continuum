import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PromptModalApi = typeof import('@/composables/usePromptModal');

describe('usePromptModal', () => {
  let mod: PromptModalApi;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('@/composables/usePromptModal');
  });

  afterEach(() => {
    // Drain any open dialog so resolver doesn't leak between tests.
    const api = mod.usePromptModal();
    if (api.open.value) api.cancel();
  });

  it('resolves with the submitted value and closes', async () => {
    const api = mod.usePromptModal();
    const pending = api.requestPrompt({ title: 'Rename' });
    expect(api.open.value).toBe(true);
    expect(api.title.value).toBe('Rename');
    api.submit('hello');
    await expect(pending).resolves.toBe('hello');
    expect(api.open.value).toBe(false);
  });

  it('resolves null on cancel', async () => {
    const api = mod.usePromptModal();
    const pending = api.requestPrompt({ title: 'X' });
    api.cancel();
    await expect(pending).resolves.toBeNull();
    expect(api.open.value).toBe(false);
  });

  it('applies defaults and overrides for label/placeholder/initial/confirm', () => {
    const api = mod.usePromptModal();
    void api.requestPrompt({
      title: 'T',
      label: 'L',
      placeholder: 'P',
      initialValue: 'V',
      confirmLabel: 'Go',
    });
    expect(api.label.value).toBe('L');
    expect(api.placeholder.value).toBe('P');
    expect(api.initialValue.value).toBe('V');
    expect(api.confirmLabel.value).toBe('Go');
    api.cancel();

    void api.requestPrompt({ title: 'T2' });
    expect(api.label.value).toBe('');
    expect(api.placeholder.value).toBe('');
    expect(api.initialValue.value).toBe('');
    expect(api.confirmLabel.value).toBe('Save');
  });

  it('cancels in-flight request when a new one is opened', async () => {
    const api = mod.usePromptModal();
    const first = api.requestPrompt({ title: 'A' });
    const second = api.requestPrompt({ title: 'B' });
    await expect(first).resolves.toBeNull();
    api.submit('done');
    await expect(second).resolves.toBe('done');
  });
});
