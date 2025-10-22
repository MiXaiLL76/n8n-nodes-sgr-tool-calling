export const createReportTool = {
	name: 'create_report_tool',
	description: `Create comprehensive detailed report with citations as a final step of research.

CRITICAL: Every factual claim in content MUST have inline citations [1], [2], [3].
Citations must be integrated directly into sentences, not just listed at the end.`,
	schema: {
		type: 'object',
		properties: {
			reasoning: {
				type: 'string',
				description: 'Why ready to create report now',
			},
			title: {
				type: 'string',
				description: 'Report title',
			},
			user_request_language_reference: {
				type: 'string',
				description: 'Copy of original user request to ensure language consistency',
			},
			content: {
				type: 'string',
				description:
					'Write comprehensive research report. Use the SAME LANGUAGE as user_request_language_reference. MANDATORY: Include inline citations [1], [2], [3] after EVERY factual claim.',
			},
			confidence: {
				type: 'string',
				enum: ['high', 'medium', 'low'],
				description: 'Confidence in findings',
			},
		},
		required: ['reasoning', 'title', 'user_request_language_reference', 'content', 'confidence'],
	},
	call: async (args: any) => {
		return JSON.stringify(
			{
				title: args.title,
				content: args.content,
				confidence: args.confidence,
				word_count: args.content.split(/\s+/).length,
				timestamp: new Date().toISOString(),
			},
			null,
			2,
		);
	},
};
