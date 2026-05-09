import { getJobStatus, jobStatusTool } from './job-status.js';
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
  getJobAccounting,
  allocationInfoTool,
  jobAccountingTool,
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

const toolDefinitions = [
  [jobStatusTool, (client, args) => getJobStatus(client, args)],
  [nodeResourcesTool, (client, args) => getNodeResources(client, args)],
  [storageQuotaTool, (client, args) => getStorageQuota(client, args)],
  [directoryUsageTool, (client, args = {}) => getDirectoryUsage(client, args.path)],
  [allocationInfoTool, (client, args) => getAllocationInfo(client, args)],
  [jobAccountingTool, (client, args) => getJobAccounting(client, args)],
  [clusterUsage24hTool, (client, args) => getClusterUsage24h(client, args)],
  [clusterOverviewTool, (client, args) => getClusterOverview(client, args)],
  [submitJobTool, (client, args, config) => submitJob(client, args, config)],
];

export const tools = toolDefinitions.map(([tool]) => tool);
export const toolHandlers = new Map(
  toolDefinitions.map(([tool, handler]) => [tool.name, handler])
);
