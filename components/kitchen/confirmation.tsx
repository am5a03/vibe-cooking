"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmationController, type ConfirmationOptions } from "./confirmation-state";

export const ConfirmationContext = createContext<ConfirmationController | null>(null);

/** Tie each caller to its own lifetime, even when it unmounts without a route change. */
export function useConfirm() {
  const controller = useContext(ConfirmationContext);
  const owner = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    owner.current = abort;
    return () => abort.abort();
  }, []);
  return useCallback(
    (options: ConfirmationOptions) => {
      if (!controller || !owner.current) return Promise.resolve(false);
      return controller.request(
        options,
        owner.current.signal,
        document.activeElement instanceof HTMLElement ? document.activeElement : null,
      );
    },
    [controller],
  );
}

export function useConfirmationController(enabled: boolean, scope: string) {
  const [controller] = useState(() => new ConfirmationController());
  useLayoutEffect(() => {
    controller.setContext(enabled, scope);
  }, [controller, enabled, scope]);
  useLayoutEffect(() => () => controller.setContext(false, ""), [controller]);
  return controller;
}

function restoreFocus(opener: HTMLElement | null) {
  // Radix content is portalled to body. Never restore focus into the hidden kitchen.
  const available = (element: HTMLElement | null): element is HTMLElement =>
    !!element?.isConnected &&
    !element.closest("[hidden], [inert]") &&
    !element.matches(":disabled") &&
    element.getClientRects().length > 0;
  if (available(opener)) {
    opener.focus({ preventScroll: true });
    return;
  }
  const input = document.querySelector<HTMLInputElement>("[data-kitchen-unlock] input");
  if (available(input)) {
    input.focus({ preventScroll: true });
    return;
  }
  const heading = document.querySelector<HTMLElement>("main.workspace h1");
  if (available(heading)) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
    heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
  }
}

export function KitchenConfirmation({
  controller,
  enabled,
}: { controller: ConfirmationController; enabled: boolean }) {
  const pending = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  // Unmount immediately when locked, including animation/portal content outside .kitchen-app.
  if (!enabled || !pending) return null;
  const { id, options, opener } = pending;
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) controller.respond(id, false);
      }}
    >
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-card text-card-foreground"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus(opener);
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-2xl leading-tight">
            {options.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="break-words leading-relaxed">
            {options.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button" onClick={() => controller.respond(id, false)}>
            {options.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant={options.destructive ? "destructive" : "default"}
            className="h-auto min-h-10 whitespace-normal"
            onClick={() => controller.respond(id, true)}
          >
            {options.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
