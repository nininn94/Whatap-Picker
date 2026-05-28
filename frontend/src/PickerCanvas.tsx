import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CellTone = "blue" | "yellow" | "red" | "white";

export type PickerCell = {
  id: string;
  rank: string;
  name: string;
  prizeIndex: number;
  tone: CellTone;
  picked: boolean;
};

type PickerCanvasProps = {
  cells: PickerCell[];
  columns: number;
  rows: number;
  pickedAnimationKey: string | null;
  onPick: (index: number) => void;
};

type CellRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const toneColor: Record<CellTone, string> = {
  blue: "#35a4ff",
  yellow: "#fbbc04",
  red: "#ff5f57",
  white: "#ffffff",
};

const pickedToneColor: Record<CellTone, string> = {
  blue: "#b9ddff",
  yellow: "#ffe7a8",
  red: "#ffc5c2",
  white: "#f8fafc",
};

const yAxisLabels = ["80s", "64s", "48s", "32s", "16s", "0s"];
const xAxisLabels = ["12:22", "12:23", "12:24", "12:25", "12:26", "12:27", "12:28", "12:29", "12:30", "12:31"];

export function PickerCanvas({
  cells,
  columns,
  rows,
  pickedAnimationKey,
  onPick,
}: PickerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cellRectsRef = useRef<CellRect[]>([]);
  const frameRef = useRef<number | null>(null);
  const animationStartRef = useRef<number>(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width);
      const nextHeight = Math.round(entry.contentRect.height);
      setCanvasSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    animationStartRef.current = performance.now();
  }, [pickedAnimationKey]);

  const draw = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas || canvasSize.width === 0 || canvasSize.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvasSize.width * dpr);
      canvas.height = Math.round(canvasSize.height * dpr);

      const context = canvas.getContext("2d");
      if (!context) return;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, canvasSize.width, canvasSize.height);
      drawAxes(context, canvasSize.width, canvasSize.height);

      const layout = getGridLayout(canvasSize.width, canvasSize.height, columns, rows);
      drawGridLines(context, layout, columns, rows);

      const rects: CellRect[] = [];
      const animationElapsed = now - animationStartRef.current;

      cells.forEach((cell, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = layout.x + column * (layout.cellWidth + layout.gap);
        const y = layout.y + row * (layout.cellHeight + layout.gap);
        rects[index] = { x, y, width: layout.cellWidth, height: layout.cellHeight };
        drawCell(context, cell, x, y, layout.cellWidth, layout.cellHeight, index === hoverIndex);

        if (cell.picked) {
          drawPickedState(context, cell, x, y, layout.cellWidth, layout.cellHeight);
        }

        if (index === hoverIndex && !cell.picked) {
          drawHoverState(context, x, y, layout.cellWidth, layout.cellHeight);
        }

        if (pickedAnimationKey && index === findPickedAnimationIndex(cells, pickedAnimationKey)) {
          drawPickPulse(context, x, y, layout.cellWidth, layout.cellHeight, animationElapsed);
        }
      });

      cellRectsRef.current = rects;
    },
    [canvasSize.height, canvasSize.width, cells, columns, hoverIndex, pickedAnimationKey, rows],
  );

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const startedAt = performance.now();
    const loop = (now: number) => {
      draw(now);
      if (now - startedAt < 720) {
        frameRef.current = requestAnimationFrame(loop);
      }
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);

  const getIndexFromPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    return cellRectsRef.current.findIndex((cellRect) =>
      x >= cellRect.x &&
      x <= cellRect.x + cellRect.width &&
      y >= cellRect.y &&
      y <= cellRect.y + cellRect.height,
    );
  }, []);

  const selectedCellLabel = useMemo(() => {
    if (hoverIndex === null || hoverIndex < 0) return "500칸 뽑기 차트";
    const cell = cells[hoverIndex];
    return cell?.picked ? `${hoverIndex + 1}번 칸 선택 완료` : `${hoverIndex + 1}번 칸 선택 가능`;
  }, [cells, hoverIndex]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-pointer rounded-md"
      role="img"
      aria-label={selectedCellLabel}
      onPointerMove={(event) => {
        const index = getIndexFromPointer(event);
        setHoverIndex(index !== null && index >= 0 ? index : null);
      }}
      onPointerLeave={() => setHoverIndex(null)}
      onClick={(event) => {
        const index = getIndexFromPointer(event);
        if (index === null || index < 0 || cells[index]?.picked) return;
        onPick(index);
      }}
    />
  );
}

