"use client";

// Minimal UI primitives — shadcn-style API without radix dependency.

import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type HTMLAttributes } from "react";

// ── Button ───────────────────────────────────────────────────────────────

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm font-mono text-xs tracking-wider uppercase transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-black hover:brightness-110 font-semibold",
        accent:
          "bg-[var(--accent-2)] text-black hover:brightness-110 font-semibold",
        secondary:
          "bg-[var(--bg-elev-2)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--border-soft)]",
        ghost:
          "text-[var(--fg-dim)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)]",
        danger:
          "bg-[var(--danger)] text-white hover:brightness-110 font-semibold",
      },
      size: {
        sm: "h-7 px-2.5",
        md: "h-8 px-3",
        lg: "h-10 px-4 text-sm",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

// ── Input ────────────────────────────────────────────────────────────────

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-8 w-full rounded-sm bg-[var(--bg-elev-2)] border border-[var(--border)] px-2.5 text-sm text-[var(--fg)] placeholder:text-[var(--fg-mute)]",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-sm bg-[var(--bg-elev-2)] border border-[var(--border)] px-2.5 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-mute)] resize-none",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-8 w-full rounded-sm bg-[var(--bg-elev-2)] border border-[var(--border)] px-2 text-sm text-[var(--fg)] cursor-pointer",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

// ── Card ─────────────────────────────────────────────────────────────────

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-[var(--bg-elev)] border border-[var(--border-soft)] rounded-sm",
        className
      )}
      {...props}
    />
  );
}

// ── Badge ────────────────────────────────────────────────────────────────

const badgeVariants = cva("chip", {
  variants: {
    variant: {
      default: "",
      accent: "chip-accent",
      accent2: "chip-accent-2",
      warn: "chip-warn",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ── Checkbox ─────────────────────────────────────────────────────────────

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-2 cursor-pointer text-xs font-mono tracking-wide select-none text-left",
        checked
          ? "text-[var(--fg)]"
          : "text-[var(--fg-dim)] hover:text-[var(--fg)]",
        className
      )}
    >
      <span
        className={cn(
          "h-3.5 w-3.5 rounded-[2px] border flex items-center justify-center shrink-0 transition-colors",
          checked
            ? "bg-[var(--accent)] border-[var(--accent)]"
            : "border-[var(--border)]"
        )}
      >
        {checked && (
          <svg
            className="h-2.5 w-2.5 text-black"
            viewBox="0 0 12 12"
            fill="none"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

// ── Range slider (dual) ──────────────────────────────────────────────────

export function RangeSlider({
  min,
  max,
  value,
  onChange,
  step = 1,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  step?: number;
}) {
  const [lo, hi] = value;
  const pct = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="relative h-2">
        <div className="absolute inset-y-1/2 -translate-y-1/2 left-0 right-0 h-0.5 bg-[var(--border)]" />
        <div
          className="absolute inset-y-1/2 -translate-y-1/2 h-0.5 bg-[var(--accent)]"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) =>
            onChange([Math.min(Number(e.target.value), hi), hi])
          }
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) =>
            onChange([lo, Math.max(Number(e.target.value), lo)])
          }
          className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
      <div className="flex justify-between text-[11px] font-mono text-[var(--fg-mute)]">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1 bg-[var(--border)] rounded-sm overflow-hidden">
      <div
        className="h-full bg-[var(--accent-2)] transition-[width] duration-150"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
