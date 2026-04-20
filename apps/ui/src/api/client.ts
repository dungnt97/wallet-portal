// API fetch wrapper — all requests go through /api proxy → admin-api :3001
// Credentials: include ensures session cookie is forwarded on every request.
//
// Step-up interception:
//   When a response is 403 with body { code: "STEP_UP_REQUIRED" }, the client
//   calls the registered onStepUpRequired callback (set by StepUpProvider),
//   waits for it to resolve (user completes WebAuthn), then retries once.
//   Callers see a transparent retry — they never need to handle this themselves.

export class ApiError extends Error {
  /** Machine-readable code from the server response body */
  code?: string;

  constructor(
    public status: number,
    message: string,
    code?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// Registered by StepUpProvider — called when 403 STEP_UP_REQUIRED is received.
// Must return a Promise that resolves after step-up completes, or rejects if cancelled.
let onStepUpRequired: (() => Promise<void>) | null = null;

/** Called by StepUpProvider to register the step-up callback. */
export function registerStepUpHandler(handler: () => Promise<void>) {
  onStepUpRequired = handler;
}

/** Called by StepUpProvider on unmount to remove the handler. */
export function unregisterStepUpHandler() {
  onStepUpRequired = null;
}

async function handleResponse<T>(res: Response): Promise<{ data: T; isStepUpRequired: boolean }> {
  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { message?: string; error?: string; code?: string };
      message = body.message ?? body.error ?? message;
      code = body.code;
    } catch {
      // non-JSON body — use statusText
    }
    if (res.status === 403 && code === 'STEP_UP_REQUIRED') {
      return { data: undefined as T, isStepUpRequired: true };
    }
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) return { data: undefined as T, isStepUpRequired: false };
  return { data: (await res.json()) as T, isStepUpRequired: false };
}

async function fetchWithStepUp<T>(buildRequest: () => Request): Promise<T> {
  const { data, isStepUpRequired } = await fetch(buildRequest()).then((r) => handleResponse<T>(r));

  if (!isStepUpRequired) return data;

  // Step-up required — invoke the modal (registered by StepUpProvider)
  if (!onStepUpRequired) {
    throw new ApiError(403, 'Step-up required but no handler registered', 'STEP_UP_REQUIRED');
  }

  // Wait for the user to complete WebAuthn ceremony
  await onStepUpRequired();

  // Retry the original request once after successful step-up
  const retry = await fetch(buildRequest()).then((r) => handleResponse<T>(r));
  if (retry.isStepUpRequired) {
    // Step-up succeeded but still rejected — should not happen in normal flow
    throw new ApiError(403, 'Step-up completed but request still rejected', 'STEP_UP_REQUIRED');
  }
  return retry.data;
}

export const api = {
  get<T>(path: string, init?: RequestInit): Promise<T> {
    return fetchWithStepUp<T>(
      () => new Request(`/api${path}`, { ...init, credentials: 'include' })
    );
  },

  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return fetchWithStepUp<T>(
      () =>
        new Request(`/api${path}`, {
          method: 'POST',
          headers: body !== undefined ? { 'content-type': 'application/json' } : {},
          credentials: 'include',
          body: body !== undefined ? JSON.stringify(body) : undefined,
          ...init,
        })
    );
  },

  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return fetchWithStepUp<T>(
      () =>
        new Request(`/api${path}`, {
          method: 'PATCH',
          headers: body !== undefined ? { 'content-type': 'application/json' } : {},
          credentials: 'include',
          body: body !== undefined ? JSON.stringify(body) : undefined,
          ...init,
        })
    );
  },

  delete<T>(path: string, init?: RequestInit): Promise<T> {
    return fetchWithStepUp<T>(
      () =>
        new Request(`/api${path}`, {
          method: 'DELETE',
          credentials: 'include',
          ...init,
        })
    );
  },
};
