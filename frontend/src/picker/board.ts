import type { ApiPrize } from "@/lib/draw-api";
import {
  BOARD_CELL_COUNT,
  BOARD_COLUMNS,
  BOARD_ROWS,
  PICKED_CELLS_STORAGE_KEY,
} from "@/picker/constants";
import type { PickedCellsByEvent, PickerState, Prize } from "@/picker/types";
import { safeCount } from "@/picker/utils";
import type { CellTone, PickerCell } from "@/PickerCanvas";

export function emptyPickerState(eventCode = ""): PickerState {
  return {
    eventCode,
    eventTitle: "Whatap 경품 뽑기",
    prizes: [],
    cells: [],
    results: [],
  };
}

export function createPickerState(
  prizes: Prize[],
  eventCode = "",
  pickedCellIndexes: number[] = [],
  remainingCount = prizeTotalOf(prizes),
): PickerState {
  const normalizedPrizes = normalizePrizes(prizes);
  if (normalizedPrizes.length === 0) {
    return emptyPickerState(eventCode);
  }

  return {
    eventCode,
    eventTitle: "Whatap 경품 뽑기",
    prizes: normalizedPrizes,
    cells: applyPickedAndStockLimit(
      buildCells(normalizedPrizes),
      eventCode,
      pickedCellIndexes,
      remainingCount,
    ),
    results: [],
  };
}

export function loadPickerState(): PickerState {
  return emptyPickerState();
}

export function prizesFromInventory(prizes: ApiPrize[]) {
  if (!Array.isArray(prizes)) return [];

  return prizes
    .map((prize, index) => {
      const rank = Math.max(1, Number(prize.rank) || index + 1);

      return {
        rank: `${rank}등`,
        name: String(prize.name || "경품").trim(),
        count: safeCount(prize.initial),
      };
    })
    .filter((prize) => prize.name && prize.count > 0);
}

export function prizeTotalOf(prizes: Prize[]) {
  return prizes.reduce((sum, prize) => sum + safeCount(prize.count), 0);
}

export function remainingTotalOf(prizes: ApiPrize[]) {
  return prizes.reduce((sum, prize) => sum + safeCount(prize.remaining), 0);
}

export function readPickedCellIndexes(eventCode: string) {
  if (!eventCode) return [];
  return readPickedCellsByEvent()[eventCode] ?? [];
}

export function rememberPickedCellIndex(eventCode: string | undefined, index: number) {
  if (!eventCode) return;

  const current = readPickedCellsByEvent();
  writePickedCellsByEvent({
    ...current,
    [eventCode]: normalizePickedCellIndexes([...(current[eventCode] ?? []), index]),
  });
}

export function clearPickedCellIndexes(eventCode: string) {
  if (!eventCode) return;

  const current = readPickedCellsByEvent();
  const next = { ...current };
  delete next[eventCode];
  writePickedCellsByEvent(next);
}

function normalizePrizes(prizes: Prize[]) {
  const list = Array.isArray(prizes) ? prizes : [];
  return list
    .map((prize, index) => ({
      rank: String(prize.rank || `${index + 1}등`).trim(),
      name: String(prize.name || "경품").trim(),
      count: safeCount(prize.count),
    }))
    .filter((prize) => prize.name && prize.count > 0);
}

function buildCells(prizes: Prize[]): PickerCell[] {
  const normalizedPrizes = normalizePrizes(prizes);
  if (normalizedPrizes.length === 0) return [];

  const assignedPrizes: Array<{ prizeIndex: number; rank: string; name: string } | undefined> =
    Array.from({ length: BOARD_CELL_COUNT });
  const prizeOrder = deterministicIndexOrder("prize-layout");
  let orderIndex = 0;

  normalizedPrizes.forEach((prize, prizeIndex) => {
    for (let count = 0; count < prize.count && orderIndex < BOARD_CELL_COUNT; count += 1) {
      assignedPrizes[prizeOrder[orderIndex]] = {
        prizeIndex,
        rank: prize.rank,
        name: prize.name,
      };
      orderIndex += 1;
    }
  });

  const fallbackPrize = {
    prizeIndex: 0,
    rank: normalizedPrizes[0].rank,
    name: normalizedPrizes[0].name,
  };
  const tones = buildTonePattern();

  return assignedPrizes.map((prize, index) => ({
    id: `cell-${index}`,
    picked: false,
    empty: false,
    tone: tones[index],
    ...(prize ?? fallbackPrize),
  }));
}

