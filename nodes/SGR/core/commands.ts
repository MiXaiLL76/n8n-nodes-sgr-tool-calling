/**
 * Special Commands Handler for SGR Agent
 * Handles /help, /tools, /clear, /new commands
 */

import type { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import type { AgentConfig } from '../agents/BaseAgent';
import { ToolCallingAgent } from '../agents';

export const HELP_MESSAGE = `**SGR Deep Research Agent - Help**

**Special Commands:**
- **/help** - Show this help message
- **/tools** - List all available tools and configuration
- **/clear** or **/new** - Clear chat history and start fresh

**How to use:**
1. Ask any research question
2. Agent will use tools to find information
3. You'll get a detailed answer with sources

**Examples:**
- "Who are dinosaurs?"
- "Create a detailed report on AI development in 2024"
- "Explain how quantum computers work"

**Features:**
- Multi-step reasoning
- Web search integration
- Automatic planning for complex tasks
- Memory across conversation
- Source citations in reports

Type **/tools** to see what tools are available.`;

export const CLEAR_MESSAGE = `Chat history has been cleared. Starting fresh!

Type **/tools** to see available tools.`;

/**
 * Handle /help command
 */
export function handleHelpCommand(itemIndex: number, answerOnly: boolean): INodeExecutionData[][] {
	return [
		[
			{
				json: (answerOnly
					? { message: HELP_MESSAGE }
					: {
							task: 'Show help',
							state: 'INFO',
							answer: HELP_MESSAGE,
						}) as IDataObject,
				pairedItem: { item: itemIndex },
			},
		],
	];
}

/**
 * Handle /tools command
 */
export function handleToolsCommand(
	executeFunctions: IExecuteFunctions,
	config: AgentConfig,
	aiModel: { invoke: (messages: unknown[]) => Promise<unknown>; [key: string]: unknown },
	itemIndex: number,
	answerOnly: boolean,
): INodeExecutionData[][] {
	// Get all tools that would be available
	const tempAgent = new ToolCallingAgent(executeFunctions, config, aiModel);
	const availableTools = tempAgent['prepareTools'](); // Access protected method

	// Categorize tools
	const builtInTools = availableTools
		.filter(
			(t) =>
				t.function.name.includes('_tool') &&
				!t.function.name.includes('tavily') &&
				!t.function.name.includes('mcp'),
		)
		.map((t) => ({
			name: t.function.name,
			description: t.function.description,
			type: 'built-in',
			schema: t.function.parameters,
		}));

	const externalTools = availableTools
		.filter(
			(t) =>
				!t.function.name.includes('_tool') ||
				t.function.name.includes('tavily') ||
				t.function.name.includes('mcp'),
		)
		.map((t) => ({
			name: t.function.name,
			description: t.function.description,
			type: t.function.name.includes('tavily') ? 'search' : 'external',
			schema: t.function.parameters,
		}));

	const allTools = [...builtInTools, ...externalTools];

	const toolsOutput = answerOnly
		? {
				message: `Available ${allTools.length} tools (${builtInTools.length} built-in, ${externalTools.length} external). Use /help for more info.`,
			}
		: {
				task: 'Show available tools',
				state: 'INFO',
				total_tools: allTools.length,
				built_in_tools_count: builtInTools.length,
				external_tools_count: externalTools.length,
				configuration: {
					max_iterations: config.maxIterations,
					max_searches: config.maxSearches,
					max_clarifications: config.maxClarifications,
				},
				tools: allTools,
				answer: `Available ${allTools.length} tools (${builtInTools.length} built-in, ${externalTools.length} external). Use /help for more info.`,
			};

	return [
		[
			{
				json: toolsOutput as IDataObject,
				pairedItem: { item: itemIndex },
			},
		],
	];
}

/**
 * Handle /clear or /new command
 */
export async function handleClearCommand(
	memory: { clear?: () => Promise<void>; [key: string]: unknown } | undefined,
	logger: { info: (msg: string) => void; warn: (msg: string) => void },
	itemIndex: number,
	answerOnly: boolean,
): Promise<INodeExecutionData[][]> {
	try {
		if (memory && typeof memory.clear === 'function') {
			await memory.clear();
			logger.info('🗑️  Memory cleared for new session');
		}
	} catch (error) {
		logger.warn(`⚠️  Failed to clear memory: ${(error as Error).message}`);
	}

	return [
		[
			{
				json: answerOnly
					? { message: CLEAR_MESSAGE }
					: {
							task: 'Memory cleared',
							state: 'CLEARED',
							answer: CLEAR_MESSAGE,
						},
				pairedItem: { item: itemIndex },
			},
		],
	];
}

/**
 * Check if task is a special command and return command name
 */
export function getCommandName(task: string): string | null {
	const lowerTask = task.toLowerCase().trim();

	if (lowerTask === '/help') return 'help';
	if (lowerTask === '/tools') return 'tools';
	if (lowerTask === '/clear' || lowerTask === '/new') return 'clear';

	return null;
}
