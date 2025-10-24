import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TavilyApi implements ICredentialType {
	name = 'tavilyApi';
	displayName = 'Tavily API';
	documentationUrl = 'https://tavily.com/';
	icon = 'file:../nodes/SGRTavilySearchTool/tavily.svg' as const;
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'The API key for Tavily API. Get it from https://app.tavily.com/',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.tavily.com',
			url: '/search',
			method: 'POST',
			body: {
				api_key: '={{$credentials.apiKey}}',
				query: 'test',
				max_results: 1,
			},
		},
	};
}
