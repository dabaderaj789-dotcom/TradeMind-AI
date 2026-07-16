import type { ReactNode } from "react";
import { cx } from "../../lib/format";

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface z-10">
          <tr className="text-[11px] uppercase tracking-wide text-faint border-b border-subtle/60">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" | "center" }) {
  return <th className={cx("font-medium px-4 py-2", `text-${align}`)}>{children}</th>;
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return <td className={cx("px-4 py-2.5", `text-${align}`, className)}>{children}</td>;
}
