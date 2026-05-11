import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { createClient } from './client-factory.js';
import { initializeLogger, logRequest, logError, logSuccess, logStartup, logStartupError, getStartupLogFilePath, setLoggingEnabled, setVerboseMode, logVerbose, markTransportConnected } from './logger.js';
import { tools, toolHandlers } from './tools/index.js';

let server;
let config;
let client;
let isShuttingDown = false;

// Exit codes: distinguish failure types for proper supervision/restart policies
const EXIT_CODES = {
  SUCCESS: 0,
  CONFIG_ERROR: 2,
  LOGGER_ERROR: 3,
  TRANSPORT_ERROR: 4,
  TOOL_ERROR: 5,
  SIGNAL_EXIT: 0,
  INTERNAL_ERROR: 1,
};

// Register signal handlers first, before main() runs (prevent race window during startup)
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

function handleShutdown(signal) {
  if (isShuttingDown) return; // Prevent double-shutdown
  isShuttingDown = true;

  try {
    logStartup(`Received ${signal}, shutting down gracefully...`);
  } catch (e) {
    // Silently fail - don't corrupt MCP protocol
  }

  if (client) {
    try {
      client.close();
    } catch (error) {
      logStartupError(`Error closing client on ${signal}`, error);
    }
  }

  process.exit(EXIT_CODES.SIGNAL_EXIT);
}

async function main() {
  try {
    logStartup('Step 1: Loading configuration...');
    config = loadConfig();
    logStartup('✓ Configuration loaded');

    logStartup('Step 2: Initializing logger...');
    try {
      initializeLogger();
      setLoggingEnabled(config.logging !== false);
      setVerboseMode(config.verbose === true);
      logStartup('✓ Logger initialized');
      logStartup(`  Startup log file: ${getStartupLogFilePath()}`);
      if (config.verbose) {
        logStartup('  Verbose mode: ENABLED');
      }
    } catch (loggerError) {
      logStartupError('Failed to initialize logger', loggerError);
      process.exit(EXIT_CODES.LOGGER_ERROR);
    }

    logStartup('Step 3: Creating client...');
    try {
      client = createClient(config);
      logStartup('✓ Client created successfully');
    } catch (clientError) {
      logStartupError('Failed to create client', clientError);
      throw clientError;
    }

    logStartup('Step 4: Creating MCP server...');
    server = new Server(
      {
        name: 'rivanna-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    logStartup('✓ MCP server created');

    logStartup('Step 5: Registering tool handlers...');
    logStartup(`  ✓ Validated ${tools.length} tools at import time`);

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        logStartup('LIST TOOLS REQUEST - Handler called');
        logVerbose('Returning tools array', { toolCount: tools.length });

        // Test serialization before returning
        try {
          const testJson = JSON.stringify({ tools });
          logVerbose('Serialization test passed', { jsonSize: testJson.length });
        } catch (serErr) {
          logStartupError('CRITICAL: Tools array is not JSON serializable', serErr);
          throw serErr;
        }

        logStartup('LIST TOOLS REQUEST - About to return response');
        const response = { tools };
        logStartup('LIST TOOLS REQUEST - Response object created, about to return');
        return response;
      } catch (error) {
        logStartupError('ERROR in ListToolsRequestSchema handler', error);
        throw error;
      }
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      let toolName = 'unknown';
      const startTime = Date.now();
      try {
        const now = new Date().toISOString();
        logStartup('Tool request received');
        logVerbose('Received tool request', { timestamp: now });

        if (!request.params || typeof request.params !== 'object') {
          throw new McpError(ErrorCode.InvalidRequest, 'Request must have params object');
        }

        const { name, arguments: args } = request.params;

        if (!name || typeof name !== 'string') {
          throw new McpError(ErrorCode.InvalidRequest, 'Tool name must be a non-empty string');
        }

        toolName = name;
        logRequest(name, args);
        logVerbose(`Tool handler lookup: ${name}`, { hasClient: !!client, configLoaded: !!config });

        const handler = toolHandlers.get(name);
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        logVerbose(`Executing tool handler: ${name}`);
        const result = await handler(client, args || {}, config);
        const duration = Date.now() - startTime;

        logSuccess(name);
        logVerbose(`Tool completed successfully: ${name}`, {
          resultSize: JSON.stringify(result).length,
          durationMs: duration
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        logError(toolName, error);
        logStartupError(`Tool error during execution: ${toolName} (${duration}ms)`, error);
        logVerbose(`Tool execution failed: ${toolName}`, {
          durationMs: duration,
          errorType: error.constructor.name,
          code: error.code
        });

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
              isError: true,
            },
          ],
        };
      }
    });
    logStartup('✓ Tool handlers registered');

    logStartup('Step 6: Connecting to stdio transport...');
    const transport = new StdioServerTransport();
    logStartup('  Transport created, attempting connection...');

    transport.onclose = () => {
      logStartup('[TRANSPORT HANDLER] onclose triggered!');
      logStartupError('Transport closed unexpectedly! This is a critical failure.');
      logVerbose('Transport state dump', { isShuttingDown, hasClient: !!client });
      logStartup(`  Exiting with code ${EXIT_CODES.TRANSPORT_ERROR}`);
      process.exit(EXIT_CODES.TRANSPORT_ERROR);
    };

    transport.onerror = (error) => {
      logStartup('[TRANSPORT HANDLER] onerror triggered!');
      logStartupError('Transport error - this will cause server failure', error);
      logVerbose('Transport error details', {
        eventType: 'transport_error',
        timestamp: new Date().toISOString(),
      });
      logStartup(`  Exiting with code ${EXIT_CODES.TRANSPORT_ERROR}`);
      process.exit(EXIT_CODES.TRANSPORT_ERROR);
    };

    // Connect with timeout to prevent hanging on transport issues
    const connectTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transport connection timeout after 10s')), 10000)
    );
    await Promise.race([server.connect(transport), connectTimeout]);
    logStartup('✓ Connected to stdio transport');
    markTransportConnected();
    logStartup('✓ Rivanna MCP server started successfully');
    logStartup(`Server is ready and waiting for requests at ${new Date().toISOString()}`);

    // Set up periodic heartbeat if verbose mode is enabled
    logStartup('Step 7: Setting up heartbeat...');
    if (config.verbose) {
      logStartup('  Verbose mode detected, creating 30s heartbeat interval');
      const heartbeatInterval = setInterval(() => {
        logVerbose('Heartbeat - server is alive', {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        });
      }, 30000); // Log heartbeat every 30 seconds

      // Ensure heartbeat doesn't prevent graceful shutdown
      heartbeatInterval.unref();
      logStartup('  ✓ Heartbeat interval created and unref()d');
    } else {
      logStartup('  Verbose mode disabled, skipping heartbeat');
    }

    // Keep process alive indefinitely by creating a never-resolving promise
    // The transport maintains active stdio listeners, keeping stdin/stdout alive
    logStartup('Step 8: Creating never-resolving promise to keep process alive...');
    logStartup(`  Active handles before promise: ${process._getActiveHandles?.().length ?? 'unknown'}`);
    logStartup(`  Active requests before promise: ${process._getActiveRequests?.().length ?? 'unknown'}`);

    let promiseCreated = false;
    const keepAlivePromise = new Promise((resolve, reject) => {
      promiseCreated = true;
      logStartup('Step 8b: Promise callback executing, logging wait state');
      logVerbose('Process entering wait state', { timestamp: new Date().toISOString() });
      logStartup('Step 8c: Logged wait state, promise callback complete (will wait indefinitely)');

      // Periodically log that we're still alive and have listeners
      const aliveCheckInterval = setInterval(() => {
        try {
          const handles = process._getActiveHandles?.().length ?? 0;
          const reqs = process._getActiveRequests?.().length ?? 0;
          const memory = process.memoryUsage();
          logStartup(`  [Keep-alive check] Handles: ${handles}, Requests: ${reqs}, Memory: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`);

          // Detect potential deadlock: no handles and no requests is suspicious
          if (handles === 0 && reqs === 0) {
            logStartup('  ⚠️  WARNING: No active handles or requests! Server may be unresponsive.');
          }
        } catch (err) {
          logStartup(`  [Keep-alive check ERROR] ${err.message}`);
        }
      }, 10000);
      aliveCheckInterval.unref();

      // This promise never resolves; process exits only via signals or transport close
    });

    logStartup('Step 8d: Waiting on promise...');
    await keepAlivePromise;

    // This line should never execute
    logStartupError('FATAL: Promise resolved unexpectedly! This should never happen.');
  } catch (error) {
    const exitCode = error.message?.includes('Invalid tool') ? EXIT_CODES.TOOL_ERROR :
                     error.message?.includes('configuration') ? EXIT_CODES.CONFIG_ERROR :
                     error.message?.includes('logger') ? EXIT_CODES.LOGGER_ERROR :
                     EXIT_CODES.INTERNAL_ERROR;
    logStartupError('Failed to initialize server', error);
    process.exit(exitCode);
  }
}

