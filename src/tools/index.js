import { listJobs, listJobsTool } from './job-status.js';
import {
  getNodeResources,
  nodeResourcesTool,
} from './node-resources.js';
import {
  getStorageQuota,
  getDirectoryUsage,
  storageQuotaTool,
  directoryUsageTool,
} from './storage-quota.js';
import {
  getAllocationInfo,
  getJobHistory,
  allocationInfoTool,
  jobHistoryTool,
} from './allocation-billing.js';
import {
  getClusterUsage24h,
  clusterUsage24hTool,
} from './usage-trends.js';
import {
  getClusterOverview,
  clusterOverviewTool,
} from './cluster-overview.js';
import { submitJob, submitJobTool } from './submit-job.js';
import { cancelJob, cancelJobTool } from './cancel-job.js';
import { execCommand, execCommandTool } from './exec-command.js';
import { sshLogin, sshLoginTool } from './ssh-login.js';

const toolDefinitions = [
  [listJobsTool, (client, args, config) => listJobs(client, args, config)],
  [nodeResourcesTool, (client, args) => getNodeResources(client, args)],
  [storageQuotaTool, (client, args, config) => getStorageQuota(client, config)],
  [directoryUsageTool, (client, args = {}) => getDirectoryUsage(client, args.path)],
  [allocationInfoTool, (client, args, config) => getAllocationInfo(client, args, config)],
  [jobHistoryTool, (client, args, config) => getJobHistory(client, args, config)],
  [clusterUsage24hTool, (client, args) => getClusterUsage24h(client, args)],
  [clusterOverviewTool, (client, args) => getClusterOverview(client, args)],
  [submitJobTool, (client, args, config) => submitJob(client, args, config)],
  [cancelJobTool, (client, args) => cancelJob(client, args)],
  [execCommandTool, (client, args) => execCommand(client, args)],
  [sshLoginTool, () => sshLogin()],
];

// Validate tool definitions at import time
const toolNames = new Set();
toolDefinitions.forEach((pair, index) => {
  const [tool, handler] = pair;

  if (!tool || typeof tool !== 'object' || !tool.name || typeof tool.name !== 'string') {
    throw new Error(`Invalid tool definition at index ${index}: missing or invalid tool name`);
  }

  if (typeof handler !== 'function') {
    throw new Error(`Invalid tool handler at index ${index} (${tool.name}): must be a function`);
  }

  if (toolNames.has(tool.name)) {
    throw new Error(`Duplicate tool name detected: ${tool.name}`);
  }

  toolNames.add(tool.name);
});

export const tools = toolDefinitions.map(([tool]) => tool);
export const toolHandlers = new Map(
  toolDefinitions.map(([tool, handler]) => [tool.name, handler])
);
