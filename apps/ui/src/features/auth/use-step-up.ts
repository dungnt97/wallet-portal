// useStepUp — hook to run a WebAuthn step-up ceremony on demand
// Returns a runStepUp() function that:
//   1. Fetches assertion options from POST /auth/webauthn/challenge
//   2. Runs the browser ceremony via @simplewebauthn/browser
//   3. POSTs the assertion to POST /auth/webauthn/verify
//   4. Returns true on success, throws on failure
import { useCallback } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { api } from '@/api/client';

export interface StepUpResult {
  ok: boolean;
  steppedUpAt: string;
}

/**
 * Runs the full WebAuthn authentication ceremony for step-up.
 * Throws if the ceremony fails or is cancelled by the user.
 */
export function useStepUp() {
  const runStepUp = useCallback(async (): Promise<StepUpResult> => {
    // Step 1 — fetch assertion options (stores challenge in server session)
    const options = await api.post<Record<string, unknown>>('/auth/webauthn/challenge');

    // Step 2 — browser WebAuthn ceremony (prompts user to tap security key / use passkey)
    // @simplewebauthn/browser v10: startAuthentication takes optionsJSON directly as first arg
    const assertionResponse = await startAuthentication(options as unknown as Parameters<typeof startAuthentication>[0]);

    // Step 3 — verify with server, which sets session.steppedUpAt
    const result = await api.post<StepUpResult>('/auth/webauthn/verify', assertionResponse);

    return result;
  }, []);

  return { runStepUp };
}
