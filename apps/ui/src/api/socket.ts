// Socket.io client factory — ref-counted singleton so multiple pages/components
// can share the same connection without one unmount disconnecting for all others.
//
// Usage in a React component:
//   useEffect(() => {
//     const socket = connectSocket();          // increments refcount, connects if needed
//     socket.on('deposit:confirmed', handler);
//     return () => {
//       socket.off('deposit:confirmed', handler);
//       disconnectSocket();                    // decrements refcount, only closes when 0
//     };
//   }, []);
import { type Socket, io } from 'socket.io-client';

let _socket: Socket | null = null;
// Reference count: incremented by connectSocket(), decremented by disconnectSocket()
let _refCount = 0;

/** Returns the shared Socket instance, creating it on first call. */
export function getSocket(): Socket {
  if (!_socket) {
    _socket = io('/stream', {
      path: '/stream/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return _socket;
}

/**
 * Increment ref-count and connect if not already connected.
 * Returns the shared socket — callers should NOT store this reference long-term;
 * always call getSocket() to retrieve it after potential reconnect cycles.
 */
export function connectSocket(): Socket {
  _refCount++;
  const socket = getSocket();
  if (!socket.connected) socket.connect();
  return socket;
}

/**
 * Decrement ref-count. Only physically disconnects and destroys the socket
 * when the count reaches zero, preventing premature disconnects when one
 * component unmounts while others are still listening.
 */
export function disconnectSocket(): void {
  if (_refCount > 0) _refCount--;
  if (_refCount === 0 && _socket) {
    _socket.disconnect();
    _socket = null;
  }
}

/** Force-disconnect regardless of ref-count (e.g. on logout). */
export function forceDisconnectSocket(): void {
  _refCount = 0;
  _socket?.disconnect();
  _socket = null;
}
