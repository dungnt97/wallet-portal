// API fetch wrapper — all requests go through /api proxy → admin-api :3001
// Credentials: include ensures session cookie is forwarded on every request.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // non-JSON body — use statusText
    }
    throw new ApiError(res.status, message);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get<T>(path: string, init?: RequestInit): Promise<T> {
    return fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
    }).then((r) => handleResponse<T>(r));
  },

  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }).then((r) => handleResponse<T>(r));
  },

  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return fetch(`/api${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }).then((r) => handleResponse<T>(r));
  },

  delete<T>(path: string, init?: RequestInit): Promise<T> {
    return fetch(`/api${path}`, {
      method: 'DELETE',
      credentials: 'include',
      ...init,
    }).then((r) => handleResponse<T>(r));
  },
};
