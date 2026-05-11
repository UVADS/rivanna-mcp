import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.rivanna-mcp');
const LOG_FILE = join(CONFIG_DIR, 'history.log');
const STARTUP_LOG_FILE = join(CONFIG_DIR, 'startup.log');

let loggerInitialized = false;

export function initializeLogger() {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    // Test write access before marking as initialized
    appendFileSync(STARTUP_LOG_FILE, '');
    loggerInitialized = true;
    logStartup('='.repeat(60));
    logStartup(`Server startup at ${new Date().toISOString()}`);
    logStartup('='.repeat(60));
  } catch (error) {
    console.error(`\n❌ Failed to initialize logger: ${error.message}`);
    console.error(`   Log directory: ${CONFIG_DIR}`);
    console.error(`   Ensure directory exists and is writable.\n`);
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
  const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'key'];

  sensitiveKeys.forEach((key) => {
    if (sanitized[key]) {
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

export function logRequest(toolName, args, loggingEnabled) {
  if (!loggingEnabled) return;

  try {
    const sanitized = sanitizeArgs(args);
    const logEntry = formatLog('REQUEST', `Tool called: ${toolName}`, sanitized);
    appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (error) {
    console.error('Failed to write log:', error.message);
  }
}

export function logError(toolName, error, loggingEnabled) {
  if (!loggingEnabled) return;

  try {
    const logEntry = formatLog('ERROR', `Tool failed: ${toolName}`, {
      error: error.message,
      code: error.code,
    });
    appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (err) {
    console.error('Failed to write error log:', err.message);
  }
}

export function logSuccess(toolName, loggingEnabled) {
  if (!loggingEnabled) return;

  try {
    const logEntry = formatLog('SUCCESS', `Tool completed: ${toolName}`);
    appendFileSync(LOG_FILE, logEntry + '\n');
  } catch (error) {
    console.error('Failed to write log:', error.message);
  }
}

export function getLogFilePath() {
  return LOG_FILE;
}

export function getStartupLogFilePath() {
  return STARTUP_LOG_FILE;
}

export function logStartupError(message, error = null) {
  try {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ERROR: ${message}`;
    if (error) {
      logEntry += `\n[${timestamp}]   Message: ${error.message}`;
      if (error.stack) {
        logEntry += `\n[${timestamp}]   Stack: ${error.stack.split('\n').join(`\n[${timestamp}]   `)}`;
      }
    }
    appendFileSync(STARTUP_LOG_FILE, logEntry + '\n');
  } catch (err) {
    // Silently fail - don't write to stderr as it corrupts MCP protocol
  }
}
