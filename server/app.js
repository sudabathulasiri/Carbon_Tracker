/**
 * app.js — Carbon Footprint Tracker API Server
 *
 * Entry point for the Express application. Responsibilities:
 *   1. Load environment variables
 *   2. Connect to MongoDB
 *   3. Apply global middleware (security, parsing, logging)
 *   4. Mount all API route groups
 *   5. Handle 404s and centralise error responses
 *   6. Start the HTTP server with graceful shutdown
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
require('dotenv').config();

// ─── Core Imports ─────────────────────────────────────────────────────────────
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

// ─── Internal Imports ─────────────────────────────────────────────────────────
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// ─── Route Imports ────────────────────────────────────────────────────────────
const carbonRoutes = require('./routes/carbonRoutes'); // Phase 2: log, stats, dashboard
const authRoutes   = require('./routes/authRoutes');   // Phase 4: register, login, me

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
const startServer = async () => {
  // 1. Connect to the database before accepting any traffic
  await connectDB();

  // 2. Initialise Express
  const app = express();

  // ─── Security Middleware ──────────────────────────────────────────────────
  // Sets a sensible set of HTTP response headers (XSS, clickjacking, etc.)
  app.use(helmet());

  // Restrict which origins can access the API
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, Postman in dev)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS policy blocked origin: ${origin}`));
        }
      },
      credentials: true, // Allow cookies / Authorization headers
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Global rate limiter — protects all /api/* routes
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    standardHeaders: true,  // Return RateLimit-* headers in responses
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests from this IP. Please try again later.',
    },
  });
  app.use('/api', limiter);

  // ─── Parsing & Utilities ─────────────────────────────────────────────────
  // Gzip compression for responses > 1kb
  app.use(compression());

  // Parse JSON bodies (limit prevents large payload attacks)
  app.use(express.json({ limit: '10kb' }));

  // Parse URL-encoded form data
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Parse Cookie header and populate req.cookies
  app.use(cookieParser());

  // Sanitize user-supplied data against MongoDB operator injection
  app.use(mongoSanitize());

  // ─── HTTP Request Logging ─────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    // Colourful, concise format for local development
    app.use(morgan('dev'));
  } else {
    // Structured Apache-compatible logs for production log aggregators
    app.use(
      morgan('combined', {
        stream: { write: (msg) => logger.http(msg.trim()) },
      })
    );
  }

  // ─── Health Check ────────────────────────────────────────────────────────
  // Lightweight endpoint for container health probes (no auth required)
  app.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      status: 'healthy',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── API Routes ──────────────────────────────────────────────────────────
  const API = '/api/v1';

  // ── Mounted Routers ──────────────────────────────────────────────────────
  app.use(`${API}/auth`,   authRoutes);   // Phase 4: register, login, logout, me, refresh
  app.use(`${API}/carbon`, carbonRoutes); // Phase 2: log, history, stats, dashboard

  // API index — lists all available endpoint groups
  app.get(API, (req, res) => {
    res.json({
      success: true,
      message: 'Carbon Footprint Tracker API',
      version: 'v1',
      endpoints: {
        carbon:    `${API}/carbon`,
        auth:      `${API}/auth`,
        users:     `${API}/users`,
      },
    });
  });

  // ─── 404 & Error Handling ────────────────────────────────────────────────
  // Catch-all for undefined routes — must come after all route registrations
  app.use(notFound);

  // Central error handler — must be last middleware (4 args)
  app.use(errorHandler);

  // ─── Start HTTP Server ───────────────────────────────────────────────────
  const PORT = parseInt(process.env.PORT, 10) || 5000;
  const server = http.createServer(app);

  server.listen(PORT, () => {
    logger.info(`⚡ Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    logger.info(`🌿 Carbon Tracker API → http://localhost:${PORT}${API}`);
    logger.info(`❤️  Health check     → http://localhost:${PORT}/health`);
  });

  // ─── Graceful Shutdown ───────────────────────────────────────────────────
  // Cleanly close the server and DB connection on termination signals
  const shutdown = async (signal) => {
    logger.warn(`${signal} received — starting graceful shutdown…`);

    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('MongoDB connection closed.');
        process.exit(0);
      } catch (err) {
        logger.error(`Error during shutdown: ${err.message}`);
        process.exit(1);
      }
    });

    // Force-kill if cleanup takes longer than 10 seconds
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // ─── Unhandled Rejection Safety Net ─────────────────────────────────────
  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled Promise Rejection at: ${promise} — reason: ${reason}`);
    // In production, exit and let the process manager restart
    if (process.env.NODE_ENV === 'production') process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}\n${err.stack}`);
    process.exit(1);
  });
};

// ─── Run ──────────────────────────────────────────────────────────────────────
startServer();
