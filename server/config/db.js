const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MONGO_OPTIONS = {
  // Automatically try to reconnect when connection is lost
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

/**
 * Establishes a connection to MongoDB.
 * Exits the process on initial connection failure so the container
 * orchestrator can restart with a proper alert.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
    logger.info(`MongoDB connected → ${conn.connection.host} (db: ${conn.connection.name})`);
  } catch (error) {
    logger.error(`MongoDB initial connection failed: ${error.message}`);
    process.exit(1);
  }
};

// ─── Connection Event Listeners ───────────────────────────────────────────────

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect…');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected successfully.');
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB runtime error: ${err.message}`);
});

module.exports = connectDB;