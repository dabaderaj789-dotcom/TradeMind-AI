import { cx } from "../../lib/format";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-1 overflow-x-auto", className)}>
      {items.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cx(
              "relative px-3 py-2 text-[13px] font-medium rounded-lg whitespace-nowrap transition-colors",
              active ? "text-content bg-elevated" : "text-muted hover:text-content",
            )}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="ml-1.5 rounded-md bg-brand/15 text-brand px-1.5 py-0.5 text-[10px] font-semibold">
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
