"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Phone, UserRound } from "lucide-react";
import {
  PICK_REVEAL_DURATION_MS,
  PickerCanvas,
  type CellTone,
  type PickerCell,
} from "./PickerCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "whatap-picker-display-v8";
const BOARD_COLUMNS = 50;
const BOARD_ROWS = 10;
const BOARD_CELL_COUNT = BOARD_COLUMNS * BOARD_ROWS;
const TEST_PARTICIPANT_NAME = "whatap";
const TEST_PARTICIPANT_PHONE_LAST_FOUR = "1111";
const RESULT_HOLD_DURATION_MS = 1500;

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
  participantName?: string;
  participantPhoneLastFour?: string;
  isMock?: boolean;
};

type PickerState = {
  eventTitle: string;
  prizes: Prize[];
  cells: PickerCell[];
  results: PickResult[];
};

type ParticipantForm = {
  lastName: string;
  firstName: string;
  phoneLastFour: string;
};

type Participant = {
  lastName: string;
  firstName: string;
  phoneLastFour: string;
};

type MockTestPrize = Pick<Prize, "rank" | "name">;

const defaultPrizes: Prize[] = [
  { rank: "1등", name: "프리미엄 굿즈", count: 10 },
  { rank: "2등", name: "텀블러", count: 40 },
  { rank: "3등", name: "스티커팩", count: 90 },
  { rank: "4등", name: "쿠폰", count: 160 },
  { rank: "5등", name: "참가 기념품", count: 200 },
];

const mockTestPrizes: MockTestPrize[] = [
  { rank: "1등", name: "Mock 프리미엄 굿즈" },
  { rank: "2등", name: "Mock 텀블러" },
  { rank: "3등", name: "Mock 스티커팩" },
  { rank: "4등", name: "Mock 쿠폰" },
  { rank: "5등", name: "Mock 참가 기념품" },
];

const defaultState: PickerState = {
  eventTitle: "Whatap 경품 뽑기",
  prizes: defaultPrizes,
  cells: buildCells(defaultPrizes),
  results: [],
};

