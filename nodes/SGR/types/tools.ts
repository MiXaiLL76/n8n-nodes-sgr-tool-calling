/**
 * Tool types for agent tool calling
 */

export interface ToolParameter {
	type: string;
	description?: string;
	properties?: Record<string, any>;
	required?: string[];
}

export interface ToolFunction {
	name: string;
	description: string;
	parameters: ToolParameter;
}

export interface Tool {
	type: 'function';
	function: ToolFunction;
}

/**
 * Connected n8n AI Tool
 */
export interface ConnectedTool {
	name: string;
	description: string;
	schema?: ToolParameter;
	call: (args: any) => Promise<any>;
}
