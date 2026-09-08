import { useEffect, type FormEvent, type ReactNode } from "react";
import { ROLE_LABELS, STATUS_LABELS, type AgentStatus, type Role } from "../lib/types";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const tone =
    status === 0
      ? "text-mint bg-mint/10 border-mint/30"
      : status === 1
        ? "text-gold bg-gold/10 border-gold/30"
        : "text-danger bg-danger/10 border-danger/30";
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide", tone)}>
      <span className={cx("size-1.5 rounded-full", status === 0 ? "bg-mint" : status === 1 ? "bg-gold" : "bg-danger")} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function RolePill({ role }: { role: Role }) {
  const tone =
    role === 2
      ? "border-gold/40 text-gold"
      : role === 1
        ? "border-info/40 text-info"
        : "border-mint/30 text-mint";
  return (
    <span className={cx("rounded-full border px-2 py-0.5 font-mono text-[11px]", tone)}>
      {ROLE_LABELS[role]}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger" | "quiet";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: "bg-mint text-void hover:bg-mint/90",
    ghost: "border border-line bg-panel text-ink hover:border-mint/40",
    danger: "border border-danger/40 text-danger hover:bg-danger/10",
    quiet: "text-muted hover:text-ink",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-40",
        styles,
        className
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-void px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-mint/50";

export function Modal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = "Save",
  busy,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: (e: FormEvent) => void;
  submitLabel?: string;
  busy?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-forest p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg">{title}</h2>
          <button type="button" className="text-muted hover:text-ink" onClick={onClose}>
            Esc
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        {onSubmit ? (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {submitLabel}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <h3 className="font-display text-xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
