"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Phone, RotateCcw, UserRound } from "lucide-react";
import {
  PICK_REVEAL_DURATION_MS,
  PickerCanvas,
  type CellTone,
  type PickerCell,
} from "./PickerCanvas";
import { Confetti } from "./Confetti";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DrawApiError,
  drawPrize,
  fetchDrawHistory,
  fetchPrizeInventory,
  searchLeads,
  type ApiPrize,
  type DrawResponse,
  type LeadSearchItem,
} from "@/lib/draw-api";

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
  leadId?: string;
  name: string;
  phoneLastFour: string;
  eventCode?: string;
  eventDate?: string;
  company?: string;
  jobLevel?: string;
  aiStatus?: LeadSearchItem["aiStatus"];
  grade?: LeadSearchItem["grade"];
  score?: LeadSearchItem["score"];
};

type LeadOption = LeadSearchItem & {
  eventCode: string;
  eventDate: string;
};

const defaultPrizes: Prize[] = [
  { rank: "1등", name: "프리미엄 굿즈", count: 10 },
  { rank: "2등", name: "텀블러", count: 40 },
  { rank: "3등", name: "스티커팩", count: 90 },
  { rank: "4등", name: "쿠폰", count: 160 },
  { rank: "5등", name: "참가 기념품", count: 200 },
];

function createDefaultState(): PickerState {
  return {
    eventTitle: "Whatap 경품 뽑기",
    prizes: defaultPrizes,
    cells: buildCells(defaultPrizes),
    results: [],
  };
}

