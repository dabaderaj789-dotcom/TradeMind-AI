/**
 * Honest empty state when broker/provider data is not connected.
 * Never invent L2, orders, positions, or margin figures.
 */

export function UnavailableProviderPanel({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-5 text-center">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{title}</div>
      <p className="max-w-[260px] text-[12px] leading-relaxed text-muted">
        {detail ?? "Unavailable from current provider"}
      </p>
    </div>
  );
}
