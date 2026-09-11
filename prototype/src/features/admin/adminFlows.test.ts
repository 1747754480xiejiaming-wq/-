import { describe, expect, it } from 'vitest';
import { createMockServices } from '../../api/mock/createMockServices';
import { hasPermissions } from './useAdminSession';

describe('admin service flows', () => {
  it('derives permission gates from the session permission codes', async () => {
    const { admin } = createMockServices({ role: 'operator', userId: 'operator-1' });
    const operator = await admin.getMe();
    expect(hasPermissions(operator.permission_codes, ['content:read', 'content:write'])).toBe(true);
    expect(hasPermissions(operator.permission_codes, ['reviews:write'])).toBe(false);

    const lead = await admin.setDemoRole('lead');
    expect(hasPermissions(lead.permission_codes, ['inquiries:read', 'inquiries:export'])).toBe(true);
    await expect(admin.listContent()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('uses versioned content commands and publishes an approved review', async () => {
    const { admin, publicApi } = createMockServices({ role: 'operator', userId: 'operator-1' });
    const published = await admin.getContent('longjing-2026');
    const withdrawn = await admin.withdraw({ id: published.id, ifMatch: published.etag, idempotencyKey: crypto.randomUUID() });
    await expect(admin.relist({ id: withdrawn.id, ifMatch: published.etag, idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });

    await admin.setDemoRole('reviewer');
    const pending = await admin.getContent('qimen-draft');
    await admin.review({ id: pending.id, revision: pending.row_version, decision: 'approve', comment: '资料完整', ifMatch: pending.etag, idempotencyKey: crypto.randomUUID() });
    await expect(publicApi.getTeaItem('qimen-draft')).resolves.toMatchObject({ status: 'published' });
  });

  it('keeps lead transitions forward-only and protects them with ETags', async () => {
    const { admin } = createMockServices({ role: 'lead', userId: 'lead-1' });
    const page = await admin.listLeads({ status: 'new' });
    const lead = page.items[0];
    const updated = await admin.updateLead({ id: lead.id, status: 'contacted', note: '已联系并说明样品安排', ifMatch: lead.etag, idempotencyKey: crypto.randomUUID() });
    expect(updated).toMatchObject({ status: 'contacted', row_version: lead.row_version + 1 });
    await expect(admin.updateLead({ id: lead.id, status: 'new', note: '尝试回退', ifMatch: updated.etag, idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ status: 409, code: 'INVALID_STATE' });
  });
});
