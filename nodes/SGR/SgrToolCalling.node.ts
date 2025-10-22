import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import { ToolCallingAgent } from './agents';
import type { AgentConfig, AdditionalToolConfig } from './agents/BaseAgent';
import {
	convertN8nToolsToInternal,
	createLoggedToolWrapper,
	type N8nAITool,
} from './core/toolConverter';
import {
	DEFAULT_SYSTEM_PROMPT,
	DEFAULT_INITIAL_USER_REQUEST,
	DEFAULT_CLARIFICATION_RESPONSE,
} from './prompts';
import {
	getCommandName,
	handleHelpCommand,
	handleToolsCommand,
	handleClearCommand,
} from './core/commands';

// Type definitions for n8n AI components
interface N8nAiLanguageModel {
	invoke: (messages: unknown[]) => Promise<unknown>;
	[key: string]: unknown;
}

interface N8nAiTool {
	name: string;
	description: string;
	schema?: unknown;
	call?: (args: unknown) => Promise<unknown>;
	[key: string]: unknown;
}

interface N8nAiMemory {
	getChatMessages?: () => Promise<unknown[]>;
	addMessage?: (message: unknown) => Promise<void>;
	clear?: () => Promise<void>;
	[key: string]: unknown;
}

interface BuiltInToolsConfig {
	enableReasoning?: boolean;
	enableFinalAnswer?: boolean;
	enableCreateReport?: boolean;
	enableClarification?: boolean;
	enableGeneratePlan?: boolean;
	enableAdaptPlan?: boolean;
}

interface PromptsConfig {
	systemPrompt?: string;
	initialUserRequest?: string;
	clarificationResponse?: string;
}

interface OptionsConfig {
	returnFullLog?: boolean;
	answerOnly?: boolean;
}