export default function App() {
  const [state, setState] = useState<PickerState>(() => loadState());
  const [participantForm, setParticipantForm] = useState<ParticipantForm>({
    lastName: "",
    firstName: "",
    phoneLastFour: "",
  });
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);
  const [participantError, setParticipantError] = useState("");
  const [isCheckingParticipant, setIsCheckingParticipant] = useState(false);
  const [selectedResult, setSelectedResult] = useState<PickResult | null>(null);
  const [activePickKey, setActivePickKey] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const revealTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const drawEffectRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current);
      }
      if (resultTimerRef.current !== null) {
        window.clearTimeout(resultTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRevealing) return;

    const video = drawEffectRef.current;
    if (!video) return;

    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, [activePickKey, isRevealing]);

  function updateState(nextState: PickerState) {
    setState(nextState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  }

  async function submitParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextParticipant: Participant = {
      lastName: participantForm.lastName.trim(),
      firstName: participantForm.firstName.trim(),
      phoneLastFour: digitsOnly(participantForm.phoneLastFour).slice(0, 4),
    };

    if (!nextParticipant.lastName || !nextParticipant.firstName || nextParticipant.phoneLastFour.length !== 4) {
      setParticipantError("고객 성, 이름과 전화번호 뒷자리 4자리를 입력해주세요.");
      return;
    }

    if (isMockTestParticipant(nextParticipant)) {
      setIsTestMode(true);
      setParticipant(nextParticipant);
      return;
    }

    setParticipantError("");
    setIsCheckingParticipant(true);

    const isSurveyParticipant = await verifyParticipant(nextParticipant);
    setIsCheckingParticipant(false);

    if (!isSurveyParticipant) {
      setParticipantError("설문 제출 내역을 찾을 수 없습니다.");
      return;
    }

    setParticipant(nextParticipant);
  }

  function updateParticipantField(field: keyof ParticipantForm, value: string) {
    const nextValue = field === "phoneLastFour" ? digitsOnly(value).slice(0, 4) : value;
    setParticipantForm((current) => ({ ...current, [field]: nextValue }));

    if (participantError) {
      setParticipantError("");
    }
  }

  function finishCycle() {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }

    setSelectedResult(null);
    setActivePickKey(null);
    setIsRevealing(false);
    setParticipant(null);
    setIsTestMode(false);
    setParticipantForm({
      lastName: "",
      firstName: "",
      phoneLastFour: "",
    });
    setParticipantError("");
  }

  function showResult(result: PickResult) {
    setSelectedResult(result);

    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
    }

    resultTimerRef.current = window.setTimeout(() => {
      resultTimerRef.current = null;
      if (result.isMock) {
        setSelectedResult(null);
        return;
      }

      finishCycle();
    }, RESULT_HOLD_DURATION_MS);
  }

  function clearRevealTimer() {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  function selectMockPrize(prize: MockTestPrize) {
    if (!participant || !isTestMode || isRevealing) return;

    const result: PickResult = {
      id: `mock-${prize.rank}`,
      cellNumber: 0,
      rank: prize.rank,
      name: prize.name,
      pickedAt: new Date().toLocaleString("ko-KR"),
      participantName: participantFullName(participant),
      participantPhoneLastFour: participant.phoneLastFour,
      isMock: true,
    };

    setActivePickKey(result.id);
    setIsRevealing(true);
    clearRevealTimer();

    revealTimerRef.current = window.setTimeout(() => {
      showResult(result);
      setIsRevealing(false);
      setActivePickKey(null);
      revealTimerRef.current = null;
    }, PICK_REVEAL_DURATION_MS);
  }

  function pickCell(index: number) {
    const cell = state.cells[index];
    if (!cell || cell.picked || isRevealing || !participant) return;

    const pickedAt = new Date().toLocaleString("ko-KR");
    const result: PickResult = {
      id: cell.id,
      cellNumber: index + 1,
      rank: cell.rank,
      name: cell.name,
      pickedAt,
      participantName: participantFullName(participant),
      participantPhoneLastFour: participant.phoneLastFour,
    };
    const nextCells = state.cells.map((item, cellIndex) =>
      cellIndex === index ? { ...item, picked: true } : item,
    );

    setActivePickKey(cell.id);
    setIsRevealing(true);
    clearRevealTimer();

    revealTimerRef.current = window.setTimeout(() => {
      updateState({
        ...state,
        cells: nextCells,
        results: [result, ...state.results],
      });
      showResult(result);
      setIsRevealing(false);
      setActivePickKey(null);
      revealTimerRef.current = null;
    }, PICK_REVEAL_DURATION_MS);
  }

  const resultOverlay = selectedResult ? (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="select-none text-[96px] font-black leading-none text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:text-[132px]">
        {selectedResult.rank}
      </div>
    </div>
  ) : null;

  const drawEffect = (
    <video
      ref={drawEffectRef}
      src="/draw-reveal-effect.webm"
      className={`pointer-events-none absolute left-1/2 top-1/2 z-10 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 object-contain transition-opacity duration-150 ${
        isRevealing ? "opacity-100" : "opacity-0"
      }`}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  );

  if (!participant) {
    return (
      <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
        <header className="flex h-[92px] shrink-0 items-center justify-center">
          <img
            src="/WhaTap_basic_logo.png"
            alt="WhaTap"
            className="h-[48px] w-auto object-contain"
          />
        </header>

        <section className="flex min-h-0 flex-1 items-center justify-center">
          <form
            className="w-full max-w-[420px] rounded-lg border bg-card p-6 shadow-sm"
            onSubmit={submitParticipant}
          >
            <div className="mb-6">
              <Badge className="mb-3 px-3 py-1 text-sm">참여자 확인</Badge>
              <h1 className="text-2xl font-bold tracking-normal text-foreground">설문 참여 정보 입력</h1>
            </div>

            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-2">
                  <Label htmlFor="participant-last-name">성</Label>
                  <div className="relative">
                    <UserRound
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="participant-last-name"
                      value={participantForm.lastName}
                      onChange={(event) => updateParticipantField("lastName", event.target.value)}
                      placeholder="홍"
                      className="h-12 pl-9 text-base"
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="participant-first-name">이름</Label>
                  <Input
                    id="participant-first-name"
                    value={participantForm.firstName}
                    onChange={(event) => updateParticipantField("firstName", event.target.value)}
                    placeholder="길동"
                    className="h-12 text-base"
                    autoComplete="given-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="participant-phone-last-four">전화번호 뒷자리</Label>
                <div className="relative">
                  <Phone
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="participant-phone-last-four"
                    value={participantForm.phoneLastFour}
                    onChange={(event) => updateParticipantField("phoneLastFour", event.target.value)}
                    placeholder="1234"
                    className="h-12 pl-9 text-base"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="tel"
                  />
                </div>
              </div>
            </div>

            {participantError ? (
              <p className="mt-4 text-sm font-medium text-destructive">{participantError}</p>
            ) : null}

            <Button type="submit" className="mt-6 h-12 w-full gap-2 text-base" disabled={isCheckingParticipant}>
              {isCheckingParticipant ? "확인 중" : "뽑기 시작"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </section>
      </main>
    );
  }

  if (isTestMode) {
    return (
      <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
        <header className="flex h-[92px] shrink-0 items-center justify-between gap-4">
          <div className="w-[180px]" aria-hidden="true" />
          <img
            src="/WhaTap_basic_logo.png"
            alt="WhaTap"
            className="h-[48px] w-auto object-contain"
          />
          <div className="flex w-[180px] justify-end">
            <Badge variant="secondary" className="max-w-full truncate px-3 py-1 text-sm">
              Mock · {participantFullName(participant)}
            </Badge>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="min-h-0 flex-1 rounded-lg border bg-card p-4 shadow-sm">
            <div className="relative h-full w-full overflow-hidden rounded-md">
              <PickerCanvas
                cells={state.cells}
                columns={BOARD_COLUMNS}
                rows={BOARD_ROWS}
                activePickKey={null}
                isRevealing={isRevealing}
                onPick={() => undefined}
              />
              {drawEffect}
              {resultOverlay}
            </div>
          </div>

          <div className="shrink-0 rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <Badge className="mb-2 px-3 py-1 text-sm">뽑기 테스트</Badge>
                <h1 className="text-xl font-bold tracking-normal text-foreground">테스트 등수 선택</h1>
              </div>
              <Button type="button" variant="ghost" onClick={finishCycle}>
                입력 폼으로 돌아가기
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-5">
              {mockTestPrizes.map((prize) => (
                <Button
                  key={prize.rank}
                  type="button"
                  variant="outline"
                  className="h-20 flex-col gap-1 px-3 text-center"
                  disabled={isRevealing}
                  onClick={() => selectMockPrize(prize)}
                >
                  <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                  <span className="text-xl font-bold">{prize.rank}</span>
                  <span className="max-w-full truncate text-xs font-medium text-muted-foreground">
                    {prize.name}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
      <header className="flex h-[92px] shrink-0 items-center justify-between gap-4">
        <div className="w-[180px]" aria-hidden="true" />
        <img
          src="/WhaTap_basic_logo.png"
          alt="WhaTap"
          className="h-[48px] w-auto object-contain"
        />
        <div className="flex w-[180px] justify-end">
          <Badge variant="secondary" className="max-w-full truncate px-3 py-1 text-sm">
            {participantFullName(participant)} · {participant.phoneLastFour}
          </Badge>
        </div>
      </header>

      <section className="min-h-0 flex-1 rounded-lg border bg-card p-4 shadow-sm">
        <div className="relative h-full w-full overflow-hidden rounded-md">
          <PickerCanvas
            cells={state.cells}
            columns={BOARD_COLUMNS}
            rows={BOARD_ROWS}
            activePickKey={null}
            isRevealing={isRevealing}
            onPick={pickCell}
          />
          {drawEffect}
          {resultOverlay}
        </div>
      </section>
    </main>
  );
}

function isMockTestParticipant(participant: Participant) {
  return (
    participantFullName(participant).toLowerCase() === TEST_PARTICIPANT_NAME &&
    participant.phoneLastFour === TEST_PARTICIPANT_PHONE_LAST_FOUR
  );
}

function participantFullName(participant: Participant) {
  return `${participant.lastName}${participant.firstName}`;
}

async function verifyParticipant(participant: Participant) {
  void participant;
  return true;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
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
