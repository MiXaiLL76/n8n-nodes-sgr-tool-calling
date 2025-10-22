/**
 * Base Agent class
 * Port of BaseAgent from sgr-deep-research Python project
 */

import { NodeOperationError, type IExecuteFunctions } from 'n8n-workflow';
import { AgentContext } from '../core/context';
import type { Message, Tool, AIModelResponse } from '../types';
import {
	DEFAULT_SYSTEM_PROMPT,
	DEFAULT_INITIAL_USER_REQUEST,
	formatPrompt,
	getCurrentDate,
} from '../prompts';

export interface AdditionalToolConfig {
	toolName: string;
	description: string;
	schema: any;
}

export interface ConnectedN8nTool {
	name: string;
	description: string;
	schema?: any;
	call: (args: any) => Promise<any>;
}

export interface BuiltInToolsConfig {
	enableReasoning?: boolean;
	enableFinalAnswer?: boolean;
	enableCreateReport?: boolean;
	enableClarification?: boolean;
	enableGeneratePlan?: boolean;
	enableAdaptPlan?: boolean;
}

export interface AgentConfig {
	task: string;
	systemPrompt?: string;
	initialUserRequest?: string;
	clarificationResponse?: string;
	maxIterations: number;
	maxSearches: number;
	maxClarifications: number;
	builtInTools?: BuiltInToolsConfig;
	additionalTools?: AdditionalToolConfig[];
	connectedTools?: ConnectedN8nTool[];
	memory?: any; // n8n Memory instance for conversation caching
}

export abstract class BaseAgent {
	protected executeFunctions: IExecuteFunctions;
	protected context: AgentContext;
	protected config: AgentConfig;
	protected conversation: Message[];
	protected aiModel: any;
	protected memory?: any;
	private loadedMessagesCount: number = 0; // Track how many messages were loaded from memory

	constructor(executeFunctions: IExecuteFunctions, config: AgentConfig, aiModel: any) {
		this.executeFunctions = executeFunctions;
		this.config = config;
		this.context = new AgentContext();
		this.conversation = [];
		this.aiModel = aiModel;
		this.memory = config.memory;
	}

	/**
	 * Initialize agent - load memory if available
	 * Must be called before execute()
	 */
	async initialize(): Promise<void> {
		let previousMessages: Message[] = [];

		// Load previous conversation from memory if available
		if (this.memory) {
			try {
				// LangChain BufferWindowMemory interface: loadMemoryVariables returns messages
				if (typeof this.memory.loadMemoryVariables === 'function') {
					const memoryVars = await this.memory.loadMemoryVariables({});
					const chatHistory = memoryVars.chat_history || memoryVars.history || [];

					if (Array.isArray(chatHistory) && chatHistory.length > 0) {
						previousMessages = chatHistory.map((msg: any) => {
							// Handle different message formats
							const msgType =
								typeof msg._getType === 'function' ? msg._getType() : msg.type || msg.role;
							return {
								role: msgType === 'human' || msgType === 'user' ? 'user' : 'assistant',
								content: msg.content || msg.text || '',
							};
						});
						this.loadedMessagesCount = previousMessages.length;
						this.executeFunctions.logger.info(
							`📥 Loaded ${previousMessages.length} messages from memory`,
						);
					}
				} else if (typeof this.memory.getChatMessages === 'function') {
					// Alternative interface (some memory types)
					const chatHistory = await this.memory.getChatMessages();
					if (chatHistory && chatHistory.length > 0) {
						previousMessages = chatHistory.map((msg: any) => ({
							role:
								msg._getType() === 'human'
									? 'user'
									: msg._getType() === 'ai'
										? 'assistant'
										: msg._getType(),
							content: msg.content,
						}));
						this.loadedMessagesCount = previousMessages.length;
						this.executeFunctions.logger.info(
							`📥 Loaded ${previousMessages.length} messages from memory`,
						);
					}
				} else {
					// Memory doesn't have expected methods, skip loading
					this.executeFunctions.logger.debug(
						'Memory node connected but does not support expected interface',
					);
				}
			} catch (error) {
				this.executeFunctions.logger.warn(`⚠️  Failed to load memory: ${(error as Error).message}`);
			}
		}

		// Always initialize with system prompt and current task
		this.initializeConversation();

		// Add previous messages after system prompt but before current task
		if (previousMessages.length > 0) {
			// Insert previous messages between system prompt and current user request
			// Structure: [system, ...previous, current_user_request]
			const systemPrompt = this.conversation[0]; // system
			const currentUserRequest = this.conversation[1]; // current task
			this.conversation = [systemPrompt, ...previousMessages, currentUserRequest];
			this.executeFunctions.logger.debug(
				`📋 Conversation structure: system + ${previousMessages.length} previous + current request`,
			);
		}
	}

