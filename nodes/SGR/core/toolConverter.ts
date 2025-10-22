/**
 * Universal Tool Converter for n8n AI Tools (LangChain, MCP, etc.)
 * Converts any n8n AI Tool to our internal tool format
 */

import type { IExecuteFunctions } from 'n8n-workflow';

export interface N8nAITool {
	name: string;
	description: string;
	schema?: any;
	call?: (args: any) => Promise<any>;
	// LangChain DynamicTool interface
	func?: (input: string) => Promise<string>;
	// Additional metadata
	[key: string]: any;
}

export interface ConvertedTool {
	name: string;
	description: string;
	schema: any;
	call: (args: any) => Promise<any>;
}

/**
 * Normalize tool name to lowercase with underscores
 * Example: "MCP Client Tool" -> "mcp_client_tool"
 */
function normalizeToolName(name: string): string {
	if (!name) return 'unknown_tool';

	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_') // Replace non-alphanumeric with underscore
		.replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
		.replace(/_+/g, '_'); // Replace multiple underscores with single
}

/**
 * Clean up schema by removing library-specific metadata fields
 * Removes Zod internal fields: _def, _cached, ~standard, etc.
 */
function cleanSchemaMetadata(schema: any): any {
	if (!schema || typeof schema !== 'object') {
		return schema;
	}

	// List of metadata keys to remove (Zod, other libraries)
	const metadataKeys = ['_def', '_cached', '~standard', '_type', '_output', '_input'];

	// Create clean copy without metadata
	const cleaned: any = {};
	for (const key in schema) {
		if (!metadataKeys.includes(key) && !key.startsWith('_') && !key.startsWith('~')) {
			cleaned[key] = schema[key];
		}
	}

	// Recursively clean nested objects
	if (cleaned.properties && typeof cleaned.properties === 'object') {
		const cleanedProps: any = {};
		for (const prop in cleaned.properties) {
			cleanedProps[prop] = cleanSchemaMetadata(cleaned.properties[prop]);
		}
		cleaned.properties = cleanedProps;
	}

	// Clean items in arrays
	if (cleaned.items) {
		cleaned.items = cleanSchemaMetadata(cleaned.items);
	}

	return cleaned;
}

/**
 * Validate and fix JSON Schema for OpenAI function calling
 * OpenAI requires schema to be 'type: object'
 * For Structured Outputs, adds strict mode and additionalProperties: false
 */
function validateAndFixSchema(schema: any, enableStrictMode: boolean = false): any {
	// First, clean metadata fields
	let cleanedSchema = cleanSchemaMetadata(schema);

	if (!cleanedSchema || Object.keys(cleanedSchema).length === 0) {
		return {
			type: 'object',
			properties: {},
			additionalProperties: enableStrictMode ? false : undefined,
		};
	}

	// If schema is not an object or doesn't have type, fix it
	if (typeof cleanedSchema !== 'object') {
		return {
			type: 'object',
			properties: {},
			additionalProperties: enableStrictMode ? false : undefined,
		};
	}

	// Fix invalid type values
	if (
		cleanedSchema.type === 'None' ||
		cleanedSchema.type === null ||
		cleanedSchema.type === undefined
	) {
		cleanedSchema.type = 'object';
	}

	// Ensure it's type: object (OpenAI requirement)
	if (cleanedSchema.type !== 'object') {
		return {
			type: 'object',
			properties: {
				input: cleanedSchema,
			},
			additionalProperties: enableStrictMode ? false : undefined,
		};
	}

	// Ensure properties exist
	if (!cleanedSchema.properties) {
		cleanedSchema.properties = {};
	}

	// Add additionalProperties: false for strict mode (OpenAI Structured Outputs)
	if (enableStrictMode && cleanedSchema.additionalProperties === undefined) {
		cleanedSchema.additionalProperties = false;
	}

	return cleanedSchema;
}

/**
 * Convert n8n AI Tool to our internal format
 */
