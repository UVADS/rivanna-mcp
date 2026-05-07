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
import {
  getClusterUsage24h,
  clusterUsage24hTool,
} from './tools/usage-trends.js';
import {
  getClusterOverview,
  clusterOverviewTool,
} from './tools/cluster-overview.js';
import { submitJob, submitJobTool } from './tools/submit-job.js';

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
  return {
    tools: [
      jobStatusTool,
      nodeResourcesTool,
      storageQuotaTool,
      directoryUsageTool,
      allocationInfoTool,
      jobAccountingTool,
      clusterUsage24hTool,
      clusterOverviewTool,
      submitJobTool,
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
        result = await getJobStatus(client, args);
        break;

      case 'get_node_resources':
        result = await getNodeResources(client, args);
        break;

      case 'get_storage_quota':
        result = await getStorageQuota(client, args);
        break;

      case 'get_directory_usage':
        result = await getDirectoryUsage(client, args.path);
        break;

      case 'get_allocation_info':
        result = await getAllocationInfo(client, args);
        break;

      case 'get_job_accounting':
        result = await getJobAccounting(client, args);
        break;

      case 'get_cluster_usage_24h':
        result = await getClusterUsage24h(client, args);
        break;

      case 'get_cluster_overview':
        result = await getClusterOverview(client, args);
        break;

      case 'submit_job':
        result = await submitJob(client, args, config);
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
  if (client) {
    client.close();
  }
  process.exit(0);
});
