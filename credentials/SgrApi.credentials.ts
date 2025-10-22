import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SgrApi implements ICredentialType {
	name = 'sgrApi';
	displayName = 'SGR OpenAI API';
	documentationUrl = 'https://platform.openai.com/docs/api-reference';
	icon = 'file:SGR.svg' as const;
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.openai.com/v1',
			description: 'The base URL for OpenAI API (or compatible endpoint)',
		},
		{
			displayName: 'Model',
			name: 'model',
			type: 'string',
			default: 'gpt-4-turbo-preview',
			description: 'The model to use for chat completions',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/models',
		},
	};
}
