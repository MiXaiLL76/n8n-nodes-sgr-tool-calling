export const generatePlanTool = {
	name: 'generate_plan_tool',
	description: `Generate research plan.

Useful to split complex request into manageable steps.`,
	schema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description: 'Justification for research approach',
			},
			research_goal: {
				type: 'string',
				description: 'Primary research objective',
			},
			planned_steps: {
				type: 'array',
				items: { type: 'string' },
				description: 'List of 3-4 planned steps',
				minItems: 3,
				maxItems: 4,
			},
			search_strategies: {
				type: 'array',
				items: { type: 'string' },
				description: 'Information search strategies',
				minItems: 2,
				maxItems: 3,
			},
		},
		required: ['reasoning', 'research_goal', 'planned_steps', 'search_strategies'],
	},
	call: async (args: any) => {
		const { reasoning, ...output } = args;
		return JSON.stringify(output, null, 2);
	},
};
