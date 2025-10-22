/**
 * Message types for agent conversation
 */

// Support both OpenAI format and n8n format
export interface ToolCall {
	id: string;
	type?: 'function' | 'tool_call';
	// OpenAI format
	function?: {
		name: string;
		arguments: string | Record<string, any>;
	};
	// n8n format
	name?: string;
	args?: any;
}

export interface Message {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
}

export interface AIModelResponse {
	content?: string | null;
	tool_calls?: ToolCall[];
}
