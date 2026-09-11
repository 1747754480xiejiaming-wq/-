import type { Lead, TeaItem } from '../../model';
import { mockSeedItems, mockSeedLeads } from './seed';

export type MockState = { items: TeaItem[]; leads: Lead[]; sourceActive: boolean };
export class MockStore {
  private state: MockState;
  constructor(seed: Partial<MockState> = {}) {
    this.state = { items: seed.items ?? mockSeedItems(), leads: seed.leads ?? mockSeedLeads(), sourceActive: seed.sourceActive ?? true };
  }
  snapshot = () => structuredClone(this.state);
  update = (apply: (state: MockState) => MockState) => { this.state = apply(this.snapshot()); return this.snapshot(); };
}
