// Status badge — maps a status key to colour class + label.
// Ports prototype primitives.jsx `StatusBadge`.

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  confirmed: { cls: 'ok', label: 'Confirmed' },
  credited: { cls: 'ok', label: 'Credited' },
  swept: { cls: 'info', label: 'Swept' },
  pending: { cls: 'warn pending', label: 'Pending' },
  failed: { cls: 'err', label: 'Failed' },
  completed: { cls: 'ok', label: 'Completed' },
  executing: { cls: 'info pending', label: 'Executing' },
  awaiting_signatures: { cls: 'warn', label: 'Awaiting sigs' },
  draft: { cls: 'muted', label: 'Draft' },
  collecting: { cls: 'warn', label: 'Collecting' },
  ready: { cls: 'info', label: 'Ready to execute' },
};

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const s = STATUS_MAP[status] ?? { cls: 'muted', label: status };
  return (
    <span className={`badge ${s.cls}`}>
      <span className="dot" />
      {s.label}
    </span>
  );
}
