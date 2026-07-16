import { useActiveSetups } from "../../hooks/queries";
import { directionTone, fmtNum, fmtPct, fmtPrice, fmtRelative, titleCase } from "../../lib/format";
import { Badge, EmptyState, Spinner } from "../common/primitives";
import { DataTable, Td, Th } from "./tables";

export function OpportunitiesTab({ id, tf }: { id: string; tf: string }) {
  const { data, isLoading } = useActiveSetups(id, tf);
  const rows = [...(data?.items ?? [])].sort((a, b) => b.confidence_score - a.confidence_score);

  if (isLoading) return <Spinner label="Loading opportunities…" />;
  if (rows.length === 0) return <EmptyState>No active opportunities on this timeframe.</EmptyState>;

  return (
    <DataTable
      head={
        <>
          <Th>Setup</Th>
          <Th>Bias</Th>
          <Th align="right">Confidence</Th>
          <Th align="right">R:R</Th>
          <Th align="right">Entry</Th>
          <Th align="right">Stop</Th>
          <Th align="left">Status</Th>
          <Th align="right">Detected</Th>
        </>
      }
    >
      {rows.map((s) => {
        const tone = directionTone(s.direction);
        return (
          <tr key={s.setup_id} className="border-b border-subtle/40 hover:bg-elevated/60">
            <Td className="font-medium text-content">{titleCase(s.setup_type)}</Td>
            <Td>
              <Badge tone={tone}>{tone === "bull" ? "Long" : tone === "bear" ? "Short" : "—"}</Badge>
            </Td>
            <Td align="right" className="font-mono text-content">{fmtPct(s.confidence_score)}</Td>
            <Td align="right" className="font-mono text-muted">{s.risk_reward != null ? fmtNum(s.risk_reward) : "—"}</Td>
            <Td align="right" className="font-mono text-muted">{fmtPrice(s.entry_zone.low)}</Td>
            <Td align="right" className="font-mono text-muted">{fmtPrice(s.stop_loss_zone.low)}</Td>
            <Td className="text-muted">{titleCase(s.status)}</Td>
            <Td align="right" className="text-faint">{fmtRelative(s.detected_at)}</Td>
          </tr>
        );
      })}
    </DataTable>
  );
}
