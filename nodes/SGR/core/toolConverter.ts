/**
 * Universal Tool Converter for n8n AI Tools (LangChain, MCP, etc.)
 * Converts any n8n AI Tool to our internal tool format
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import type { IExecuteFunctions, Logger } from 'n8n-workflow';

export interface N8nAITool {
	name: string;
	description: string;
	schema?: Record<string, unknown> | { parse?: (args: unknown) => unknown; [key: string]: unknown };
	call?: (args: Record<string, unknown>) => Promise<string | object>;
	// LangChain DynamicTool interface
	func?: (input: string) => Promise<string>;
	// LangChain Tool interface (wrapped by logWrapper)
	_call?: (query: string) => Promise<string>;
	// Additional metadata
	[key: string]: unknown;
}

export interface ConvertedTool {
	name: string;
	description: string;
	schema: Record<string, unknown>;
	call: (args: Record<string, unknown>) => Promise<string | object>;
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
 * Extract JSON Schema from Zod schema
 * Zod schemas have _def property with the actual schema definition
 */
function extractSchemaFromZod(zodSchema: unknown): Record<string, unknown> | null {
	if (!zodSchema || typeof zodSchema !== 'object') {
		return null;
	}

	// Check if it's a Zod schema with _def
	const schema = zodSchema as any;
	if (schema._def) {
		const def = schema._def;

		// For ZodEffects (wrapped schemas with transformations), unwrap to get the underlying schema
		if (def.typeName === 'ZodEffects' && def.schema) {
			console.log('[extractSchemaFromZod] Unwrapping ZodEffects to extract underlying schema');
			return extractSchemaFromZod(def.schema);
		}

		// For ZodObject, extract shape
		if (def.typeName === 'ZodObject') {
			const shape = typeof def.shape === 'function' ? def.shape() : def.shape;

			if (!shape || Object.keys(shape).length === 0) {
				console.log('[extractSchemaFromZod] ZodObject has empty shape, returning null');
				return null;
			}

			const properties: Record<string, unknown> = {};
			const required: string[] = [];

			for (const [key, value] of Object.entries(shape)) {
				const fieldDef = (value as any)._def;

				// Extract field info
				const fieldSchema: Record<string, unknown> = {};

				// Determine type
				if (fieldDef.typeName === 'ZodString') {
					fieldSchema.type = 'string';
				} else if (fieldDef.typeName === 'ZodNumber') {
					fieldSchema.type = 'number';
				} else if (fieldDef.typeName === 'ZodBoolean') {
					fieldSchema.type = 'boolean';
				} else if (fieldDef.typeName === 'ZodArray') {
					fieldSchema.type = 'array';
				} else if (fieldDef.typeName === 'ZodObject') {
					fieldSchema.type = 'object';
				}

				// Check if optional
				const isOptional = fieldDef.typeName === 'ZodOptional' || fieldDef.isOptional;
				if (!isOptional) {
					required.push(key);
				}

				// Add description if available
				if (fieldDef.description) {
					fieldSchema.description = fieldDef.description;
				}

				properties[key] = fieldSchema;
			}

			console.log(
				'[extractSchemaFromZod] Extracted from ZodObject:',
				JSON.stringify({ properties, required }, null, 2),
			);

			return {
				type: 'object',
				properties,
				required: required.length > 0 ? required : undefined,
			};
		}
	}

	return null;
}

/**
 * Clean up schema by removing library-specific metadata fields
 * Removes Zod internal fields: _def, _cached, ~standard, etc.
 */
