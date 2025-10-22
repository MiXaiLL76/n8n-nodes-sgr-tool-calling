import {
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

export class SgrTavilySearchTool implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SGR Tavily Search Tool',
		name: 'sgrTavilySearchTool',
		icon: 'file:tavily.svg',
		group: ['transform'],
		version: 1,
		description: 'Web search tool using Tavily API for SGR Agent',
		usableAsTool: true,
		defaults: {
			name: 'SGR Tavily Search',
		},
		inputs: [],
		outputs: ['ai_tool'],
		outputNames: ['Tool'],
		credentials: [
			{
				name: 'tavilyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				default: 5,
				description: 'Maximum number of search results to return',
				typeOptions: {
					minValue: 1,
					maxValue: 10,
				},
			},
			{
				displayName: 'Search Depth',
				name: 'searchDepth',
				type: 'options',
				options: [
					{
						name: 'Basic',
						value: 'basic',
						description: 'Fast search with basic results',
					},
					{
						name: 'Advanced',
						value: 'advanced',
						description: 'Detailed search with more comprehensive results',
					},
				],
				default: 'basic',
				description: 'The depth of the search',
			},
			{
				displayName: 'Include Answer',
				name: 'includeAnswer',
				type: 'boolean',
				default: true,
				description: 'Whether to include a summarized answer in the response',
			},
			{
				displayName: 'Include Raw Content',
				name: 'includeRawContent',
				type: 'boolean',
				default: false,
				description: 'Whether to include raw HTML content',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const maxResults = this.getNodeParameter('maxResults', itemIndex) as number;
		const searchDepth = this.getNodeParameter('searchDepth', itemIndex) as string;
		const includeAnswer = this.getNodeParameter('includeAnswer', itemIndex) as boolean;
		const includeRawContent = this.getNodeParameter('includeRawContent', itemIndex) as boolean;

		const credentials = await this.getCredentials('tavilyApi');
		const apiKey = credentials.apiKey as string;

		const tool = {
			name: 'tavily_search',
			description: `Search the web for real-time information about any topic.
Use this tool when you need up-to-date information that might not be available in your training data.
The search results will include relevant snippets and URLs from web pages.

Usage:
- Use SPECIFIC terms and context in queries
- Search queries in SAME LANGUAGE as user request
- For date/number questions, include specific year/context in query

Returns: Page titles, URLs, snippets, and optionally a summarized answer`,
			schema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'Search query in same language as user request',
					},
					reasoning: {
						type: 'string',
						description: 'Why this search is needed and what to expect',
					},
				},
				required: ['query', 'reasoning'],
			},
			call: async (args: { query: string; reasoning: string }) => {
				const { query } = args;
				try {
					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: 'https://api.tavily.com/search',
						headers: {
							'Content-Type': 'application/json',
						},
						body: {
							api_key: apiKey,
							query,
							max_results: maxResults,
							search_depth: searchDepth,
							include_answer: includeAnswer,
							include_raw_content: includeRawContent,
						},
					});

					const data = response as {
						answer?: string;
						results?: Array<{ title: string; url: string; content?: string }>;
					};

					// Format the response
					let formattedResult = `Search Query: ${query}\n\n`;

					if (data.answer && includeAnswer) {
						formattedResult += `Summary Answer:\n${data.answer}\n\n`;
					}

					formattedResult += 'Search Results:\n\n';

					if (data.results && Array.isArray(data.results)) {
						data.results.forEach((result, index: number) => {
							formattedResult += `[${index + 1}] ${result.title}\n`;
							formattedResult += `URL: ${result.url}\n`;
							if (result.content) {
								const snippet =
									result.content.length > 200
										? result.content.substring(0, 200) + '...'
										: result.content;
								formattedResult += `Snippet: ${snippet}\n`;
							}
							formattedResult += '\n';
						});
					}

					return formattedResult;
				} catch (error) {
					return `Error executing Tavily search: ${(error as Error).message}`;
				}
			},
		};

		return {
			response: tool,
		};
	}
}
