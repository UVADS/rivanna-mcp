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
  [listJobsTool, (client, args) => listJobs(client, args)],
  [nodeResourcesTool, (client, args) => getNodeResources(client, args)],
  [storageQuotaTool, (client, args) => getStorageQuota(client, args)],
  [directoryUsageTool, (client, args = {}) => getDirectoryUsage(client, args.path)],
  [allocationInfoTool, (client, args) => getAllocationInfo(client, args)],
  [jobHistoryTool, (client, args) => getJobHistory(client, args)],
  [clusterUsage24hTool, (client, args) => getClusterUsage24h(client, args)],
  [clusterOverviewTool, (client, args) => getClusterOverview(client, args)],
  [submitJobTool, (client, args, config) => submitJob(client, args, config)],
  [cancelJobTool, (client, args) => cancelJob(client, args)],
  [execCommandTool, (client, args) => execCommand(client, args)],
  [sshLoginTool, () => sshLogin()],
];

export const tools = toolDefinitions.map(([tool]) => tool);
export const toolHandlers = new Map(
  toolDefinitions.map(([tool, handler]) => [tool.name, handler])
);
