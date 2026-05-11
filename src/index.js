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
import { initializeLogger, logRequest, logError, logSuccess, logStartup, logStartupError, getStartupLogFilePath, setLoggingEnabled } from './logger.js';
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
      logStartup('✓ Logger initialized');
      logStartup(`  Startup log file: ${getStartupLogFilePath()}`);
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
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      let toolName = 'unknown';
      try {
        if (!request.params || typeof request.params !== 'object') {
          throw new McpError(ErrorCode.InvalidRequest, 'Request must have params object');
        }

        const { name, arguments: args } = request.params;

        if (!name || typeof name !== 'string') {
          throw new McpError(ErrorCode.InvalidRequest, 'Tool name must be a non-empty string');
        }

        toolName = name;
        logRequest(name, args);

        const handler = toolHandlers.get(name);
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        const result = await handler(client, args || {}, config);

        logSuccess(name);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logError(toolName, error);

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
      logStartup('WARNING: Transport closed unexpectedly!');
      process.exit(EXIT_CODES.TRANSPORT_ERROR);
    };

    transport.onerror = (error) => {
      logStartupError('Transport error', error);
      process.exit(EXIT_CODES.TRANSPORT_ERROR);
    };

    // Connect with timeout to prevent hanging on transport issues
    const connectTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transport connection timeout after 10s')), 10000)
    );
    await Promise.race([server.connect(transport), connectTimeout]);
    logStartup('✓ Connected to stdio transport');
    logStartup('✓ Rivanna MCP server started successfully');
    logStartup('Server is ready and waiting for requests...');

    // Keep process alive indefinitely by creating a never-resolving promise
    // The transport maintains active stdio listeners, keeping stdin/stdout alive
    await new Promise(() => {
      // This promise never resolves; process exits only via signals or transport close
    });
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
  logStartupError('Unhandled Promise Rejection', error);
  handleShutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  if (isShuttingDown) return;
  logStartupError('Uncaught Exception', error);
  handleShutdown('uncaughtException');
});
