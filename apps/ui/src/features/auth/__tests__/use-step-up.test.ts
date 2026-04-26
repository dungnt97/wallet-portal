// Tests for use-step-up.ts — WebAuthn step-up ceremony hook.
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStepUp } from '../use-step-up';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── useStepUp ─────────────────────────────────────────────────────────────────

describe('useStepUp', () => {
  it('returns a runStepUp function', () => {
    const { result } = renderHook(() => useStepUp());
    expect(typeof result.current.runStepUp).toBe('function');
  });

  it('calls POST /auth/webauthn/challenge to get options', async () => {
    const { api } = await import('@/api/client');
    const { startAuthentication } = await import('@simplewebauthn/browser');

    const mockOptions = { challenge: 'abc123', rpId: 'localhost' };
    const mockAssertion = { id: 'cred-1', type: 'public-key' };
    const mockResult = { ok: true, steppedUpAt: '2024-01-01T00:00:00.000Z' };

    vi.mocked(api.post)
      .mockResolvedValueOnce(mockOptions) // challenge
      .mockResolvedValueOnce(mockResult); // verify
    vi.mocked(startAuthentication).mockResolvedValue(mockAssertion as never);

    const { result } = renderHook(() => useStepUp());
    await result.current.runStepUp();

    expect(api.post).toHaveBeenCalledWith('/auth/webauthn/challenge');
  });

  it('passes options to startAuthentication', async () => {
    const { api } = await import('@/api/client');
    const { startAuthentication } = await import('@simplewebauthn/browser');

    const mockOptions = { challenge: 'xyz789', rpId: 'localhost' };
    const mockAssertion = { id: 'cred-2', type: 'public-key' };
    const mockResult = { ok: true, steppedUpAt: '2024-01-01T00:00:00.000Z' };

    vi.mocked(api.post).mockResolvedValueOnce(mockOptions).mockResolvedValueOnce(mockResult);
    vi.mocked(startAuthentication).mockResolvedValue(mockAssertion as never);

    const { result } = renderHook(() => useStepUp());
    await result.current.runStepUp();

    expect(startAuthentication).toHaveBeenCalledWith(mockOptions);
  });

  it('calls POST /auth/webauthn/verify with assertion response', async () => {
    const { api } = await import('@/api/client');
    const { startAuthentication } = await import('@simplewebauthn/browser');

    const mockOptions = { challenge: 'chall', rpId: 'localhost' };
    const mockAssertion = { id: 'cred-3', clientDataJSON: 'base64data' };
    const mockResult = { ok: true, steppedUpAt: '2024-06-01T12:00:00.000Z' };

    vi.mocked(api.post).mockResolvedValueOnce(mockOptions).mockResolvedValueOnce(mockResult);
    vi.mocked(startAuthentication).mockResolvedValue(mockAssertion as never);

    const { result } = renderHook(() => useStepUp());
    await result.current.runStepUp();

    expect(api.post).toHaveBeenCalledWith('/auth/webauthn/verify', mockAssertion);
  });

  it('returns StepUpResult on success', async () => {
    const { api } = await import('@/api/client');
    const { startAuthentication } = await import('@simplewebauthn/browser');

    const mockOptions = { challenge: 'chall2' };
    const mockAssertion = { id: 'cred-4' };
    const mockResult = { ok: true, steppedUpAt: '2025-01-01T00:00:00.000Z' };

    vi.mocked(api.post).mockResolvedValueOnce(mockOptions).mockResolvedValueOnce(mockResult);
    vi.mocked(startAuthentication).mockResolvedValue(mockAssertion as never);

    const { result } = renderHook(() => useStepUp());
    const stepResult = await result.current.runStepUp();

    expect(stepResult).toEqual(mockResult);
    expect(stepResult.ok).toBe(true);
  });

  it('propagates error when startAuthentication throws (user cancelled)', async () => {
    const { api } = await import('@/api/client');
    const { startAuthentication } = await import('@simplewebauthn/browser');

    vi.mocked(api.post).mockResolvedValueOnce({ challenge: 'c' });
    vi.mocked(startAuthentication).mockRejectedValue(new Error('NotAllowedError'));

    const { result } = renderHook(() => useStepUp());
    await expect(result.current.runStepUp()).rejects.toThrow('NotAllowedError');
  });

  it('propagates error when verify POST fails', async () => {
    const { api } = await import('@/api/client');
    const { startAuthentication } = await import('@simplewebauthn/browser');

    vi.mocked(api.post)
      .mockResolvedValueOnce({ challenge: 'c' })
      .mockRejectedValueOnce(new Error('Unauthorized'));
    vi.mocked(startAuthentication).mockResolvedValue({ id: 'cred-5' } as never);

    const { result } = renderHook(() => useStepUp());
    await expect(result.current.runStepUp()).rejects.toThrow('Unauthorized');
  });
});
