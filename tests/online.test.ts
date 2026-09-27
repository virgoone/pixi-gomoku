import { describe, expect, it } from 'vitest';

import { parseMessage } from '../src/net/online';

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
    expect(parseMessage({ type: 'start', hostStone: 2, round: 2 })).toEqual({ type: 'start', hostStone: 2, round: 2 });
    expect(parseMessage({ type: 'start', hostStone: 3, round: 1 })).toBeNull();
    expect(parseMessage({ type: 'hello', name: 'a', protocol: 1 })).toEqual({ type: 'hello', name: 'a', protocol: 1 });
    expect(parseMessage({ type: 'hello', name: 5 })).toBeNull();
    expect(parseMessage({ type: 'hack' })).toBeNull();
    expect(parseMessage('move')).toBeNull();
    expect(parseMessage(null)).toBeNull();
    expect(parseMessage({ type: 'bye' })).toEqual({ type: 'bye' });
  });
});
