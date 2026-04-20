// Socket.io client factory — connects to /stream namespace on admin-api :3001
// Proxied via Vite dev server (ws: true). In production, same origin.
import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;

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

export function connectSocket(): Socket {
  const socket = getSocket();
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
}