	/**
	 * Initialize conversation with system prompt and task
	 */
	protected initializeConversation(): void {
		const systemPrompt = this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
		const initialUserRequest = this.config.initialUserRequest || DEFAULT_INITIAL_USER_REQUEST;

		// Prepare tools list for system prompt (similar to Python's PromptLoader.get_system_prompt)
		const tools = this.prepareTools();
		const availableToolsStr = tools
			.map((tool, index) => `${index + 1}. ${tool.function.name}: ${tool.function.description}`)
			.join('\n');

		// Format system prompt
		const formattedSystemPrompt = formatPrompt(systemPrompt, {
			available_tools: availableToolsStr,
		});

		// Format initial user request
		const formattedUserRequest = formatPrompt(initialUserRequest, {
			current_date: getCurrentDate(),
			task: this.config.task,
		});

		this.conversation = [
			{
				role: 'system',
				content: formattedSystemPrompt,
			},
			{
				role: 'user',
				content: formattedUserRequest,
			},
		];
	}

	/**
	 * Main execution loop - to be implemented by subclasses
	 */
	abstract execute(itemIndex: number): Promise<void>;

	/**
	 * Prepare tools for the current iteration
	 * Should filter based on limits and agent state
	 */
	protected abstract prepareTools(): Tool[];

