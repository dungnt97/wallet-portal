// Misc prototype utility ports: short addresses, explorer URLs, CSV download, minutesAgo.

export function shortAddr(s: string, a = 6, b = 4): string {
  return s && s.length > a + b + 3 ? `${s.slice(0, a)}…${s.slice(-b)}` : s;
}

export function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60 * 1000).toISOString();
}

export function explorerUrl(chain: 'bnb' | 'sol', hashOrAddr: string): string {
  if (chain === 'bnb') return `https://bscscan.com/tx/${hashOrAddr}`;
  return `https://solscan.io/tx/${hashOrAddr}`;
}

export function addressExplorerUrl(chain: 'bnb' | 'sol', addr: string): string {
  if (chain === 'bnb') return `https://bscscan.com/address/${addr}`;
  return `https://solscan.io/account/${addr}`;
}

/** Trigger a CSV download in the browser. No-op during SSR. */
export function downloadCSV(
  filename: string,
  rows: (string | number | null | undefined)[][],
  headers: string[]
): void {
  if (typeof document === 'undefined') return;
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
