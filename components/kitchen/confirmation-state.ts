export interface ConfirmationOptions {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface PendingConfirmation {
  id: number;
  options: ConfirmationOptions;
  opener: HTMLElement | null;
}

/** One decision at a time. Nothing is queued for replay after navigation or unlock. */
export class ConfirmationController {
  private enabled = false;
  private scope = "";
  private epoch = 0;
  private sequence = 0;
  private pending: PendingConfirmation | null = null;
  private resolve: ((accepted: boolean) => void) | null = null;
  private listeners = new Set<() => void>();

  getSnapshot = () => this.pending;
  getServerSnapshot = () => null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }

  setContext(enabled: boolean, scope: string) {
    if (this.enabled === enabled && this.scope === scope) return;
    this.enabled = enabled;
    this.scope = scope;
    this.cancel();
  }

  cancel = () => {
    // Also invalidates an approval whose promise continuation has not run yet.
    this.epoch++;
    const resolve = this.resolve;
    this.resolve = null;
    this.pending = null;
    resolve?.(false);
    this.emit();
  };

  request = (
    options: ConfirmationOptions,
    signal?: AbortSignal,
    opener: HTMLElement | null = null,
  ): Promise<boolean> => {
    if (!this.enabled || signal?.aborted || this.pending) return Promise.resolve(false);
    const epoch = this.epoch;
    const id = ++this.sequence;
    const aborted = () => {
      if (this.pending?.id === id) this.cancel();
    };
    const decision = new Promise<boolean>((resolve) => {
      this.resolve = resolve;
      this.pending = { id, options: { ...options }, opener };
      signal?.addEventListener("abort", aborted, { once: true });
      this.emit();
    });
    return decision.then((accepted) => {
      signal?.removeEventListener("abort", aborted);
      return accepted && this.enabled && this.epoch === epoch && !signal?.aborted;
    });
  };

  respond = (id: number, accepted: boolean) => {
    if (!this.enabled || this.pending?.id !== id) return;
    const resolve = this.resolve;
    // Clear synchronously: double-clicks and stale dialog handlers cannot run twice.
    this.resolve = null;
    this.pending = null;
    resolve?.(accepted);
    this.emit();
  };
}
