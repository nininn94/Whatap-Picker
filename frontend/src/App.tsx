"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PICK_REVEAL_DURATION_MS } from "./PickerCanvas";
import {
  DrawApiError,
  drawPrize,
  fetchDrawHistory,
  fetchEvents,
  fetchPrizeInventory,
  searchLeads,
  type ApiEvent,
  type ApiPrize,
} from "@/lib/draw-api";
import {
  clearPickedCellIndexes,
  createPickerState,
  emptyPickerState,
  loadPickerState,
  prizesFromInventory,
  prizeTotalOf,
  readPickedCellIndexes,
  remainingTotalOf,
  rememberPickedCellIndex,
} from "@/picker/board";
import { BOARD_CELL_COUNT, BOARD_COLUMNS, BOARD_ROWS } from "@/picker/constants";
import { AdminControlPage } from "@/picker/pages/AdminControlPage";
import { DrawBoardPage } from "@/picker/pages/DrawBoardPage";
import { DrawResultOverlay } from "@/picker/pages/DrawResultOverlay";
import { ParticipantEntryPage } from "@/picker/pages/ParticipantEntryPage";
import type {
  LeadOption,
  Participant,
  ParticipantForm,
  PickerState,
  PickerView,
  PickResult,
  Prize,
} from "@/picker/types";
import {
  apiErrorMessage,
  digitsOnly,
  drawResponseLabel,
  eventStatusLabel,
  isAdminSpecialAccount,
  participantFormFullName,
  pickResultFromDrawResponse,
  prizeInventoryStatus,
  readEventCode,
  rememberEventCode,
  updateEventCodeInUrl,
} from "@/picker/utils";

