export const adaptPlanTool = {
	name: 'adapt_plan_tool',
	description: 'Adapt research plan based on new findings.',
	schema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description: 'Why plan needs adaptation based on new data',
			},
			original_goal: {
				type: 'string',
				description: 'Original research goal',
			},
			new_goal: {
				type: 'string',
				description: 'Updated research goal',
			},
			plan_changes: {
				type: 'array',
				items: { type: 'string' },
				description: 'Specific changes made to plan',
				minItems: 1,
				maxItems: 3,
			},
			next_steps: {
				type: 'array',
				items: { type: 'string' },
				description: 'Updated remaining steps',
				minItems: 2,
				maxItems: 4,
			},
		},
		required: ['reasoning', 'original_goal', 'new_goal', 'plan_changes', 'next_steps'],
	},
	call: async (args: Record<string, unknown>) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { reasoning, ...output } = args;
		return JSON.stringify(output, null, 2);
	},
};
