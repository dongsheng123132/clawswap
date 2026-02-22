import { startAgentRunner } from './agent-runner';

let initialized = false;

export function ensureAgentRunnerStarted() {
  if (initialized) return;
  initialized = true;
  startAgentRunner(30000);
}
