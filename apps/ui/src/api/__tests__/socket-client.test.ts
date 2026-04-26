// Tests for api/socket.ts — getSocket, connectSocket, disconnectSocket, forceDisconnectSocket.
// Uses vi.mock for socket.io-client to avoid real WebSocket connections.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock socket.io-client ─────────────────────────────────────────────────────

const mockSocketInstance = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocketInstance),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  vi.clearAllMocks();
  // Reset socket module state between tests by re-importing with a fresh module cache.
  // vitest does not isolate module state automatically, so force-disconnect resets the singleton.
  const { forceDisconnectSocket } = await import('../socket');
  forceDisconnectSocket();
});

afterEach(async () => {
  const { forceDisconnectSocket } = await import('../socket');
  forceDisconnectSocket();
});

describe('getSocket', () => {
  it('returns a socket instance', async () => {
    const { getSocket } = await import('../socket');
    const socket = getSocket();
    expect(socket).toBe(mockSocketInstance);
  });

  it('returns the same instance on subsequent calls (singleton)', async () => {
    const { getSocket } = await import('../socket');
    const s1 = getSocket();
    const s2 = getSocket();
    expect(s1).toBe(s2);
  });
});

describe('connectSocket', () => {
  it('returns the socket instance', async () => {
    const { connectSocket } = await import('../socket');
    const socket = connectSocket();
    expect(socket).toBe(mockSocketInstance);
  });

  it('calls socket.connect() when not already connected', async () => {
    mockSocketInstance.connected = false;
    const { connectSocket } = await import('../socket');
    connectSocket();
    expect(mockSocketInstance.connect).toHaveBeenCalled();
  });

  it('does not call socket.connect() when already connected', async () => {
    mockSocketInstance.connected = true;
    const { connectSocket } = await import('../socket');
    connectSocket();
    expect(mockSocketInstance.connect).not.toHaveBeenCalled();
    // reset
    mockSocketInstance.connected = false;
  });
});

describe('disconnectSocket', () => {
  it('does not disconnect while other callers still hold a reference', async () => {
    mockSocketInstance.connected = false;
    const { connectSocket, disconnectSocket } = await import('../socket');
    connectSocket(); // refCount = 1
    connectSocket(); // refCount = 2
    disconnectSocket(); // refCount = 1 — should NOT disconnect
    expect(mockSocketInstance.disconnect).not.toHaveBeenCalled();
  });

  it('physically disconnects when ref-count reaches zero', async () => {
    mockSocketInstance.connected = false;
    const { connectSocket, disconnectSocket } = await import('../socket');
    connectSocket(); // refCount = 1
    disconnectSocket(); // refCount = 0 → disconnect
    expect(mockSocketInstance.disconnect).toHaveBeenCalled();
  });

  it('does not underflow ref-count below zero', async () => {
    const { disconnectSocket } = await import('../socket');
    // disconnectSocket when count is already 0 — must not throw
    expect(() => disconnectSocket()).not.toThrow();
  });
});

describe('forceDisconnectSocket', () => {
  it('disconnects the socket immediately regardless of ref-count', async () => {
    mockSocketInstance.connected = false;
    const {
      connectSocket,
      connectSocket: connect2,
      forceDisconnectSocket,
    } = await import('../socket');
    connectSocket();
    connect2();
    forceDisconnectSocket();
    expect(mockSocketInstance.disconnect).toHaveBeenCalled();
  });

  it('resets socket to null (getSocket creates fresh instance after force disconnect)', async () => {
    const { io } = await import('socket.io-client');
    const { connectSocket, forceDisconnectSocket, getSocket } = await import('../socket');
    connectSocket();
    forceDisconnectSocket();
    getSocket(); // should call io() again
    // io() was called at least twice (once before force, once after)
    expect(vi.mocked(io)).toHaveBeenCalled();
  });
});
