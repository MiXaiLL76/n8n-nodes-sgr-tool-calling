export const finalAnswerTool = {
	name: 'final_answer_tool',
	description: `Finalize research task and complete agent execution after all steps are completed.

Usage: Call after you complete research task`,
	schema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description: 'Why task is now complete and how answer was verified',
			},
			completed_steps: {
				type: 'array',
				items: { type: 'string' },
				description: 'Summary of completed steps including verification',
				minItems: 1,
				maxItems: 5,
			},
			answer: {
				type: 'string',
				description:
					'Comprehensive final answer with EXACT factual details (dates, numbers, names)',
			},
			status: {
				type: 'string',
				enum: ['COMPLETED', 'FAILED'],
				description: 'Task completion status',
			},
		},
		required: ['reasoning', 'completed_steps', 'answer', 'status'],
	},
	call: async (args: any) => {
		return JSON.stringify(args, null, 2);
	},
};
