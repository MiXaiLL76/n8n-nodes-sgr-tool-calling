export const reasoningTool = {
	name: 'reasoning_tool',
	description: `Agent core logic, determines next reasoning step with adaptive planning by schema-guided-reasoning capabilities. Keep all text fields concise and focused.

Usage: Required tool use this tool before execution tool, and after execution`,
	schema: {
		type: 'object',
		properties: {
			reasoning_steps: {
				type: 'array',
				items: { type: 'string' },
				description: 'Step-by-step reasoning (brief, 1 sentence each)',
				minItems: 2,
				maxItems: 3,
			},
			current_situation: {
				type: 'string',
				description: 'Current research situation (2-3 sentences MAX)',
				maxLength: 300,
			},
			plan_status: {
				type: 'string',
				description: 'Status of current plan (1 sentence)',
				maxLength: 150,
			},
			enough_data: {
				type: 'boolean',
				description: 'Sufficient data collected for comprehensive report?',
				default: false,
			},
			remaining_steps: {
				type: 'array',
				items: { type: 'string' },
				description: '1-3 remaining steps (brief, action-oriented)',
				minItems: 1,
				maxItems: 3,
			},
			task_completed: {
				type: 'boolean',
				description: 'Is the research task finished?',
			},
		},
		required: [
			'reasoning_steps',
			'current_situation',
			'plan_status',
			'remaining_steps',
			'task_completed',
		],
	},
	call: async (args: Record<string, unknown>) => {
		return JSON.stringify(args, null, 2);
	},
};
