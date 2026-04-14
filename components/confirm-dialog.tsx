"use client";

// App-wide confirmation dialog. Replaces window.confirm with a styled
// modal that matches the rest of the UI. Exposed as a promise-based
// hook so callers write `const ok = await confirm(...)`.
//
// Usage:
//
//   const confirm = useConfirm();
//   const ok = await confirm({
//     title: "Delete playlist",
//     message: `Delete "${name}" from Beatport?`,
//     confirmLabel: "Delete",
//     destructive: true,
//   });
//   if (!ok) return;

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button } from "./ui";
import { cn } from "@/lib/utils";

export interface ConfirmOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOpts) => Promise<boolean>;

const noop: ConfirmFn = () => Promise.resolve(false);
const ConfirmContext = createContext<ConfirmFn>(noop);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

interface Pending {
  opts: ConfirmOpts;
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      setPending((cur) => {
        cur?.resolve(result);
        return null;
      });
    },
    []
  );

  // Esc dismiss / Enter confirm
  useEffect(() => {
    if (!pending) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6"
          onClick={() => close(false)}
        >
          <div
            className="bg-[var(--bg-elev)] border border-[var(--border)] rounded-sm w-[420px] max-w-full shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[var(--border-soft)]">
              <div
                className={cn(
                  "text-[11px] font-mono tracking-wider uppercase",
                  pending.opts.destructive
                    ? "text-[var(--danger)]"
                    : "text-[var(--fg-mute)]"
                )}
              >
                {pending.opts.title ?? "Confirm"}
              </div>
              <div className="text-sm text-[var(--fg)] mt-1 leading-relaxed">
                {pending.opts.message}
              </div>
            </div>
            <div className="px-5 py-3 flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="md"
                onClick={() => close(false)}
                autoFocus={!pending.opts.destructive}
              >
                {pending.opts.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={pending.opts.destructive ? "danger" : "primary"}
                size="md"
                onClick={() => close(true)}
                autoFocus={pending.opts.destructive}
              >
                {pending.opts.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
