import type { DataConnection, Peer as PeerType } from 'peerjs';

import type { Opening, Variant } from '../gomoku/opening';
import type { Rule, Stone } from '../gomoku/rules';

/**
 * Two-player rooms over WebRTC (PeerJS). The host registers a peer id derived
 * from a six-digit room code; the guest connects to it. No game server is
 * needed, so the game stays a static site. Signalling uses PeerJS's public
 * broker; move data flows peer to peer.
 */

const PREFIX = 'pixi-gomoku-v1-';
/**
 * 1: first release. 2: `start` carries the rule (renju rooms).
 * 3: `start` carries the opening; swap / offer / choose messages for the RIF opening.
 * 4: `delegate` tells the opponent a player handed their seat to the master (托管);
 *    undo is a handshake: request → reply → commit (or cancel), so both sides
 *    take back the same moves or neither does.
 */
export const PROTOCOL = 4;
/** Oldest protocol that understands renju rooms. */
export const RENJU_PROTOCOL = 2;
/** Oldest protocol that understands the RIF opening. */
export const OPENING_PROTOCOL = 3;
/**
 * Oldest protocol that shows a 托管 notice. Handing a seat to the master is
 * only allowed when the opponent will see it.
 */
export const DELEGATE_PROTOCOL = 4;
/** Oldest protocol that answers undo requests. */
export const UNDO_PROTOCOL = 4;
const PING_MS = 5000;
// Generous: background tabs throttle timers heavily; real disconnects arrive via the close event.
const TIMEOUT_MS = 90000;

export type NetMessage =
  | { type: 'hello'; name: string; protocol: number }
  | { type: 'start'; hostStone: Stone; round: number; rule: Rule; opening: Opening }
  /** RIF opening: the tentative white's decision after three stones. */
  | { type: 'swap'; swap: boolean }
  /** RIF opening: black's two candidate 5th moves. */
  | { type: 'offer'; points: Array<[number, number]> }
  /** RIF opening: the 5th move white keeps. */
  | { type: 'choose'; x: number; y: number }
  /** The sender's moves are now (or no longer) played by the master. */
  | { type: 'delegate'; on: boolean }
  /** Ask to take back `count` moves from a game that is `index` moves long. */
  | { type: 'undo-request'; count: 1 | 2; index: number }
  /** The answer to the request for a game `index` moves long (so a stale answer cannot match a newer request). */
  | { type: 'undo-reply'; accept: boolean; index: number }
  /** The requester saw the acceptance and took the moves back: the accepter does the same now. */
  | { type: 'undo-commit'; index: number }
  /** The requester gave up waiting: an acceptance still in flight must not be acted on. */
  | { type: 'undo-cancel'; index: number }
  | { type: 'move'; x: number; y: number; index: number }
  | { type: 'resign' }
  | { type: 'rematch' }
  | { type: 'full' }
  | { type: 'ping' }
  | { type: 'bye' };

export type Role = 'host' | 'guest';

