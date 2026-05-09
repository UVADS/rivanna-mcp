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

const config = loadConfig();
initializeLogger(config);
const loggingEnabled = config.logging !== false;

const client = createClient(config);

const server = new Server(
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Rivanna MCP server started');
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
