import { describe, expect, it } from 'vitest';
import type { ConversationRound } from '../../../../src/shared/ui/hooks/use-conversation';
import { deriveHistoryItems, toHistoryTextPreview } from '../../../../src/shared/ui/pages/history-view-model';
import { fakeTaskRecord } from '../../../helpers/fakes';

describe('history-view-model', () => {
  it('merges active and durable state by taskId into a single item', () => {
    const round: ConversationRound = {
      id: fakeTaskRecord.taskId,
      time: '9:31',
      createdAt: fakeTaskRecord.createdAt,
      prompt: 'active prompt',
      status: 'running',
      providerName: 'Session Provider',
      elapsedSeconds: 2,
      previews: [],
      attachments: [],
      placementIntent: { kind: 'unbound', reason: 'no-photoshop-capture' },
    };

    const items = deriveHistoryItems({
      durableRecords: [fakeTaskRecord],
      activeRounds: [round],
      previews: {},
      canDownload: true,
      canPlace: true,
      noPrompt: 'No prompt',
      unknownProvider: 'Unknown',
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: fakeTaskRecord.taskId,
      taskId: fakeTaskRecord.taskId,
      status: 'running',
      isActive: true,
      canLocate: true,
      taskRecord: fakeTaskRecord,
    });
  });

  it('disables host actions for remote-only or missing resources', () => {
    const remoteRecord = {
      ...fakeTaskRecord,
      outputs: [{
        ...fakeTaskRecord.outputs[0]!,
        asset: { ref: { kind: 'url', ref: 'https://example.test/result.png', mimeType: 'image/png' } },
      }],
    };

    const items = deriveHistoryItems({
      durableRecords: [remoteRecord],
      activeRounds: [],
      previews: {},
      canDownload: true,
      canPlace: true,
      noPrompt: 'No prompt',
      unknownProvider: 'Unknown',
    });

    expect(items[0]?.actions).toEqual({
      retry: 'disabled',
      download: 'disabled',
      place: 'disabled',
    });
  });

  it('bounds prompt preview size and scrubs hostile payloads', () => {
    const huge = `${'token'.repeat(100)} data:image/png;base64,${'a'.repeat(2048)} https://example.test/${'x'.repeat(300)}`;
    const preview = toHistoryTextPreview(huge, 'No prompt');

    expect(preview).toContain('[Image data]');
    expect(preview.length).toBeLessThanOrEqual(400);
  });
});
