import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class PageTranslateApi implements ICredentialType {
	name = 'pageTranslateApi';
	displayName = 'PageTranslate API';
	documentationUrl = 'https://pagetranslate.ai/api';
	icon = 'file:../nodes/PageTranslate/pagetranslate.svg' as const;
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'Create a key in your verified PageTranslate account under Dashboard > API Keys',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://api.pagetranslate.ai/api/v1', url: '/jobs/', method: 'GET' },
	};
}
