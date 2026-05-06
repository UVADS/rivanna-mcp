import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import SSHClient from './ssh-client.js';
import { loadConfig } from './config.js';
import { initializeLogger, logRequest, logError, logSuccess } from './logger.js';
import { getJobStatus, jobStatusTool } from './tools/job-status.js';
import {
  getNodeResources,
  nodeResourcesTool,
} from './tools/node-resources.js';
import {
  getStorageQuota,
  getDirectoryUsage,
  storageQuotaTool,
  directoryUsageTool,
} from './tools/storage-quota.js';
import {
  getAllocationInfo,
  getJobAccounting,
  allocationInfoTool,
  jobAccountingTool,
} from './tools/allocation-billing.js';

const config = loadConfig();
initializeLogger(config);
const HPC_HOST = 'login.hpc.virginia.edu';
const HPC_USER = config.computingId;
const HPC_KEY = config.sshKeyPath;
const loggingEnabled = config.logging !== false;

const sshClient = new SSHClient(HPC_HOST, HPC_USER, HPC_KEY);

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
  return {
    tools: [
      jobStatusTool,
      nodeResourcesTool,
      storageQuotaTool,
      directoryUsageTool,
      allocationInfoTool,
      jobAccountingTool,
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params || request;

    logRequest(name, args, loggingEnabled);

    let result;
    switch (name) {
      case 'get_job_status':
        result = await getJobStatus(sshClient, args);
        break;

      case 'get_node_resources':
        result = await getNodeResources(sshClient, args);
        break;

      case 'get_storage_quota':
        result = await getStorageQuota(sshClient, args);
        break;

      case 'get_directory_usage':
        result = await getDirectoryUsage(sshClient, args.path);
        break;

      case 'get_allocation_info':
        result = await getAllocationInfo(sshClient, args);
        break;

      case 'get_job_accounting':
        result = await getJobAccounting(sshClient, args);
        break;

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }

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
  if (sshClient) {
    sshClient.close();
  }
  process.exit(0);
});