const isInt = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** Data from the other peer is untrusted: accept only well-formed messages. */
export function parseMessage(data: unknown): NetMessage | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case 'hello':
      return typeof m.name === 'string' ? { type: 'hello', name: m.name, protocol: Number(m.protocol) || 0 } : null;
    case 'start':
      // A host from before protocol 2 sends no rule: that room is free-style.
      return (m.hostStone === 1 || m.hostStone === 2) && isInt(m.round, 1, 1e6)
        ? {
            type: 'start',
            hostStone: m.hostStone,
            round: m.round as number,
            rule: m.rule === 'renju' ? 'renju' : 'freestyle',
            // Protocol 2 hosts send no opening; the RIF opening needs renju.
            opening: m.rule === 'renju' && m.opening === 'rif' ? 'rif' : 'free',
          }
        : null;
    case 'swap':
      return typeof m.swap === 'boolean' ? { type: 'swap', swap: m.swap } : null;
    case 'offer': {
      const points = Array.isArray(m.points) ? m.points : null;
      if (!points || points.length !== 2) return null;
      const valid = points.every((p) => Array.isArray(p) && p.length === 2 && isInt(p[0], 0, 14) && isInt(p[1], 0, 14));
      return valid ? { type: 'offer', points: points.map((p) => [p[0], p[1]] as [number, number]) } : null;
    }
    case 'undo-request':
      return (m.count === 1 || m.count === 2) && isInt(m.index, 1, 225) ? { type: 'undo-request', count: m.count, index: m.index as number } : null;
    case 'undo-reply':
      return typeof m.accept === 'boolean' && isInt(m.index, 1, 225) ? { type: 'undo-reply', accept: m.accept, index: m.index as number } : null;
    case 'undo-commit':
    case 'undo-cancel':
      return isInt(m.index, 1, 225) ? { type: m.type, index: m.index as number } : null;
    case 'delegate':
      return typeof m.on === 'boolean' ? { type: 'delegate', on: m.on } : null;
    case 'choose':
      return isInt(m.x, 0, 14) && isInt(m.y, 0, 14) ? { type: 'choose', x: m.x as number, y: m.y as number } : null;
    case 'move':
      return isInt(m.x, 0, 14) && isInt(m.y, 0, 14) && isInt(m.index, 0, 224) ? { type: 'move', x: m.x as number, y: m.y as number, index: m.index as number } : null;
    case 'resign':
    case 'rematch':
    case 'full':
    case 'ping':
    case 'bye':
      return { type: m.type };
    default:
      return null;
  }
}

async function createPeer(id?: string): Promise<PeerType> {
  const { Peer } = await import('peerjs');
  return await new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const onError = (error: Error & { type?: string }) => {
      peer.destroy();
      reject(error);
    };
    peer.once('open', () => {
      peer.off('error', onError);
      resolve(peer);
    });
    peer.once('error', onError);
  });
}

/**
 * The rule a room actually plays: renju only if the guest's client knows it,
 * otherwise an older guest would accept moves the host refuses.
 */
export function agreedRule(wanted: Rule, opponentProtocol: number): Rule {
  return wanted === 'renju' && opponentProtocol >= RENJU_PROTOCOL ? 'renju' : 'freestyle';
}

/**
 * The rule and opening a room actually plays, given what the host asked for and
 * the guest's protocol: each feature is dropped if the guest's client predates it.
 */
export function agreedVariant(wanted: Variant, opponentProtocol: number): Variant {
  const rule = agreedRule(wanted.rule, opponentProtocol);
  return { rule, opening: rule === 'renju' && wanted.opening === 'rif' && opponentProtocol >= OPENING_PROTOCOL ? 'rif' : 'free' };
}

export function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function roomLink(code: string) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

/** An open connection between the two players. */
export class OnlineLink {
  opponentName = '好友';
  /** Protocol from the opponent's hello; 0 until it arrives. */
  opponentProtocol = 0;
  /** Resolves when the opponent's hello has arrived. */
  readonly greeted: Promise<void>;
  private resolveGreeted: () => void = () => undefined;
  private listeners = new Set<(message: NetMessage) => void>();
  private closeListeners = new Set<(reason: string) => void>();
  private lastSeen = Date.now();
  private pinger: number;
  private closed = false;

