import {
  DrawApiError,
  type ApiEvent,
  type ApiPrize,
  type DrawResponse,
} from "@/lib/draw-api";
import {
  ADMIN_SPECIAL_ACCOUNT_NAME,
  ADMIN_SPECIAL_ACCOUNT_PHONE_LAST_FOUR,
  EVENT_CODE_STORAGE_KEY,
} from "@/picker/constants";
import type { Participant, ParticipantForm, PickResult } from "@/picker/types";

export function isAdminSpecialAccount(participant: ParticipantForm) {
  return (
    participantFormFullName(participant).toLowerCase() === ADMIN_SPECIAL_ACCOUNT_NAME &&
    participant.phoneLastFour === ADMIN_SPECIAL_ACCOUNT_PHONE_LAST_FOUR
  );
}

export function participantFullName(participant: Participant) {
  return participant.name;
}

export function participantFormFullName(participant: ParticipantForm) {
  return `${participant.lastName}${participant.firstName}`;
}

export function pickResultFromDrawResponse(
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

export function drawResponseLabel(response: DrawResponse) {
  if (response.outOfStock || response.rank === null) {
    return "꽝";
  }

  return `${response.rank}등 · ${response.prizeName || "경품"}`;
}

export function prizeInventoryStatus(prizes: ApiPrize[], isLoading: boolean, error: string) {
  if (isLoading) return "재고 확인 중";
  if (error) return error;
  if (prizes.length === 0) return "";

  const initial = prizes.reduce((sum, prize) => sum + safeCount(prize.initial), 0);
  const remaining = prizes.reduce((sum, prize) => sum + safeCount(prize.remaining), 0);
  return `잔여 ${remaining}/${initial}`;
}

export function eventStatusLabel({
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

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof DrawApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR");
}

export function readEventCode() {
  if (typeof window === "undefined") return "";

  const queryEventCode = new URLSearchParams(window.location.search).get("eventCode")?.trim();
  if (queryEventCode) return queryEventCode;

  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const eventSegmentIndex = pathSegments.indexOf("event");
  const pathEventCode = eventSegmentIndex >= 0 ? pathSegments[eventSegmentIndex + 1] : "";
  if (pathEventCode) return decodeEventCode(pathEventCode);

  return localStorage.getItem(EVENT_CODE_STORAGE_KEY)?.trim() || "";
}

export function rememberEventCode(eventCode: string) {
  if (typeof window === "undefined") return;

  localStorage.setItem(EVENT_CODE_STORAGE_KEY, eventCode);
}

export function eventOptionLabel(event: ApiEvent) {
  return [event.eventCode, event.label, event.eventDate, event.status].filter(Boolean).join(" · ");
}

export function updateEventCodeInUrl(eventCode: string) {
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

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function safeCount(value: number) {
  return Math.max(0, Number(value) || 0);
}

function decodeEventCode(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}
