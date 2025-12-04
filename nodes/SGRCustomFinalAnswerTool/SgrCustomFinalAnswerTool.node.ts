import {
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	NodeOperationError,
} from 'n8n-workflow';

// Import default schema from finalAnswerTool
import { finalAnswerTool } from '../SGR/tools/finalAnswer';

const DEFAULT_DESCRIPTION = `Finalize research task and complete agent execution after all steps are completed.

Usage: Call after you complete research task

NOTE: When using this custom tool, the built-in "Final Answer Tool" and "Clarification Tool"
are automatically disabled in SGR Agent to avoid conflicts.`;

export class SgrCustomFinalAnswerTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SGR Custom Final Answer Tool',
		name: 'sgrCustomFinalAnswerTool',
		icon: 'file:../SGR/SGR.svg',
		group: ['transform'],
		version: 1,
		description: 'Custom configurable Final Answer tool for SGR Agent',
		usableAsTool: true,
		defaults: {
			name: 'Custom Final Answer',
		},
		inputs: [],
		outputs: ['ai_tool'],
		outputNames: ['Tool'],
		properties: [
			// {
			// 	displayName: 'Tool Name',
			// 	name: 'toolName',
			// 	type: 'string',
			// 	default: 'custom_final_answer_tool',
			// 	description:
			// 		'Name of the tool. Use "final_answer_tool" to replace the built-in tool (auto-disabled when this tool is connected).',
			// 	required: true,
			// },
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				default: DEFAULT_DESCRIPTION,
				description: 'Description of what the tool does (shown to the AI model)',
				required: true,
			},
			{
				displayName: 'JSON Schema',
				name: 'jsonSchema',
				type: 'json',
				default: JSON.stringify(finalAnswerTool.schema, null, 2),
				description:
					'JSON Schema defining the structure of tool parameters (default from nodes/SGR/tools/finalAnswer.ts)',
				required: true,
				validateType: 'object',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const toolName = 'custom_final_answer_tool'; // this.getNodeParameter('toolName', itemIndex) as string;
		const description = this.getNodeParameter('description', itemIndex) as string;
		const jsonSchemaParam = this.getNodeParameter('jsonSchema', itemIndex);

		// Parse and validate schema
		let schema: Record<string, unknown>;

		// Handle both string and object types
		if (typeof jsonSchemaParam === 'string') {
			// Check for invalid object-to-string conversion
			if (jsonSchemaParam === '[object Object]') {
				throw new NodeOperationError(
					this.getNode(),
					'Invalid JSON schema: received "[object Object]" instead of valid JSON. Please ensure the JSON Schema field contains valid JSON string.',
				);
			}

			try {
				schema = JSON.parse(jsonSchemaParam);
			} catch (error) {
				throw new NodeOperationError(
					this.getNode(),
					`Invalid JSON schema: ${(error as Error).message}`,
				);
			}
		} else if (typeof jsonSchemaParam === 'object' && jsonSchemaParam !== null) {
			// n8n may pass already parsed object
			schema = jsonSchemaParam as Record<string, unknown>;
		} else {
			throw new NodeOperationError(
				this.getNode(),
				`Invalid JSON schema: expected string or object, got ${typeof jsonSchemaParam}`,
			);
		}

		// Validate schema is an object
		if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
			throw new NodeOperationError(this.getNode(), 'JSON schema must be a valid object');
		}

		// Basic schema validation
		if (schema.type !== 'object') {
			throw new NodeOperationError(
				this.getNode(),
				'JSON schema must have type "object" at root level',
			);
		}

		if (!schema.properties || typeof schema.properties !== 'object') {
			throw new NodeOperationError(this.getNode(), 'JSON schema must have "properties" object');
		}

		const tool = {
			name: toolName,
			description,
			schema,
			call: async (args: Record<string, unknown>) => {
				return JSON.stringify(args, null, 2);
			},
		};

		return {
			response: tool,
		};
	}
}
