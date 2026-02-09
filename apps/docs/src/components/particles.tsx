"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// Create a glowing circular particle texture
function createParticleTexture() {
  if (typeof document === "undefined") {
    return new THREE.Texture();
  }

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");

  if (!context) {
    return new THREE.Texture();
  }

  // Create radial gradient for glowing effect
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);

  // White center, fading to transparent edge
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.8)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.4)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function Particles() {
  const particlesRef = useRef<THREE.Points>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetMouseRef = useRef({ x: 0, y: 0 });

  // Create texture on client side only
  const particleTexture = useMemo(() => createParticleTexture(), []);

  // Generate particle positions
  const [positions, colors, sizes] = useMemo(() => {
    const particleCount = 4000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Create spherical distribution
      const radius = Math.random() * 15 + 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Matrix green colors - professional geek style
      const color = new THREE.Color();
      // Green to cyan gradient (0.25-0.45 in HSL)
      const hue = 0.25 + Math.random() * 0.2;
      const saturation = 0.85 + Math.random() * 0.15; // High saturation
      const lightness = 0.45 + Math.random() * 0.3; // Varying brightness
      color.setHSL(hue, saturation, lightness);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;

      // Random sizes
      sizes[i] = Math.random() * 2 + 0.5;
    }

    return [positions, colors, sizes];
  }, []);

  // Mouse move handler with cleanup
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      targetMouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      targetMouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useFrame((state) => {
    if (particlesRef.current) {
      const time = state.clock.getElapsedTime();

      // Smooth mouse following
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.02;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.02;

      // Gentle rotation
      particlesRef.current.rotation.y = time * 0.03 + mouseRef.current.x * 0.3;
      particlesRef.current.rotation.x = mouseRef.current.y * 0.3;

      // Add wave motion to particles
      const positionAttribute = particlesRef.current.geometry.attributes.position;
      if (positionAttribute) {
        const positions = positionAttribute.array as Float32Array;
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i] ?? 0;
          positions[i + 2] = (positions[i + 2] ?? 0) + Math.sin(time * 0.5 + x * 0.1) * 0.002;
        }
        positionAttribute.needsUpdate = true;
      }
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          args={[positions, 3]}
          array={positions}
          attach="attributes-position"
          count={positions.length / 3}
          itemSize={3}
        />
        <bufferAttribute
          args={[colors, 3]}
          array={colors}
          attach="attributes-color"
          count={colors.length / 3}
          itemSize={3}
        />
        <bufferAttribute
          args={[sizes, 1]}
          array={sizes}
          attach="attributes-size"
          count={sizes.length}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        alphaMap={particleTexture}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        map={particleTexture}
        opacity={0.8}
        size={0.15}
        sizeAttenuation
        transparent
        vertexColors
      />
    </points>
  );
}

export function ParticleBackground() {
  return (
    <div className="fixed inset-0 -z-10 opacity-70">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 75 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <Particles />
      </Canvas>
    </div>
  );
}
