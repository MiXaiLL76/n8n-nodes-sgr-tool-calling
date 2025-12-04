/**
 * Tool Calling Agent
 * Port of ToolCallingResearchAgent from sgr-agent-core Python project
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { BaseAgent } from './BaseAgent';
import type { Tool, ToolCall } from '../types';
import { AgentState } from '../types';
import {
	reasoningTool,
	finalAnswerTool,
	createReportTool,
	createReportToolWithContext,
	clarificationTool,
	generatePlanTool,
	adaptPlanTool,
} from '../tools';

interface ReasoningResult {
	reasoning: string;
	completed_steps: string[];
	remaining_steps: string[];
	status: string;
}

export class ToolCallingAgent extends BaseAgent {
	/**
	 * Main execution loop - Two phase approach:
	 * 1. Reasoning phase - force reasoning tool to get agent's plan
	 * 2. Action selection phase - let agent choose which tool to use
	 */
	async execute(): Promise<void> {
		this.logger.info('🚀 SGR Agent execution started');
		this.logger.info(`📋 Task: ${this.config.task.substring(0, 100)}...`);
		this.logger.info(
			`⚙️  Config: maxIterations=${this.config.maxIterations}, maxSearches=${this.config.maxSearches}, maxClarifications=${this.config.maxClarifications}`,
		);

		// Main agent loop
		while (!this.context.isFinished() && this.context.iteration < this.config.maxIterations) {
			this.context.iteration += 1;

			this.logger.info(`\n${'='.repeat(60)}`);
			this.logger.info(`🔄 Iteration ${this.context.iteration}/${this.config.maxIterations}`);
			this.logger.info(
				`📊 Stats: searches=${this.context.searches_used}/${this.config.maxSearches}, clarifications=${this.context.clarifications_used}/${this.config.maxClarifications}`,
			);
			this.logger.info(`${'='.repeat(60)}`);

			// Phase 1: Reasoning phase
			this.logger.info(`\n🧠 Phase 1: Reasoning`);
			const reasoning = await this.reasoningPhase();

			// Check if agent decided to complete
			if (this.isCompletionStatus(reasoning.status)) {
				this.logger.info(`✅ Agent decided to complete with status: ${reasoning.status}`);
				this.context.complete();
				break;
			}

			// Phase 2: Action selection phase
			this.logger.info(`\n🎯 Phase 2: Action Selection`);
			await this.actionSelectionPhase(reasoning);

			// Check if max iterations reached
			if (this.context.iteration >= this.config.maxIterations) {
				this.logger.warn(`⚠️  Max iterations (${this.config.maxIterations}) reached`);
				this.context.maxIterationsReached();
			}
		}

		this.logger.info(`\n${'='.repeat(60)}`);
		this.logger.info(`🏁 SGR Agent execution finished`);
		this.logger.info(`📈 Final state: ${this.context.state}`);
		this.logger.info(`🔢 Total iterations: ${this.context.iteration}`);
		this.logger.info(`${'='.repeat(60)}\n`);
	}

	/**
	 * Phase 1: Reasoning phase
	 * Forces the agent to use reasoning tool to think about the task
	 */
	private async reasoningPhase(): Promise<ReasoningResult> {
		// Prepare tools with reasoning tool highlighted
		const availableTools = this.prepareTools();
		this.logger.info(`   📦 Available tools: ${availableTools.length}`);

		const reasoningTool = availableTools.find((t) =>
			t.function?.name?.toLowerCase().includes('reasoning'),
		);

		// If we have a dedicated reasoning tool, force it
		let response;
		if (reasoningTool) {
			this.logger.info(`   🎯 Forcing reasoning tool: ${reasoningTool.function.name}`);
			response = await this.callAIModelWithToolChoice(availableTools, reasoningTool.function.name);
		} else {
			this.logger.info(`   🤖 Calling AI with all tools`);
			response = await this.callAIModel(availableTools);
		}

		// Debug log the response
		this.logger.debug(
			`   🔍 Response structure: ${JSON.stringify({ hasContent: !!response.content, toolCallsCount: response.tool_calls?.length || 0 })}`,
		);

		if (response.tool_calls && response.tool_calls.length > 0) {
			this.logger.debug(
				`   🔍 First tool call structure: ${JSON.stringify(response.tool_calls[0])}`,
			);
		}

		// Add assistant message to conversation
		this.addAssistantMessage(response.content || null, response.tool_calls);

		// Process the reasoning tool call
		if (response.tool_calls && response.tool_calls.length > 0) {
			const toolCall = response.tool_calls[0];

			// Normalize tool call structure - support both OpenAI format and n8n format
			let toolName: string;
			let toolArgs: Record<string, unknown>;

			if (toolCall.function) {
				// OpenAI format: {function: {name, arguments}, id}
				toolName = toolCall.function.name;
				try {
					toolArgs =
						typeof toolCall.function.arguments === 'string'
							? JSON.parse(toolCall.function.arguments)
							: toolCall.function.arguments;
				} catch {
					toolArgs = toolCall.function.arguments as Record<string, unknown>;
				}
			} else if (toolCall.name) {
				// n8n format: {name, args, type, id}
				toolName = toolCall.name;
				toolArgs = (toolCall.args || {}) as Record<string, unknown>;
			} else {
				this.logger.error('❌ Invalid tool call structure received from AI model');
				this.logger.error(`   Tool call object: ${JSON.stringify(toolCall)}`);
				throw new Error('Invalid tool call structure received from AI model');
			}

			this.logger.info(`   🔧 Tool called: ${toolName}`);

			// Log reasoning details
			if (toolArgs.current_situation) {
				this.logger.info(`   💭 Situation: ${toolArgs.current_situation.substring(0, 100)}...`);
			}
			if (toolArgs.remaining_steps && toolArgs.remaining_steps.length > 0) {
				this.logger.info(`   📝 Next steps: ${toolArgs.remaining_steps.join(', ')}`);
			}
			if (toolArgs.task_completed !== undefined) {
				this.logger.info(`   ✓ Task completed: ${toolArgs.task_completed}`);
			}

			// Log reasoning
			this.context.logToolCall(toolName, toolArgs);

			// Execute tool to get result
			const toolResult = await this.executeTool(toolName, toolArgs);

			// Add tool result to conversation
			this.addToolResult(toolCall.id, toolName, toolResult);

			// Log result
			this.context.logToolResult(toolName, toolResult);

			return toolArgs as ReasoningResult;
		}

		// Fallback if no reasoning provided
		this.logger.warn(`   ⚠️  No reasoning tool call, using fallback`);
		return {
			reasoning: 'Continue with task',
			completed_steps: [],
			remaining_steps: ['Continue working on the task'],
			status: 'RESEARCHING',
		};
	}

	/**
	 * Phase 2: Action selection phase
	 * Let the agent choose which tool to use based on the reasoning
	 */
	private async actionSelectionPhase(reasoning: ReasoningResult): Promise<void> {
		// Prepare available tools based on limits
		const availableTools = this.prepareTools();
		this.logger.info(`   📦 Available tools: ${availableTools.length}`);

		// Call AI Model with tool calling
		// Note: Using "auto" instead of "required" for better compatibility
		this.logger.info(`   🤖 Calling AI model for action selection...`);
		const response = await this.callAIModel(availableTools);

		// Handle case where LLM returned text instead of tool call
		// Similar to Python's _select_action_phase handling
		if (!response.tool_calls || response.tool_calls.length === 0) {
			this.logger.info(`   💬 LLM returned text response instead of tool call`);
			const finalContent = response.content || 'Task completed successfully';

			// Create a synthetic FinalAnswerTool call
			const syntheticToolCall = {
				id: `${this.context.iteration}-synthetic-final`,
				type: 'function' as const,
				function: {
					name: 'final_answer_tool',
					arguments: JSON.stringify({
						reasoning: 'Agent decided to complete the task',
						completed_steps: [finalContent],
						status: 'COMPLETED',
					}),
				},
			};

			this.addAssistantMessage(finalContent, [syntheticToolCall]);
			await this.processToolCalls([syntheticToolCall]);
			return;
		}

		// Add assistant message to conversation
		const messageContent =
			reasoning.remaining_steps && reasoning.remaining_steps.length > 0
				? reasoning.remaining_steps[0]
				: 'Completing task';
		this.addAssistantMessage(messageContent, response.tool_calls);

		// Process tool calls
		this.logger.info(`   🔧 Processing ${response.tool_calls.length} tool call(s)`);
		await this.processToolCalls(response.tool_calls);
	}

	/**
	 * Check if status indicates completion
	 */
	private isCompletionStatus(status: string | undefined): boolean {
		if (!status) return false;
		const completionStatuses = ['COMPLETED', 'FAILED', 'DONE', 'FINISHED'];
		return completionStatuses.includes(status.toUpperCase());
	}

	/**
	 * Call AI model with specific tool choice
	 */
	private async callAIModelWithToolChoice(
		tools: Tool[],
		toolName: string,
	): Promise<AIModelResponse> {
		try {
			const toolChoice = {
				type: 'function' as const,
				function: { name: toolName },
			};
			return await this.callAIModel(tools, toolChoice);
		} catch {
			// If forcing tool choice fails, fall back to regular call
			return await this.callAIModel(tools);
		}
	}

	/**
	 * Execute a tool - handle built-in tools, connected n8n tools and additional tools
	 */
	protected async executeTool(
		toolName: string,
		toolArgs: Record<string, unknown>,
	): Promise<string> {
		// Check if it's a built-in tool
		// Use contextual version of createReportTool for access to sources
		const contextualCreateReportTool = createReportToolWithContext(this.context, this.logger);

		const builtInToolsMap: Record<
			string,
			{ call: (args: Record<string, unknown>) => Promise<string> }
		> = {
			[reasoningTool.name]: reasoningTool,
			[finalAnswerTool.name]: finalAnswerTool,
			[createReportTool.name]: contextualCreateReportTool,
			[clarificationTool.name]: clarificationTool,
			[generatePlanTool.name]: generatePlanTool,
			[adaptPlanTool.name]: adaptPlanTool,
		};

		const builtInTool = builtInToolsMap[toolName];
		if (builtInTool) {
			try {
				const result = await builtInTool.call(toolArgs);
				return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
			} catch (error) {
				this.logger.error(
					`         ❌ Built-in tool execution failed: ${(error as Error).message}`,
				);
				return JSON.stringify({
					error: `Failed to execute ${toolName}: ${(error as Error).message}`,
				});
			}
		}

		// Check if it's a connected n8n tool
		const connectedTool = this.config.connectedTools?.find((t) => t.name === toolName);
		if (connectedTool) {
			this.logger.info(`\n         ${'═'.repeat(50)}`);
			this.logger.info(`         🔧 EXECUTING TOOL: ${toolName.toUpperCase()}`);
			this.logger.info(`         ${'═'.repeat(50)}`);
			this.logger.debug(`         📋 Tool arguments: ${JSON.stringify(toolArgs)}`);

			// Send UI notification about tool execution
			try {
				this.executeFunctions.sendMessageToUI(`🔧 Executing tool: ${toolName}`);
			} catch {
				// Ignore if sendMessageToUI is not available
			}

			try {
				const result = await connectedTool.call(toolArgs);

				this.logger.info(`         ✅ TOOL COMPLETED: ${toolName.toUpperCase()}`);
				this.logger.info(`         ${'═'.repeat(50)}\n`);

				// Increment searches counter if it's a search tool
				if (
					toolName.toLowerCase().includes('search') ||
					toolName.toLowerCase().includes('tavily')
				) {
					this.context.incrementSearches();
					this.logger.info(`         🔍 Search count incremented: ${this.context.searches_used}`);

					// Try to extract sources from search results (for Tavily Search Tool)
					const formattedResult = this.extractAndStoreSources(result, toolArgs);
					if (formattedResult) {
						// Return formatted text for AI model instead of full JSON
						return formattedResult;
					}
				}
				return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
			} catch (error) {
				this.logger.error(`         ❌ Tool execution failed: ${(error as Error).message}`);
				return JSON.stringify({
					error: `Failed to execute ${toolName}: ${(error as Error).message}`,
				});
			}
		}

		// Check if it's an additional custom tool
		const additionalTool = this.config.additionalTools?.find((t) => t.toolName === toolName);
		if (additionalTool) {
			this.logger.debug(`         🔹 Executing additional custom tool: ${toolName}`);
			// For additional tools, we just return the arguments as JSON
			// In real implementation, this would call an external API or function
			return JSON.stringify({
				tool: toolName,
				args: toolArgs,
				message: 'Additional tool executed (implement custom logic here)',
			});
		}

		this.logger.error(`         ❌ Tool not found: ${toolName}`);
		throw new Error(`Tool ${toolName} not found`);
	}

	/**
	 * Process tool calls from AI response
	 */
	private async processToolCalls(toolCalls: ToolCall[]): Promise<void> {
		for (let i = 0; i < toolCalls.length; i++) {
			const toolCall = toolCalls[i];

			// Normalize tool call structure - support both OpenAI format and n8n format
			let toolName: string;
			let toolArgs: Record<string, unknown>;
			let toolCallId: string;

			if (toolCall.function) {
				// OpenAI format: {function: {name, arguments}, id}
				if (!toolCall.function.name) {
					this.logger.warn(`   ⚠️  Tool call ${i + 1}: Missing function name, skipping`);
					continue;
				}
				toolName = toolCall.function.name;
				toolCallId = toolCall.id;
				try {
					toolArgs =
						typeof toolCall.function.arguments === 'string'
							? JSON.parse(toolCall.function.arguments)
							: toolCall.function.arguments;
				} catch {
					toolArgs = toolCall.function.arguments as Record<string, unknown>;
					this.logger.warn(`      ⚠️  Failed to parse arguments`);
				}
			} else if (toolCall.name) {
				// n8n format: {name, args, type, id}
				toolName = toolCall.name;
				toolArgs = (toolCall.args || {}) as Record<string, unknown>;
				toolCallId = toolCall.id;
			} else {
				this.logger.warn(`   ⚠️  Tool call ${i + 1}: Invalid structure, skipping`);
				continue;
			}

			this.logger.info(`\n   ${'━'.repeat(60)}`);
			this.logger.info(`   🔧 Tool call ${i + 1}/${toolCalls.length}: ${toolName}`);

			// Log key arguments
			if (toolArgs && typeof toolArgs === 'object') {
				const argKeys = Object.keys(toolArgs);
				if (argKeys.length > 0) {
					this.logger.info(`      📋 Arguments: ${argKeys.join(', ')}`);
				}
				this.logger.debug(`      📋 Full arguments JSON: ${JSON.stringify(toolArgs)}`);
			}

			// Log tool call
			this.context.logToolCall(toolName, toolArgs);

			// Execute tool
			this.logger.info(`      ⚙️  Executing...`);
			const startTime = Date.now();
			const toolResult = await this.executeTool(toolName, toolArgs);
			const duration = Date.now() - startTime;

			this.logger.info(`      ✓ Completed in ${duration}ms`);
			this.logger.info(`      📤 Result: ${toolResult.substring(0, 100)}...`);

			// Update context based on tool name patterns
			this.updateContextForTool(toolName);

			// Add tool result to conversation
			this.addToolResult(toolCallId, toolName, toolResult);

			// Log tool result
			this.context.logToolResult(toolName, toolResult);

			// Check if clarification tool was called - stop execution and wait for user response
			if (toolName.toLowerCase().includes('clarification')) {
				this.logger.info('\n⏸️  Research paused - waiting for clarification from user');
				this.context.state = AgentState.WAITING_FOR_CLARIFICATION;

				// Save conversation history to memory including clarification questions
				await this.saveClarificationToMemory();

				this.context.complete(); // Mark as complete to exit main loop
				return; // Exit processToolCalls immediately
			}
		}
	}

	/**
	 * Update context counters based on tool usage
	 */
	private updateContextForTool(toolName: string): void {
		const lowerName = toolName.toLowerCase();

		if (lowerName.includes('search')) {
			this.context.incrementSearches();
		} else if (lowerName.includes('clarification')) {
			this.context.incrementClarifications();
		} else if (lowerName.includes('final') || lowerName.includes('answer')) {
			this.context.complete();
		}
	}

	/**
	 * Prepare tools with filters based on current limits
	 * Mimics Python's _prepare_tools logic
	 */
	protected prepareTools(): Tool[] {
		const tools: Tool[] = [];
		const builtInTools = this.config.builtInTools || {};

		// Add built-in tools based on configuration
		const maxIterationsReached = this.context.iteration >= this.config.maxIterations;
		const searchLimitReached = this.context.searches_used >= this.config.maxSearches;
		const clarificationLimitReached =
			this.context.clarifications_used >= this.config.maxClarifications;

		// Check if custom final answer tool is connected
		// If custom final answer tool is connected, automatically disable built-in finalAnswer and clarification
		const allConnectedTools = this.config.connectedTools || [];
		const hasCustomFinalAnswerTool = allConnectedTools.some(
			(t) =>
				t.name.toLowerCase().includes('final_answer') ||
				t.name.toLowerCase().includes('finalanswer') ||
				t.name === 'custom_final_answer_tool',
		);

		if (hasCustomFinalAnswerTool) {
			this.logger.info(
				'🔧 Custom Final Answer Tool detected - automatically disabling built-in Final Answer and Clarification tools',
			);
		}

		// Reasoning tool - always available if enabled
		if (builtInTools.enableReasoning !== false) {
			tools.push({
				type: 'function' as const,
				function: {
					name: reasoningTool.name,
					description: reasoningTool.description,
					parameters: reasoningTool.schema,
				},
			});
		}

		// Final Answer tool - available if enabled and no custom final answer tool is connected
		if (builtInTools.enableFinalAnswer !== false && !hasCustomFinalAnswerTool) {
			tools.push({
				type: 'function' as const,
				function: {
					name: finalAnswerTool.name,
					description: finalAnswerTool.description,
					parameters: finalAnswerTool.schema,
				},
			});
		}

		// Create Report tool - always available if enabled
		if (builtInTools.enableCreateReport !== false) {
			tools.push({
				type: 'function' as const,
				function: {
					name: createReportTool.name,
					description: createReportTool.description,
					parameters: createReportTool.schema,
				},
			});
		}

		// If max iterations reached, only return completion tools
		if (maxIterationsReached) {
			// Add connected tools (like search)
			const connectedToolsFormatted: Tool[] = (this.config.connectedTools || []).map((t) => ({
				type: 'function' as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: t.schema || {
						type: 'object',
						properties: {},
					},
				},
			}));

			return [...tools, ...connectedToolsFormatted];
		}

		// Clarification tool - available if enabled, limit not reached, and no custom final answer tool
		if (
			builtInTools.enableClarification !== false &&
			!clarificationLimitReached &&
			!hasCustomFinalAnswerTool
		) {
			tools.push({
				type: 'function' as const,
				function: {
					name: clarificationTool.name,
					description: clarificationTool.description,
					parameters: clarificationTool.schema,
				},
			});
		}

		// Generate Plan tool - available if enabled
		if (builtInTools.enableGeneratePlan !== false) {
			tools.push({
				type: 'function' as const,
				function: {
					name: generatePlanTool.name,
					description: generatePlanTool.description,
					parameters: generatePlanTool.schema,
				},
			});
		}

		// Adapt Plan tool - available if enabled
		if (builtInTools.enableAdaptPlan !== false) {
			tools.push({
				type: 'function' as const,
				function: {
					name: adaptPlanTool.name,
					description: adaptPlanTool.description,
					parameters: adaptPlanTool.schema,
				},
			});
		}

		// Add connected n8n tools (like Tavily Search)
		let connectedTools = this.config.connectedTools || [];

		// Remove search tools if limit reached
		if (searchLimitReached) {
			connectedTools = connectedTools.filter(
				(t) => !t.name.toLowerCase().includes('search') && !t.name.toLowerCase().includes('tavily'),
			);
		}

		// Convert to OpenAI function format
		const connectedToolsFormatted: Tool[] = connectedTools.map((t) => {
			const toolDef = {
				type: 'function' as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: t.schema || {
						type: 'object',
						properties: {},
					},
				},
			};

			// Log tool definition for debugging
			this.logger.debug(`[prepareTools] Connected tool: ${t.name}`);
			this.logger.debug(`   Schema: ${JSON.stringify(toolDef.function.parameters, null, 2)}`);

			return toolDef;
		});

		// Add additional custom tools from config
		const additionalTools: Tool[] =
			this.config.additionalTools?.map((t) => ({
				type: 'function' as const,
				function: {
					name: t.toolName,
					description: t.description,
					parameters: t.schema,
				},
			})) || [];

		return [...tools, ...connectedToolsFormatted, ...additionalTools];
	}

	/**
	 * Extract sources from search tool results and store them in context
	 * Similar to Python's TavilySearchService behavior
	 * Returns formatted text for AI model, or undefined if no sources were extracted
	 */
	private extractAndStoreSources(
		result: string | object,
		toolArgs: Record<string, unknown>,
	): string | undefined {
		try {
			// Try to parse result as JSON
			const resultString = typeof result === 'string' ? result : JSON.stringify(result);
			const parsed = JSON.parse(resultString);

			// Check if result contains sources metadata (from our modified SgrTavilySearchTool)
			if (parsed.sources && Array.isArray(parsed.sources)) {
				const query = parsed.query || (toolArgs.query as string) || '';

				// Add sources to context
				let addedCount = 0;
				for (const source of parsed.sources) {
					if (source.url) {
						// Calculate next source number based on existing sources
						const nextNumber = this.context.sources.size + 1;
						const sourceData = {
							number: nextNumber,
							title: source.title || 'Untitled',
							url: source.url,
							snippet: source.snippet || '',
							full_content: source.full_content || '',
							char_count: source.char_count || 0,
						};

						this.context.addSource(source.url, sourceData);
						addedCount++;
					}
				}

				this.logger.info(
					`         📚 Added ${addedCount} sources to context (total: ${this.context.sources.size})`,
				);

				// Add search result to context
				if (query) {
					const searchResult = {
						query,
						answer: parsed.answer || '',
						citations: parsed.sources || [],
						timestamp: new Date().toISOString(),
					};
					this.context.addSearch(searchResult);
					this.logger.debug(`         📝 Recorded search: "${query}"`);
				}

				// Return formatted text for AI model (if available)
				if (parsed.formatted) {
					return parsed.formatted;
				}
			}
		} catch {
			// If parsing fails, it's probably not a JSON result - that's okay
			this.logger.debug(
				`         ℹ️  Could not extract sources from result (not JSON or no sources field)`,
			);
		}

		return undefined;
	}
}
