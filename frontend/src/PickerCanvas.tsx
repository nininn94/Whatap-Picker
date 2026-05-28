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
  activePickKey: string | null;
  isRevealing: boolean;
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
  blue: "#cfe9ff",
  yellow: "#fff0c7",
  red: "#ffd8d6",
  white: "#f3f5f8",
};

const yAxisLabels = ["80s", "64s", "48s", "32s", "16s", "0s"];
const xAxisLabels = ["12:22", "12:23", "12:24", "12:25", "12:26", "12:27", "12:28", "12:29", "12:30", "12:31"];
export const PICK_REVEAL_DURATION_MS = 3334;

export function PickerCanvas({
  cells,
  columns,
  rows,
  activePickKey,
  isRevealing,
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
  }, [activePickKey]);

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
      const activeIndex = activePickKey ? findPickedAnimationIndex(cells, activePickKey) : -1;

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
      });

      cellRectsRef.current = rects;

      if (isRevealing && activeIndex >= 0 && rects[activeIndex]) {
        drawRevealAnimation(context, layout, rects[activeIndex], cells[activeIndex], animationElapsed);
      }
    },
    [activePickKey, canvasSize.height, canvasSize.width, cells, columns, hoverIndex, isRevealing, rows],
  );

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    const duration = isRevealing ? PICK_REVEAL_DURATION_MS : 720;
    const startedAt = performance.now();
    const loop = (now: number) => {
      draw(now);
      if (now - startedAt < duration) {
        frameRef.current = requestAnimationFrame(loop);
      }
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [draw, isRevealing]);

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
      className={`h-full w-full rounded-md ${isRevealing ? "cursor-wait" : "cursor-pointer"}`}
      role="img"
      aria-label={selectedCellLabel}
      onPointerMove={(event) => {
        const index = getIndexFromPointer(event);
        setHoverIndex(index !== null && index >= 0 ? index : null);
      }}
      onPointerLeave={() => setHoverIndex(null)}
      onClick={(event) => {
        if (isRevealing) return;
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
  context.strokeStyle = cell.tone === "white" ? "#b9c5d3" : "rgba(44, 62, 80, 0.28)";
  context.lineWidth = 1.5;
  context.fillRect(x, y, width, height);
  context.strokeRect(x + 0.75, y + 0.75, Math.max(0, width - 1.5), Math.max(0, height - 1.5));

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
  drawPickedHatch(context, x, y, width, height);
  context.restore();
}

function drawPickedHatch(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const spacing = Math.max(7, Math.min(width, height) * 0.42);

  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.strokeStyle = "rgba(52, 58, 64, 0.16)";
  context.lineWidth = 1;

  for (let offset = -height; offset < width; offset += spacing) {
    context.beginPath();
    context.moveTo(x + offset, y + height);
    context.lineTo(x + offset + height, y);
    context.stroke();
  }

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

function drawRevealAnimation(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getGridLayout>,
  target: CellRect,
  cell: PickerCell,
  elapsed: number,
) {
  const progress = Math.min(1, elapsed / PICK_REVEAL_DURATION_MS);
  const centerX = layout.x + layout.gridWidth / 2;
  const centerY = layout.y + layout.gridHeight * 0.43;
  const appearProgress = clampNumber(progress / 0.24, 0, 1);
  const chargeProgress = clampNumber((progress - 0.2) / 0.44, 0, 1);
  const rankProgress = clampNumber((progress - 0.62) / 0.22, 0, 1);
  const sourceProgress = clampNumber(progress / 0.32, 0, 1);
  const shakeWindow = smoothPulse(progress, 0.2, 0.68, 0.92);
  const shakeX = Math.sin(elapsed * 0.045) * 5 * shakeWindow;
  const shakeY = Math.cos(elapsed * 0.055) * 2.5 * shakeWindow;
  const boxWidth = clampNumber(layout.gridWidth * 0.22, 190, 280);
  const boxHeight = clampNumber(layout.gridHeight * 0.22, 100, 142);
  const scale = 0.72 + easeOutBack(appearProgress) * 0.28 + Math.sin(elapsed * 0.04) * 0.012 * shakeWindow;

  context.save();
  drawRevealSource(context, target, sourceProgress);
  drawBoxGlow(context, centerX + shakeX, centerY + shakeY, boxWidth, boxHeight, chargeProgress, rankProgress);
  drawPrizeBox(
    context,
    centerX + shakeX,
    centerY + shakeY,
    boxWidth * scale,
    boxHeight * scale,
    appearProgress,
    chargeProgress,
    rankProgress,
  );
  drawRankReveal(context, cell.rank, centerX + shakeX, centerY + shakeY, boxWidth, boxHeight, rankProgress);
  context.restore();
}

function drawRevealSource(
  context: CanvasRenderingContext2D,
  target: CellRect,
  progress: number,
) {
  if (progress >= 1) return;

  const alpha = 1 - easeOutCubic(progress);
  const centerX = target.x + target.width / 2;
  const centerY = target.y + target.height / 2;
  const radius = Math.max(target.width, target.height) * (0.9 + progress * 1.4);

  context.save();
  context.globalAlpha = alpha;
  context.strokeStyle = "rgba(26, 115, 232, 0.6)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawBoxGlow(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  chargeProgress: number,
  rankProgress: number,
) {
  const glowAlpha = 0.12 + chargeProgress * 0.12 + rankProgress * 0.16;
  const pulse = Math.sin(chargeProgress * Math.PI * 6) * 0.5 + 0.5;
  const radius = width * (0.75 + rankProgress * 0.32 + pulse * 0.04);
  const gradient = context.createRadialGradient(centerX, centerY, width * 0.2, centerX, centerY, radius);

  context.save();
  gradient.addColorStop(0, `rgba(255, 244, 196, ${glowAlpha})`);
  gradient.addColorStop(0.42, `rgba(53, 164, 255, ${glowAlpha * 0.5})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

  context.strokeStyle = `rgba(251, 188, 4, ${0.18 + rankProgress * 0.2})`;
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(centerX, centerY, width * (0.5 + rankProgress * 0.28), height * (0.48 + rankProgress * 0.22), 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawPrizeBox(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  appearProgress: number,
  chargeProgress: number,
  rankProgress: number,
) {
  if (appearProgress <= 0) return;

  const alpha = Math.min(1, appearProgress * 1.4);
  const x = centerX - width / 2;
  const y = centerY - height / 2;
  const lidHeight = height * 0.28;
  const ribbonWidth = width * 0.17;
  const pulse = Math.sin(chargeProgress * Math.PI * 7) * 0.5 + 0.5;
  const boxGradient = context.createLinearGradient(x, y, x, y + height);
  boxGradient.addColorStop(0, "#ffffff");
  boxGradient.addColorStop(0.5, "#eef7ff");
  boxGradient.addColorStop(1, "#d6ebff");

  const lidGradient = context.createLinearGradient(x, y, x, y + lidHeight);
  lidGradient.addColorStop(0, "#ffffff");
  lidGradient.addColorStop(1, "#fff2c2");

  context.save();
  context.globalAlpha = alpha;
  context.shadowColor = `rgba(26, 115, 232, ${0.16 + pulse * 0.08 + rankProgress * 0.08})`;
  context.shadowBlur = 24 + pulse * 8 + rankProgress * 14;

  context.fillStyle = boxGradient;
  roundedRect(context, x, y, width, height, 14);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(26, 115, 232, 0.22)";
  context.lineWidth = 2;
  context.stroke();

  context.fillStyle = lidGradient;
  roundedRect(context, x - width * 0.04, y - height * 0.03, width * 1.08, lidHeight, 13);
  context.fill();
  context.strokeStyle = "rgba(218, 143, 0, 0.18)";
  context.lineWidth = 1.5;
  context.stroke();

  context.fillStyle = "#35a4ff";
  roundedRect(context, centerX - ribbonWidth / 2, y - height * 0.03, ribbonWidth, height * 1.03, 5);
  context.fill();
  context.fillStyle = "#fbbc04";
  roundedRect(context, x - width * 0.04, y + lidHeight * 0.5, width * 1.08, height * 0.13, 5);
  context.fill();

  context.fillStyle = "rgba(255, 255, 255, 0.5)";
  roundedRect(context, x + width * 0.08, y + height * 0.16, width * 0.36, height * 0.08, height * 0.04);
  context.fill();

  if (chargeProgress > 0 && rankProgress < 0.28) {
    drawBoxShimmer(context, x, y, width, height, chargeProgress);
  }

  context.restore();
}

function drawBoxShimmer(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
) {
  const shimmerX = x - width * 0.2 + width * 1.4 * progress;
  const gradient = context.createLinearGradient(shimmerX - width * 0.14, 0, shimmerX + width * 0.14, 0);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.72)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.save();
  roundedRect(context, x, y, width, height, 14);
  context.clip();
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
  context.restore();
}

function drawRankReveal(
  context: CanvasRenderingContext2D,
  rank: string,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  progress: number,
) {
  if (progress <= 0) return;

  const eased = easeOutBack(Math.min(1, progress));
  const alpha = Math.min(1, progress * 1.8);
  const fontSize = Math.round(clampNumber(width * 0.32, 48, 82) * eased);

  context.save();
  context.globalAlpha = alpha;
  context.shadowColor = "rgba(251, 188, 4, 0.52)";
  context.shadowBlur = 18;
  context.fillStyle = "#202124";
  context.font = `900 ${fontSize}px Inter, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(rank, centerX, centerY + height * 0.08);
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255, 255, 255, 0.86)";
  context.lineWidth = Math.max(2, fontSize * 0.04);
  context.strokeText(rank, centerX, centerY + height * 0.08);
  context.restore();
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeOutBack(value: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function smoothPulse(value: number, fadeInStart: number, peakStart: number, fadeOutEnd: number) {
  const fadeIn = clampNumber((value - fadeInStart) / Math.max(0.001, peakStart - fadeInStart), 0, 1);
  const fadeOut = clampNumber((fadeOutEnd - value) / Math.max(0.001, fadeOutEnd - peakStart), 0, 1);
  return easeOutCubic(Math.min(fadeIn, fadeOut));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + nextRadius, y);
  context.lineTo(x + width - nextRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + nextRadius);
  context.lineTo(x + width, y + height - nextRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - nextRadius, y + height);
  context.lineTo(x + nextRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - nextRadius);
  context.lineTo(x, y + nextRadius);
  context.quadraticCurveTo(x, y, x + nextRadius, y);
}

function findPickedAnimationIndex(cells: PickerCell[], key: string) {
  return cells.findIndex((cell) => cell.id === key);
}
