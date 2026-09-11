import { describe, expect, it } from 'vitest';
import { createMockServices } from './createMockServices';

describe('mock API state machine', () => {
  it('hides withdrawn tea items and restores the public item on relist', async () => {
    const { admin, publicApi } = createMockServices();
    const item = await admin.getContent('longjing-2026');

    await admin.withdraw({ id: item.id, ifMatch: item.etag, idempotencyKey: crypto.randomUUID() });
    await expect(publicApi.getTeaItem('longjing-2026')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });

    const withdrawn = await admin.getContent('longjing-2026');
    await admin.relist({ id: withdrawn.id, ifMatch: withdrawn.etag, idempotencyKey: crypto.randomUUID() });
    await expect(publicApi.getTeaItem('longjing-2026')).resolves.toMatchObject({ id: 'longjing-2026', status: 'published' });
  });

  it('restores the demo source when relisting after a source withdrawal', async () => {
    const { admin, publicApi } = createMockServices();
    await admin.setSourceActive(false);
    await expect(publicApi.getTeaItem('longjing-2026')).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const item = await admin.getContent('longjing-2026');
    await admin.withdraw({ id: item.id, ifMatch: item.etag, idempotencyKey: crypto.randomUUID() });
    const withdrawn = await admin.getContent('longjing-2026');
    await admin.relist({ id: withdrawn.id, ifMatch: withdrawn.etag, idempotencyKey: crypto.randomUUID() });

    await expect(publicApi.getTeaItem('longjing-2026')).resolves.toMatchObject({ id: 'longjing-2026' });
  });

  it('only lets operators delete drafts and forbids reviewers from approving their own work', async () => {
    const { admin } = createMockServices({ role: 'operator' });
    const published = await admin.getContent('longjing-2026');
    await expect(admin.delete({ id: published.id, ifMatch: published.etag, idempotencyKey: crypto.randomUUID() }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    const reviewer = createMockServices({ role: 'reviewer', userId: 'author-1' }).admin;
    const pending = await reviewer.getContent('qimen-draft');
    await expect(reviewer.review({ id: pending.id, revision: pending.row_version, decision: 'approve', comment: '通过', ifMatch: pending.etag, idempotencyKey: crypto.randomUUID(), authorId: 'author-1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
