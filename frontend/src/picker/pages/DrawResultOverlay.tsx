import type { PickResult } from "@/picker/types";

type DrawResultOverlayProps = {
  result: PickResult | null;
  onConfirm: () => void;
};

export function DrawResultOverlay({ result, onConfirm }: DrawResultOverlayProps) {
  if (!result) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
      <div className="flex select-none flex-col items-center gap-6 rounded-2xl px-10 py-8 text-center shadow-2xl" style={{ backgroundColor: "#1a4db5" }}>
        <div className="text-[96px] font-black leading-none text-white sm:text-[132px]" data-testid="draw-result-rank">
          {result.rank}
        </div>
        <button
          type="button"
          className="h-12 w-full rounded-lg bg-white px-10 text-base font-bold text-[#1a4db5] transition-colors hover:bg-white/90"
          onClick={onConfirm}
        >
          확인
        </button>
      </div>
    </div>
  );
}
