/**
 * Agent execution context
 * Similar to ResearchContext from Python version
 */

import { AgentState, type ExecutionLogEntry } from '../types';

export class AgentContext {
	iteration: number = 0;
	state: AgentState = AgentState.RESEARCHING;
	clarifications_used: number = 0;
	searches_used: number = 0;
	executionLog: ExecutionLogEntry[] = [];

	constructor() {
		this.reset();
	}

	reset(): void {
		this.iteration = 0;
		this.state = AgentState.RESEARCHING;
		this.clarifications_used = 0;
		this.searches_used = 0;
		this.executionLog = [];
	}

	logToolCall(toolName: string, args: any): void {
		this.executionLog.push({
			iteration: this.iteration,
			timestamp: new Date().toISOString(),
			type: 'tool_call',
			tool: toolName,
			arguments: args,
		});
	}

	logToolResult(toolName: string, result: any): void {
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
}
