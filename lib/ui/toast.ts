// lib/ui/toast.ts
// Global Toast Dispatcher & State Store for Neo-Brutalist Alerts

export type ToastType = 'info' | 'warning' | 'success' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners = new Set<ToastListener>();

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => {
      this.listeners.delete(listener);
    };
  }

  show(message: string, type: ToastType = 'info', durationMs = 4000): string {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `toast_${Date.now()}`;
    const item: ToastItem = { id, message, type, durationMs };
    // Keep at most 2 toasts simultaneously so they don't block the screen
    this.toasts = [...this.toasts.slice(-1), item];
    this.emit();

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }

    return id;
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.toasts);
      } catch {}
    }
  }
}

export const toastManager = new ToastManager();

export function showToast(message: string, type: ToastType = 'info', durationMs = 4000): string {
  return toastManager.show(message, type, durationMs);
}
