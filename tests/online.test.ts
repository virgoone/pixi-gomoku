import { describe, expect, it } from 'vitest';

import { agreedRule, agreedVariant, parseMessage, PROTOCOL } from '../src/net/online';

describe('parseMessage', () => {
  it('accepts well-formed moves', () => {
    expect(parseMessage({ type: 'move', x: 7, y: 7, index: 0 })).toEqual({ type: 'move', x: 7, y: 7, index: 0 });
  });

  it('rejects moves off the board or with bad fields', () => {
    expect(parseMessage({ type: 'move', x: 15, y: 0, index: 0 })).toBeNull();
    expect(parseMessage({ type: 'move', x: 1.5, y: 0, index: 0 })).toBeNull();
    expect(parseMessage({ type: 'move', x: '3', y: 0, index: 0 })).toBeNull();
    expect(parseMessage({ type: 'move', x: 3, y: 3, index: -1 })).toBeNull();
  });

  it('validates start and hello, drops unknown data', () => {
    expect(parseMessage({ type: 'start', hostStone: 2, round: 2, rule: 'renju', opening: 'rif' })).toEqual({ type: 'start', hostStone: 2, round: 2, rule: 'renju', opening: 'rif' });
    expect(parseMessage({ type: 'start', hostStone: 3, round: 1 })).toBeNull();
    expect(parseMessage({ type: 'hello', name: 'a', protocol: 1 })).toEqual({ type: 'hello', name: 'a', protocol: 1 });
    expect(parseMessage({ type: 'hello', name: 5 })).toBeNull();
    expect(parseMessage({ type: 'hack' })).toBeNull();
    expect(parseMessage('move')).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage({ type: 'bye' })).toEqual({ type: 'bye' });
  });
});

describe('room rule', () => {
  it('reads a start without a rule (older host) as free-style', () => {
    expect(parseMessage({ type: 'start', hostStone: 1, round: 1 })).toEqual({ type: 'start', hostStone: 1, round: 1, rule: 'freestyle', opening: 'free' });
    expect(parseMessage({ type: 'start', hostStone: 1, round: 1, rule: 'caro' })).toEqual({ type: 'start', hostStone: 1, round: 1, rule: 'freestyle', opening: 'free' });
    // A protocol 2 host sends a rule but no opening.
    expect(parseMessage({ type: 'start', hostStone: 1, round: 1, rule: 'renju' })).toMatchObject({ rule: 'renju', opening: 'free' });
    // The RIF opening needs renju.
    expect(parseMessage({ type: 'start', hostStone: 1, round: 1, rule: 'freestyle', opening: 'rif' })).toMatchObject({ opening: 'free' });
  });

  it('plays renju only when the guest understands it', () => {
    expect(agreedRule('renju', PROTOCOL)).toBe('renju');
    expect(agreedRule('renju', 1)).toBe('freestyle');
    // No hello yet (0) is treated like an old client.
    expect(agreedRule('renju', 0)).toBe('freestyle');
    expect(agreedRule('freestyle', PROTOCOL)).toBe('freestyle');
  });
});

describe('RIF opening messages', () => {
  it('validates swap, offer and choose', () => {
    expect(parseMessage({ type: 'swap', swap: true })).toEqual({ type: 'swap', swap: true });
    expect(parseMessage({ type: 'swap', swap: 'yes' })).toBeNull();
    expect(parseMessage({ type: 'offer', points: [[1, 2], [3, 4]] })).toEqual({ type: 'offer', points: [[1, 2], [3, 4]] });
    expect(parseMessage({ type: 'offer', points: [[1, 2]] })).toBeNull();
    expect(parseMessage({ type: 'offer', points: [[1, 2], [3, 15]] })).toBeNull();
    expect(parseMessage({ type: 'choose', x: 7, y: 8 })).toEqual({ type: 'choose', x: 7, y: 8 });
    expect(parseMessage({ type: 'choose', x: -1, y: 8 })).toBeNull();
    expect(parseMessage({ type: 'delegate', on: true })).toEqual({ type: 'delegate', on: true });
    expect(parseMessage({ type: 'delegate', on: 1 })).toBeNull();
    expect(parseMessage({ type: 'undo-request', count: 2, index: 9 })).toEqual({ type: 'undo-request', count: 2, index: 9 });
    expect(parseMessage({ type: 'undo-request', count: 3, index: 9 })).toBeNull();
    expect(parseMessage({ type: 'undo-reply', accept: false })).toEqual({ type: 'undo-reply', accept: false });
  });

  it('drops each feature the guest cannot play', () => {
    const rif = { rule: 'renju', opening: 'rif' } as const;
    expect(agreedVariant(rif, PROTOCOL)).toEqual(rif);
    expect(agreedVariant(rif, 2)).toEqual({ rule: 'renju', opening: 'free' });
    expect(agreedVariant(rif, 1)).toEqual({ rule: 'freestyle', opening: 'free' });
    expect(agreedVariant(rif, 0)).toEqual({ rule: 'freestyle', opening: 'free' });
  });
});