  constructor(
    readonly role: Role,
    readonly code: string,
    private peer: PeerType,
    private conn: DataConnection,
  ) {
    this.greeted = new Promise((resolve) => {
      this.resolveGreeted = resolve;
    });
    conn.on('data', (data) => {
      this.lastSeen = Date.now();
      const message = parseMessage(data);
      if (!message || message.type === 'ping') return;
      if (message.type === 'bye') {
        this.finish('对手已离开房间');
        return;
      }
      if (message.type === 'full') {
        this.finish('房间已满');
        return;
      }
      if (message.type === 'hello') {
        this.opponentName = message.name.slice(0, 12) || '好友';
        this.opponentProtocol = message.protocol;
        this.resolveGreeted();
      }
      for (const listener of this.listeners) listener(message);
    });
    conn.on('close', () => this.finish('连接已断开'));
    conn.on('error', () => this.finish('连接出错'));
    peer.on('disconnected', () => {
      // The broker link dropped; the data channel may still be alive, so try to reconnect quietly.
      if (!this.closed) peer.reconnect();
    });
    this.pinger = window.setInterval(() => {
      this.send({ type: 'ping' });
      if (Date.now() - this.lastSeen > TIMEOUT_MS) this.finish('对手网络中断');
    }, PING_MS);
  }

  get isOpen() {
    return !this.closed;
  }

  send(message: NetMessage) {
    if (this.closed || !this.conn.open) return;
    this.conn.send(message);
  }

  onMessage(listener: (message: NetMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onClose(listener: (reason: string) => void) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  private finish(reason: string) {
    if (this.closed) return;
    this.closed = true;
    window.clearInterval(this.pinger);
    for (const listener of this.closeListeners) listener(reason);
    this.listeners.clear();
    this.closeListeners.clear();
    try {
      this.conn.close();
    } catch {
      /* already closed */
    }
    this.peer.destroy();
  }

  /**
   * Leave on purpose: tell the other side first. Our own listeners are dropped
   * right away, since "the opponent left" handlers must not fire for our own exit.
   */
  close() {
    if (this.closed) return;
    this.listeners.clear();
    this.closeListeners.clear();
    this.send({ type: 'bye' });
    window.setTimeout(() => this.finish('你离开了房间'), 120);
  }
}

export type HostedRoom = {
  code: string;
  link: string;
  cancel: () => void;
};

/**
 * Open a room and wait for one guest. Retries with a new code if the id is taken.
 * `onGuest` fires once, with the link already open and greetings exchanged.
 */
export async function hostRoom(name: string, onGuest: (link: OnlineLink) => void): Promise<HostedRoom> {
  let peer: PeerType | null = null;
  let code = '';
  for (let attempt = 0; attempt < 4 && !peer; attempt += 1) {
    code = randomCode();
    try {
      peer = await createPeer(PREFIX + code);
    } catch (error) {
      if ((error as { type?: string }).type !== 'unavailable-id') throw error;
    }
  }
  if (!peer) throw new Error('无法创建房间，请稍后再试');

  const host = peer;
  let taken = false;
  host.on('connection', (conn) => {
    conn.on('open', () => {
      if (taken) {
        conn.send({ type: 'full' } satisfies NetMessage);
        window.setTimeout(() => conn.close(), 200);
        return;
      }
      taken = true;
      const link = new OnlineLink('host', code, host, conn);
      link.send({ type: 'hello', name, protocol: PROTOCOL });
      onGuest(link);
    });
  });

  return {
    code,
    link: roomLink(code),
    cancel: () => {
      if (!taken) host.destroy();
    },
  };
}

/** Join a room by code. Rejects with a readable message when it does not exist. */
export async function joinRoom(code: string, name: string): Promise<OnlineLink> {
  const peer = await createPeer();
  return await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      peer.destroy();
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail('连接超时，请检查房间号或网络'), 12000);
    // Only errors before the connection opens mean "could not join"; later ones
    // (e.g. the signalling server blipping) must not kill a live game.
    peer.on('error', (error: Error & { type?: string }) => fail(error.type === 'peer-unavailable' ? '房间不存在或已关闭' : '连接失败，请稍后再试'));
    const conn = peer.connect(PREFIX + code, { reliable: true });
    conn.on('open', () => {
      if (settled) {
        conn.close();
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      const link = new OnlineLink('guest', code, peer, conn);
      link.send({ type: 'hello', name, protocol: PROTOCOL });
      resolve(link);
    });
  });
}
