import { useHistoricalSetups } from "../../hooks/queries";
import { directionTone, fmtPct, fmtPrice, fmtTime, titleCase } from "../../lib/format";
import { Badge, EmptyState, Spinner } from "../common/primitives";
import { DataTable, Td, Th } from "./tables";

export function RecentAnalysisTab({ id, tf }: { id: string; tf: string }) {
  const { data, isLoading } = useHistoricalSetups(id, tf);
  const rows = data?.items ?? [];

  if (isLoading) return <Spinner label="Loading history…" />;
  if (rows.length === 0) return <EmptyState>No historical analysis recorded.</EmptyState>;

  return (
    <DataTable
      head={
        <>
          <Th align="right">Detected</Th>
          <Th>Setup</Th>
          <Th>Bias</Th>
          <Th align="right">Confidence</Th>
          <Th align="right">Entry</Th>
          <Th>Status</Th>
        </>
      }
    >
      {rows.map((s) => {
        const tone = directionTone(s.direction);
        return (
          <tr key={s.setup_id} className="border-b border-subtle/40 hover:bg-elevated/60">
            <Td align="right" className="text-faint whitespace-nowrap">{fmtTime(s.detected_at)}</Td>
            <Td className="text-content">{titleCase(s.setup_type)}</Td>
            <Td>
              <Badge tone={tone}>{tone === "bull" ? "Long" : tone === "bear" ? "Short" : "—"}</Badge>
            </Td>
            <Td align="right" className="font-mono text-content">{fmtPct(s.confidence_score)}</Td>
            <Td align="right" className="font-mono text-muted">{fmtPrice(s.entry_zone.low)}</Td>
            <Td className="text-muted">{titleCase(s.status)}</Td>
          </tr>
        );
      })}
    </DataTable>
  );
}