export function convertN8nToolToInternal(tool: N8nAITool): ConvertedTool {
	// Case 1: Tool already in our format (has name, description, schema, call)
	if (tool.name && tool.description && tool.schema && tool.call) {
		return {
			name: normalizeToolName(tool.name),
			description: tool.description,
			schema: validateAndFixSchema(tool.schema),
			call: tool.call,
		};
	}

	// Case 2: LangChain DynamicTool format (has func instead of call)
	if (tool.func && typeof tool.func === 'function') {
		return {
			name: normalizeToolName(tool.name),
			description: tool.description || 'No description provided',
			schema: validateAndFixSchema(
				tool.schema || {
					type: 'object',
					properties: {
						input: {
							type: 'string',
							description: 'Tool input',
						},
					},
					required: ['input'],
				},
			),
			call: async (args: any) => {
				// LangChain tools expect string input
				const input = typeof args === 'string' ? args : args.input || JSON.stringify(args);
				return await tool.func!(input);
			},
		};
	}

	// Case 3: MCP Toolkit format (from McpClientTool)
	// McpToolkit wraps multiple tools, need to extract individual tools
	if ((tool as any).getTools && typeof (tool as any).getTools === 'function') {
		// This is a toolkit, not a single tool
		// Will be handled by the caller
		throw new Error('Toolkit detected, should be unwrapped before conversion');
	}

	// Case 4: Generic tool with invoke method
	if ((tool as any).invoke && typeof (tool as any).invoke === 'function') {
		return {
			name: normalizeToolName(tool.name || 'unknown_tool'),
			description: tool.description || 'No description provided',
			schema: validateAndFixSchema(
				tool.schema || {
					type: 'object',
					properties: {
						input: {
							type: 'string',
							description: 'Tool input',
						},
					},
					required: ['input'],
				},
			),
			call: async (args: any) => {
				return await (tool as any).invoke(args);
			},
		};
	}

	// Fallback: wrap the tool as-is
	return {
		name: normalizeToolName(tool.name || 'unknown_tool'),
		description: tool.description || 'No description provided',
		schema: validateAndFixSchema(
			tool.schema || {
				type: 'object',
				properties: {},
			},
		),
		call: async (args: any) => {
			// Try to call the tool if it has a call method
			if (tool.call) {
				return await tool.call(args);
			}
			// Otherwise return error
			throw new Error(`Tool ${tool.name} does not have a callable method`);
		},
	};
}

/**
 * Convert array of n8n AI Tools to internal format
 * Handles toolkits that contain multiple tools
 */
export function convertN8nToolsToInternal(tools: N8nAITool[]): ConvertedTool[] {
	const convertedTools: ConvertedTool[] = [];

	for (const tool of tools) {
		// Check if it's a toolkit (has getTools method)
		if ((tool as any).getTools && typeof (tool as any).getTools === 'function') {
			// Extract individual tools from toolkit
			const toolkitTools = (tool as any).getTools();
			if (Array.isArray(toolkitTools)) {
				for (const subTool of toolkitTools) {
					try {
						convertedTools.push(convertN8nToolToInternal(subTool));
					} catch (error) {
						// Skip tools that fail conversion - will be logged by caller
					}
				}
			}
		} else {
			// Convert single tool
			try {
				convertedTools.push(convertN8nToolToInternal(tool));
			} catch (error) {
				// Skip tools that fail conversion - will be logged by caller
			}
		}
	}

	return convertedTools;
}

/**
 * Create a wrapper for n8n connected tools that logs execution
 */
export function createLoggedToolWrapper(
	tool: ConvertedTool,
	executeFunctions: IExecuteFunctions,
): ConvertedTool {
	const originalCall = tool.call;

	return {
		...tool,
		call: async (args: any) => {
			const logger = executeFunctions.logger;
			logger.debug(`🔧 Calling external tool: ${tool.name}`);
			logger.debug(`   Arguments: ${JSON.stringify(args).substring(0, 200)}`);

			try {
				const result = await originalCall(args);
				logger.debug(`   ✅ Tool ${tool.name} completed successfully`);
				return result;
			} catch (error) {
				logger.error(`   ❌ Tool ${tool.name} failed: ${(error as Error).message}`);
				throw error;
			}
		},
	};
}
