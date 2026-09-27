import { afterEach, describe, expect, test, vi } from 'vitest';
import { type FederatedPointerEvent, Texture } from 'pixi.js';

import { BoardView } from '../src/ui/BoardView';
import { BLACK } from '../src/gomoku/rules';

// Exercise real Pixi containers and board coordinates without loading SVGs or a GPU.
vi.mock('../src/app/textures', () => ({ tex: () => Texture.EMPTY }));

const boards: BoardView[] = [];
function setup() {
  const board = new BoardView();
  board.layout(360);
  board.acceptingInput = true;
  board.onCell = vi.fn();
  boards.push(board);
  return board;
}

function tap(board: BoardView, x: number, y: number, pointerType = 'touch') {
  board.emit('pointertap', {
    pointerType,
    global: board.toGlobal(board.toLocal2({ x, y })),
  } as FederatedPointerEvent);
}

function liftFinger(board: BoardView) {
  // Non-hovering touch pointers leave after pointerup; the next tap has a new contact.
  board.emit('pointerleave', { pointerType: 'touch' } as FederatedPointerEvent);
}

afterEach(() => {
  for (const board of boards.splice(0)) board.destroy({ children: true });
});

describe('board touch input', () => {
  test('confirms the same intersection after the first finger has lifted', () => {
    const board = setup();
    tap(board, 7, 7);
    liftFinger(board);
    expect(board.onCell).not.toHaveBeenCalled();
    expect(board.hasTouchPreview).toBe(true);
    tap(board, 7, 7);
    liftFinger(board);
    expect(board.onCell).toHaveBeenCalledExactlyOnceWith({ x: 7, y: 7 });
    expect(board.hasTouchPreview).toBe(false);
  });

  test('moving to a different intersection requires confirmation of the new point', () => {
    const board = setup();
    tap(board, 7, 7);
    liftFinger(board);
    tap(board, 8, 7);
    liftFinger(board);
    expect(board.onCell).not.toHaveBeenCalled();
    tap(board, 8, 7);
    expect(board.onCell).toHaveBeenCalledExactlyOnceWith({ x: 8, y: 7 });
  });

  test.each(['mouse', 'pen'])('%s still places with one tap', (pointerType) => {
    const board = setup();
    tap(board, 7, 7, pointerType);
    expect(board.onCell).toHaveBeenCalledExactlyOnceWith({ x: 7, y: 7 });
  });

  test.each(['pointerupoutside', 'pointercancel'] as const)('%s cancels a pending touch', (event) => {
    const board = setup();
    tap(board, 7, 7);
    board.emit(event, { pointerType: 'touch' } as FederatedPointerEvent);
    expect(board.hasTouchPreview).toBe(false);
    tap(board, 7, 7);
    expect(board.onCell).not.toHaveBeenCalled();
  });

  test.each(['hideGhost', 'clear'] as const)('%s requires a fresh confirmation', (reset) => {
    const board = setup();
    const previews: boolean[] = [];
    board.onTouchPreviewChange = () => previews.push(board.hasTouchPreview);
    tap(board, 7, 7);
    board[reset]();
    tap(board, 7, 7);
    expect(board.onCell).not.toHaveBeenCalled();
    expect(previews).toEqual([true, false, true]);
  });

  test('rejects occupied, out-of-board and disabled input', () => {
    const board = setup();
    board.placeStone(7, 7, BLACK, false);
    for (const pointerType of ['touch', 'mouse']) {
      tap(board, 7, 7, pointerType);
      tap(board, 7, 7, pointerType);
      tap(board, -1, 7, pointerType);
      tap(board, 15, 7, pointerType);
    }
    board.acceptingInput = false;
    tap(board, 8, 7);
    tap(board, 8, 7);
    expect(board.onCell).not.toHaveBeenCalled();
    expect(board.hasTouchPreview).toBe(false);
  });

  test('confirms the same grid point after resizing a scaled board', () => {
    const board = setup();
    board.position.set(20, 100);
    board.scale.set(0.8);
    tap(board, 3, 11);
    liftFinger(board);
    board.layout(600);
    tap(board, 3, 11);
    expect(board.onCell).toHaveBeenCalledExactlyOnceWith({ x: 3, y: 11 });
  });
});