export class SgrToolCalling implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SGR Agent',
		name: 'sgrToolCalling',
		icon: 'file:SGR.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'AI Agent with Tool Calling',
		description: 'SGR Research Agent with OpenAI Tool Calling',
		usableAsTool: true,
		defaults: {
			name: 'SGR Agent',
		},
		inputs: [
			NodeConnectionTypes.Main,
			{
				displayName: 'Chat Model',
				maxConnections: 1,
				type: NodeConnectionTypes.AiLanguageModel,
				required: true,
			},
			{
				displayName: 'Tools',
				maxConnections: undefined,
				type: NodeConnectionTypes.AiTool,
				required: false,
			},
			{
				displayName: 'Memory',
				maxConnections: 1,
				type: NodeConnectionTypes.AiMemory,
				required: false,
			},
		],
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Built-in Tools',
				name: 'builtInTools',
				type: 'collection',
				placeholder: 'Configure Built-in Tools',
				default: {
					enableReasoning: true,
					enableFinalAnswer: true,
					enableCreateReport: true,
					enableClarification: true,
					enableGeneratePlan: true,
					enableAdaptPlan: true,
				},
				description: 'Enable or disable built-in SGR tools',
				options: [
					{
						displayName: 'Adapt Plan Tool',
						name: 'enableAdaptPlan',
						type: 'boolean',
						default: true,
						description: 'Whether to enable tool to adapt research plans based on findings',
					},
					{
						displayName: 'Clarification Tool',
						name: 'enableClarification',
						type: 'boolean',
						default: true,
						description: 'Whether to enable tool to ask clarifying questions',
					},
					{
						displayName: 'Create Report Tool',
						name: 'enableCreateReport',
						type: 'boolean',
						default: true,
						description: 'Whether to enable tool to create comprehensive reports with citations',
					},
					{
						displayName: 'Final Answer Tool',
						name: 'enableFinalAnswer',
						type: 'boolean',
						default: true,
						description: 'Whether to enable tool to finalize research and complete execution',
					},
					{
						displayName: 'Generate Plan Tool',
						name: 'enableGeneratePlan',
						type: 'boolean',
						default: true,
						description: 'Whether to enable tool to generate research plans',
					},
					{
						displayName: 'Reasoning Tool',
						name: 'enableReasoning',
						type: 'boolean',
						default: true,
						description: 'Whether to enable agent core reasoning tool for determining next steps',
					},
				],
			},
			{
				displayName: 'Max Iterations',
				name: 'maxIterations',
				type: 'number',
				default: 10,
				description: 'Maximum number of iterations before forcing completion',
			},
			{
				displayName: 'Max Searches',
				name: 'maxSearches',
				type: 'number',
				default: 4,
				description: 'Maximum number of web searches allowed',
			},
			{
				displayName: 'Max Clarifications',
				name: 'maxClarifications',
				type: 'number',
				default: 3,
				description: 'Maximum number of clarification requests',
			},
			{
				displayName: 'Prompts',
				name: 'prompts',
				type: 'collection',
				placeholder: 'Configure Prompts',
				default: {
					systemPrompt: DEFAULT_SYSTEM_PROMPT,
					initialUserRequest: DEFAULT_INITIAL_USER_REQUEST,
					clarificationResponse: DEFAULT_CLARIFICATION_RESPONSE,
				},
				description:
					'Configure system prompts and templates (defaults from nodes/SGR/prompts/index.ts)',
				options: [
					{
						displayName: 'System Prompt',
						name: 'systemPrompt',
						type: 'string',
						default: DEFAULT_SYSTEM_PROMPT,
						description:
							'Main system prompt for the agent. Default value from nodes/SGR/prompts/index.ts.',
						typeOptions: {
							rows: 10,
						},
					},
					{
						displayName: 'Initial User Request Template',
						name: 'initialUserRequest',
						type: 'string',
						default: DEFAULT_INITIAL_USER_REQUEST,
						description:
							'Template for initial user request from nodes/SGR/prompts/index.ts. Use {task} and {current_date} placeholders.',
						typeOptions: {
							rows: 5,
						},
					},
					{
						displayName: 'Clarification Response Template',
						name: 'clarificationResponse',
						type: 'string',
						default: DEFAULT_CLARIFICATION_RESPONSE,
						description:
							'Template for clarification responses from nodes/SGR/prompts/index.ts. Use {clarifications} and {current_date} placeholders.',
						typeOptions: {
							rows: 5,
						},
					},
				],
			},
			{
				displayName: 'Additional Tools',
				name: 'additionalTools',
				type: 'fixedCollection',
				placeholder: 'Add Tool',
				default: { tools: [] },
				description: 'Additional custom tools to use alongside system tools',
				typeOptions: {
					multipleValues: true,
				},
				options: [
					{
						displayName: 'Tools',
						name: 'tools',
						values: [
							{
								displayName: 'Tool Name',
								name: 'toolName',
								type: 'string',
								default: '',
								description: 'Name of the tool',
							},
							{
								displayName: 'Description',
								name: 'description',
								type: 'string',
								typeOptions: {
									rows: 3,
								},
								default: '',
								description: 'Description of what the tool does',
							},
							{
								displayName: 'Schema (JSON)',
								name: 'schema',
								type: 'json',
								default: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
								description: 'JSON Schema for tool parameters',
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Return Full Log',
						name: 'returnFullLog',
						type: 'boolean',
						default: false,
						description: 'Whether to return the full execution log',
					},
					{
						displayName: 'Answer Only',
						name: 'answerOnly',
						type: 'boolean',
						default: false,
						description:
							'Whether to return only the answer text without metadata (useful for chat responses)',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get AI Language Model from input
		const aiModel = (await this.getInputConnectionData(
			NodeConnectionTypes.AiLanguageModel,
			0,
		)) as N8nAiLanguageModel;

		if (!aiModel) {
			throw new NodeOperationError(
				this.getNode(),
				'AI Language Model must be connected to the "Chat Model" input',
			);
		}

		// Get connected AI Tools (like Tavily Search, MCP, LangChain tools, etc.)
		// Note: n8n automatically highlights tool nodes when they execute via call()
		const rawConnectedTools = (await this.getInputConnectionData(NodeConnectionTypes.AiTool, 0)) as
			| N8nAiTool[]
			| undefined;

		// Track session ID changes to clear memory when needed
		let lastSessionId: string | undefined;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			// Log session ID and input data for debugging
			const sessionId = items[itemIndex].json.sessionId as string | undefined;
			this.logger.info(`🔑 Session ID: ${sessionId || 'NOT PROVIDED'}`);
			this.logger.debug(`📦 Input keys: ${Object.keys(items[itemIndex].json).join(', ')}`);

			// Get connected Memory (optional) - PER ITEM to support different session IDs
			// Memory node uses sessionId from $json.sessionId which can be different for each item
			const memory = (await this.getInputConnectionData(
				NodeConnectionTypes.AiMemory,
				itemIndex,
			)) as N8nAiMemory | undefined;

			if (memory) {
				this.logger.debug(`💾 Memory connected for this item`);

				// Check if session ID changed - if yes, clear memory for fresh start
				if (lastSessionId && sessionId && lastSessionId !== sessionId) {
					this.logger.info(
						`🔄 Session ID changed: ${lastSessionId} → ${sessionId}, clearing memory`,
					);
					try {
						if (typeof memory.clear === 'function') {
							await memory.clear();
							this.logger.info('🗑️  Memory cleared for new session');
						}
					} catch (error) {
						this.logger.warn(`⚠️  Failed to clear memory: ${(error as Error).message}`);
					}
				}

				lastSessionId = sessionId;
			} else {
				this.logger.debug(`📭 No memory connected`);
			}

			try {
				// Get task from input item (from Chat Trigger or previous node)
				const task = String(
					items[itemIndex].json.chatInput ||
						items[itemIndex].json.input ||
						items[itemIndex].json.message ||
						items[itemIndex].json.text ||
						items[itemIndex].json.task ||
						'',
				);

				if (!task) {
					throw new NodeOperationError(
						this.getNode(),
						'No task found in input. Make sure the previous node provides chatInput, input, message, text, or task field.',
					);
				}

				// Get parameters early for command processing
				const builtInTools = this.getNodeParameter('builtInTools', itemIndex, {
					enableReasoning: true,
					enableFinalAnswer: true,
					enableCreateReport: true,
					enableClarification: true,
					enableGeneratePlan: true,
					enableAdaptPlan: true,
				}) as BuiltInToolsConfig;
				const maxIterations = this.getNodeParameter('maxIterations', itemIndex) as number;
				const maxSearches = this.getNodeParameter('maxSearches', itemIndex) as number;
				const maxClarifications = this.getNodeParameter('maxClarifications', itemIndex) as number;
				const prompts = this.getNodeParameter('prompts', itemIndex, {
					systemPrompt: DEFAULT_SYSTEM_PROMPT,
					initialUserRequest: DEFAULT_INITIAL_USER_REQUEST,
					clarificationResponse: DEFAULT_CLARIFICATION_RESPONSE,
				}) as PromptsConfig;
				const additionalTools = this.getNodeParameter('additionalTools', itemIndex, {
					tools: [],
				}) as { tools: unknown[] };
				const options = this.getNodeParameter('options', itemIndex, {}) as OptionsConfig;

				// Convert connected tools to internal format
				const connectedTools = rawConnectedTools
					? convertN8nToolsToInternal(rawConnectedTools as unknown as N8nAITool[]).map((tool) =>
							createLoggedToolWrapper(tool, this),
						)
					: [];

				this.logger.info(
					`🔧 Converted ${connectedTools.length} external tools: ${connectedTools.map((t) => t.name).join(', ')}`,
				);

				// Create agent configuration for commands
				const config: AgentConfig = {
					task,
					systemPrompt: prompts.systemPrompt || undefined,
					initialUserRequest: prompts.initialUserRequest || undefined,
					clarificationResponse: prompts.clarificationResponse || undefined,
					maxIterations,
					maxSearches,
					maxClarifications,
					builtInTools,
					additionalTools: (additionalTools.tools as AdditionalToolConfig[]) || [],
					connectedTools,
					memory: memory || undefined,
				};

				// Check for special commands
				const commandName = getCommandName(task);

				// Handle /help command
				if (commandName === 'help') {
					return handleHelpCommand(itemIndex, options.answerOnly || false);
				}

				// Handle /tools command
				if (commandName === 'tools') {
					return handleToolsCommand(this, config, aiModel, itemIndex, options.answerOnly || false);
				}

				// Handle /clear or /new command
				if (commandName === 'clear') {
					return await handleClearCommand(
						memory,
						this.logger,
						itemIndex,
						options.answerOnly || false,
					);
				}

				// Handle clearMemory via JSON input (for compatibility)
				const shouldClearMemory =
					items[itemIndex].json.clearMemory === true || items[itemIndex].json.action === 'clear';

				if (shouldClearMemory && memory) {
					try {
						if (typeof memory.clear === 'function') {
							await memory.clear();
							this.logger.info('🗑️  Memory cleared for new session');
						}
					} catch (error) {
						this.logger.warn(`⚠️  Failed to clear memory: ${(error as Error).message}`);
					}
				}

				// Create agent
				const agent = new ToolCallingAgent(this, config, aiModel);

				// Initialize agent (load memory if available)
				await agent.initialize();

				// Execute agent
				await agent.execute();

				// Save conversation to memory for next run
				await agent.saveToMemory();

				// Get agent output
				const output = agent.getOutput() as IDataObject;

				// Filter output based on options
				if (!options.returnFullLog) {
					delete output.log;
					delete output.conversation;
				}

				// Return only answer text if answerOnly option is enabled
				if (options.answerOnly || false) {
					returnData.push({
						json: {
							message: output.answer || output.final_message || '',
						},
						pairedItem: itemIndex,
					});
				} else {
					returnData.push({
						json: output,
						pairedItem: itemIndex,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: itemIndex,
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