export default function App() {
  const [state, setState] = useState<PickerState>(() => loadState());
  const [eventCode, setEventCode] = useState("");
  const [prizeInventory, setPrizeInventory] = useState<ApiPrize[]>([]);
  const [isLoadingPrizes, setIsLoadingPrizes] = useState(false);
  const [prizeError, setPrizeError] = useState("");
  const [participantForm, setParticipantForm] = useState<ParticipantForm>({
    lastName: "",
    firstName: "",
    phoneLastFour: "",
  });
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [isTestMode, setIsTestMode] = useState(false);
  const [participantError, setParticipantError] = useState("");
  const [isCheckingParticipant, setIsCheckingParticipant] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [selectedResult, setSelectedResult] = useState<PickResult | null>(null);
  const [activePickKey, setActivePickKey] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const revealTimerRef = useRef<number | null>(null);
  const resultTimerRef = useRef<number | null>(null);
  const drawEffectRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setEventCode(readEventCode());
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const loadPrizeInventory = useCallback(async (nextEventCode: string) => {
    setIsLoadingPrizes(true);
    setPrizeError("");

    try {
      const response = await fetchPrizeInventory(nextEventCode);
      setPrizeInventory(response.prizes);
    } catch (error) {
      setPrizeInventory([]);
      setPrizeError(apiErrorMessage(error, "경품 재고를 불러오지 못했습니다."));
    } finally {
      setIsLoadingPrizes(false);
    }
  }, []);

  useEffect(() => {
    if (!eventCode) return;
    const timerId = window.setTimeout(() => {
      void loadPrizeInventory(eventCode);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [eventCode, loadPrizeInventory]);

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

  function resetPickedState() {
    clearRevealTimer();
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }

    const nextState = createDefaultState();
    setState(nextState);
    localStorage.removeItem(STORAGE_KEY);
    setDrawError("");
    setSelectedResult(null);
    setActivePickKey(null);
    setIsRevealing(false);
  }

  async function submitParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextParticipant: ParticipantForm = {
      lastName: participantForm.lastName.trim(),
      firstName: participantForm.firstName.trim(),
      phoneLastFour: digitsOnly(participantForm.phoneLastFour).slice(0, 4),
    };

    if (!nextParticipant.lastName || !nextParticipant.firstName || nextParticipant.phoneLastFour.length !== 4) {
      setParticipantError("고객 성, 이름과 전화번호 뒷자리 4자리를 입력해주세요.");
      return;
    }

    if (!eventCode) {
      setParticipantError("URL에 eventCode 파라미터가 필요합니다.");
      return;
    }

    if (isMockTestParticipant(nextParticipant)) {
      setIsTestMode(true);
      setParticipant({
        leadId: "mock-lead-whatap-1111",
        name: participantFormFullName(nextParticipant),
        phoneLastFour: nextParticipant.phoneLastFour,
        eventCode,
        eventDate: todayDateString(),
        company: "Mock Company",
        jobLevel: "MOCK",
        aiStatus: "DONE",
        grade: "A",
        score: 100,
      });
      return;
    }

    setParticipantError("");
    setLeadOptions([]);
    setIsCheckingParticipant(true);

    try {
      const response = await searchLeads({
        name: participantFormFullName(nextParticipant),
        phoneLast4: nextParticipant.phoneLastFour,
        eventCode,
      });

      const options = response.results.map((lead) => ({
        ...lead,
        eventCode: response.eventCode,
        eventDate: response.eventDate,
      }));

      if (options.length === 0) {
        setParticipantError("설문 제출 내역을 찾을 수 없습니다.");
        return;
      }

      if (options.length > 1) {
        setLeadOptions(options);
        return;
      }

      await selectLeadOption(options[0]);
    } catch (error) {
      setParticipantError(apiErrorMessage(error, "참여자 검색 중 오류가 발생했습니다."));
    } finally {
      setIsCheckingParticipant(false);
    }
  }

  function updateParticipantField(field: keyof ParticipantForm, value: string) {
    const nextValue = field === "phoneLastFour" ? digitsOnly(value).slice(0, 4) : value;
    setParticipantForm((current) => ({ ...current, [field]: nextValue }));

    if (participantError) {
      setParticipantError("");
    }

    if (leadOptions.length > 0) {
      setLeadOptions([]);
    }
  }

  async function selectLeadOption(lead: LeadOption) {
    setLeadOptions([]);

    if (lead.drawn) {
      await showAlreadyDrawnMessage(lead);
      return;
    }

    setParticipant({
      leadId: lead.leadId,
      name: lead.name,
      phoneLastFour: digitsOnly(participantForm.phoneLastFour).slice(0, 4),
      eventCode: lead.eventCode,
      eventDate: lead.eventDate,
      company: lead.company,
      jobLevel: lead.jobLevel,
      aiStatus: lead.aiStatus,
      grade: lead.grade,
      score: lead.score,
    });
    setDrawError("");
  }

  async function showAlreadyDrawnMessage(lead: LeadOption) {
    try {
      const history = await fetchDrawHistory({
        leadId: lead.leadId,
        eventCode: lead.eventCode,
      });
      setParticipantError(`이미 추첨 완료된 참여자입니다. 결과: ${drawResponseLabel(history)}`);
    } catch {
      setParticipantError("이미 추첨 완료된 참여자입니다.");
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
    setConfettiTrigger(0);
    setDrawError("");
  }

  function showResult(result: PickResult) {
    setSelectedResult(result);
    setConfettiTrigger((prev) => prev + 1);

    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
    }

    if (result.isMock) {
      resultTimerRef.current = window.setTimeout(() => {
        resultTimerRef.current = null;
        setSelectedResult(null);
      }, RESULT_HOLD_DURATION_MS);
    }
  }

  function clearRevealTimer() {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  function pickMockCell(index: number, currentParticipant: Participant) {
    const cell = state.cells[index];
    if (!cell || cell.picked || isRevealing) return;

    const result: PickResult = {
      id: `${cell.id}-mock-${Date.now()}`,
      cellNumber: index + 1,
      rank: cell.rank,
      name: cell.name,
      pickedAt: new Date().toLocaleString("ko-KR"),
      participantName: participantFullName(currentParticipant),
      participantPhoneLastFour: currentParticipant.phoneLastFour,
      isMock: true,
    };
    const nextCells = state.cells.map((item, cellIndex) =>
      cellIndex === index ? { ...item, picked: true } : item,
    );

    setActivePickKey(result.id);
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

  async function pickCell(index: number) {
    const cell = state.cells[index];
    if (!cell || cell.picked || isRevealing || !participant) return;

    if (isTestMode) {
      pickMockCell(index, participant);
      return;
    }

    if (!participant.leadId || !participant.eventDate || !participant.eventCode) {
      setDrawError("참여자 정보가 올바르지 않습니다. 다시 검색해 주세요.");
      return;
    }

    setDrawError("");
    setActivePickKey(cell.id);
    setIsRevealing(true);
    clearRevealTimer();

    const startedAt = window.performance.now();

    try {
      const response = await drawPrize({
        leadId: participant.leadId,
        eventDate: participant.eventDate,
      });
      const result = pickResultFromDrawResponse(response, cell.id, index + 1, participant);
      const nextCells = state.cells.map((item, cellIndex) =>
        cellIndex === index ? { ...item, picked: true, rank: result.rank, name: result.name } : item,
      );
      const remainingRevealMs = Math.max(0, PICK_REVEAL_DURATION_MS - (window.performance.now() - startedAt));

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
        void loadPrizeInventory(participant.eventCode || eventCode);
      }, remainingRevealMs);
    } catch (error) {
      if (error instanceof DrawApiError && error.code === "ALREADY_DRAWN") {
        await showExistingDrawResult(cell.id, index + 1, participant);
        return;
      }

      setIsRevealing(false);
      setActivePickKey(null);
      setDrawError(apiErrorMessage(error, "뽑기를 실행하지 못했습니다."));
    }
  }

  async function showExistingDrawResult(cellId: string, cellNumber: number, currentParticipant: Participant) {
    if (!currentParticipant.leadId || !currentParticipant.eventCode) return;

    try {
      const response = await fetchDrawHistory({
        leadId: currentParticipant.leadId,
        eventCode: currentParticipant.eventCode,
      });
      const result = pickResultFromDrawResponse(response, cellId, cellNumber, currentParticipant);

      updateState({
        ...state,
        cells: state.cells,
        results: [result, ...state.results],
      });
      showResult(result);
      setIsRevealing(false);
      setActivePickKey(null);
      setDrawError("이미 추첨 완료된 참여자입니다. 기존 결과를 표시합니다.");
    } catch (error) {
      setIsRevealing(false);
      setActivePickKey(null);
      setDrawError(apiErrorMessage(error, "이미 추첨된 결과를 불러오지 못했습니다."));
    }
  }

  const prizeStatus = prizeInventoryStatus(prizeInventory, isLoadingPrizes, prizeError);

  const resultOverlay = selectedResult ? (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
      <div className="flex select-none flex-col items-center gap-6 rounded-2xl px-10 py-8 text-center shadow-2xl" style={{ backgroundColor: "#1a4db5" }}>
        <div className="text-[96px] font-black leading-none text-white sm:text-[132px]" data-testid="draw-result-rank">
          {selectedResult.rank}
        </div>
        {!selectedResult.isMock && (
          <button
            type="button"
            className="h-12 w-full rounded-lg bg-white px-10 text-base font-bold text-[#1a4db5] transition-colors hover:bg-white/90"
            onClick={finishCycle}
          >
            확인
          </button>
        )}
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
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge className="px-3 py-1 text-sm">와탭 뽑기 이벤트</Badge>
                {eventCode ? (
                  <Badge variant="secondary" className="max-w-full px-3 py-1 text-sm">
                    {eventCode}
                  </Badge>
                ) : null}
              </div>
              <h1 className="text-2xl font-bold tracking-normal text-foreground">제출하신 설문 정보를 입력해 주세요.</h1>
              {prizeStatus ? (
                <p className="mt-2 text-sm font-medium text-muted-foreground">{prizeStatus}</p>
              ) : null}
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
            {!eventCode ? (
              <p className="mt-4 text-sm font-medium text-destructive">
                URL에 eventCode 파라미터가 필요합니다.
              </p>
            ) : null}

            {leadOptions.length > 0 ? (
              <div className="mt-4 space-y-2">
                {leadOptions.map((lead) => (
                  <Button
                    key={lead.leadId}
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => void selectLeadOption(lead)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{lead.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {lead.company} · {lead.jobLevel}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {lead.drawn ? "추첨 완료" : lead.grade ? `${lead.grade} · ${lead.score ?? "-"}점` : lead.aiStatus}
                    </span>
                  </Button>
                ))}
              </div>
            ) : null}

            <Button type="submit" className="mt-6 h-12 w-full gap-2 text-base" disabled={isCheckingParticipant || !eventCode}>
              {isCheckingParticipant ? "확인 중" : "이벤트 참여하기"}
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
              <Confetti key={confettiTrigger} active={confettiTrigger > 0} />
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
        <div className="flex w-[180px] justify-start">
          {prizeStatus ? (
            <Badge variant="outline" className="max-w-full truncate px-3 py-1 text-sm">
              {prizeStatus}
            </Badge>
          ) : null}
        </div>
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
          {drawError ? (
            <div className="absolute left-4 top-4 z-20 max-w-[420px] rounded-md border border-destructive/30 bg-background/95 px-4 py-2 text-sm font-medium text-destructive shadow-sm">
              {drawError}
            </div>
          ) : null}
          {drawEffect}
          {resultOverlay}
          <Confetti key={confettiTrigger} active={confettiTrigger > 0} />
        </div>
      </section>
    </main>
  );
}

function isMockTestParticipant(participant: ParticipantForm) {
  return (
    participantFormFullName(participant).toLowerCase() === TEST_PARTICIPANT_NAME &&
    participant.phoneLastFour === TEST_PARTICIPANT_PHONE_LAST_FOUR
  );
}

function participantFullName(participant: Participant) {
  return participant.name;
}

function participantFormFullName(participant: ParticipantForm) {
  return `${participant.lastName}${participant.firstName}`;
}

function pickResultFromDrawResponse(
  response: DrawResponse,
  cellId: string,
  cellNumber: number,
  participant: Participant,
): PickResult {
  const isOutOfStock = response.outOfStock === true || response.rank === null;

  return {
    id: `${cellId}-${response.drawnAt}`,
    cellNumber,
    rank: isOutOfStock ? "꽝" : `${response.rank}등`,
    name: response.prizeName || "경품 소진",
    pickedAt: formatDateTime(response.drawnAt),
    participantName: participantFullName(participant),
    participantPhoneLastFour: participant.phoneLastFour,
  };
}

function drawResponseLabel(response: DrawResponse) {
  if (response.outOfStock || response.rank === null) {
    return "꽝";
  }

  return `${response.rank}등 · ${response.prizeName || "경품"}`;
}

function prizeInventoryStatus(prizes: ApiPrize[], isLoading: boolean, error: string) {
  if (isLoading) return "재고 확인 중";
  if (error) return error;
  if (prizes.length === 0) return "";

  const initial = prizes.reduce((sum, prize) => sum + safeCount(prize.initial), 0);
  const remaining = prizes.reduce((sum, prize) => sum + safeCount(prize.remaining), 0);
  return `잔여 ${remaining}/${initial}`;
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DrawApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}

function readEventCode() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("eventCode")?.trim() || "";
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function loadState(): PickerState {
  if (typeof window === "undefined") return defaultState;

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
