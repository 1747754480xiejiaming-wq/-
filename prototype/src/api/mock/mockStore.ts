import type { Lead, TeaItem } from '../../model';
import { mockSeedItems, mockSeedLeads } from './seed';

export type MockState = { items: TeaItem[]; leads: Lead[]; leadVersions: Record<string, number>; sourceActive: boolean };
export class MockStore {
  private state: MockState;
  private listeners = new Set<() => void>();
  constructor(seed: Partial<MockState> = {}) {
    const leads = seed.leads ?? mockSeedLeads();
    this.state = { items: seed.items ?? mockSeedItems(), leads, leadVersions: seed.leadVersions ?? Object.fromEntries(leads.map(lead => [lead.id, 1])), sourceActive: seed.sourceActive ?? true };
  }
  snapshot = () => structuredClone(this.state);
  update = (apply: (state: MockState) => MockState) => { this.state = apply(this.snapshot()); this.listeners.forEach(listener => listener()); return this.snapshot(); };
  reset = () => { const leads = mockSeedLeads(); this.state = { items: mockSeedItems(), leads, leadVersions: Object.fromEntries(leads.map(lead => [lead.id, 1])), sourceActive: true }; this.listeners.forEach(listener => listener()); };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
}
