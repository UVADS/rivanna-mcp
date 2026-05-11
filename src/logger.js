import { appendFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.rivanna-mcp');
const LOG_FILE = join(CONFIG_DIR, 'history.log');
const STARTUP_LOG_FILE = join(CONFIG_DIR, 'startup.log');

let loggerInitialized = false;
let loggingEnabled = true;
let verboseMode = false;
let transportConnected = false;

// Emergency buffer for errors that occur before logging is ready
let errorBuffer = [];

export function initializeLogger() {
  try {
    // mkdirSync with recursive flag is idempotent (no-op if exists)
    mkdirSync(CONFIG_DIR, { recursive: true });

    // Rotate startup log: rename current to .old for "log from last run only" behavior
    try {
      if (existsSync(STARTUP_LOG_FILE)) {
        const oldLogPath = STARTUP_LOG_FILE + '.old';
        renameSync(STARTUP_LOG_FILE, oldLogPath);
      }
    } catch {
      // Log rotation not critical, continue
    }

    // Test write access with a real write (not empty string)
    const testMarker = `[${new Date().toISOString()}] Logger initialized\n`;
    appendFileSync(STARTUP_LOG_FILE, testMarker);

    loggerInitialized = true;
    logStartup('='.repeat(60));
    logStartup(`Server startup at ${new Date().toISOString()}`);
    logStartup('='.repeat(60));
  } catch (error) {
    console.error(`\nFailed to initialize logger: ${error.message}`);
    console.error(`Log directory: ${CONFIG_DIR}`);
    console.error(`Ensure directory exists and is writable.\n`);
    throw error;
  }
}

export function logStartup(message) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    appendFileSync(STARTUP_LOG_FILE, logEntry + '\n');
  } catch (error) {
    // Silently fail - don't write to stderr as it corrupts MCP protocol
  }
}

function sanitizeArgs(args) {
  const sanitized = { ...(args || {}) };
  // Only redact explicitly sensitive fields (avoid false positives like sshKeyPath)
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'privateKey'];

  sensitiveKeys.forEach((key) => {
    if (key in sanitized && sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

function formatLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] ${level}: ${message}`;

  if (data) {
    logEntry += ` | ${JSON.stringify(data)}`;
  }

  return logEntry;
}

function writeLine(file, level, message, data = null) {
  try {
    const logEntry = level ? formatLog(level, message, data) : `[${new Date().toISOString()}] ${message}`;
    appendFileSync(file, logEntry + '\n');
  } catch (error) {
    // Before transport connects, we can write to stderr for critical issues
    if (!transportConnected) {
      const msg = `LOGGER ERROR: Failed to write to ${file}: ${error.message}`;
      console.error(msg);
      errorBuffer.push({ timestamp: new Date().toISOString(), error: msg });
    }
    // After transport connects, we can't write to stderr, but we tried to log it
  }
}

export function logRequest(toolName, args) {
  if (!loggingEnabled) return;

  try {
    const sanitized = sanitizeArgs(args);
    const logEntry = formatLog('REQUEST', `Tool called: ${toolName}`, sanitized);
    appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (error) {
    // Silently fail - don't write to stderr as it corrupts MCP protocol after transport connects
  }
}

export function logError(toolName, error) {
  if (!loggingEnabled) return;

  try {
    const logEntry = formatLog('ERROR', `Tool failed: ${toolName}`, {
      error: error.message,
      code: error.code,
    });
    appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (err) {
    // Silently fail - don't write to stderr as it corrupts MCP protocol after transport connects
  }
}

export function logSuccess(toolName) {
  if (!loggingEnabled) return;

  try {
    const logEntry = formatLog('SUCCESS', `Tool completed: ${toolName}`);
    appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (error) {
    // Silently fail - don't write to stderr as it corrupts MCP protocol after transport connects
  }
}

export function getLogFilePath() {
  return LOG_FILE;
}

export function getStartupLogFilePath() {
  return STARTUP_LOG_FILE;
}

export function setLoggingEnabled(enabled) {
  loggingEnabled = enabled;
}

export function setVerboseMode(enabled) {
  verboseMode = enabled;
}

export function logVerbose(message, data = null) {
  if (!verboseMode) return;
  try {
    writeLine(STARTUP_LOG_FILE, 'VERBOSE', message, data);
  } catch (error) {
    if (!transportConnected) {
      console.error(`VERBOSE LOG FAILED: ${error.message}`);
    }
  }
}

export function markTransportConnected() {
  transportConnected = true;
  logStartup('[TRANSPORT] Client connected - stdio protocol now active');
  logStartup('[TRANSPORT] Errors will no longer be written to stderr (would corrupt protocol)');
  logStartup('[TRANSPORT] All errors must be captured in logs only');
}

export function getErrorBuffer() {
  return errorBuffer;
}

export function logStartupError(message, error = null) {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] ERROR: ${message}`;
  if (error) {
    logEntry += `\n[${timestamp}]   Message: ${error.message}`;
    if (error.stack) {
      logEntry += `\n[${timestamp}]   Stack: ${error.stack.split('\n').join(`\n[${timestamp}]   `)}`;
    }
  }

  let writeSucceeded = false;
  try {
    appendFileSync(STARTUP_LOG_FILE, logEntry + '\n');
    writeSucceeded = true;
  } catch (writeError) {
    // Before transport: we can use stderr
    if (!transportConnected) {
      console.error(`\n${'='.repeat(60)}`);
      console.error('CRITICAL LOGGER FAILURE:');
      console.error(`Failed to write startup error log to: ${STARTUP_LOG_FILE}`);
      console.error(`Reason: ${writeError.message}`);
      console.error(`Original error was: ${message}`);
      if (error?.message) console.error(`Error details: ${error.message}`);
      console.error(`${'='.repeat(60)}\n`);
      errorBuffer.push({
        timestamp,
        original: message,
        logWriteFailed: writeError.message
      });
    }
    // After transport: can't use stderr, but we tried our best
  }

  // If we couldn't write to startup.log, try writing to history.log as backup
  if (!writeSucceeded) {
    try {
      appendFileSync(LOG_FILE, `[${timestamp}] FALLBACK ERROR: ${message}\n`);
      if (error) {
        appendFileSync(LOG_FILE, `[${timestamp}]   ${error.message}\n`);
      }
      writeSucceeded = true;
    } catch (fallbackError) {
      // Both logs failed - nothing we can do now
    }
  }
}