function cleanSchemaMetadata(schema: unknown): Record<string, unknown> {
	if (!schema || typeof schema !== 'object') {
		return schema as Record<string, unknown>;
	}

	// First, try to extract from Zod
	const zodExtracted = extractSchemaFromZod(schema);
	if (zodExtracted) {
		return zodExtracted;
	}

	// List of metadata keys to remove (Zod, other libraries)
	const metadataKeys = ['_def', '_cached', '~standard', '_type', '_output', '_input', 'parse'];

	// Create clean copy without metadata
	const cleaned: Record<string, unknown> = {};
	for (const key in schema as Record<string, unknown>) {
		if (!metadataKeys.includes(key) && !key.startsWith('_') && !key.startsWith('~')) {
			cleaned[key] = (schema as Record<string, unknown>)[key];
		}
	}

	// Recursively clean nested objects
	if (cleaned.properties && typeof cleaned.properties === 'object') {
		const cleanedProps: Record<string, unknown> = {};
		for (const prop in cleaned.properties as Record<string, unknown>) {
			cleanedProps[prop] = cleanSchemaMetadata(
				(cleaned.properties as Record<string, unknown>)[prop],
			);
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
function validateAndFixSchema(
	schema: unknown,
	enableStrictMode: boolean = false,
): Record<string, unknown> {
	// First, clean metadata fields
	const cleanedSchema = cleanSchemaMetadata(schema);

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
	console.log(`[toolConverter] Converting tool: ${tool.name}`);
	console.log(`[toolConverter]   Has _call: ${!!tool._call}`);
	console.log(`[toolConverter]   Has call: ${!!tool.call}`);
	console.log(`[toolConverter]   Has func: ${!!tool.func}`);
	console.log(`[toolConverter]   Has invoke: ${!!('invoke' in tool)}`);
	console.log(`[toolConverter]   Has getTools: ${!!('getTools' in tool)}`);

	// Case 1: LangChain Tool wrapped by logWrapper (has _call method)
	// This is the most common case for n8n built-in tools like Calculator, Code Tool, etc.
	// IMPORTANT: Check if it's also a DynamicStructuredTool (has both _call and func with Zod schema)
	// MCP tools are wrapped by logWrapper, so they have _call, but also have func and schema
	if (tool._call && typeof tool._call === 'function') {
		// Check if this is a wrapped DynamicStructuredTool (MCP tools)
		const hasFunc = tool.func && typeof tool.func === 'function';
		const hasZodSchema =
			tool.schema &&
			typeof tool.schema === 'object' &&
			('_def' in tool.schema || 'parse' in tool.schema);

		console.log(`[toolConverter] Tool ${tool.name} has _call method`);
		console.log(`[toolConverter]   Also has func: ${hasFunc}`);
		console.log(`[toolConverter]   Also has Zod schema: ${hasZodSchema}`);

		// If it has both _call and func with Zod schema, it's a wrapped DynamicStructuredTool
		if (hasFunc && hasZodSchema) {
			console.log(`[toolConverter]   -> Treating as wrapped DynamicStructuredTool (MCP tool)`);
			const zodSchema = tool.schema as { parse?: (args: unknown) => unknown };
			const toolName = normalizeToolName(tool.name);

			const extractedSchema = validateAndFixSchema(tool.schema);
			console.log(
				`[toolConverter]   Extracted schema:`,
				JSON.stringify(extractedSchema, null, 2),
			);

			return {
				name: toolName,
				description: tool.description || 'No description provided',
				schema: extractedSchema,
				call: async (args: Record<string, unknown>) => {
					// Debug: log what we're about to call the tool with
					console.log(`[toolConverter] Calling wrapped DynamicStructuredTool ${toolName}:`);
					console.log(`[toolConverter]   args:`, JSON.stringify(args, null, 2));

					// IMPORTANT: Don't use _call! The logWrapper's _call expects a string.
					// Instead, use func or invoke which expect objects for DynamicStructuredTool
					if (tool.func) {
						console.log(`[toolConverter]   Using tool.func (bypassing logWrapper)`);

						// Call tool.func directly without Zod validation
						// The tool's internal implementation will handle validation
						// Zod validation can be too strict (e.g., strict mode rejects extra fields)
						// while our JSON schema might allow them
						return await tool.func!(args);
					} else if ('invoke' in tool && typeof tool.invoke === 'function') {
						console.log(`[toolConverter]   Using tool.invoke`);
						return await (tool as any).invoke(args);
					} else {
						// Fallback to _call (shouldn't happen for MCP tools)
						console.log(`[toolConverter]   WARNING: Falling back to _call (may fail)`);
						return await tool._call!(args as any);
					}
				},
			};
		}

		// Regular tool with _call that expects string input
		console.log(`[toolConverter]   -> Treating as regular string-based tool`);
		console.log(`[toolConverter]   Original schema:`, JSON.stringify(tool.schema, null, 2));

		// Determine the appropriate default schema based on tool name
		let defaultSchema = {
			type: 'object',
			properties: {
				input: {
					type: 'string',
					description: 'Tool input',
				},
			},
			required: ['input'],
		};

		// Calculator-specific schema
		if (tool.name && tool.name.toLowerCase().includes('calculator')) {
			defaultSchema = {
				type: 'object',
				properties: {
					input: {
						type: 'string',
						description: 'A mathematical expression to evaluate (e.g., "2+2", "10*5", "sqrt(16)")',
					},
				},
				required: ['input'],
			};
		}

		// First, try to extract schema from tool.schema (if it's Zod)
		let extractedSchema = tool.schema ? validateAndFixSchema(tool.schema) : null;

		// If extracted schema is empty (no properties), use default schema
		if (
			!extractedSchema ||
			!extractedSchema.properties ||
			Object.keys(extractedSchema.properties).length === 0
		) {
			console.log(`[toolConverter]   Extracted schema is empty, using default schema`);
			extractedSchema = defaultSchema;
		}

		const finalSchema = extractedSchema;
		console.log(`[toolConverter]   Final schema:`, JSON.stringify(finalSchema, null, 2));

		return {
			name: normalizeToolName(tool.name),
			description: tool.description || 'No description provided',
			schema: finalSchema,
			call: async (args: Record<string, unknown>) => {
				console.log(`[toolConverter] Calling regular _call tool: ${tool.name}`);
				console.log(`[toolConverter]   args:`, JSON.stringify(args, null, 2));
				console.log(`[toolConverter]   args keys:`, Object.keys(args));

				// LangChain tools wrapped by logWrapper expect string input
				// Try to extract the actual query/expression from args
				let input: string;

				if (typeof args === 'string') {
					input = args;
				} else if (args.input && typeof args.input === 'string') {
					input = args.input;
				} else if (args.query && typeof args.query === 'string') {
					input = args.query;
				} else if (args.expression && typeof args.expression === 'string') {
					input = args.expression;
				} else if (args.question && typeof args.question === 'string') {
					input = args.question;
				} else {
					// If we can't find a string field, use the first string value or JSON stringify
					const firstStringValue = Object.values(args).find((v) => typeof v === 'string');
					input = (firstStringValue as string) || JSON.stringify(args);
				}

				console.log(`[toolConverter]   Extracted input:`, input);
				const result = await tool._call!(input);
				console.log(`[toolConverter]   Result:`, result);
				return result;
			},
		};
	}

	// Case 2: Tool has call method (custom n8n AI tools)
	if (tool.name && tool.description && tool.call && typeof tool.call === 'function') {
		return {
			name: normalizeToolName(tool.name),
			description: tool.description,
			schema: validateAndFixSchema(tool.schema), // schema can be undefined
			call: tool.call,
		};
	}

	// Case 3: LangChain DynamicTool format (has func instead of call)
	// This includes both DynamicTool (string input) and DynamicStructuredTool (object input)
	if (tool.func && typeof tool.func === 'function') {
		// Check if it's a DynamicStructuredTool (has Zod schema that expects object)
		// MCP tools from @n8n/n8n-nodes-langchain.mcpClientTool use DynamicStructuredTool
		// They have Zod schemas and expect object arguments, not strings
		const hasZodSchema =
			tool.schema &&
			typeof tool.schema === 'object' &&
			('_def' in tool.schema || 'parse' in tool.schema);

		console.log(`[toolConverter] Converting tool with func: ${tool.name}`);
		console.log(`[toolConverter]   Has schema: ${!!tool.schema}`);
		console.log(`[toolConverter]   Schema type: ${typeof tool.schema}`);
		console.log(`[toolConverter]   Has _def: ${tool.schema && '_def' in tool.schema}`);
		console.log(`[toolConverter]   Has parse: ${tool.schema && 'parse' in tool.schema}`);
		console.log(`[toolConverter]   Is structured tool: ${hasZodSchema}`);

		const isStructuredTool = hasZodSchema;

		if (isStructuredTool) {
			// DynamicStructuredTool - func expects object, not string
			// MCP tools and other structured tools with Zod schemas
			const zodSchema = tool.schema as { parse?: (args: unknown) => unknown };
			const toolName = normalizeToolName(tool.name);

			return {
				name: toolName,
				description: tool.description || 'No description provided',
				schema: validateAndFixSchema(tool.schema),
				call: async (args: Record<string, unknown>) => {
					// Debug: log what we're about to call the tool with
					console.log(`[toolConverter] DynamicStructuredTool ${toolName}:`);
					console.log(`[toolConverter]   args type: ${typeof args}`);
					console.log(`[toolConverter]   args keys: ${Object.keys(args).join(', ')}`);
					console.log(`[toolConverter]   args value:`, JSON.stringify(args, null, 2));

					// If schema has parse method (Zod), validate/transform args
					let validatedArgs = args;
					if (zodSchema.parse && typeof zodSchema.parse === 'function') {
						try {
							console.log(`[toolConverter]   Validating with Zod schema...`);
							validatedArgs = zodSchema.parse(args) as Record<string, unknown>;
							console.log(`[toolConverter]   Validation successful`);
						} catch (error) {
							console.log(`[toolConverter]   Validation failed:`, error);
							// If validation fails, try to pass args as-is
							// Some tools might be more lenient
							validatedArgs = args;
						}
					}

					// Pass args directly as object
					console.log(`[toolConverter]   Calling tool.func with:`, JSON.stringify(validatedArgs, null, 2));
					return await tool.func!(validatedArgs);
				},
			};
		}

		// Regular DynamicTool - func expects string input
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
			call: async (args: Record<string, unknown>) => {
				// LangChain tools expect string input
				const input = typeof args === 'string' ? args : args.input || JSON.stringify(args);
				return await tool.func!(input as string);
			},
		};
	}

	// Case 4: MCP Toolkit format (from McpClientTool)
	// McpToolkit wraps multiple tools, need to extract individual tools
	if ('getTools' in tool && typeof (tool as { getTools?: () => unknown }).getTools === 'function') {
		// This is a toolkit, not a single tool
		// Will be handled by the caller
		throw new Error('Toolkit detected, should be unwrapped before conversion');
	}

	// Case 5: Generic tool with invoke method
	if (
		'invoke' in tool &&
		typeof (tool as { invoke?: (args: unknown) => unknown }).invoke === 'function'
	) {
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
			call: async (args: Record<string, unknown>) => {
				return await (tool as { invoke: (args: unknown) => Promise<string | object> }).invoke(args);
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
		call: async (args: Record<string, unknown>) => {
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
		if (
			'getTools' in tool &&
			typeof (tool as { getTools?: () => unknown }).getTools === 'function'
		) {
			// Extract individual tools from toolkit
			const toolkitTools = (tool as { getTools: () => unknown }).getTools();
			if (Array.isArray(toolkitTools)) {
				for (const subTool of toolkitTools) {
					try {
						convertedTools.push(convertN8nToolToInternal(subTool));
					} catch {
						// Skip tools that fail conversion - will be logged by caller
					}
				}
			}
		} else {
			// Convert single tool
			try {
				convertedTools.push(convertN8nToolToInternal(tool));
			} catch {
				// Skip tools that fail conversion - will be logged by caller
			}
		}
	}

	return convertedTools;
}

/**
 * Safely stringify and truncate data for logging
 */
function safeStringify(data: unknown, maxLength: number = 500): string {
	try {
		const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
		if (str.length <= maxLength) {
			return str;
		}
		return str.substring(0, maxLength) + `... (truncated, total length: ${str.length})`;
	} catch (error) {
		return `[Unable to stringify: ${(error as Error).message}]`;
	}
}

/**
 * Create a wrapper for n8n connected tools that logs execution
 */
export function createLoggedToolWrapper(tool: ConvertedTool, logger: Logger): ConvertedTool {
	const originalCall = tool.call;

	return {
		...tool,
		call: async (args: Record<string, unknown>) => {
			logger.debug(`🔧 Calling external tool: ${tool.name}`);
			logger.debug(`   Tool schema type: ${tool.schema?.type || 'unknown'}`);
			logger.debug(`   Arguments (type): ${typeof args}`);
			logger.debug(`   Arguments (full):\n${safeStringify(args, 1000)}`);

			try {
				const result = await originalCall(args);
				logger.debug(`   ✅ Tool ${tool.name} completed successfully`);
				logger.debug(`   Result type: ${typeof result}`);
				logger.debug(`   Result (preview):\n${safeStringify(result, 500)}`);
				return result;
			} catch (error) {
				const errorMessage = (error as Error).message || String(error);
				const errorStack = (error as Error).stack || '';

				logger.error(`   ❌ Tool ${tool.name} failed`);
				logger.error(`   Error message: ${errorMessage}`);
				if (errorStack) {
					logger.error(`   Error stack:\n${errorStack}`);
				}

				// Log full error object for debugging
				logger.error(`   Full error:\n${safeStringify(error, 1000)}`);

				throw error;
			}
		},
	};
}
