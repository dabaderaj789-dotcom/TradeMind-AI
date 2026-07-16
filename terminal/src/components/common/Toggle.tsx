import { cx } from "../../lib/format";

export function Toggle({
  checked,
  onChange,
  label,
  dotColor,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 group"
    >
      <span
        className={cx(
          "relative h-5 w-9 rounded-full transition-colors duration-200",
          checked ? "bg-brand" : "bg-elevated border border-subtle/70",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
      {label && (
        <span className="flex items-center gap-1.5 text-sm text-muted group-hover:text-content transition-colors">
          {dotColor && <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />}
          {label}
        </span>
      )}
    </button>
  );
}
