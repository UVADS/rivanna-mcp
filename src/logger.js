import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.rivanna-mcp');
const LOG_FILE = join(CONFIG_DIR, 'history.log');

export function initializeLogger() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
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
