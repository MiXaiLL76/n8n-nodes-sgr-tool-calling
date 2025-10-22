/**
 * Export all types
 */

export * from './messages';
export * from './tools';

export enum AgentState {
	RESEARCHING = 'RESEARCHING',
	WAITING_FOR_CLARIFICATION = 'WAITING_FOR_CLARIFICATION',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
	MAX_ITERATIONS_REACHED = 'MAX_ITERATIONS_REACHED',
}

export interface ExecutionLogEntry {
	iteration: number;
	timestamp?: string;
	type: 'tool_call' | 'tool_result' | 'reasoning';
	tool?: string;
	arguments?: Record<string, unknown>;
	result?: unknown;
}
