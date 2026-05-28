export type ApiPrize = {
  rank: number;
  name: string;
  initial: number;
  awarded: number;
  remaining: number;
};

export type LeadSearchItem = {
  leadId: string;
  name: string;
  jobFunction: string;
  jobLevel: string;
  company: string;
  drawn: boolean;
  drawnAt: string | null;
  aiStatus: "PENDING" | "DONE" | "RULE_ONLY" | "FAILED" | "MANUAL_OVERRIDE";
  grade: "A" | "B" | "C" | null;
  score: number | null;
};

export type LeadSearchResponse = {
  eventCode: string;
  eventDate: string;
  results: LeadSearchItem[];
};

export type PrizeInventoryResponse = {
  eventCode: string;
  eventDate: string;
  prizes: ApiPrize[];
};

export type DrawResponse = {
  rank: number | null;
  prizeName: string | null;
  outOfStock?: boolean;
  drawnAt: string;
  drawnBy: {
    id: string;
    username: string;
  };
};

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  errors?: Array<{ field?: string; message?: string }>;
};

export class DrawApiError extends Error {
  code: string;
  status: number;
  errors: ApiErrorPayload["errors"];

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message || `API 요청에 실패했습니다. (${status})`);
    this.name = "DrawApiError";
    this.status = status;
    this.code = payload.code || "UNKNOWN_ERROR";
    this.errors = payload.errors;
  }
}

export async function fetchPrizeInventory(eventCode: string) {
  return requestJson<PrizeInventoryResponse>(
    `/api/prizes?${new URLSearchParams({ eventCode })}`,
  );
}

export async function searchLeads(params: {
  name: string;
  phoneLast4: string;
  eventCode: string;
}) {
  return requestJson<LeadSearchResponse>(
    `/api/leads/search?${new URLSearchParams(params)}`,
  );
}

export async function drawPrize(params: { leadId: string; eventCode: string }) {
  return requestJson<DrawResponse>("/api/draw", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function fetchDrawHistory(params: { leadId: string; eventCode: string }) {
  return requestJson<DrawResponse>(
    `/api/draw/history?${new URLSearchParams(params)}`,
  );
}

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

async function requestJson<T>(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = await readPayload(response);
  if (!response.ok) {
    throw new DrawApiError(response.status, payload as ApiErrorPayload);
  }

  return payload as T;
}

async function readPayload(response: Response): Promise<ApiErrorPayload | unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: response.statusText || "API 응답을 해석하지 못했습니다." };
  }
}
