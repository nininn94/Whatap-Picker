import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { participantFullName } from "@/picker/utils";
import type { Participant } from "@/picker/types";
import type { PickerCell } from "@/PickerCanvas";
import { DrawStage } from "./DrawStage";

type DrawBoardPageProps = {
  participant: Participant;
  cells: PickerCell[];
  columns: number;
  rows: number;
  activePickKey: string | null;
  isRevealing: boolean;
  drawError: string;
  prizeStatus: string;
  drawEffect: ReactNode;
  resultOverlay: ReactNode;
  confettiTrigger: number;
  onPick: (index: number) => void;
};

export function DrawBoardPage({
  participant,
  cells,
  columns,
  rows,
  activePickKey,
  isRevealing,
  drawError,
  prizeStatus,
  drawEffect,
  resultOverlay,
  confettiTrigger,
  onPick,
}: DrawBoardPageProps) {
  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-background px-5 pb-5 pt-4">
      <header className="flex h-[92px] shrink-0 items-center justify-between gap-4">
        <div className="flex w-[180px] items-center justify-start gap-2">
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
          emptyMessage="경품 재고를 불러온 뒤 추첨판이 표시됩니다."
          onPick={onPick}
        />
      </section>
    </main>
  );
}
