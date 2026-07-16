import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/format";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={cx("relative w-full card shadow-pop animate-scale-in", width)}>
        {(title || subtitle) && (
          <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-subtle/60">
            <div>
              {title && <h3 className="text-base font-semibold text-content">{title}</h3>}
              {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
            </div>
            <button className="text-faint hover:text-content transition-colors" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>
        )}
        <div className="p-5 max-h-[70vh] overflow-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
