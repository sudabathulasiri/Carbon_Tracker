const { createLogger, format, transports } = require('winston');

const { combine, timestamp, printf, colorize, errors } = format;

// Custom log format for development
const devFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// Custom log format for production (JSON for log aggregators)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format:
    process.env.NODE_ENV === 'production'
      ? prodFormat
      : combine(
          colorize(),
          timestamp({ format: 'HH:mm:ss' }),
          errors({ stack: true }),
          devFormat
        ),
  transports: [new transports.Console()],
  exitOnError: false,
});

module.exports = logger;