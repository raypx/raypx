import { useTheme } from "@raypx/ui/hooks/use-theme";
import { cn } from "@raypx/ui/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";

interface Star {
  x: number;
  y: number;
  z: number;
  speed: number;
}

interface FallingStarsBgProps {
  color?: string;
  count?: number;
  className?: string;
}

export function FallingStarsBg({ color, count = 200, className }: FallingStarsBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const perspectiveRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const isPausedRef = useRef(false);

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Handle hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Determine effective color based on theme if not provided
  const effectiveColor = useMemo(() => {
    if (color) return color;
    if (!mounted) return "#FFF"; // Default fallback
    return resolvedTheme === "dark" ? "#FFF" : "#64748b"; // Slate-500 for light mode
  }, [color, resolvedTheme, mounted]);

  // Pre-calculate RGB values once
  const rgb = useMemo(() => {
    let hex = effectiveColor.replace(/^#/, "");

    // If the hex code is 3 characters, expand it to 6 characters
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }

    // Parse the r, g, b values from the hex string
    const bigint = Number.parseInt(hex, 16);
    const r = (bigint >> 16) & 255; // Extract the red component
    const g = (bigint >> 8) & 255; // Extract the green component
    const b = bigint & 255; // Extract the blue component

    return { r, g, b };
  }, [effectiveColor]);

  // Pre-calculate color strings
  const colorStrings = useMemo(
    () => ({
      trail: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
      line: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`,
      dot: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
      shadow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`,
    }),
    [rgb],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cache context
    ctxRef.current = canvas.getContext("2d", { alpha: true });
    const ctx = ctxRef.current;
    if (!ctx) return;

    // Throttle resize handler
    let resizeTimeout: number | undefined;
    const resizeCanvas = () => {
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      resizeTimeout = requestAnimationFrame(() => {
        if (!canvas) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        perspectiveRef.current = canvas.width / 2;
      });
    };

    window.addEventListener("resize", resizeCanvas, { passive: true });
    resizeCanvas(); // Call it initially to set correct size

    perspectiveRef.current = canvas.width / 2;
    starsRef.current = [];

    // Initialize stars
    for (let i = 0; i < count; i++) {
      starsRef.current.push({
        x: (Math.random() - 0.5) * 2 * canvas.width,
        y: (Math.random() - 0.5) * 2 * canvas.height,
        z: Math.random() * canvas.width,
        speed: Math.random() * 5 + 2, // Speed for falling effect
      });
    }

    // Optimized draw function - reduced shadow operations
    const drawStar = (star: Star) => {
      if (!ctx || !canvas) return;

      const perspective = perspectiveRef.current;
      const scale = perspective / (perspective + star.z); // 3D perspective scale
      const x2d = canvas.width / 2 + star.x * scale;
      const y2d = canvas.height / 2 + star.y * scale;
      const size = Math.max(scale * 3, 0.5); // Size based on perspective

      // Previous position for a trail effect
      const prevScale = perspective / (perspective + star.z + star.speed * 15);
      const xPrev = canvas.width / 2 + star.x * prevScale;
      const yPrev = canvas.height / 2 + star.y * prevScale;

      // Only draw trail if star is visible and size is reasonable
      if (size > 0.1 && star.z > 0) {
        // Draw trail with reduced blur for better performance
        ctx.save();
        ctx.strokeStyle = colorStrings.trail;
        ctx.lineWidth = size * 2;
        ctx.shadowBlur = 20; // Reduced from 35
        ctx.shadowColor = colorStrings.shadow;
        ctx.beginPath();
        ctx.moveTo(x2d, y2d);
        ctx.lineTo(xPrev, yPrev);
        ctx.stroke();
        ctx.restore();

        // Draw sharp line
        ctx.strokeStyle = colorStrings.line;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(x2d, y2d);
        ctx.lineTo(xPrev, yPrev);
        ctx.stroke();
      }

      // Draw the actual star (dot)
      ctx.fillStyle = colorStrings.dot;
      ctx.beginPath();
      ctx.arc(x2d, y2d, size / 4, 0, Math.PI * 2);
      ctx.fill();
    };

    // Optimized animation function
    let lastTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: DOMHighResTimeStamp) => {
      if (!canvas || !ctx || isPausedRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaTime = currentTime - lastTime;

      // Throttle to target FPS
      if (deltaTime >= frameInterval) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        starsRef.current.forEach((star) => {
          drawStar(star);

          // Move star towards the screen (decrease z)
          star.z -= star.speed;

          // Reset star when it reaches the viewer (z = 0)
          if (star.z <= 0) {
            star.z = canvas.width;
            star.x = (Math.random() - 0.5) * 2 * canvas.width;
            star.y = (Math.random() - 0.5) * 2 * canvas.height;
          }
        });

        lastTime = currentTime - (deltaTime % frameInterval);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Pause animation when page is not visible
    const handleVisibilityChange = () => {
      isPausedRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    animate(0); // Start animation

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (resizeTimeout) {
        cancelAnimationFrame(resizeTimeout);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [count, colorStrings]);

  // Don't render until mounted to avoid hydration mismatch with theme
  if (!mounted) return null;

  return (
    <canvas
      className={cn("absolute inset-0 h-full w-full will-change-contents", className)}
      ref={canvasRef}
      style={{ willChange: "contents" }}
    />
  );
}
