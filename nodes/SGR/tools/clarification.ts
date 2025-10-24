// https://github.com/vamplabAI/sgr-deep-research/blob/main/sgr_deep_research/core/tools/clarification_tool.py
export const clarificationTool = {
	name: 'clarification_tool',
	description: `Ask clarifying questions when facing ambiguous request.

Keep all fields concise - brief reasoning, short terms, and clear questions.`,
	schema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description: 'Why clarification is needed (1-2 sentences MAX)',
				maxLength: 200,
			},
			unclear_terms: {
				type: 'array',
				items: { type: 'string' },
				description: 'List of unclear terms (brief, 1-3 words each)',
				minItems: 1,
				maxItems: 3,
			},
			assumptions: {
				type: 'array',
				items: { type: 'string' },
				description: 'Possible interpretations (short, 1 sentence each)',
				minItems: 2,
				maxItems: 3,
			},
			questions: {
				type: 'array',
				items: { type: 'string' },
				description: '3 specific clarifying questions (short and direct)',
				minItems: 3,
				maxItems: 3,
			},
		},
		required: ['reasoning', 'unclear_terms', 'assumptions', 'questions'],
	},
	call: async (args: Record<string, unknown>) => {
		return (args.questions as string[]).join('\n');
	},
};
