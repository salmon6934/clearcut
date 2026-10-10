import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isNativePlatform } from './platform';

type ModalDismissHandler = () => boolean; // return true if handled

const modalDismissHandlers: ModalDismissHandler[] = [];

/**
 * Register a modal dismiss handler. Return an unsubscribe function.
 * When the back button is pressed, the topmost handler is executed.
 */
export function registerModalDismiss(handler: ModalDismissHandler): () => void {
  modalDismissHandlers.push(handler);
  return () => {
    const idx = modalDismissHandlers.indexOf(handler);
    if (idx !== -1) {
      modalDismissHandlers.splice(idx, 1);
    }
  };
}

export function useHardwareBackButton(isModalOpen = false, closeModal?: () => void) {
  const router = useRouter();
  const pathname = usePathname();
  const closeModalRef = useRef(closeModal);

  useEffect(() => {
    closeModalRef.current = closeModal;
  }, [closeModal]);

  useEffect(() => {
    if (isModalOpen && closeModalRef.current) {
      return registerModalDismiss(() => {
        closeModalRef.current?.();
        return true;
      });
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (!isNativePlatform()) return;

    let handle: PluginListenerHandle | undefined;

    const setupListener = async () => {
      handle = await CapApp.addListener('backButton', ({ canGoBack }) => {
        // 1. Try dismissing active modal (LIFO)
        if (modalDismissHandlers.length > 0) {
          const topHandler = modalDismissHandlers[modalDismissHandlers.length - 1];
          if (topHandler && topHandler()) {
            return;
          }
        }

        // 2. Navigate back if not at root
        if (pathname !== '/' && canGoBack) {
          router.back();
        } else {
          // 3. Minimize / exit app at root
          CapApp.minimizeApp();
        }
      });
    };

    setupListener();

    return () => {
      handle?.remove();
    };
  }, [pathname, router]);
}