function buildTonePattern(): CellTone[] {
  const columnHeights = Array.from({ length: BOARD_COLUMNS }, (_, column) => {
    const wave = Math.sin(column * 0.41) * 1.25 + Math.cos(column * 0.23) * 0.95;
    const spike =
      spikeWeight(column, 3) * 3.8 +
      spikeWeight(column, 18) * 2.7 +
      spikeWeight(column, 39) * 3.5 +
      spikeWeight(column, 45) * 2.8;
    const jitter = deterministicNumber(`height:${column}`) * 1.8;
    return Math.max(3, Math.min(BOARD_ROWS, Math.round(4.4 + wave + spike + jitter)));
  });

  return Array.from({ length: BOARD_CELL_COUNT }, (_, index) => {
    const column = index % BOARD_COLUMNS;
    const row = Math.floor(index / BOARD_COLUMNS);
    const rowFromBottom = BOARD_ROWS - 1 - row;
    const height = columnHeights[column];

    if (rowFromBottom >= height) {
      if (rowFromBottom === height && deterministicNumber(`edge:${index}`) < 0.14) {
        return deterministicNumber(`edge-tone:${index}`) < 0.72 ? "blue" : "yellow";
      }
      if (rowFromBottom >= BOARD_ROWS - 2 && deterministicNumber(`outlier:${index}`) < 0.018) return "blue";
      return "white";
    }

    if (rowFromBottom > 1 && deterministicNumber(`inner-gap:${index}`) < 0.08) return "white";
    if (rowFromBottom === 0) {
      return deterministicNumber(`base:${index}`) < 0.78
        ? "red"
        : deterministicNumber(`base-alt:${index}`) < 0.62 ? "yellow" : "blue";
    }
    if (rowFromBottom === 1 && deterministicNumber(`row-one:${index}`) < 0.16) return "red";
    if (rowFromBottom <= 3) return deterministicNumber(`low:${index}`) < 0.5 ? "yellow" : "blue";
    return deterministicNumber(`high:${index}`) < 0.78 ? "blue" : "yellow";
  });
}

function spikeWeight(column: number, center: number) {
  return Math.max(0, 1 - Math.abs(column - center) / 3);
}

function applyPickedAndStockLimit(
  cells: PickerCell[],
  eventCode: string,
  pickedCellIndexes: number[],
  remainingCount: number,
) {
  const pickedSet = new Set(normalizePickedCellIndexes(pickedCellIndexes));
  const cellsWithPicked = cells.map((cell, index) => ({
    ...cell,
    picked: pickedSet.has(index),
    empty: false,
  }));
  const unpickedCount = cellsWithPicked.reduce((sum, cell) => sum + (cell.picked ? 0 : 1), 0);
  const boundedRemainingCount = Math.min(BOARD_CELL_COUNT, safeCount(remainingCount));
  const emptyCount = Math.max(0, unpickedCount - boundedRemainingCount);

  if (emptyCount === 0) return cellsWithPicked;

  const emptyIndexes = new Set(
    deterministicIndexOrder(`empty:${eventCode || "default"}`)
      .filter((index) => !pickedSet.has(index))
      .slice(0, emptyCount),
  );

  return cellsWithPicked.map((cell, index) =>
    emptyIndexes.has(index) ? { ...cell, empty: true, tone: "white" as CellTone } : cell,
  );
}

function readPickedCellsByEvent(): PickedCellsByEvent {
  if (typeof window === "undefined") return {};

  const saved = localStorage.getItem(PICKED_CELLS_STORAGE_KEY);
  if (!saved) return {};

  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      writePickedCellsByEvent({});
      return {};
    }

    const record = parsed as Record<string, unknown>;
    if ("cells" in record || "prizes" in record || "results" in record) {
      writePickedCellsByEvent({});
      return {};
    }

    return Object.fromEntries(
      Object.entries(record)
        .map(([key, value]) => [key, normalizePickedCellIndexes(value)] as const)
        .filter(([key, value]) => key.trim() && value.length > 0),
    );
  } catch {
    writePickedCellsByEvent({});
    return {};
  }
}

function writePickedCellsByEvent(store: PickedCellsByEvent) {
  if (typeof window === "undefined") return;

  const normalized = Object.fromEntries(
    Object.entries(store)
      .map(([key, value]) => [key, normalizePickedCellIndexes(value)] as const)
      .filter(([key, value]) => key.trim() && value.length > 0),
  );
  localStorage.setItem(PICKED_CELLS_STORAGE_KEY, JSON.stringify(normalized));
}

function normalizePickedCellIndexes(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item < BOARD_CELL_COUNT),
    ),
  ).sort((a, b) => a - b);
}

function deterministicIndexOrder(seed: string) {
  return Array.from({ length: BOARD_CELL_COUNT }, (_, index) => index).sort((left, right) => {
    const leftWeight = deterministicNumber(`${seed}:${left}`);
    const rightWeight = deterministicNumber(`${seed}:${right}`);
    return leftWeight === rightWeight ? left - right : leftWeight - rightWeight;
  });
}

function deterministicNumber(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}
