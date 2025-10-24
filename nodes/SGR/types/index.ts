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

/**
 * Data about a research source
 * Port from Python SourceData model
 */
export interface SourceData {
	number: number;
	title?: string;
	url: string;
	snippet?: string;
	full_content?: string;
	char_count?: number;
}

/**
 * Search result with query, answer, and sources
 * Port from Python SearchResult model
 */
export interface SearchResult {
	query: string;
	answer?: string;
	citations: SourceData[];
	timestamp: string;
}
