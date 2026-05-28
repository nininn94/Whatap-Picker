import type { ReactNode } from "react";
import { Confetti } from "@/Confetti";
import { PickerCanvas, type PickerCell } from "@/PickerCanvas";

type DrawStageProps = {
  cells: PickerCell[];
  columns: number;
  rows: number;
  activePickKey: string | null;
  isRevealing: boolean;
  drawError: string;
  confettiTrigger: number;
  emptyMessage: string;
  onPick: (index: number) => void;
  drawEffect: ReactNode;
  resultOverlay: ReactNode;
};

export function DrawStage({
  cells,
  columns,
  rows,
  activePickKey,
  isRevealing,
  drawError,
  confettiTrigger,
  emptyMessage,
  onPick,
  drawEffect,
  resultOverlay,
}: DrawStageProps) {
  const hasCells = cells.length > 0;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md">
      {hasCells ? (
        <PickerCanvas
          cells={cells}
          columns={columns}
          rows={rows}
          activePickKey={activePickKey}
          isRevealing={isRevealing}
          onPick={onPick}
        />
      ) : (
        <div className="flex h-full min-h-[240px] items-center justify-center rounded-md bg-muted/30 px-6 text-center text-sm font-medium text-muted-foreground">
          {emptyMessage}
        </div>
      )}
      {drawError ? (
        <div className="absolute left-4 top-4 z-20 max-w-[420px] rounded-md border border-destructive/30 bg-background/95 px-4 py-2 text-sm font-medium text-destructive shadow-sm">
          {drawError}
        </div>
      ) : null}
      {hasCells ? drawEffect : null}
      {resultOverlay}
      <Confetti key={confettiTrigger} active={confettiTrigger > 0} />
    </div>
  );
}
