// Typed HTTP client for wallet-engine internal API (service-to-service, bearer auth)
// Used by admin-api to trigger HD address derivation after user creation.

export interface DerivedAddress {
  chain: 'bnb' | 'sol';
  address: string;
  derivationPath: string;
  derivationIndex: number;
}

export interface DeriveAddressesResponse {
  addresses: DerivedAddress[];
}

export class WalletEngineError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'WalletEngineError';
  }
}

export interface WalletEngineClientOptions {
  baseUrl: string;
  bearerToken: string;
  timeoutMs?: number;
}

/**
 * Call wallet-engine POST /internal/users/:userId/derive-addresses.
 * Returns the derived BNB + Solana addresses for the user.
 * Throws WalletEngineError on HTTP errors (caller decides whether to surface 502).
 */
export async function deriveUserAddresses(
  opts: WalletEngineClientOptions,
  userId: string
): Promise<DeriveAddressesResponse> {
  const { baseUrl, bearerToken, timeoutMs = 10_000 } = opts;
  const url = `${baseUrl}/internal/users/${userId}/derive-addresses`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new WalletEngineError(0, `Network error calling wallet-engine: ${String(err)}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // non-JSON — keep statusText
    }
    throw new WalletEngineError(
      res.status,
      `wallet-engine derive failed (${res.status}): ${message}`
    );
  }

  return res.json() as Promise<DeriveAddressesResponse>;
}
