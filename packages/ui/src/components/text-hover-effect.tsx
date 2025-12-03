import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";

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
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
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

  // Update target position when cursor moves
  useEffect(() => {
    if (svgRef.current && hovered && cursor.x !== null && cursor.y !== null) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const cxPercentage = ((cursor.x - svgRect.left) / svgRect.width) * 100;
      const cyPercentage = ((cursor.y - svgRect.top) / svgRect.height) * 100;

      targetPositionRef.current = { cx: cxPercentage, cy: cyPercentage };
    }
  }, [cursor, hovered]);

  return (
    <svg
      className={cn("select-none pointer-events-auto", className)}
      height="100%"
      onMouseEnter={(e) => {
        setHovered(true);
        // Immediately set position to mouse location when entering
        if (svgRef.current) {
          const svgRect = svgRef.current.getBoundingClientRect();
          const cxPercentage = ((e.clientX - svgRect.left) / svgRect.width) * 100;
          const cyPercentage = ((e.clientY - svgRect.top) / svgRect.height) * 100;
          
          // Set both current and target to mouse position to avoid animation from center
          currentPositionRef.current = { cx: cxPercentage, cy: cyPercentage };
          targetPositionRef.current = { cx: cxPercentage, cy: cyPercentage };
          
          // Set radius to normal size
          currentRadiusRef.current = NORMAL_RADIUS;
          targetRadiusRef.current = NORMAL_RADIUS;
          
          // Immediately update gradient position and radius
          if (gradientRef.current) {
            gradientRef.current.setAttribute("cx", `${cxPercentage}%`);
            gradientRef.current.setAttribute("cy", `${cyPercentage}%`);
            gradientRef.current.setAttribute("r", `${NORMAL_RADIUS}%`);
          }
        }
        setCursor({ x: e.clientX, y: e.clientY });
      }}
      onMouseLeave={() => {
        setHovered(false);
        // Shrink radius to 0 instead of moving to center - avoids bounce effect
        // Keep position at current location, just shrink the radius
        targetRadiusRef.current = 0;
      }}
      onMouseMove={(e) => {
        setCursor({ x: e.clientX, y: e.clientY });
      }}
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
          {hovered && (
            <>
              <stop offset="0%" stopColor="#eab308" />
              <stop offset="25%" stopColor="#ef4444" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="75%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </>
          )}
        </linearGradient>

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
        className="fill-transparent stroke-neutral-200 font-[helvetica] text-7xl font-bold dark:stroke-neutral-800"
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
        className="fill-transparent stroke-neutral-200 font-[helvetica] text-7xl font-bold dark:stroke-neutral-800"
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
      {/* Colored fill and stroke layer - follows mouse */}
      {hovered && (
        <text
          className="font-[helvetica] text-7xl font-bold"
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
      )}
    </svg>
  );
};
