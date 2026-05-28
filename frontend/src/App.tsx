"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Phone, RotateCcw, UserRound } from "lucide-react";
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

type BoardPattern = "scatter" | "rising" | "spike";

const STORAGE_KEY = "whatap-picker-display-v9";
const EVENT_CODE_STORAGE_KEY = "whatap-picker-selected-event-code";
const EVENT_CODE_OPTIONS_STORAGE_KEY = "whatap-picker-event-codes";
const BOARD_COLUMNS = 50;
const BOARD_ROWS = 10;
const BOARD_CELL_COUNT = BOARD_COLUMNS * BOARD_ROWS;
const MAX_EVENT_CODE_OPTIONS = 8;
const TEST_PARTICIPANT_NAME = "whatap";
const TEST_PARTICIPANT_PHONE_LAST_FOUR = "1111";
const RESULT_HOLD_DURATION_MS = 1500;
const DEFAULT_BOARD_PATTERN: BoardPattern = "scatter";
const BOARD_PATTERN_OPTIONS: { id: BoardPattern; label: string; description: string }[] = [
  { id: "scatter", label: "분산형", description: "전역 산포" },
  { id: "rising", label: "상승형", description: "계단 상승" },
  { id: "spike", label: "스파이크형", description: "중앙 집중" },
];

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
  pattern: BoardPattern;
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

const mockTestPrizes: Prize[] = defaultPrizes.map((prize) => ({
  ...prize,
  name: `Mock ${prize.name}`,
}));

function createDefaultState(pattern: BoardPattern = DEFAULT_BOARD_PATTERN): PickerState {
  return {
    eventTitle: "Whatap 경품 뽑기",
    pattern,
    prizes: defaultPrizes,
    cells: buildCells(defaultPrizes, pattern),
    results: [],
  };
}

