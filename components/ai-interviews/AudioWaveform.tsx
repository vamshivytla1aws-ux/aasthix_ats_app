"use client";

import { useEffect, useRef } from "react";

export default function AudioWaveform({
  analyser,
  scrambled,
}: {
  analyser: AnalyserNode | null;
  scrambled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      const centerY = canvas.height / 2;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;
        
        let color = "#00bfa5"; // Default ATS teal
        if (scrambled) {
          color = i % 2 === 0 ? "#ef4444" : "#f87171"; // Red shades for warning
        } else if (i > bufferLength / 2) {
          color = "#9ca3af"; // Gray for higher frequencies to match the screenshot pattern
        }

        ctx.fillStyle = color;
        // Draw symmetrical bars from center
        if (barHeight > 0) {
          ctx.fillRect(x, centerY - barHeight / 2, barWidth - 1, barHeight);
        } else {
          // Base line
          ctx.fillRect(x, centerY - 1, barWidth - 1, 2);
        }

        x += barWidth;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, scrambled]);

  return (
    <div className="w-full flex justify-center py-2">
      <canvas
        ref={canvasRef}
        width={300}
        height={60}
        className="rounded bg-black/10 dark:bg-black/40"
      />
    </div>
  );
}
