/**
 * usePromptModal — module-singleton state + API for the global prompt
 * dialog.
 *
 * A single `UiPromptModal` instance is mounted at the app root (in
 * `App.vue`) and bound to the reactive state exposed here. Any consumer
 * can call `requestPrompt(...)` to summon it and receive a Promise
 * resolving to the user's input (or `null` on cancel/dismiss).
 *
 * Because the state lives at module scope, multiple concurrent calls to
 * `requestPrompt` will overwrite the previous resolver — only the most
 * recent caller wins. In practice the dialog is modal so there is at most
 * one outstanding request at any time.
 */
import { ref } from 'vue';

export interface PromptRequest {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
}

const open = ref(false);
const title = ref('');
const label = ref('');
const placeholder = ref('');
const initialValue = ref('');
const confirmLabel = ref('Save');
let resolver: ((value: string | null) => void) | null = null;

/**
 * Show the prompt dialog and resolve with the entered text (or `null`
 * if the user dismissed it).
 */
function requestPrompt(payload: PromptRequest): Promise<string | null> {
  // Resolve any in-flight request as cancelled so its caller doesn't hang.
  if (resolver) {
    resolver(null);
    resolver = null;
  }
  title.value = payload.title;
  label.value = payload.label ?? '';
  placeholder.value = payload.placeholder ?? '';
  initialValue.value = payload.initialValue ?? '';
  confirmLabel.value = payload.confirmLabel ?? 'Save';
  return new Promise<string | null>((resolve) => {
    resolver = resolve;
    open.value = true;
  });
}

/** Bound to the modal's `@submit`. */
function submit(value: string): void {
  resolver?.(value);
  resolver = null;
  open.value = false;
}

/** Bound to the modal's `@cancel` / `update:modelValue=false`. */
function cancel(): void {
  resolver?.(null);
  resolver = null;
  open.value = false;
}

export function usePromptModal() {
  return {
    open,
    title,
    label,
    placeholder,
    initialValue,
    confirmLabel,
    requestPrompt,
    submit,
    cancel,
  };
}