main().catch((error) => {
  const exitCode = error.message?.includes('Invalid tool') ? EXIT_CODES.TOOL_ERROR :
                   error.message?.includes('configuration') ? EXIT_CODES.CONFIG_ERROR :
                   EXIT_CODES.INTERNAL_ERROR;
  logStartupError('Failed to start server', error);
  process.exit(exitCode);
});

// Global error handlers (for errors that escape try-catch)
process.on('unhandledRejection', (reason, promise) => {
  if (isShuttingDown) return;
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const errorMsg = `UNHANDLED REJECTION at ${new Date().toISOString()}: ${error.message}`;

  logStartup(errorMsg);
  logStartup(`  Promise context: ${String(promise).substring(0, 200)}`);
  logStartupError('CRITICAL: Unhandled Promise Rejection', error);
  logVerbose('Unhandled rejection details', {
    promise: String(promise),
    errorType: error.constructor.name,
    code: error.code,
    stack: error.stack?.split('\n').slice(0, 5),
  });

  handleShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  if (isShuttingDown) return;
  const errorMsg = `UNCAUGHT EXCEPTION at ${new Date().toISOString()}: ${error.message}`;

  logStartup(errorMsg);
  logStartup(`  Error type: ${error.constructor.name}`);
  logStartup(`  Code: ${error.code || 'N/A'}`);
  logStartupError('CRITICAL: Uncaught Exception', error);
  logVerbose('Uncaught exception details', {
    errorType: error.constructor.name,
    code: error.code,
    stack: error.stack?.split('\n').slice(0, 5),
  });

  handleShutdown('uncaughtException');
});

process.on('exit', (code) => {
  logStartup(`Process exit with code: ${code}`);
});
