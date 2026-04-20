// StepUpProvider — global context that intercepts 403 STEP_UP_REQUIRED responses
// Wraps the app so any component can trigger step-up via useStepUpContext().
// When a 403 with code STEP_UP_REQUIRED is caught, opens StepUpModal,
// waits for completion, then signals the caller to retry the original request.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StepUpModal } from '@/features/auth/step-up-modal';
import { registerStepUpHandler, unregisterStepUpHandler } from '@/api/client';

interface StepUpContextValue {
  /**
   * Call this when a 403 STEP_UP_REQUIRED is received.
   * Returns a promise that resolves when the user completes step-up,
   * or rejects if they cancel.
   */
  requestStepUp: () => Promise<void>;
}

const StepUpContext = createContext<StepUpContextValue | null>(null);

export function useStepUpContext() {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error('useStepUpContext must be used inside <StepUpProvider>');
  return ctx;
}

interface Props {
  children: React.ReactNode;
}

export function StepUpProvider({ children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  // Resolve/reject refs for the current pending step-up promise
  const resolveRef = useRef<(() => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);

  const requestStepUp = useCallback((): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      setIsOpen(true);
    });
  }, []);

  // Register the step-up handler with the API client module so that any
  // api.post/patch/delete call that gets a 403 STEP_UP_REQUIRED can trigger
  // this modal automatically and transparently retry.
  useEffect(() => {
    registerStepUpHandler(requestStepUp);
    return () => unregisterStepUpHandler();
  }, [requestStepUp]);

  function handleSuccess() {
    setIsOpen(false);
    resolveRef.current?.();
    resolveRef.current = null;
    rejectRef.current = null;
  }

  function handleCancel() {
    setIsOpen(false);
    rejectRef.current?.(new Error('Step-up cancelled by user'));
    resolveRef.current = null;
    rejectRef.current = null;
  }

  return (
    <StepUpContext.Provider value={{ requestStepUp }}>
      {children}
      {isOpen && <StepUpModal onSuccess={handleSuccess} onCancel={handleCancel} />}
    </StepUpContext.Provider>
  );
}
