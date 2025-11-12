/**
 * Session Manager
 * Manages active call sessions and provides real-time updates
 */

import { EventEmitter } from 'events';
import { Server as SocketIOServer } from 'socket.io';

import { CallSession } from '../../../shared/types';

export class SessionManager extends EventEmitter {
    private io: SocketIOServer;

    /**
     * Creates a new SessionManager instance.
     * Manages active call sessions and provides real-time updates via Socket.IO.
     *
     * @param io - The Socket.IO server instance for broadcasting session updates
     */
    constructor(io: SocketIOServer) {
        super();
        this.io = io;
    }

    /**
     * Handles session updates by broadcasting them to connected clients.
     * Emits the session update to all clients subscribed to the session's room.
     *
     * @param session - The call session data to broadcast
     */
    public handleSessionUpdate(session: CallSession): void {
        this.io.to(`session:${session.sessionId}`).emit('session_update', session);
    }
}
