import { cn } from "@raypx/ui/lib/utils";
import { type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";

interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  spotlightColor?: string;
  borderGlow?: boolean;
}

export function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(120, 119, 198, 0.3)",
  borderGlow = true,
  ...props
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const div = divRef.current;
    if (!div) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = div.getBoundingClientRect();
      setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    const handleMouseEnter = () => {
      setOpacity(1);
    };

    const handleMouseLeave = () => {
      setOpacity(0);
    };

    const handleFocus = () => {
      setOpacity(1);
    };

    const handleBlur = () => {
      setOpacity(0);
    };

    div.addEventListener("mousemove", handleMouseMove);
    div.addEventListener("mouseenter", handleMouseEnter);
    div.addEventListener("mouseleave", handleMouseLeave);
    div.addEventListener("focus", handleFocus, true);
    div.addEventListener("blur", handleBlur, true);

    return () => {
      div.removeEventListener("mousemove", handleMouseMove);
      div.removeEventListener("mouseenter", handleMouseEnter);
      div.removeEventListener("mouseleave", handleMouseLeave);
      div.removeEventListener("focus", handleFocus, true);
      div.removeEventListener("blur", handleBlur, true);
    };
  }, []);

  return (
    <div
      className={cn(
        "group/card relative rounded-xl text-card-foreground transition-all duration-500",
        className,
      )}
      ref={divRef}
      {...props}
    >
      {/* Animated border gradient */}
      {borderGlow && (
        <div
          className="absolute -inset-[1px] rounded-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 blur-[1px]"
          style={{
            background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, rgba(120, 119, 198, 0.4), rgba(59, 130, 246, 0.2), transparent 60%)`,
            opacity: opacity * 0.8,
          }}
        />
      )}

      {/* Card background with subtle gradient */}
      <div className="absolute inset-[1px] rounded-xl bg-card/90 backdrop-blur-xl" />

      {/* Inner border */}
      <div className="absolute inset-0 rounded-xl border border-white/[0.08] group-hover/card:border-white/[0.15] transition-colors duration-500" />

      {/* Spotlight effect */}
      <div
        className="pointer-events-none absolute -inset-px rounded-xl transition duration-500"
        style={{
          opacity,
          background: `radial-gradient(800px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 40%)`,
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-primary/20 rounded-tl-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-primary/20 rounded-tr-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b border-l border-primary/20 rounded-bl-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b border-r border-primary/20 rounded-br-xl opacity-0 group-hover/card:opacity-100 transition-opacity duration-500" />

      {/* Content */}
      <div className="relative h-full z-10">{children}</div>
    </div>
  );
}