	/**
	 * Call AI model with current conversation and tools
	 */
	protected async callAIModel(
		tools: Tool[],
		toolChoice?: { type: 'function'; function: { name: string } },
	): Promise<AIModelResponse> {
		try {
			// Prepare the options for n8n AI model
			const options: any = {};

			if (tools.length > 0) {
				options.tools = tools;
				if (toolChoice) {
					options.tool_choice = toolChoice;
				} else {
					options.tool_choice = 'auto';
				}
			}

			// Log what we're sending
			this.executeFunctions.logger.debug(
				`Calling AI model with ${this.conversation.length} messages, ${tools.length} tools`,
			);

			// Normalize messages to OpenAI format for the AI model
			const normalizedMessages = this.conversation.map((msg) => {
				const normalized: any = {
					role: msg.role,
				};

				// Add content - use empty string if null for assistant messages with tool_calls
				if (msg.content !== null && msg.content !== undefined) {
					normalized.content = msg.content;
				} else if (msg.role === 'tool') {
					// Tool messages must have content
					normalized.content = msg.content || '';
				} else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
					// Assistant messages with tool_calls can have null content, but some models prefer empty string
					normalized.content = '';
				} else {
					// For other cases, use empty string
					normalized.content = msg.content || '';
				}

				// Add tool_calls only if they exist and are properly formatted
				if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
					// Normalize tool calls to OpenAI format
					normalized.tool_calls = msg.tool_calls.map((tc) => {
						// If already in OpenAI format
						if (tc.function) {
							return tc;
						}
						// If in n8n format, convert to OpenAI format
						if (tc.name) {
							return {
								id: tc.id,
								type: 'function',
								function: {
									name: tc.name,
									arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args),
								},
							};
						}
						return tc;
					});
				}

				// Add tool result fields if present
				if (msg.tool_call_id) {
					normalized.tool_call_id = msg.tool_call_id;
				}
				if (msg.name) {
					normalized.name = msg.name;
				}

				return normalized;
			});

			// Call the AI model using n8n's invoke method
			const response = await this.aiModel.invoke(normalizedMessages, options);

			// Validate response structure
			if (!response) {
				throw new Error('Empty response from AI model');
			}

			// Extract tool calls - they might be in different formats depending on the model
			let toolCalls = [];
			if (response.tool_calls && Array.isArray(response.tool_calls)) {
				toolCalls = response.tool_calls;
			} else if (response.additional_kwargs?.tool_calls) {
				toolCalls = response.additional_kwargs.tool_calls;
			} else if (response.message?.tool_calls) {
				toolCalls = response.message.tool_calls;
			}

			// Log response structure for debugging
			this.executeFunctions.logger.debug(
				`AI Response: content=${!!response.content}, tool_calls=${toolCalls.length}, response_keys=${Object.keys(response || {}).join(',')}`,
			);

			return {
				content: response.content || response.text || null,
				tool_calls: toolCalls,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : '';

			this.executeFunctions.logger.error(`AI Model error: ${errorMessage}`);
			if (errorStack) {
				this.executeFunctions.logger.debug(`Error stack: ${errorStack}`);
			}

			throw new NodeOperationError(
				this.executeFunctions.getNode(),
				`AI Model error: ${errorMessage}`,
			);
		}
	}

	/**
	 * Execute a tool by name
	 * Can be overridden by subclasses to handle system tools
	 */
	protected abstract executeTool(toolName: string, toolArgs: any): Promise<any>;

	/**
	 * Add assistant message to conversation
	 */
	protected addAssistantMessage(content: string | null, toolCalls?: any[]): void {
		const message: any = {
			role: 'assistant',
			content,
		};

		// Only add tool_calls if they exist and are not empty
		if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
			message.tool_calls = toolCalls;
		}

		this.conversation.push(message);
	}

	/**
	 * Add tool result to conversation
	 */
	protected addToolResult(toolCallId: string, toolName: string, result: any): void {
		this.conversation.push({
			role: 'tool',
			content: typeof result === 'string' ? result : JSON.stringify(result),
			tool_call_id: toolCallId,
			name: toolName,
		});
	}

	/**
	 * Get final output
	 */
	public getOutput(): any {
		const lastMessage = this.conversation[this.conversation.length - 1];
		let finalContent = '';
		let answer = '';

		// Try to extract answer from the last tool result
		if (lastMessage.role === 'tool') {
			const toolResult = lastMessage.content;
			// Try to parse JSON from tool result
			try {
				const parsed = JSON.parse(toolResult || '{}');
				// Check for answer in create_report_tool or final_answer_tool
				if (parsed.content) {
					answer = parsed.content;
				} else if (parsed.answer) {
					answer = parsed.answer;
				}
			} catch (e) {
				// If not JSON, use as is
				answer = toolResult || '';
			}

			finalContent =
				this.conversation
					.slice()
					.reverse()
					.find((m) => m.role === 'assistant')?.content || '';
		} else {
			finalContent = lastMessage.content || '';
		}

		// Extract tool usage summary from execution log
		const toolCalls = this.context.executionLog.filter((entry) => entry.type === 'tool_call');
		const toolsSummary = toolCalls.map((entry) => ({
			iteration: entry.iteration,
			tool: entry.tool,
			timestamp: entry.timestamp,
		}));

		return {
			task: this.config.task,
			state: this.context.state,
			iterations: this.context.iteration,
			final_message: finalContent,
			answer: answer || finalContent, // The actual answer/report
			tools_used: toolsSummary, // Summary of all tools used
			log: this.context.executionLog,
			conversation: this.conversation,
		};
	}

	/**
	 * Save conversation to memory
	 * Only saves NEW messages that were added after loading from memory
	 */
	async saveToMemory(): Promise<void> {
		if (!this.memory) return;

		try {
			// Get only NEW messages (skip those loaded from memory)
			const allMessages = this.conversation.filter(
				(msg) => msg.role === 'user' || msg.role === 'assistant',
			);
			const newMessages = allMessages.slice(this.loadedMessagesCount);

			if (newMessages.length === 0) {
				this.executeFunctions.logger.debug(`📭 No new messages to save to memory`);
				return;
			}

			// Get the clean user question from config.task (original user input)
			// Don't use the formatted message which includes system prompts and dates
			const userQuestionText = this.config.task;
			if (!userQuestionText) {
				this.executeFunctions.logger.debug(`📭 No user question found to save`);
				return;
			}

			// Extract final answer using same logic as getOutput()
			// Look for answer in the last tool result (final_answer_tool or create_report_tool)
			let finalAnswer = '';
			const lastMessage = this.conversation[this.conversation.length - 1];

			if (lastMessage.role === 'tool') {
				const toolResult = lastMessage.content;
				try {
					const parsed = JSON.parse(toolResult || '{}');
					// Check for answer in create_report_tool or final_answer_tool
					if (parsed.content) {
						finalAnswer = parsed.content;
					} else if (parsed.answer) {
						finalAnswer = parsed.answer;
					}
				} catch (e) {
					// If not JSON, try to find last assistant message
					finalAnswer = toolResult || '';
				}
			}

			// If no answer from tool, try to get from assistant messages
			if (!finalAnswer) {
				for (let i = this.conversation.length - 1; i >= 0; i--) {
					if (this.conversation[i].role === 'assistant' && this.conversation[i].content) {
						finalAnswer = this.conversation[i].content!;
						break;
					}
				}
			}

			// If no final answer yet, don't save (agent still working)
			if (!finalAnswer) {
				this.executeFunctions.logger.debug(
					`📭 No final answer yet, skipping memory save (agent still working)`,
				);
				return;
			}

			// LangChain BufferWindowMemory interface: saveContext(input, output)
			if (typeof this.memory.saveContext === 'function') {
				// Save only the clean user question and final answer
				await this.memory.saveContext({ input: userQuestionText }, { output: finalAnswer });
			} else if (
				this.memory.chatHistory &&
				typeof this.memory.chatHistory.addMessage === 'function'
			) {
				// Alternative interface with chatHistory.addMessage
				// Save only clean user question and final answer
				await this.memory.chatHistory.addMessage({
					content: userQuestionText,
					role: 'human',
				});
				await this.memory.chatHistory.addMessage({ content: finalAnswer, role: 'ai' });
			} else {
				this.executeFunctions.logger.debug('Memory node does not support expected save interface');
				return;
			}

			this.executeFunctions.logger.info(
				`💾 Saved conversation to memory: question + final answer (${this.loadedMessagesCount} previous messages cached)`,
			);
		} catch (error) {
			this.executeFunctions.logger.warn(
				`⚠️  Failed to save to memory: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Get conversation history
	 */
	public getConversation(): Message[] {
		return this.conversation;
	}

	/**
	 * Get agent context
	 */
	public getContext(): AgentContext {
		return this.context;
	}
}
