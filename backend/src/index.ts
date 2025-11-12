/**
 * Jitsi Call Analytics - Backend Entry Point
 * Multi-source data ingestion and real-time analytics processing
 */

// IMPORTANT: This must be the very first import to load environment variables
import './env';

import { getLogger } from '@jitsi/logger';
import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';

import { apiResponseMiddleware, requestLogger } from './middleware/apiResponse';
import participantsRouter from './routes/participants';
import rtcstatsRouter from './routes/rtcstats';
import sessionsAnalyzeRouter from './routes/sessions_analyze'; // Analysis/processing endpoints
import uploadsRouter from './routes/uploads';
import visualizationRouter from './routes/visualization';
import { EventCorrelationEngine } from './services/EventCorrelationEngine';
import { SessionManager } from './services/SessionManager';

const logger = getLogger('backend/src/index');

/**
 * Main application class for the Jitsi Call Analytics backend.
 *
 * This class orchestrates the entire analytics platform, including:
 * - Express.js web server setup
 * - WebSocket server for real-time communication
 * - Service initialization and coordination
 * - API route configuration
 * - Database and Redis connections
 *
 * @class JitsiCallAnalytics
 */
export class JitsiCallAnalytics {
    /** Express.js application instance */
    private app: Application;
    /** HTTP server instance */
    private server: http.Server;
    /** Socket.IO server for real-time communication */
    private io: SocketIOServer;
    /** Server port number */
    private port: number;
    /** Event correlation engine instance */
    private correlationEngine!: EventCorrelationEngine;
    /** Session management service instance */
    private sessionManager!: SessionManager;

    /**
     * Initializes the Jitsi Call Analytics application.
     *
     * Sets up the Express server, HTTP server, Socket.IO server with CORS configuration,
     * and initializes middleware and services.
     *
     * @constructor
     */
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new SocketIOServer(this.server, {
            cors: {
                origin: process.env.FRONTEND_URL || 'http://localhost:3000',
                methods: [ 'GET', 'POST' ]
            }
        });

        this.port = parseInt(process.env.PORT || '5000');
        this.setupMiddleware();
        this.setupServices();
    }

    /**
     * Sets up Express.js middleware for the application.
     *
     * Configures:
     * - Security headers via Helmet
     * - CORS policy for cross-origin requests
     * - JSON and URL-encoded request parsing
     *
     * @private
     * @returns {void}
     */
    private setupMiddleware(): void {
        // Security and basic middleware
        this.app.use(helmet());
        this.app.use(
            cors({
                origin: process.env.FRONTEND_URL || 'http://localhost:3000',
                credentials: true
            })
        );
        this.app.use(express.json({ limit: '200mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '200mb' }));

        // API middleware
        this.app.use(apiResponseMiddleware);
        this.app.use(requestLogger);

        // Serve static files from public directory
        this.app.use('/public', express.static('src/public'));
    }

    /**
     * Initializes all application services and dependencies.
     *
     * This method:
     * - Sets up database and Redis connections
     * - Initializes core analytics services
     * - Configures API routes
     * - Sets up WebSocket event handlers
     *
     * @private
     * @returns {Promise<void>} A promise that resolves when all services are initialized
     * @throws {Error} Throws an error if service initialization fails, causing process exit
     */
    private async setupServices(): Promise<void> {
        try {
            // Initialize core services
            this.correlationEngine = new EventCorrelationEngine();
            this.sessionManager = new SessionManager(this.io);

            // Setup API routes
            this.setupRoutes();

            // Setup WebSocket handlers
            this.setupWebSocketHandlers();

            logger.info('Jitsi Call Analytics services initialized');
        } catch (error) {
            logger.error('Failed to initialize services:', error);
            process.exit(1);
        }
    }

    /**
     * Configures API routes for the application.
     *
     * Sets up:
     * - Health check endpoint for monitoring
     * - Session management API routes
     * - Future API endpoints for analytics data
     *
     * @private
     * @returns {void}
     */
    private setupRoutes(): void {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: Date.now(),
                services: {
                    database: 'connected',
                    redis: 'connected',
                    dataIngestion: 'running'
                }
            });
        });

        // RTC Visualizer route
        this.app.get('/visualizer', (req, res) => {
            res.redirect('/public/rtc-visualizer.html');
        });

        // API v1 routes
        this.app.use('/api/v1/sessions', sessionsAnalyzeRouter); // Session analysis/processing endpoints
        this.app.use('/api/v1/participants', participantsRouter); // Participant endpoints
        this.app.use('/api/v1/rtcstats', rtcstatsRouter); // RTCStats integration endpoints
        this.app.use('/api/v1/uploads', uploadsRouter); // File upload endpoints

        // Other API routes
        this.app.use('/api/visualization', visualizationRouter); // RTC Visualizer compatibility

        // Serve frontend static files (in production)
        if (process.env.NODE_ENV === 'production') {
            // Allow override via env var for Docker, otherwise use relative path
            const frontendPath = process.env.FRONTEND_BUILD_PATH || path.join(__dirname, '../../../../frontend/build');

            logger.info(`Serving frontend from: ${frontendPath}`);

            // Serve static files
            this.app.use(express.static(frontendPath));

            // Handle SPA routing - send all non-API requests to index.html
            this.app.get('*', (_req: Request, res: Response) => {
                res.sendFile(path.join(frontendPath, 'index.html'));
            });
        }
    }

    /**
     * Configures WebSocket event handlers for real-time communication.
     *
     * Sets up Socket.IO event handlers for:
     * - Client connection/disconnection management
     * - Session subscription for real-time updates
     * - Participant subscription for live metrics
     *
     * @private
     * @returns {void}
     */
    private setupWebSocketHandlers(): void {
        this.io.on('connection', socket => {
            logger.debug(`Client connected: ${socket.id}`);

            // Subscribe to session updates
            socket.on('subscribe_session', (sessionId: string) => {
                socket.join(`session:${sessionId}`);
                logger.debug(`Client ${socket.id} subscribed to session ${sessionId}`);
            });

            // Subscribe to participant updates
            socket.on('subscribe_participant', (participantId: string) => {
                socket.join(`participant:${participantId}`);
                logger.debug(`Client ${socket.id} subscribed to participant ${participantId}`);
            });

            socket.on('disconnect', () => {
                logger.debug(`Client disconnected: ${socket.id}`);
            });
        });
    }

    /**
     * Starts the Jitsi Call Analytics server.
     *
     * Begins listening for HTTP and WebSocket connections on the configured port.
     * This method should be called after the application has been fully initialized.
     *
     * @public
     * @returns {Promise<void>} A promise that resolves when the server starts listening
     *
     * @example
     * ```typescript
     * const hub = new JitsiCallAnalytics();
     * await hub.start();
     * ```
     */
    public async start(): Promise<void> {
        this.server.listen(this.port, () => {
            logger.info(`Jitsi Call Analytics running on port ${this.port}`);
            logger.info(`Dashboard available at http://localhost:${this.port}`);
            logger.info('WebSocket server ready for real-time connections');
        });
    }
}

// Start the application
const analyticsHub = new JitsiCallAnalytics();

analyticsHub.start().catch(error => logger.error('Failed to start analytics hub:', error));