export default function App() {
  const [state, setState] = useState<PickerState>(() => loadState());
  const [selectedPattern, setSelectedPattern] = useState<BoardPattern>(() => state.pattern);
  const [eventCode, setEventCode] = useState("");
  const [eventCodeDraft, setEventCodeDraft] = useState("");
  const [eventCodeOptions, setEventCodeOptions] = useState<string[]>([]);
  const [selectedEventDate, setSelectedEventDate] = useState("");
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
      const nextEventCode = readEventCode();
      setEventCode(nextEventCode);
      setEventCodeDraft(nextEventCode);
      setEventCodeOptions(readEventCodeOptions(nextEventCode));
      if (nextEventCode) {
        setEventCodeOptions(rememberEventCode(nextEventCode));
      }
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const loadPrizeInventory = useCallback(async (nextEventCode: string) => {
    setIsLoadingPrizes(true);
    setPrizeError("");

    try {
      const response = await fetchPrizeInventory(nextEventCode);
      setPrizeInventory(response.prizes);
      setSelectedEventDate(response.eventDate);
      setParticipant((current) =>
        current && current.eventCode === response.eventCode
          ? { ...current, eventDate: response.eventDate }
          : current,
      );
    } catch (error) {
      setPrizeInventory([]);
      setSelectedEventDate("");
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

  function resetPickedState(pattern: BoardPattern = selectedPattern) {
    clearRevealTimer();
    if (resultTimerRef.current !== null) {
      window.clearTimeout(resultTimerRef.current);
      resultTimerRef.current = null;
    }

    const nextState = createDefaultState(pattern);
    setSelectedPattern(pattern);
    updateState(nextState);
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

    if (isMockTestParticipant(nextParticipant)) {
      openManagementPage(nextParticipant);
      return;
    }

    if (!eventCode) {
      setParticipantError("URL에 eventCode 파라미터가 필요합니다.");
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

  function openManagementPage(nextParticipant: ParticipantForm) {
    setIsTestMode(true);
    setParticipant({
      leadId: "mock-lead-whatap-1111",
      name: participantFormFullName(nextParticipant),
      phoneLastFour: nextParticipant.phoneLastFour,
      eventCode,
      eventDate: selectedEventDate || todayDateString(),
      company: "Mock Company",
      jobLevel: "MOCK",
      aiStatus: "DONE",
      grade: "A",
      score: 100,
    });
    setParticipantError("");
    setLeadOptions([]);
    setDrawError("");
  }

  function submitEventSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyEventCode(eventCodeDraft);
  }

  function applyEventCode(value: string) {
    const nextEventCode = value.trim();
    if (!nextEventCode) {
      setPrizeError("이벤트 코드를 입력해주세요.");
      return;
    }

    setEventCode(nextEventCode);
    setEventCodeDraft(nextEventCode);
    setEventCodeOptions(rememberEventCode(nextEventCode));
    updateEventCodeInUrl(nextEventCode);
    setPrizeInventory([]);
    setSelectedEventDate("");
    setPrizeError("");
    setParticipantError("");
    setDrawError("");
    setParticipant((current) =>
      current ? { ...current, eventCode: nextEventCode, eventDate: undefined } : current,
    );
    resetPickedState(selectedPattern);
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

  function pickMockCell(index: number, currentParticipant: Participant, prizeOverride?: Prize) {
    const cell = state.cells[index];
    if (!cell || cell.picked || isRevealing) return;

    const result: PickResult = {
      id: `${cell.id}-mock`,
      cellNumber: index + 1,
      rank: prizeOverride?.rank ?? cell.rank,
      name: prizeOverride?.name ?? cell.name,
      pickedAt: new Date().toLocaleString("ko-KR"),
      participantName: participantFullName(currentParticipant),
      participantPhoneLastFour: currentParticipant.phoneLastFour,
      isMock: true,
    };
    const nextCells = state.cells.map((item, cellIndex) =>
      cellIndex === index
        ? {
            ...item,
            picked: true,
            rank: result.rank,
            name: result.name,
          }
        : item,
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

  function selectMockPrize(prize: Prize) {
    if (!participant || isRevealing) return;

    const candidates = state.cells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => !cell.picked && cell.tone !== "white");
    const fallbackCandidates = state.cells
      .map((cell, index) => ({ cell, index }))
      .filter(({ cell }) => !cell.picked);
    const pickableCells = candidates.length > 0 ? candidates : fallbackCandidates;

    if (pickableCells.length === 0) {
      setDrawError("선택 가능한 칸이 없습니다. 뽑기판을 초기화해 주세요.");
      return;
    }

    const nextIndex = pickableCells[0].index;
    pickMockCell(nextIndex, participant, prize);
  }

  async function pickCell(index: number) {
    const cell = state.cells[index];
    if (!cell || cell.picked || isRevealing || !participant) return;

    if (isTestMode) {
      pickMockCell(index, participant);
      return;
    }

    if (!participant.leadId || !participant.eventCode) {
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
        eventCode: participant.eventCode,
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
  const selectedEventStatus = eventStatusLabel({
    eventCode,
    eventDate: selectedEventDate,
    prizeStatus,
    isLoading: isLoadingPrizes,
    error: prizeError,
  });
  const isManagementPatternEntered = isMockTestParticipant({
    lastName: participantForm.lastName.trim(),
    firstName: participantForm.firstName.trim(),
    phoneLastFour: digitsOnly(participantForm.phoneLastFour).slice(0, 4),
  });
  const canSubmitParticipant = !isCheckingParticipant && (Boolean(eventCode) || isManagementPatternEntered);

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
        <header className="flex h-[92px] shrink-0 items-center justify-between gap-4">
          <div className="w-[180px]" aria-hidden="true" />
          <img
            src="/WhaTap_basic_logo.png"
            alt="WhaTap"
            className="h-[48px] w-auto object-contain"
          />
          <div className="flex w-[180px] justify-end">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => resetPickedState()}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              초기화
            </Button>
          </div>
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
            {!eventCode && !isManagementPatternEntered ? (
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

            <Button type="submit" className="mt-6 h-12 w-full gap-2 text-base" disabled={!canSubmitParticipant}>
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
          <div className="flex w-[180px] justify-start">
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => resetPickedState(selectedPattern)}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              초기화
            </Button>
          </div>
          <img
            src="/WhaTap_basic_logo.png"
            alt="WhaTap"
            className="h-[48px] w-auto object-contain"
          />
          <div className="flex w-[180px] justify-end">
            <Badge variant="secondary" className="max-w-full truncate px-3 py-1 text-sm">
              관리 모드
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
                activePickKey={activePickKey}
                isRevealing={isRevealing}
                onPick={() => undefined}
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
          </div>

          <div className="shrink-0 rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <Badge className="mb-2 px-3 py-1 text-sm">뽑기판 관리</Badge>
                <h1 className="text-xl font-bold tracking-normal text-foreground">이벤트 및 테스트 관리</h1>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  현재 선택된 이벤트: {selectedEventStatus}
                </p>
              </div>
              <Button type="button" variant="ghost" onClick={finishCycle}>
                입력 폼으로 돌아가기
              </Button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_1.4fr]">
              <div>
                <div className="mb-2 text-sm font-semibold text-foreground">이벤트 선택</div>
                <form className="space-y-2" onSubmit={submitEventSelection}>
                  {eventCodeOptions.length > 0 ? (
                    <select
                      aria-label="최근 이벤트 선택"
                      value={eventCodeOptions.includes(eventCodeDraft) ? eventCodeDraft : ""}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium"
                      disabled={isRevealing}
                      onChange={(event) => setEventCodeDraft(event.target.value)}
                    >
                      <option value="" disabled>
                        최근 이벤트
                      </option>
                      {eventCodeOptions.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Input
                    aria-label="이벤트 코드"
                    value={eventCodeDraft}
                    onChange={(event) => setEventCodeDraft(event.target.value)}
                    placeholder="event-code"
                    className="h-10 text-sm"
                    disabled={isRevealing}
                  />
                  <Button type="submit" className="h-10 w-full" disabled={isRevealing || !eventCodeDraft.trim()}>
                    이벤트 적용
                  </Button>
                </form>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-foreground">패턴 선택</div>
                <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                  {BOARD_PATTERN_OPTIONS.map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      variant={selectedPattern === option.id ? "default" : "outline"}
                      className="h-12 justify-between gap-2 px-3 text-left"
                      disabled={isRevealing}
                      onClick={() => resetPickedState(option.id)}
                    >
                      <span className="font-bold">{option.label}</span>
                      <span className="text-xs font-medium opacity-80">{option.description}</span>
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm font-semibold text-foreground">등수 선택</div>
                <div className="grid grid-cols-5 gap-2">
                  {mockTestPrizes.map((prize) => (
                    <Button
                      key={prize.rank}
                      type="button"
                      variant="outline"
                      className="h-20 flex-col gap-1 px-2 text-center"
                      disabled={isRevealing}
                      onClick={() => selectMockPrize(prize)}
                    >
                      <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                      <span className="text-lg font-bold">{prize.rank}</span>
                      <span className="max-w-full truncate text-xs font-medium text-muted-foreground">
                        {prize.name}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
      <header className="flex h-[92px] shrink-0 items-center justify-between gap-4">
        <div className="flex w-[180px] items-center justify-start gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => resetPickedState()}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            초기화
          </Button>
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
            {isTestMode ? "Mock · " : ""}
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
            activePickKey={activePickKey}
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

function eventStatusLabel({
  eventCode,
  eventDate,
  prizeStatus,
  isLoading,
  error,
}: {
  eventCode: string;
  eventDate: string;
  prizeStatus: string;
  isLoading: boolean;
  error: string;
}) {
  if (!eventCode) return "미선택";

  const parts = [eventCode];
  if (eventDate) {
    parts.push(eventDate);
  }
  if (prizeStatus) {
    parts.push(prizeStatus);
  } else if (!isLoading && !error && eventDate) {
    parts.push("등록된 재고 없음");
  }

  return parts.join(" · ");
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

  const queryEventCode = new URLSearchParams(window.location.search).get("eventCode")?.trim();
  if (queryEventCode) return queryEventCode;

  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const eventSegmentIndex = pathSegments.indexOf("event");
  const pathEventCode = eventSegmentIndex >= 0 ? pathSegments[eventSegmentIndex + 1] : "";
  if (pathEventCode) return decodeEventCode(pathEventCode);

  return localStorage.getItem(EVENT_CODE_STORAGE_KEY)?.trim() || "";
}

function decodeEventCode(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function readEventCodeOptions(currentEventCode = "") {
  if (typeof window === "undefined") return currentEventCode ? [currentEventCode] : [];

  const options = parseEventCodeOptions(localStorage.getItem(EVENT_CODE_OPTIONS_STORAGE_KEY));
  if (!currentEventCode) return options;

  return uniqueEventCodes([currentEventCode, ...options]);
}

function rememberEventCode(eventCode: string) {
  const nextOptions = uniqueEventCodes([eventCode, ...readEventCodeOptions()]).slice(0, MAX_EVENT_CODE_OPTIONS);
  localStorage.setItem(EVENT_CODE_STORAGE_KEY, eventCode);
  localStorage.setItem(EVENT_CODE_OPTIONS_STORAGE_KEY, JSON.stringify(nextOptions));
  return nextOptions;
}

function parseEventCodeOptions(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return uniqueEventCodes(parsed.map((item) => String(item)));
  } catch {
    return [];
  }
}

function uniqueEventCodes(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function updateEventCodeInUrl(eventCode: string) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (pathSegments[0] === "event") {
    url.pathname = `/event/${encodeURIComponent(eventCode)}`;
    url.searchParams.delete("eventCode");
  } else {
    url.searchParams.set("eventCode", eventCode);
  }

  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function loadState(): PickerState {
  const fallbackState = createDefaultState();
  if (typeof window === "undefined") return fallbackState;

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return fallbackState;

  try {
    const parsed = JSON.parse(saved) as PickerState;
    const pattern = normalizeBoardPattern(parsed.pattern);
    const prizes = normalizePrizes(parsed.prizes);
    if (prizeTotalOf(prizes) !== BOARD_CELL_COUNT || parsed.cells?.length !== BOARD_CELL_COUNT) {
      return fallbackState;
    }

    return {
      eventTitle: parsed.eventTitle || fallbackState.eventTitle,
      pattern,
      prizes,
      cells: parsed.cells,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };
  } catch {
    return fallbackState;
  }
}

function normalizeBoardPattern(pattern: unknown): BoardPattern {
  return pattern === "rising" || pattern === "spike" || pattern === "scatter"
    ? pattern
    : DEFAULT_BOARD_PATTERN;
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

function buildCells(prizes: Prize[], pattern: BoardPattern): PickerCell[] {
  const normalizedPrizes = normalizePrizes(prizes);
  const pool = normalizedPrizes.flatMap((prize, prizeIndex) =>
    Array.from({ length: prize.count }, () => ({
      prizeIndex,
      rank: prize.rank,
      name: prize.name,
    })),
  );
  const tones = buildTonePattern(pattern);

  return shuffle(pool).slice(0, BOARD_CELL_COUNT).map((prize, index) => ({
    id: `cell-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    picked: false,
    tone: tones[index],
    ...prize,
  }));
}

function buildTonePattern(pattern: BoardPattern): CellTone[] {
  return Array.from({ length: BOARD_CELL_COUNT }, (_, index) => {
    const column = index % BOARD_COLUMNS;
    const row = Math.floor(index / BOARD_COLUMNS);
    const rowFromBottom = BOARD_ROWS - 1 - row;

    if (pattern === "rising") {
      return risingTone(column, rowFromBottom);
    }

    if (pattern === "spike") {
      return spikeTone(column, rowFromBottom);
    }

    return scatterTone(row, rowFromBottom);
  });
}

function scatterTone(row: number, rowFromBottom: number): CellTone {
  if (rowFromBottom === 0) {
    return Math.random() < 0.9 ? "blue" : "yellow";
  }

  if (row === 0) {
    return Math.random() < 0.7 ? (Math.random() < 0.64 ? "yellow" : "red") : "white";
  }

  const probability = rowFromBottom <= 2 ? 0.72 : rowFromBottom <= 5 ? 0.56 : 0.42;
  if (Math.random() > probability) return "white";
  return Math.random() < 0.58 ? "blue" : Math.random() < 0.86 ? "yellow" : "red";
}

function risingTone(column: number, rowFromBottom: number): CellTone {
  if (rowFromBottom === 0) {
    return Math.random() < 0.78 ? "blue" : Math.random() < 0.86 ? "red" : "yellow";
  }

  const ramp = clampPatternNumber((column - 16) / 17, 0, 1);
  const shelf = column >= 32 ? (column < 42 ? 6 : 5) : 0;
  const height = Math.max(2, Math.round(2 + ramp * 6), shelf);
  const ridge = Math.abs(rowFromBottom - height) <= 1 && column >= 16;
  const body = rowFromBottom < height && column >= 16 && Math.random() < 0.82;
  const lowerFill = rowFromBottom <= Math.min(height, 4) && Math.random() < 0.76;
  const outlier = Math.random() < 0.1;

  if (!ridge && !body && !lowerFill && !outlier) return "white";
  if (rowFromBottom <= 1 && Math.random() < 0.3) return "red";
  if (ridge && column >= 33) return Math.random() < 0.68 ? "yellow" : "blue";
  return Math.random() < 0.74 ? "blue" : "yellow";
}

function spikeTone(column: number, rowFromBottom: number): CellTone {
  if (rowFromBottom === 0) {
    return Math.random() < 0.86 ? "blue" : "yellow";
  }

  const center = 25.5;
  const distance = Math.abs(column - center);
  const spikeHeight = Math.max(0, Math.round(9.5 - distance * 0.7));
  const shoulderHeight = Math.max(0, Math.round(5.8 - distance * 0.28));
  const inSpike = spikeHeight > 0 && rowFromBottom <= spikeHeight;
  const inShoulder = shoulderHeight > 0 && rowFromBottom <= shoulderHeight && Math.random() < 0.9;
  const baseFill = rowFromBottom <= 3 && Math.random() < 0.58;
  const outlier = Math.random() < (rowFromBottom <= 4 ? 0.15 : 0.08);

  if (!inSpike && !inShoulder && !baseFill && !outlier) {
    return "white";
  }

  if (distance <= 2.2 && rowFromBottom >= 2 && rowFromBottom <= 6) return "red";
  if (distance <= 7 && rowFromBottom <= spikeHeight) return Math.random() < 0.82 ? "yellow" : "blue";
  return Math.random() < 0.62 ? "blue" : "yellow";
}

function clampPatternNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}
