export type ApiPrize = {
  rank: number;
  name: string;
  initial: number;
  awarded: number;
  remaining: number;
};

export type ApiEvent = {
  id: string;
  eventCode: string;
  eventDate: string;
  endDate: string | null;
  label: string;
  status: string;
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
  drawnBy?: {
    id: string;
    username: string;
  } | null;
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
  const response = await requestJson<BackendLeadSearchResponse>(
    `/api/leads/search?${new URLSearchParams(params)}`,
  );
  return normalizeLeadSearchResponse(response);
}

export async function drawPrize(params: { leadId: string; eventCode: string }) {
  const response = await requestJson<DrawResponse>("/api/draw", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return normalizeDrawResponse(response);
}

export async function fetchDrawHistory(params: { leadId: string; eventCode: string }) {
  const response = await requestJson<BackendDrawHistoryResponse>(
    `/api/draw/history?${new URLSearchParams(params)}`,
  );
  return normalizeDrawHistoryResponse(response);
}

export async function fetchAdminEvents() {
  return requestJson<ApiEvent[]>("/api/admin/events");
}

async function requestJson<T>(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${apiBaseUrl()}${path}`;
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

type BackendLeadSearchItem = Omit<LeadSearchItem, "aiStatus" | "grade" | "score"> &
  Partial<Pick<LeadSearchItem, "aiStatus" | "grade" | "score">> & {
    ai?: {
      status?: LeadSearchItem["aiStatus"];
      grade?: LeadSearchItem["grade"];
      score?: number | null;
    } | null;
  };

type BackendLeadSearchResponse = Omit<LeadSearchResponse, "results"> & {
  results: BackendLeadSearchItem[];
};

type BackendDrawHistoryResponse = Partial<DrawResponse> & {
  drawn?: boolean;
  awardedRank?: number | null;
};

function apiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE ??
    ""
  ).replace(/\/+$/, "");
}

function normalizeLeadSearchResponse(response: BackendLeadSearchResponse): LeadSearchResponse {
  return {
    ...response,
    results: response.results.map((lead) => {
      const { ai, aiStatus, grade, score, ...rest } = lead;
      return {
        ...rest,
        aiStatus: aiStatus ?? ai?.status ?? "PENDING",
        grade: grade ?? ai?.grade ?? null,
        score: score ?? ai?.score ?? null,
      };
    }),
  };
}

function normalizeDrawResponse(response: DrawResponse): DrawResponse {
  return {
    ...response,
    outOfStock: response.outOfStock ?? (response.rank === null),
  };
}

function normalizeDrawHistoryResponse(response: BackendDrawHistoryResponse): DrawResponse {
  if (response.drawn === false) {
    throw new DrawApiError(404, {
      code: "NOT_FOUND",
      message: "추첨 이력을 찾을 수 없습니다.",
    });
  }

  const rank = response.rank ?? response.awardedRank ?? null;
  return normalizeDrawResponse({
    rank,
    prizeName: response.prizeName ?? null,
    outOfStock: response.outOfStock ?? (rank === null),
    drawnAt: response.drawnAt ?? "",
    drawnBy: response.drawnBy ?? null,
  });
}