function getGridLayout(width: number, height: number, columns: number, rows: number) {
  const axisLeft = width < 520 ? 38 : 58;
  const axisBottom = width < 520 ? 28 : 42;
  const top = 12;
  const right = 10;
  const gap = width < 520 ? 1 : 2;
  const availableWidth = width - axisLeft - right;
  const availableHeight = height - top - axisBottom;
  const cellWidth = Math.max(3, (availableWidth - (columns - 1) * gap) / columns);
  const cellHeight = Math.max(3, (availableHeight - (rows - 1) * gap) / rows);
  const gridWidth = columns * cellWidth + (columns - 1) * gap;
  const gridHeight = rows * cellHeight + (rows - 1) * gap;

  return {
    x: axisLeft,
    y: top,
    cellWidth,
    cellHeight,
    gap,
    gridWidth,
    gridHeight,
  };
}

function drawAxes(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.fillStyle = "#202124";
  context.font = width < 520 ? "600 12px Inter, sans-serif" : "600 20px Inter, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "middle";

  const layout = getGridLayout(width, height, 50, 10);
  yAxisLabels.forEach((label, index) => {
    const y = layout.y + (layout.gridHeight / (yAxisLabels.length - 1)) * index;
    context.fillText(label, layout.x - 10, y);
  });

  context.textBaseline = "top";
  const labels = width < 520 ? xAxisLabels.filter((_, index) => index % 2 === 0) : xAxisLabels;
  labels.forEach((label, index) => {
    const x = layout.x + (layout.gridWidth / Math.max(1, labels.length - 1)) * index;
    context.textAlign = index === 0 ? "left" : index === labels.length - 1 ? "right" : "center";
    context.fillText(label, x, layout.y + layout.gridHeight + 10);
  });

  context.strokeStyle = "#9aa0a6";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(layout.x - 1, layout.y - 1);
  context.lineTo(layout.x - 1, layout.y + layout.gridHeight + 1);
  context.lineTo(layout.x + layout.gridWidth + 1, layout.y + layout.gridHeight + 1);
  context.stroke();
  context.restore();
}

function drawGridLines(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getGridLayout>,
  columns: number,
  rows: number,
) {
  context.save();
  context.strokeStyle = "rgba(60, 64, 67, 0.08)";
  context.lineWidth = 1;
  context.setLineDash([2, 4]);

  for (let column = 5; column < columns; column += 5) {
    const x = layout.x + column * (layout.cellWidth + layout.gap) - layout.gap / 2;
    context.beginPath();
    context.moveTo(x, layout.y - 3);
    context.lineTo(x, layout.y + layout.gridHeight + 3);
    context.stroke();
  }

  for (let row = 2; row < rows; row += 2) {
    const y = layout.y + row * (layout.cellHeight + layout.gap) - layout.gap / 2;
    context.beginPath();
    context.moveTo(layout.x - 3, y);
    context.lineTo(layout.x + layout.gridWidth + 3, y);
    context.stroke();
  }

  context.restore();
}

function drawCell(
  context: CanvasRenderingContext2D,
  cell: PickerCell,
  x: number,
  y: number,
  width: number,
  height: number,
  isHovered: boolean,
) {
  context.save();
  context.fillStyle = toneColor[cell.tone];
  context.strokeStyle = cell.tone === "white" ? "#e8edf3" : "rgba(255, 255, 255, 0.82)";
  context.lineWidth = 1;
  context.fillRect(x, y, width, height);
  context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));

  if (isHovered && cell.tone === "white") {
    context.fillStyle = "rgba(26, 115, 232, 0.05)";
    context.fillRect(x, y, width, height);
  }

  context.restore();
}

function drawPickedState(
  context: CanvasRenderingContext2D,
  cell: PickerCell,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.fillStyle = pickedToneColor[cell.tone];
  context.fillRect(x, y, width, height);

  const insetX = Math.max(4, width * 0.34);
  const insetY = Math.max(7, height * 0.34);
  context.strokeStyle = "rgba(52, 58, 64, 0.26)";
  context.lineWidth = Math.max(1, Math.min(width, height) * 0.045);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x + insetX, y + insetY);
  context.lineTo(x + width - insetX, y + height - insetY);
  context.moveTo(x + width - insetX, y + insetY);
  context.lineTo(x + insetX, y + height - insetY);
  context.stroke();
  context.restore();
}

function drawHoverState(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.strokeStyle = "#174ea6";
  context.lineWidth = 2;
  context.strokeRect(x - 1, y - 1, width + 2, height + 2);
  context.restore();
}

function drawPickPulse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  elapsed: number,
) {
  const progress = Math.min(1, elapsed / 650);
  const alpha = Math.max(0, 0.42 * (1 - progress));
  context.save();
  context.strokeStyle = `rgba(26, 115, 232, ${alpha})`;
  context.lineWidth = 2;
  const growX = width * 0.6 * progress;
  const growY = height * 0.6 * progress;
  context.strokeRect(x - growX / 2, y - growY / 2, width + growX, height + growY);
  context.restore();
}

function findPickedAnimationIndex(cells: PickerCell[], key: string) {
  return cells.findIndex((cell) => cell.id === key);
}
