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
import { initializeLogger, logRequest, logError, logSuccess, logStartup, logStartupError, getStartupLogFilePath } from './logger.js';
import { tools, toolHandlers } from './tools/index.js';

let server;
let config;
let client;
let loggingEnabled;

async function main() {
  try {
    logStartup('Step 1: Loading configuration...');
    config = loadConfig();
    logStartup('✓ Configuration loaded');

    logStartup('Step 2: Initializing logger...');
    initializeLogger(config);
    loggingEnabled = config.logging !== false;
    logStartup('✓ Logger initialized');
    logStartup(`  Startup log file: ${getStartupLogFilePath()}`);

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
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params || request;

        logRequest(name, args, loggingEnabled);

        const handler = toolHandlers.get(name);
        if (!handler) {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        const result = await handler(client, args || {}, config);

        logSuccess(name, loggingEnabled);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const { name } = request.params || request;
        logError(name, error, loggingEnabled);

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
      logStartup('WARNING: Transport closed!');
      process.exit(0);
    };

    transport.onerror = (error) => {
      logStartupError('Transport error', error);
      process.exit(1);
    };

    await server.connect(transport);
    logStartup('✓ Connected to stdio transport');
    logStartup('✓ Rivanna MCP server started successfully');
    logStartup('Server is ready and waiting for requests...');
    logStartup('Entering idle loop (waiting for requests)...');

    // Keep the process alive indefinitely with a heartbeat
    const heartbeatInterval = setInterval(() => {
      // Silent heartbeat - just keeps process alive
    }, 30000);
    heartbeatInterval.ref(); // Keep this interval from allowing exit
    logStartup('✓ Heartbeat started');

    // Keep the process alive indefinitely
    const idlePromise = new Promise(() => {
      logStartup('Promise created, waiting for requests...');
    });

    logStartup('About to await idle promise...');
    try {
      await idlePromise;
      logStartup('ERROR: Idle promise resolved (should never happen)');
    } catch (err) {
      logStartupError('Error in idle promise', err);
      throw err;
    }
  } catch (error) {
    logStartupError('Failed to initialize server', error);
    process.exit(1);
  }
}

main().catch((error) => {
  logStartupError('Failed to start server', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  try {
    logStartup('Received SIGINT, shutting down gracefully...');
  } catch (e) {
    console.error('Failed to log shutdown:', e);
  }
  if (client) {
    client.close();
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logStartupError('Unhandled Promise Rejection', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logStartupError('Uncaught Exception', error);
  process.exit(1);
});
