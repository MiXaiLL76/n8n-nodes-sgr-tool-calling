/**
 * Agent execution context
 * Similar to ResearchContext from Python version
 */

import { AgentState, type ExecutionLogEntry, type SourceData, type SearchResult } from '../types';

export class AgentContext {
	iteration: number = 0;
	state: AgentState = AgentState.RESEARCHING;
	clarifications_used: number = 0;
	searches_used: number = 0;
	executionLog: ExecutionLogEntry[] = [];

	// Research data from Python ResearchContext
	sources: Map<string, SourceData> = new Map();
	searches: SearchResult[] = [];

	constructor() {
		this.reset();
	}

	reset(): void {
		this.iteration = 0;
		this.state = AgentState.RESEARCHING;
		this.clarifications_used = 0;
		this.searches_used = 0;
		this.executionLog = [];
		this.sources = new Map();
		this.searches = [];
	}

	logToolCall(toolName: string, args: Record<string, unknown>): void {
		this.executionLog.push({
			iteration: this.iteration,
			timestamp: new Date().toISOString(),
			type: 'tool_call',
			tool: toolName,
			arguments: args,
		});
	}

	logToolResult(toolName: string, result: unknown): void {
		this.executionLog.push({
			iteration: this.iteration,
			timestamp: new Date().toISOString(),
			type: 'tool_result',
			tool: toolName,
			result,
		});
	}

	incrementSearches(): void {
		this.searches_used += 1;
	}

	incrementClarifications(): void {
		this.clarifications_used += 1;
	}

	complete(): void {
		this.state = AgentState.COMPLETED;
	}

	fail(): void {
		this.state = AgentState.FAILED;
	}

	maxIterationsReached(): void {
		this.state = AgentState.MAX_ITERATIONS_REACHED;
	}

	isFinished(): boolean {
		return (
			this.state === AgentState.COMPLETED ||
			this.state === AgentState.FAILED ||
			this.state === AgentState.MAX_ITERATIONS_REACHED
		);
	}

	/**
	 * Add a source to the context
	 */
	addSource(url: string, sourceData: SourceData): void {
		this.sources.set(url, sourceData);
	}

	/**
	 * Add a search result to the context
	 */
	addSearch(searchResult: SearchResult): void {
		this.searches.push(searchResult);
	}

	/**
	 * Get sources as formatted string for report
	 */
	getSourcesAsString(): string {
		const sourcesArray = Array.from(this.sources.values());
		if (sourcesArray.length === 0) {
			return '';
		}

		return sourcesArray
			.map((source) => `[${source.number}] ${source.title || 'Untitled'} - ${source.url}`)
			.join('\n');
	}
}
