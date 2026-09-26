import type { Stone } from '../rules';
import { type BrainId, chooseMove } from './brains';

export type AiRequest = { id: number; brain: BrainId; board: Uint8Array; stone: Stone };
export type AiResponse = { id: number; x: number; y: number };

self.onmessage = (event: MessageEvent<AiRequest>) => {
  const { id, brain, board, stone } = event.data;
  const move = chooseMove(brain, board, stone);
  (self as unknown as Worker).postMessage({ id, x: move.x, y: move.y } satisfies AiResponse);
};
