import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  LANEFOLD_CONFIG,
  mergeScore,
} from '../config';
import type {
  ChangedCell,
  Direction,
  Grid,
  MergeEvent,
  MoveResolution,
  Position,
  Tile,
  TileSpawnEvent,
} from '../types';

function createRow(): Array<Tile | null> {
  return Array.from({ length: BOARD_WIDTH }, () => null);
}

export function createEmptyGrid(): Grid {
  return Array.from({ length: BOARD_HEIGHT }, createRow);
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.map((tile) => (tile ? { ...tile } : null)));
}

export function randomEmptyCell(grid: Grid, rng: () => number): Position | null {
  const emptyCells: Position[] = [];

  for (let row = 0; row < BOARD_HEIGHT; row += 1) {
    for (let col = 0; col < BOARD_WIDTH; col += 1) {
      if (!grid[row][col]) {
        emptyCells.push({ row, col });
      }
    }
  }

  if (emptyCells.length === 0) {
    return null;
  }

  const choice = Math.floor(rng() * emptyCells.length);
  return emptyCells[choice] ?? null;
}

export function spawnRandomTile(
  grid: Grid,
  nextId: number,
  rng: () => number,
): { grid: Grid; nextId: number; spawnedTile: TileSpawnEvent | null } {
  const position = randomEmptyCell(grid, rng);

  if (!position) {
    return {
      grid,
      nextId,
      spawnedTile: null,
    };
  }

  const pool = LANEFOLD_CONFIG.board.newTileRankPool;
  const rank = pool[Math.floor(rng() * pool.length)] ?? pool[0];
  const nextGrid = cloneGrid(grid);

  nextGrid[position.row][position.col] = {
    id: nextId,
    rank,
  };

  return {
    grid: nextGrid,
    nextId: nextId + 1,
    spawnedTile: {
      row: position.row,
      col: position.col,
      rank,
    },
  };
}

export function spawnTileWithRank(
  grid: Grid,
  nextId: number,
  rng: () => number,
  rank: number,
): { grid: Grid; nextId: number; spawnedTile: TileSpawnEvent | null } {
  const position = randomEmptyCell(grid, rng);

  if (!position) {
    return {
      grid,
      nextId,
      spawnedTile: null,
    };
  }

  const nextGrid = cloneGrid(grid);

  nextGrid[position.row][position.col] = {
    id: nextId,
    rank,
  };

  return {
    grid: nextGrid,
    nextId: nextId + 1,
    spawnedTile: {
      row: position.row,
      col: position.col,
      rank,
    },
  };
}

function getLinePositions(index: number, direction: Direction): Position[] {
  const positions: Position[] = [];

  for (let offset = 0; offset < BOARD_WIDTH; offset += 1) {
    switch (direction) {
      case 'left':
        positions.push({ row: index, col: offset });
        break;
      case 'right':
        positions.push({ row: index, col: BOARD_WIDTH - 1 - offset });
        break;
      case 'up':
        positions.push({ row: offset, col: index });
        break;
      case 'down':
        positions.push({ row: BOARD_HEIGHT - 1 - offset, col: index });
        break;
    }
  }

  return positions;
}

function sameTile(a: Tile | null, b: Tile | null): boolean {
  return a?.id === b?.id && a?.rank === b?.rank;
}

export function canAnyMove(grid: Grid): boolean {
  for (let row = 0; row < BOARD_HEIGHT; row += 1) {
    for (let col = 0; col < BOARD_WIDTH; col += 1) {
      const tile = grid[row][col];

      if (!tile) {
        return true;
      }

      const right = grid[row][col + 1];
      const down = grid[row + 1]?.[col];

      if (right && right.rank === tile.rank) {
        return true;
      }

      if (down && down.rank === tile.rank) {
        return true;
      }
    }
  }

  return false;
}

export function moveBoard(
  grid: Grid,
  direction: Direction,
  nextId: number,
): MoveResolution {
  const working = createEmptyGrid();
  const merges: MergeEvent[] = [];
  const changedCells: ChangedCell[] = [];
  let changed = false;
  let scoreGain = 0;
  let currentId = nextId;
  const lineCount = direction === 'left' || direction === 'right' ? BOARD_HEIGHT : BOARD_WIDTH;

  for (let index = 0; index < lineCount; index += 1) {
    const positions = getLinePositions(index, direction);
    const originalTiles = positions
      .map(({ row, col }) => grid[row][col])
      .filter((tile): tile is Tile => tile !== null);

    const resolvedLine: Array<Tile | null> = Array.from(
      { length: positions.length },
      () => null,
    );

    let cursor = 0;

    for (let sourceIndex = 0; sourceIndex < originalTiles.length; sourceIndex += 1) {
      const currentTile = originalTiles[sourceIndex];
      const nextTile = originalTiles[sourceIndex + 1];

      if (nextTile && nextTile.rank === currentTile.rank) {
        const mergedRank = currentTile.rank + LANEFOLD_CONFIG.board.mergeRankStep;
        const mergedTile: Tile = {
          id: currentId,
          rank: mergedRank,
        };

        resolvedLine[cursor] = mergedTile;
        currentId += 1;
        sourceIndex += 1;

        const target = positions[cursor];

        merges.push({
          row: target.row,
          col: target.col,
          rank: mergedRank,
          value: mergeScore(mergedRank),
        });
        scoreGain += mergeScore(mergedRank);
      } else {
        resolvedLine[cursor] = { ...currentTile };
      }

      cursor += 1;
    }

    positions.forEach((position, lineOffset) => {
      const resolvedTile = resolvedLine[lineOffset];
      working[position.row][position.col] = resolvedTile;

      if (!sameTile(grid[position.row][position.col], resolvedTile)) {
        changed = true;
      }

      if (resolvedTile) {
        changedCells.push({
          row: position.row,
          col: position.col,
          rank: resolvedTile.rank,
        });
      }
    });
  }

  return {
    changed,
    grid: changed ? working : cloneGrid(grid),
    merges,
    changedCells,
    scoreGain,
    nextId: currentId,
  };
}
