import { cn } from "@raypx/ui/lib/utils";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

export const TextHoverEffect = ({
  text,
  duration = 0.3,
  strokeDuration = 4,
  className,
}: {
  text: string;
  duration?: number;
  strokeDuration?: number;
  automatic?: boolean;
  className?: string;
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientRef = useRef<SVGRadialGradientElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [_cursor, setCursor] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const currentPositionRef = useRef({ cx: 50, cy: 50 });
  const targetPositionRef = useRef({ cx: 50, cy: 50 });
  const currentRadiusRef = useRef(0);
  const targetRadiusRef = useRef(0);
  const NORMAL_RADIUS = 30; // Normal radius percentage

  // Smooth interpolation function (easing)
  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  // Helper to update position based on mouse/touch coordinates
  const updatePosition = useCallback((clientX: number, clientY: number, immediate = false) => {
    if (svgRef.current) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const cxPercentage = ((clientX - svgRect.left) / svgRect.width) * 100;
      const cyPercentage = ((clientY - svgRect.top) / svgRect.height) * 100;

      const newPos = { cx: cxPercentage, cy: cyPercentage };
      targetPositionRef.current = newPos;

      if (immediate) {
        currentPositionRef.current = newPos;
        currentRadiusRef.current = NORMAL_RADIUS;
        targetRadiusRef.current = NORMAL_RADIUS;

        if (gradientRef.current) {
          gradientRef.current.setAttribute("cx", `${cxPercentage}%`);
          gradientRef.current.setAttribute("cy", `${cyPercentage}%`);
          gradientRef.current.setAttribute("r", `${NORMAL_RADIUS}%`);
        }
      }
    }
    setCursor({ x: clientX, y: clientY });
  }, []);

  // Continuous animation loop
  useEffect(() => {
    let isRunning = true;

    const animate = () => {
      if (!isRunning || !gradientRef.current) return;

      const current = currentPositionRef.current;
      const target = targetPositionRef.current;

      // Calculate easing factor for smooth animation
      const easingFactor = duration > 0 ? Math.min(0.2 / duration, 0.4) : 0.4;

      // Interpolate position
      const newCx = lerp(current.cx, target.cx, easingFactor);
      const newCy = lerp(current.cy, target.cy, easingFactor);

      // Interpolate radius
      const newRadius = lerp(currentRadiusRef.current, targetRadiusRef.current, easingFactor);

      currentPositionRef.current = { cx: newCx, cy: newCy };
      currentRadiusRef.current = newRadius;

      // Update gradient directly
      gradientRef.current.setAttribute("cx", `${newCx}%`);
      gradientRef.current.setAttribute("cy", `${newCy}%`);
      gradientRef.current.setAttribute("r", `${newRadius}%`);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [duration]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setHovered(true);
    updatePosition(e.clientX, e.clientY, true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    targetRadiusRef.current = 0;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    updatePosition(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (touch) {
      updatePosition(touch.clientX, touch.clientY);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      setHovered(true);
      updatePosition(touch.clientX, touch.clientY, true);
    }
  };

  const handleTouchEnd = () => {
    setHovered(false);
    targetRadiusRef.current = 0;
  };

  return (
    <svg
      className={cn("pointer-events-auto select-none", className)}
      height="100%"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      ref={svgRef}
      style={{ display: "block" }}
      viewBox="0 0 300 100"
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id="textGradient"
          x1="0%"
          x2="100%"
          y1="0%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#eab308" />
          <stop offset="25%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="75%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        <motion.linearGradient
          animate={{
            x1: ["-100%", "100%"],
            x2: ["0%", "200%"],
          }}
          gradientUnits="userSpaceOnUse"
          id="rainbowGradient"
          initial={{
            x1: "-100%",
            x2: "0%",
          }}
          transition={{
            duration: 4,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: "loop",
            ease: "linear",
          }}
          y1="0%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#eab308" stopOpacity="0" />
          <stop offset="20%" stopColor="#ef4444" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
          <stop offset="80%" stopColor="#06b6d4" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </motion.linearGradient>

        <radialGradient
          cx="50%"
          cy="50%"
          gradientUnits="userSpaceOnUse"
          id="revealMask"
          r="0%"
          ref={gradientRef}
        >
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="50%" stopColor="white" stopOpacity="0.9" />
          <stop offset="80%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="black" stopOpacity="0" />
        </radialGradient>
        <mask id="textMask">
          <rect fill="url(#revealMask)" height="100%" width="100%" x="0" y="0" />
        </mask>
      </defs>
      <text
        className="fill-transparent stroke-neutral-200 font-[helvetica] font-bold text-7xl transition-opacity duration-300 dark:stroke-neutral-800"
        dominantBaseline="middle"
        strokeWidth="0.3"
        style={{ opacity: hovered ? 0.7 : 0 }}
        textAnchor="middle"
        x="50%"
        y="50%"
      >
        {text}
      </text>
      <motion.text
        animate={{
          strokeDashoffset: 0,
          strokeDasharray: 1000,
        }}
        className="fill-transparent stroke-neutral-200 font-[helvetica] font-bold text-7xl dark:stroke-neutral-800"
        dominantBaseline="middle"
        initial={{ strokeDashoffset: 1000, strokeDasharray: 1000 }}
        strokeWidth="0.3"
        textAnchor="middle"
        transition={{
          duration: strokeDuration,
          ease: "easeInOut",
        }}
        x="50%"
        y="50%"
      >
        {text}
      </motion.text>

      {/* Rainbow flow effect when not hovered */}
      {!hovered && (
        <text
          className="fill-transparent font-[helvetica] font-bold text-7xl"
          dominantBaseline="middle"
          stroke="url(#rainbowGradient)"
          strokeWidth="0.3"
          textAnchor="middle"
          x="50%"
          y="50%"
        >
          {text}
        </text>
      )}

      {/* Colored fill and stroke layer - follows mouse */}
      <text
        className="font-[helvetica] font-bold text-7xl"
        dominantBaseline="middle"
        fill="url(#textGradient)"
        mask="url(#textMask)"
        stroke="url(#textGradient)"
        strokeWidth="0.5"
        textAnchor="middle"
        x="50%"
        y="50%"
      >
        {text}
      </text>
    </svg>
  );
};
