// https://github.com/vamplabAI/sgr-deep-research/blob/main/sgr_deep_research/core/tools/create_report_tool.py
import type { AgentContext } from '../core/context';
import type { Logger } from 'n8n-workflow';

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
	call: async (args: Record<string, unknown>) => {
		return JSON.stringify(
			{
				title: args.title,
				content: args.content,
				confidence: args.confidence,
				word_count: (args.content as string).split(/\s+/).length,
				timestamp: new Date().toISOString(),
			},
			null,
			2,
		);
	},
};

/**
 * Create contextual version of createReportTool with access to AgentContext
 * This is used by ToolCallingAgent to provide full functionality from Python version
 */
export function createReportToolWithContext(context: AgentContext, logger?: Logger) {
	return {
		...createReportTool,
		call: async (args: Record<string, unknown>) => {
			const title = args.title as string;
			const content = args.content as string;
			const confidence = args.confidence as string;
			const reasoning = args.reasoning as string;
			const userRequestLanguageReference = args.user_request_language_reference as string;

			// Build full report content similar to Python version
			let fullContent = `# ${title}\n\n`;
			fullContent += `*Created: ${new Date().toISOString().replace('T', ' ').substring(0, 19)}*\n\n`;
			fullContent += content + '\n\n';

			// Add sources reference section if sources exist
			const sourcesArray = Array.from(context.sources.values());
			if (sourcesArray.length > 0) {
				fullContent += '---\n\n';
				fullContent += '## Источники / Sources\n\n';
				fullContent += context.getSourcesAsString();
			}

			const wordCount = content.split(/\s+/).length;
			const sourcesCount = sourcesArray.length;

			// Detailed logging like Python version
			if (logger) {
				logger.info(
					`📝 CREATE REPORT FULL DEBUG:\n` +
						`   🌍 Language Reference: '${userRequestLanguageReference}'\n` +
						`   📊 Title: '${title}'\n` +
						`   🔍 Reasoning: '${reasoning.substring(0, 150)}...'\n` +
						`   📈 Confidence: ${confidence}\n` +
						`   📄 Content Preview: '${content.substring(0, 200)}...'\n` +
						`   📊 Words: ${wordCount}, Sources: ${sourcesCount}\n`,
				);
			}

			const report = {
				title,
				content,
				full_content: fullContent,
				confidence,
				sources_count: sourcesCount,
				word_count: wordCount,
				timestamp: new Date().toISOString(),
			};

			return JSON.stringify(report, null, 2);
		},
	};
}
