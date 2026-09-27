import { describe, expect, it } from 'vitest';

import { agreedRule, parseMessage, PROTOCOL } from '../src/net/online';

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
    expect(parseMessage({ type: 'start', hostStone: 2, round: 2, rule: 'renju' })).toEqual({ type: 'start', hostStone: 2, round: 2, rule: 'renju' });
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
    expect(parseMessage({ type: 'start', hostStone: 1, round: 1 })).toEqual({ type: 'start', hostStone: 1, round: 1, rule: 'freestyle' });
    expect(parseMessage({ type: 'start', hostStone: 1, round: 1, rule: 'caro' })).toEqual({ type: 'start', hostStone: 1, round: 1, rule: 'freestyle' });
  });

  it('plays renju only when the guest understands it', () => {
    expect(agreedRule('renju', PROTOCOL)).toBe('renju');
    expect(agreedRule('renju', 1)).toBe('freestyle');
    // No hello yet (0) is treated like an old client.
    expect(agreedRule('renju', 0)).toBe('freestyle');
    expect(agreedRule('freestyle', PROTOCOL)).toBe('freestyle');
  });
});
