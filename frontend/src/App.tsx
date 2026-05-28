import { useState } from "react";
import { PickerCanvas, type CellTone, type PickerCell } from "./PickerCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "whatap-picker-display-v5";
const BOARD_COLUMNS = 50;
const BOARD_ROWS = 10;
const BOARD_CELL_COUNT = BOARD_COLUMNS * BOARD_ROWS;

type Prize = {
  rank: string;
  name: string;
  count: number;
};

type PickResult = {
  id: string;
  cellNumber: number;
  rank: string;
  name: string;
  pickedAt: string;
};

type PickerState = {
  eventTitle: string;
  prizes: Prize[];
  cells: PickerCell[];
  results: PickResult[];
};

const defaultPrizes: Prize[] = [
  { rank: "1등", name: "프리미엄 굿즈", count: 10 },
  { rank: "2등", name: "텀블러", count: 40 },
  { rank: "3등", name: "스티커팩", count: 90 },
  { rank: "4등", name: "쿠폰", count: 160 },
  { rank: "5등", name: "참가 기념품", count: 200 },
];

const defaultState: PickerState = {
  eventTitle: "Whatap 경품 뽑기",
  prizes: defaultPrizes,
  cells: buildCells(defaultPrizes),
  results: [],
};

export default function App() {
  const [state, setState] = useState<PickerState>(() => loadState());
  const [resultOpen, setResultOpen] = useState(false);
  const [selectedResult, setSelectedResult] = useState<PickResult | null>(null);
  const [pickedAnimationKey, setPickedAnimationKey] = useState<string | null>(null);

  function updateState(nextState: PickerState) {
    setState(nextState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }

  function pickCell(index: number) {
    const cell = state.cells[index];
    if (!cell || cell.picked) return;

    const pickedAt = new Date().toLocaleString("ko-KR");
    const result: PickResult = {
      id: cell.id,
      cellNumber: index + 1,
      rank: cell.rank,
      name: cell.name,
      pickedAt,
    };
    const nextCells = state.cells.map((item, cellIndex) =>
      cellIndex === index ? { ...item, picked: true } : item,
    );

    updateState({
      ...state,
      cells: nextCells,
      results: [result, ...state.results],
    });
    setPickedAnimationKey(cell.id);
    setSelectedResult(result);
    setResultOpen(true);
  }

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
      <header className="flex h-[92px] shrink-0 items-center justify-center">
        <img
          src="/WhaTap_basic_logo.png"
          alt="WhaTap"
          className="h-[48px] w-auto object-contain"
        />
      </header>

      <section className="min-h-0 flex-1 rounded-lg border bg-card p-4 shadow-sm">
        <div className="h-full w-full">
          <PickerCanvas
            cells={state.cells}
            columns={BOARD_COLUMNS}
            rows={BOARD_ROWS}
            pickedAnimationKey={pickedAnimationKey}
            onPick={pickCell}
          />
        </div>
      </section>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader className="items-center text-center">
            <Badge className="mb-2 px-3 py-1 text-sm">{selectedResult?.rank}</Badge>
            <DialogTitle className="text-[42px] leading-tight">{selectedResult?.name}</DialogTitle>
            <DialogDescription>
              {selectedResult?.cellNumber}번 칸 · {selectedResult?.pickedAt}
            </DialogDescription>
          </DialogHeader>
          <Button type="button" onClick={() => setResultOpen(false)}>
            확인
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function loadState(): PickerState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return defaultState;

  try {
    const parsed = JSON.parse(saved) as PickerState;
    const prizes = normalizePrizes(parsed.prizes);
    if (prizeTotalOf(prizes) !== BOARD_CELL_COUNT || parsed.cells?.length !== BOARD_CELL_COUNT) {
      return defaultState;
    }

    return {
      eventTitle: parsed.eventTitle || defaultState.eventTitle,
      prizes,
      cells: parsed.cells,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };
  } catch {
    return defaultState;
  }
}

function normalizePrizes(prizes: Prize[]) {
  const list = Array.isArray(prizes) && prizes.length > 0 ? prizes : defaultPrizes;
  return list
    .map((prize, index) => ({
      rank: String(prize.rank || `${index + 1}등`).trim(),
      name: String(prize.name || "경품").trim(),
      count: safeCount(prize.count),
    }))
    .filter((prize) => prize.name && prize.count > 0);
}

function safeCount(value: number) {
  return Math.max(0, Number(value) || 0);
}

function prizeTotalOf(prizes: Prize[]) {
  return prizes.reduce((sum, prize) => sum + safeCount(prize.count), 0);
}

function buildCells(prizes: Prize[]): PickerCell[] {
  const normalizedPrizes = normalizePrizes(prizes);
  const pool = normalizedPrizes.flatMap((prize, prizeIndex) =>
    Array.from({ length: prize.count }, () => ({
      prizeIndex,
      rank: prize.rank,
      name: prize.name,
    })),
  );
  const tones = buildTonePattern();

  return shuffle(pool).slice(0, BOARD_CELL_COUNT).map((prize, index) => ({
    id: `cell-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    picked: false,
    tone: tones[index],
    ...prize,
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
    const jitter = Math.random() * 1.8;
    return Math.max(3, Math.min(BOARD_ROWS, Math.round(4.4 + wave + spike + jitter)));
  });

  return Array.from({ length: BOARD_CELL_COUNT }, (_, index) => {
    const column = index % BOARD_COLUMNS;
    const row = Math.floor(index / BOARD_COLUMNS);
    const rowFromBottom = BOARD_ROWS - 1 - row;
    const height = columnHeights[column];

    if (rowFromBottom >= height) {
      if (rowFromBottom === height && Math.random() < 0.14) return Math.random() < 0.72 ? "blue" : "yellow";
      if (rowFromBottom >= BOARD_ROWS - 2 && Math.random() < 0.018) return "blue";
      return "white";
    }

    if (rowFromBottom > 1 && Math.random() < 0.08) return "white";
    if (rowFromBottom === 0) return Math.random() < 0.78 ? "red" : Math.random() < 0.62 ? "yellow" : "blue";
    if (rowFromBottom === 1 && Math.random() < 0.16) return "red";
    if (rowFromBottom <= 3) return Math.random() < 0.5 ? "yellow" : "blue";
    return Math.random() < 0.78 ? "blue" : "yellow";
  });
}

function spikeWeight(column: number, center: number) {
  return Math.max(0, 1 - Math.abs(column - center) / 3);
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}
