// Tests for sequence-data.ts — SEQUENCES constant shape and actor/message integrity.
import { describe, expect, it } from 'vitest';
import { SEQUENCES } from '../sequence-data';

describe('SEQUENCES constant', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SEQUENCES)).toBe(true);
    expect(SEQUENCES.length).toBeGreaterThan(0);
  });

  it('every sequence has required fields: id, title, subtitle, actors, messages', () => {
    for (const seq of SEQUENCES) {
      expect(typeof seq.id).toBe('string');
      expect(typeof seq.title).toBe('string');
      expect(typeof seq.subtitle).toBe('string');
      expect(Array.isArray(seq.actors)).toBe(true);
      expect(Array.isArray(seq.messages)).toBe(true);
    }
  });

  it('all sequence ids are unique', () => {
    const ids = SEQUENCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes a deposit sequence', () => {
    expect(SEQUENCES.some((s) => s.id === 'deposit')).toBe(true);
  });

  it('includes a withdrawal sequence', () => {
    expect(SEQUENCES.some((s) => s.id === 'withdrawal')).toBe(true);
  });

  it('every actor has id, label, and tone', () => {
    for (const seq of SEQUENCES) {
      for (const actor of seq.actors) {
        expect(typeof actor.id).toBe('string');
        expect(typeof actor.label).toBe('string');
        expect(typeof actor.tone).toBe('string');
      }
    }
  });

  it('actor ids are unique within each sequence', () => {
    for (const seq of SEQUENCES) {
      const ids = seq.actors.map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every sequence has at least one actor', () => {
    for (const seq of SEQUENCES) {
      expect(seq.actors.length).toBeGreaterThan(0);
    }
  });

  it('every sequence has at least one message', () => {
    for (const seq of SEQUENCES) {
      expect(seq.messages.length).toBeGreaterThan(0);
    }
  });

  it('message kind when present is a known value', () => {
    const validKinds = new Set(['sync', 'async', 'return', 'note', 'self']);
    for (const seq of SEQUENCES) {
      for (const msg of seq.messages) {
        if (msg.kind !== undefined) {
          expect(validKinds.has(msg.kind)).toBe(true);
        }
      }
    }
  });

  it('deposit sequence has a chain actor', () => {
    const deposit = SEQUENCES.find((s) => s.id === 'deposit');
    expect(deposit).toBeDefined();
    expect(deposit!.actors.some((a) => a.tone === 'chain')).toBe(true);
  });

  it('deposit sequence title is non-empty', () => {
    const deposit = SEQUENCES.find((s) => s.id === 'deposit');
    expect(deposit!.title.length).toBeGreaterThan(0);
  });

  it('actor tones are drawn from the known set', () => {
    const validTones = new Set([
      'neutral',
      'ruby',
      'node',
      'chain',
      'db',
      'external',
      'policy',
      'treasurer',
      'queue',
    ]);
    for (const seq of SEQUENCES) {
      for (const actor of seq.actors) {
        expect(validTones.has(actor.tone)).toBe(true);
      }
    }
  });
});
