import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

const API = 'https://api.pagetranslate.ai/api/v1';
const supported = new Set([
	'pdf',
	'docx',
	'epub',
	'png',
	'jpg',
	'jpeg',
	'webp',
	'tiff',
	'tif',
	'bmp',
	'gif',
]);

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool -- Upload requires binary workflow input, which agent tools do not support.
export class PageTranslate implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PageTranslate',
		name: 'pageTranslate',
		icon: { light: 'file:pagetranslate.svg', dark: 'file:pagetranslate.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Translate documents into 70+ languages while preserving layout',
		defaults: { name: 'PageTranslate' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'pageTranslateApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Document', value: 'document' }],
				default: 'document',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['document'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get a document',
						description: 'Get status, progress and word count',
					},
					{
						name: 'Get Download Link',
						value: 'getDownloadLink',
						action: 'Get a document download link',
						description: 'Get a one-hour link for a completed document',
					},
					{
						name: 'Get Many',
						value: 'getMany',
						action: 'Get many documents',
						description: 'List recent translations',
					},
					{
						name: 'Start',
						value: 'start',
						action: 'Start a document translation',
						description: 'Start an explicitly confirmed translation using existing word balance',
					},
					{
						name: 'Upload',
						value: 'upload',
						action: 'Upload a document',
						description: 'Upload a document and get its word count without starting translation',
					},
				],
				default: 'upload',
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				description: 'The input binary field containing the document to upload',
				displayOptions: { show: { operation: ['upload'] } },
			},
			{
				displayName: 'Target Language',
				name: 'targetLanguage',
				type: 'string',
				default: 'es',
				required: true,
				placeholder: 'e.g. es, fr, pt-BR',
				description:
					'Target language code. Use pt-BR for Brazilian Portuguese, zh for Simplified Chinese, or zh-TW for Traditional Chinese.',
				displayOptions: { show: { operation: ['upload'] } },
			},
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				required: true,
				description: 'The 24-character job ID returned by Upload or Get Many',
				displayOptions: { show: { operation: ['get', 'start', 'getDownloadLink'] } },
			},
			{
				displayName: 'Confirm Spending Words',
				name: 'confirmStart',
				type: 'boolean',
				default: false,
				description:
					"Whether you confirm the word count and quote and authorize spending the account's existing word balance. Starting cannot be undone and never charges a card.",
				displayOptions: { show: { operation: ['start'] } },
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { operation: ['getMany'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: { show: { operation: ['getMany'], returnAll: [false] } },
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const output: INodeExecutionData[] = [];
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const call = async (path: string, options: Partial<IHttpRequestOptions> = {}) => {
					try {
						return (await this.helpers.httpRequestWithAuthentication.call(
							this,
							'pageTranslateApi',
							{ method: 'GET', json: true, timeout: 120000, ...options, url: API + path },
						)) as IDataObject;
					} catch (error) {
						throw new NodeApiError(this.getNode(), error, { itemIndex });
					}
				};
				let result: IDataObject;
				if (operation === 'upload') {
					const field = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
					const binary = this.helpers.assertBinaryData(itemIndex, field);
					const filename = binary.fileName || '';
					if (!supported.has(filename.split('.').pop()?.toLowerCase() || '')) {
						throw new NodeOperationError(
							this.getNode(),
							'Use a PDF, DOCX, EPUB or supported image with its original filename extension',
							{ itemIndex },
						);
					}
					const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, field);
					if (buffer.byteLength > 100 * 1024 * 1024 || buffer.byteLength === 0) {
						throw new NodeOperationError(
							this.getNode(),
							'The document must be non-empty and no larger than 100 MB',
							{ itemIndex },
						);
					}
					const language = (this.getNodeParameter('targetLanguage', itemIndex) as string).trim();
					if (!language)
						throw new NodeOperationError(this.getNode(), 'Set a target language code', {
							itemIndex,
						});
					const form = new FormData();
					form.append(
						'file',
						new Blob([new Uint8Array(buffer)], { type: binary.mimeType }),
						filename,
					);
					form.append('requested_language', language);
					const uploaded = await call('/upload/', { method: 'POST', body: form });
					result = await call(`/jobs/${String(uploaded.job_id)}`);
				} else if (operation === 'getMany') {
					const response = await call('/jobs/');
					const jobs = response.jobs as IDataObject[];
					const all = this.getNodeParameter('returnAll', itemIndex) as boolean;
					const selected = all
						? jobs
						: jobs.slice(0, this.getNodeParameter('limit', itemIndex) as number);
					output.push(...selected.map((job) => ({ json: job, pairedItem: { item: itemIndex } })));
					continue;
				} else {
					const id = (this.getNodeParameter('jobId', itemIndex) as string).trim();
					if (!/^[0-9a-f]{24}$/i.test(id))
						throw new NodeOperationError(
							this.getNode(),
							'Use the 24-character job ID returned by PageTranslate',
							{ itemIndex },
						);
					if (operation === 'get') result = await call(`/jobs/${id}`);
					else if (operation === 'start') {
						if (!this.getNodeParameter('confirmStart', itemIndex))
							throw new NodeOperationError(
								this.getNode(),
								'Review the word count and quote, then enable Confirm Spending Words before starting',
								{ itemIndex },
							);
						await call(`/jobs/${id}/translate`, {
							method: 'POST',
							body: { payment_method: 'credits' },
						});
						result = await call(`/jobs/${id}`);
					} else if (operation === 'getDownloadLink') {
						result = await call(`/jobs/${id}/download-link`, { method: 'POST' });
						result.download_url = `https://api.pagetranslate.ai${result.download_path}`;
					} else
						throw new NodeOperationError(this.getNode(), 'Unsupported operation', { itemIndex });
				}
				output.push({ json: result, pairedItem: { item: itemIndex } });
			} catch (error) {
				if (!this.continueOnFail()) {
					if (error instanceof NodeOperationError) {
						throw new NodeOperationError(this.getNode(), error, { itemIndex });
					}
					throw new NodeApiError(this.getNode(), error, { itemIndex });
				}
				output.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
			}
		}
		return [output];
	}
}
