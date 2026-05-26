import { io, type Socket } from 'socket.io-client';
import { getApiBaseUrl } from './api';

export type TriageChatSocket = Socket;

export function createTriageChatSocket(token: string) {
    const apiBase = getApiBaseUrl().replace(/\/api\/v\d+$/, '');

    return io(apiBase, {
        path: '/triage-chat/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 8,
        reconnectionDelay: 700,
        timeout: 10000
    });
}
