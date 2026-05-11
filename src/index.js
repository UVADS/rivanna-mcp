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
import {
  initializeLogger,
  logRequest,
  logError,
  logSuccess,
  logStartup,
  logStartupError,
  getStartupLogFilePath,
  setLoggingEnabled,
  setVerboseMode,
  logVerbose,
  markTransportConnected,
} from './logger.js';
import { tools, toolHandlers } from './tools/index.js';

let server;
let config;
let client;
let isShuttingDown = false;

const EXIT_CODES = {
  SUCCESS: 0,
  CONFIG_ERROR: 2,
  LOGGER_ERROR: 3,
  TRANSPORT_ERROR: 4,
  TOOL_ERROR: 5,
  SIGNAL_EXIT: 0,
  INTERNAL_ERROR: 1,
};

process.on('SIGINT', () => shutdown('SIGINT', EXIT_CODES.SIGNAL_EXIT));
process.on('SIGTERM', () => shutdown('SIGTERM', EXIT_CODES.SIGNAL_EXIT));

function shutdown(reason, code) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try { logStartup(`Shutdown (${reason}), exiting with code ${code}`); } catch {}
  if (client) {
    try { client.close(); } catch (e) { logStartupError('client.close() failed', e); }
  }
  process.exit(code);
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
      if (config.verbose) logStartup('  Verbose mode: ENABLED');
    } catch (loggerError) {
      logStartupError('Failed to initialize logger', loggerError);
      process.exit(EXIT_CODES.LOGGER_ERROR);
    }

    logStartup('Step 3: Creating client...');
    client = createClient(config);
    logStartup('✓ Client created successfully');

    logStartup('Step 4: Creating MCP server...');
    server = new Server(
      { name: 'rivanna-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    logStartup('✓ MCP server created');

    logStartup(`Step 5: Registering ${tools.length} tools...`);

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      logStartup('LIST TOOLS request received');
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const startTime = Date.now();
      const name = request?.params?.name;

      if (!name || typeof name !== 'string') {
        throw new McpError(ErrorCode.InvalidRequest, 'Tool name must be a non-empty string');
      }

      const handler = toolHandlers.get(name);
      if (!handler) {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      logRequest(name, request.params.arguments);
      try {
        const result = await handler(client, request.params.arguments || {}, config);
        logSuccess(name);
        logVerbose(`Tool completed: ${name}`, { durationMs: Date.now() - startTime });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        logError(name, error);
        return {
          content: [{ type: 'text', text: `Error: ${error.message}`, isError: true }],
        };
      }
    });
    logStartup('✓ Tool handlers registered');

    logStartup('Step 6: Connecting to stdio transport...');
    const transport = new StdioServerTransport();

    // Parent (Claude Code) closing stdin is the normal disconnect path.
    // Exit cleanly — do NOT treat as a critical failure.
    transport.onclose = () => {
      logStartup('Transport closed (parent disconnected) — exiting cleanly');
      shutdown('transport-close', EXIT_CODES.SUCCESS);
    };

    transport.onerror = (error) => {
      logStartupError('Transport error', error);
      shutdown('transport-error', EXIT_CODES.TRANSPORT_ERROR);
    };

    // Connect with 10s timeout to avoid hanging on broken stdio.
    let connectTimer;
    const connectTimeout = new Promise((_, reject) => {
      connectTimer = setTimeout(
        () => reject(new Error('Transport connection timeout after 10s')),
        10000
      );
    });
    try {
      await Promise.race([server.connect(transport), connectTimeout]);
    } finally {
      clearTimeout(connectTimer);
    }

    markTransportConnected();
    logStartup('✓ Rivanna MCP server ready');

    // No keep-alive promise needed: StdioServerTransport holds stdin in
    // flowing mode, which keeps the Node event loop alive until the parent
    // closes stdin (handled by transport.onclose above).

    if (config.verbose) {
      const heartbeat = setInterval(() => {
        logVerbose('Heartbeat', {
          uptime: process.uptime(),
          rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        });
      }, 30000);
      heartbeat.unref();
    }
  } catch (error) {
    const exitCode =
      error.message?.includes('Invalid tool') ? EXIT_CODES.TOOL_ERROR :
      error.message?.includes('configuration') ? EXIT_CODES.CONFIG_ERROR :
      EXIT_CODES.INTERNAL_ERROR;
    logStartupError('Failed to initialize server', error);
    process.exit(exitCode);
  }
}

main().catch((error) => {
  logStartupError('Failed to start server', error);
  process.exit(EXIT_CODES.INTERNAL_ERROR);
});

process.on('unhandledRejection', (reason) => {
  if (isShuttingDown) return;
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logStartupError('Unhandled promise rejection', err);
  shutdown('unhandledRejection', EXIT_CODES.INTERNAL_ERROR);
});

process.on('uncaughtException', (error) => {
  if (isShuttingDown) return;
  logStartupError('Uncaught exception', error);
  shutdown('uncaughtException', EXIT_CODES.INTERNAL_ERROR);
});

process.on('beforeExit', (code) => {
  logStartup(`beforeExit fired with code ${code} — event loop drained`);
});

process.on('exit', (code) => {
  try { logStartup(`Process exit with code: ${code}`); } catch {}
});
