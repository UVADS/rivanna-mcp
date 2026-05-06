import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import SSHClient from './ssh-client.js';
import { loadConfig } from './config.js';
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
const HPC_HOST = 'login.hpc.virginia.edu';
const HPC_USER = config.computingId;
const HPC_KEY = config.sshKeyPath;

const sshClient = new SSHClient(HPC_HOST, HPC_USER, HPC_KEY);

const server = new Server(
  {
    name: 'rivanna-mpc',
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
    const { name, arguments: args } = request;

    switch (name) {
      case 'get_job_status':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await getJobStatus(sshClient, args),
                null,
                2
              ),
            },
          ],
        };

      case 'get_node_resources':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await getNodeResources(sshClient, args),
                null,
                2
              ),
            },
          ],
        };

      case 'get_storage_quota':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await getStorageQuota(sshClient, args),
                null,
                2
              ),
            },
          ],
        };

      case 'get_directory_usage':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await getDirectoryUsage(sshClient, args.path),
                null,
                2
              ),
            },
          ],
        };

      case 'get_allocation_info':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await getAllocationInfo(sshClient, args),
                null,
                2
              ),
            },
          ],
        };

      case 'get_job_accounting':
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                await getJobAccounting(sshClient, args),
                null,
                2
              ),
            },
          ],
        };

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  } catch (error) {
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
  const transport = new server.StdioServerTransport();
  await server.connect(transport);
  console.error('Rivanna MPC server started');
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
