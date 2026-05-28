import type { FormEvent, ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApiEvent } from "@/lib/draw-api";
import { eventOptionLabel } from "@/picker/utils";
import type { PickerCell } from "@/PickerCanvas";
import { DrawStage } from "./DrawStage";

type AdminControlPageProps = {
  cells: PickerCell[];
  columns: number;
  rows: number;
  activePickKey: string | null;
  isRevealing: boolean;
  drawError: string;
  drawEffect: ReactNode;
  resultOverlay: ReactNode;
  confettiTrigger: number;
  selectedEventStatus: string;
  adminEvents: ApiEvent[];
  eventCodeDraft: string;
  selectedAdminEventCode: string;
  isLoadingEvents: boolean;
  eventListError: string;
  canApplyEventSelection: boolean;
  onResetPickedState: () => void;
  onBackToEntry: () => void;
  onEventCodeDraftChange: (value: string) => void;
  onSubmitEventSelection: (event: FormEvent<HTMLFormElement>) => void;
};

export function AdminControlPage({
  cells,
  columns,
  rows,
  activePickKey,
  isRevealing,
  drawError,
  drawEffect,
  resultOverlay,
  confettiTrigger,
  selectedEventStatus,
  adminEvents,
  eventCodeDraft,
  selectedAdminEventCode,
  isLoadingEvents,
  eventListError,
  canApplyEventSelection,
  onResetPickedState,
  onBackToEntry,
  onEventCodeDraftChange,
  onSubmitEventSelection,
}: AdminControlPageProps) {
  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
      <header className="flex h-[92px] shrink-0 items-center justify-between gap-4">
        <div className="flex w-[180px] justify-start">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onResetPickedState}>
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
          <DrawStage
            cells={cells}
            columns={columns}
            rows={rows}
            activePickKey={activePickKey}
            isRevealing={isRevealing}
            drawError={drawError}
            drawEffect={drawEffect}
            resultOverlay={resultOverlay}
            confettiTrigger={confettiTrigger}
            emptyMessage="이벤트를 선택하면 실제 경품 재고 기준 뽑기판이 표시됩니다."
            onPick={() => undefined}
          />
        </div>

        <div className="shrink-0 rounded-lg border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <Badge className="mb-2 px-3 py-1 text-sm">뽑기판 관리</Badge>
              <h1 className="text-xl font-bold tracking-normal text-foreground">이벤트 및 뽑기판 관리</h1>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                현재 선택된 이벤트: {selectedEventStatus}
              </p>
            </div>
            <Button type="button" variant="ghost" onClick={onBackToEntry}>
              입력 폼으로 돌아가기
            </Button>
          </div>

          <div className="max-w-xl">
            <div className="mb-2 text-sm font-semibold text-foreground">이벤트 선택</div>
            <form className="space-y-2" onSubmit={onSubmitEventSelection}>
              <select
                aria-label="이벤트 코드"
                value={selectedAdminEventCode}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium"
                disabled={isRevealing || isLoadingEvents || adminEvents.length === 0}
                onChange={(event) => onEventCodeDraftChange(event.target.value)}
              >
                <option value="" disabled>
                  {isLoadingEvents ? "이벤트 불러오는 중" : "이벤트 선택"}
                </option>
                {adminEvents.map((item) => (
                  <option key={item.eventCode} value={item.eventCode}>
                    {eventOptionLabel(item)}
                  </option>
                ))}
              </select>
              {eventListError ? (
                <p className="text-sm font-medium text-destructive">{eventListError}</p>
              ) : !isLoadingEvents && adminEvents.length === 0 ? (
                <p className="text-sm font-medium text-muted-foreground">등록된 이벤트가 없습니다.</p>
              ) : null}
              <Button type="submit" className="h-10 w-full" disabled={isRevealing || !canApplyEventSelection || eventCodeDraft.trim() === ""}>
                이벤트 적용
              </Button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