export default function App() {
  const [view, setView] = useState<PickerView>("entry");
  const [state, setState] = useState<PickerState>(() => loadPickerState());
  const [eventCode, setEventCode] = useState("");
  const [eventCodeDraft, setEventCodeDraft] = useState("");
  const [adminEvents, setAdminEvents] = useState<ApiEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventListError, setEventListError] = useState("");
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
  const [participantError, setParticipantError] = useState("");
  const [isCheckingParticipant, setIsCheckingParticipant] = useState(false);
  const [drawError, setDrawError] = useState("");
  const [selectedResult, setSelectedResult] = useState<PickResult | null>(null);
  const [activePickKey, setActivePickKey] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const revealTimerRef = useRef<number | null>(null);
  const drawEffectRef = useRef<HTMLVideoElement | null>(null);

  const syncBoardWithInventory = useCallback((nextEventCode: string, nextPrizes: Prize[], remainingCount: number) => {
    const pickedCellIndexes = readPickedCellIndexes(nextEventCode);
    setState(createPickerState(nextPrizes, nextEventCode, pickedCellIndexes, remainingCount));
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const nextEventCode = readEventCode();
      setEventCode(nextEventCode);
      setEventCodeDraft(nextEventCode);
      if (nextEventCode) {
        rememberEventCode(nextEventCode);
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
      const nextPrizes = prizesFromInventory(response.prizes);

      if (nextPrizes.length === 0) {
        setState(emptyPickerState(response.eventCode));
      } else {
        const total = prizeTotalOf(nextPrizes);
        if (total === BOARD_CELL_COUNT) {
          syncBoardWithInventory(response.eventCode, nextPrizes, remainingTotalOf(response.prizes));
        } else {
          setState(emptyPickerState(response.eventCode));
          setPrizeError(`경품 수량 합계가 ${total}개입니다. 뽑기판은 ${BOARD_CELL_COUNT}개가 필요합니다.`);
        }
      }

      setParticipant((current) =>
        current && current.eventCode === response.eventCode
          ? { ...current, eventDate: response.eventDate }
          : current,
      );
    } catch (error) {
      setPrizeInventory([]);
      setSelectedEventDate("");
      setState(emptyPickerState(nextEventCode));
      setPrizeError(apiErrorMessage(error, "경품 재고를 불러오지 못했습니다."));
    } finally {
      setIsLoadingPrizes(false);
    }
  }, [syncBoardWithInventory]);

  const loadAdminEvents = useCallback(async () => {
    setIsLoadingEvents(true);
    setEventListError("");

    try {
      const response = await fetchEvents();
      setAdminEvents(response);
      setEventCodeDraft((current) => {
        const currentCode = current.trim() || eventCode.trim();
        if (currentCode && response.some((item) => item.eventCode === currentCode)) {
          return currentCode;
        }

        return response[0]?.eventCode ?? currentCode;
      });
    } catch (error) {
      setAdminEvents([]);
      setEventListError(apiErrorMessage(error, "이벤트 목록을 불러오지 못했습니다."));
    } finally {
      setIsLoadingEvents(false);
    }
  }, [eventCode]);

  useEffect(() => {
    if (!eventCode) return;
    const timerId = window.setTimeout(() => {
      void loadPrizeInventory(eventCode);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [eventCode, loadPrizeInventory]);

  useEffect(() => {
    if (view !== "admin") return;
    const timerId = window.setTimeout(() => {
      void loadAdminEvents();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [view, loadAdminEvents]);

  useEffect(() => {
    return () => {
      clearRevealTimer();
    };
  }, []);

  useEffect(() => {
    if (!isRevealing) return;

    const video = drawEffectRef.current;
    if (!video) return;

    video.currentTime = 0;
    void video.play().catch(() => undefined);
  }, [activePickKey, isRevealing]);

  function resetPickedState() {
    clearRevealTimer();
    clearPickedCellIndexes(eventCode);

    const inventoryPrizes = prizesFromInventory(prizeInventory);
    const nextState =
      prizeTotalOf(inventoryPrizes) === BOARD_CELL_COUNT
        ? createPickerState(inventoryPrizes, eventCode, [], remainingTotalOf(prizeInventory))
        : emptyPickerState(eventCode);

    setState(nextState);
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

    if (isAdminSpecialAccount(nextParticipant)) {
      openAdminPage();
      return;
    }

    if (!eventCode) {
      setParticipantError("행사를 먼저 선택해주세요.");
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

  function openAdminPage() {
    setView("admin");
    setParticipant(null);
    setParticipantError("");
    setLeadOptions([]);
    setDrawError("");
    setSelectedResult(null);
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
    rememberEventCode(nextEventCode);
    updateEventCodeInUrl(nextEventCode);
    setState(emptyPickerState(nextEventCode));
    setPrizeInventory([]);
    setSelectedEventDate("");
    setPrizeError("");
    setParticipantError("");
    setDrawError("");
    setSelectedResult(null);
    setActivePickKey(null);
    setIsRevealing(false);
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
    setView("draw");
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
    clearRevealTimer();
    setSelectedResult(null);
    setActivePickKey(null);
    setIsRevealing(false);
    setParticipant(null);
    setView("entry");
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
  }

  function clearRevealTimer() {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }

  async function pickCell(index: number) {
    const cell = state.cells[index];
    if (!cell || cell.picked || cell.empty || isRevealing || !participant) return;

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

      rememberPickedCellIndex(participant.eventCode || eventCode, index);
      revealTimerRef.current = window.setTimeout(() => {
        setState({
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

      setState({
        ...state,
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
  const isAdminSpecialAccountEntered = isAdminSpecialAccount({
    lastName: participantForm.lastName.trim(),
    firstName: participantForm.firstName.trim(),
    phoneLastFour: digitsOnly(participantForm.phoneLastFour).slice(0, 4),
  });
  const canSubmitParticipant = !isCheckingParticipant && (Boolean(eventCode) || isAdminSpecialAccountEntered);
  const selectedAdminEventCode = adminEvents.some((item) => item.eventCode === eventCodeDraft.trim())
    ? eventCodeDraft.trim()
    : "";
  const canApplyEventSelection = !isLoadingEvents && Boolean(selectedAdminEventCode);

  const resultOverlay = (
    <DrawResultOverlay
      result={selectedResult}
      onConfirm={finishCycle}
    />
  );
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

  if (view === "admin") {
    return (
      <AdminControlPage
        cells={state.cells}
        columns={BOARD_COLUMNS}
        rows={BOARD_ROWS}
        activePickKey={activePickKey}
        isRevealing={isRevealing}
        drawError={drawError}
        drawEffect={drawEffect}
        resultOverlay={resultOverlay}
        confettiTrigger={confettiTrigger}
        selectedEventStatus={selectedEventStatus}
        adminEvents={adminEvents}
        eventCodeDraft={eventCodeDraft}
        selectedAdminEventCode={selectedAdminEventCode}
        isLoadingEvents={isLoadingEvents}
        eventListError={eventListError}
        canApplyEventSelection={canApplyEventSelection}
        onResetPickedState={resetPickedState}
        onBackToEntry={finishCycle}
        onEventCodeDraftChange={setEventCodeDraft}
        onSubmitEventSelection={submitEventSelection}
      />
    );
  }

  if (view === "draw" && participant) {
    return (
      <DrawBoardPage
        participant={participant}
        cells={state.cells}
        columns={BOARD_COLUMNS}
        rows={BOARD_ROWS}
        activePickKey={activePickKey}
        isRevealing={isRevealing}
        drawError={drawError}
        prizeStatus={prizeStatus}
        drawEffect={drawEffect}
        resultOverlay={resultOverlay}
        confettiTrigger={confettiTrigger}
        onPick={pickCell}
      />
    );
  }

  return (
    <ParticipantEntryPage
      participantForm={participantForm}
      participantError={participantError}
      prizeStatus={prizeStatus}
      eventCode={eventCode}
      isAdminSpecialAccountEntered={isAdminSpecialAccountEntered}
      leadOptions={leadOptions}
      isCheckingParticipant={isCheckingParticipant}
      canSubmitParticipant={canSubmitParticipant}
      onSubmit={submitParticipant}
      onParticipantFieldChange={updateParticipantField}
      onSelectLead={(lead) => void selectLeadOption(lead)}
    />
  );
}
