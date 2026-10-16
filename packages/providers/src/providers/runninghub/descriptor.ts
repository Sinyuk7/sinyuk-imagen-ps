import type { ProviderDescriptor } from '../../contract/provider.js';
export const runningHubDescriptor: ProviderDescriptor = { id: 'runninghub', family: 'runninghub', displayName: 'RunningHub', operations: ['text_to_image', 'image_edit'], invokeMode: 'async', defaultModelTemplates: [], billing: { query: 'unsupported', mode: 'fixed', protocols: [] } };
