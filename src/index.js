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
import { initializeLogger, logRequest, logError, logSuccess } from './logger.js';
import { tools, toolHandlers } from './tools/index.js';

let server;
let config;
let client;
let loggingEnabled;

async function main() {
  console.error('Rivanna MCP server starting...');

  try {
    console.error('Loading configuration...');
    config = loadConfig();
    console.error('Configuration loaded');

    console.error('Initializing logger...');
    initializeLogger(config);
    loggingEnabled = config.logging !== false;
    console.error('Logger initialized');

    console.error('Creating client...');
    client = createClient(config);
    console.error('Client created');

    console.error('Creating MCP server...');
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

    console.error('Connecting to stdio transport...');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Rivanna MCP server started');

    // Keep the process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('Failed to initialize server:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  if (client) {
    client.close();
  }
  process.exit(0);
});

// Catch unhandled errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});
