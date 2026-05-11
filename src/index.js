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
    initializeLogger();
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

    // Validate tool definitions
    const toolNames = new Set();
    for (const tool of tools) {
      if (!tool.name || typeof tool.name !== 'string') {
        throw new Error(`Invalid tool definition: missing or invalid name`);
      }
      if (toolNames.has(tool.name)) {
        throw new Error(`Duplicate tool name: ${tool.name}`);
      }
      if (!toolHandlers.has(tool.name)) {
        throw new Error(`Tool handler not registered for: ${tool.name}`);
      }
      toolNames.add(tool.name);
    }
    logStartup(`  ✓ Validated ${tools.length} tools`);

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
        logError(toolName, error, loggingEnabled);

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
      process.exit(1);
    };

    transport.onerror = (error) => {
      logStartupError('Transport error', error);
      process.exit(1);
    };

    await server.connect(transport);
    logStartup('✓ Connected to stdio transport');
    logStartup('✓ Rivanna MCP server started successfully');
    logStartup('Server is ready and waiting for requests...');

    // Keep process alive indefinitely by creating a never-resolving promise
    // The transport maintains active stdio listeners, keeping stdin/stdout alive
    await new Promise(() => {
      // This promise never resolves; process exits only via signals or transport close
    });
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
    // Silently fail - don't corrupt MCP protocol
  }
  if (client) {
    try {
      client.close();
    } catch (error) {
      logStartupError('Error closing client', error);
    }
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
