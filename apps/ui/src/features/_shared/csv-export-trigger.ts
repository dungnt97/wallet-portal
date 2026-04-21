// Trigger a server-side CSV download by navigating to the export URL.
// The browser handles the Content-Disposition header and prompts a file save.
// This approach avoids buffering the full CSV in the browser JS heap.

/**
 * Trigger a CSV file download from a server-side streaming endpoint.
 * Opens the URL in a hidden anchor click — the server sends Content-Disposition:attachment.
 *
 * @param url - Full URL including query params (e.g. /api/deposits/export.csv?chain=bnb)
 */
export function triggerCsvDownload(url: string): void {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = url;
  // No explicit download attribute — server's Content-Disposition drives the filename.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
