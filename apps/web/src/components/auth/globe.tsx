"use client";

import { Button } from "@ecolens/ui/components/button";
import { cn } from "@ecolens/ui/lib/utils";
import { Crosshair, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GHANA_BORDER, LAND_DOTS, LAND_SAMPLE_COUNT } from "./globe-data";
import { PILOT_BASINS, PILOT_CENTER, PILOT_RIVERS } from "./pilot-geography";

// A dotted orthographic globe drawn on a 2D canvas. Everything it shows is
// bundled (about 6 KB gzipped), so it renders instantly on slow or no network
// and costs nothing in tiles. The full map (MapLibre + deck.gl) stays on the
// signed-in routes.

type GlobeProps = { lite: boolean; className?: string };

const DEG = Math.PI / 180;
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 14;
const FOCUS_ZOOM = 9;
const HOME = { lon: PILOT_CENTER[0] + 2, lat: 9, zoom: 1.15 };
const IDLE_RETURN_MS = 6000;

const COLORS = {
  ocean: "rgba(45, 212, 191, 0.06)",
  rim: "rgba(94, 234, 212, 0.22)",
  dot: "167, 243, 208",
  ghanaFill: "rgba(52, 211, 153, 0.16)",
  ghanaStroke: "rgba(110, 231, 183, 0.85)",
  basinFill: "rgba(251, 191, 36, 0.18)",
  basinStroke: "rgba(251, 191, 36, 0.8)",
  river: "rgba(125, 211, 252, 0.95)",
  pulse: "251, 191, 36",
  label: "rgba(236, 253, 245, 0.8)",
};

// Unit vectors of the land dots, decoded once.
let landXYZ: Float32Array | null = null;
function getLand() {
  if (landXYZ) return landXYZ;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const deltas = LAND_DOTS.split(",");
  const out = new Float32Array(deltas.length * 3);
  let i = 0;
  deltas.forEach((d, k) => {
    i += Number.parseInt(d, 36);
    const y = 1 - (2 * (i + 0.5)) / LAND_SAMPLE_COUNT;
    const r = Math.sqrt(1 - y * y);
    const theta = i * golden;
    out[k * 3] = r * Math.sin(theta);
    out[k * 3 + 1] = y;
    out[k * 3 + 2] = r * Math.cos(theta);
  });
  landXYZ = out;
  return out;
}

type View = { lon: number; lat: number; zoom: number };

export default function Globe({ lite, className }: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef<{ zoomBy: (f: number) => void; focus: (on: boolean) => void } | null>(
    null,
  );
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const land = getLand();
    const n = land.length / 3;
    const sx = new Float32Array(n);
    const sy = new Float32Array(n);
    const bucket = new Uint8Array(n);

    const view: View = lite ? { ...HOME } : { lon: HOME.lon + 80, lat: HOME.lat, zoom: 0.95 };
    let target: View | null = lite ? null : { ...HOME };
    const velocity = { lon: 0, lat: 0 };
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dirty = true;
    let visible = true;
    let lastInteraction = performance.now();
    let isFocused = false;
    const start = performance.now();

    const setFocus = (on: boolean) => {
      isFocused = on;
      setFocused(on);
    };

    // --- projection --------------------------------------------------------
    let cosL = 1;
    let sinL = 0;
    let cosP = 1;
    let sinP = 0;
    let R = 1;
    let cx = 0;
    let cy = 0;
    const updateProjection = () => {
      cosL = Math.cos(view.lon * DEG);
      sinL = Math.sin(view.lon * DEG);
      cosP = Math.cos(view.lat * DEG);
      sinP = Math.sin(view.lat * DEG);
      R = Math.min(width, height) * 0.42 * view.zoom;
      cx = width / 2;
      cy = height / 2;
    };
    // Projects [lon, lat] into out = [x, y, depth]; depth <= 0 is the far side.
    const out = [0, 0, 0];
    const project = (lon: number, lat: number) => {
      const cl = Math.cos(lat * DEG);
      const x = cl * Math.sin(lon * DEG);
      const y = Math.sin(lat * DEG);
      const z = cl * Math.cos(lon * DEG);
      const x1 = x * cosL - z * sinL;
      const z1 = x * sinL + z * cosL;
      out[0] = cx + R * x1;
      out[1] = cy - R * (y * cosP - z1 * sinP);
      out[2] = y * sinP + z1 * cosP;
      return out;
    };

    const tracePath = (coords: readonly (readonly [number, number])[], close: boolean) => {
      let pen = false;
      for (const [lon, lat] of coords) {
        const [x, y, z] = project(lon, lat);
        if (z <= 0) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        pen = true;
      }
      if (close && pen) ctx.closePath();
    };

    // --- drawing -----------------------------------------------------------
    const draw = (now: number) => {
      updateProjection();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Sphere and atmosphere rim.
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.ocean;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.rim;
      ctx.stroke();

      // Land dots, bucketed by depth so the limb fades without per-dot styles.
      const size = Math.min(1.1 + view.zoom * 0.45, 3);
      const zoomFade = view.zoom > 4 ? Math.max(0.35, 1 - (view.zoom - 4) / 8) : 1;
      for (let i = 0; i < n; i++) {
        const x = land[i * 3] as number;
        const y = land[i * 3 + 1] as number;
        const z = land[i * 3 + 2] as number;
        const x1 = x * cosL - z * sinL;
        const z1 = x * sinL + z * cosL;
        const depth = y * sinP + z1 * cosP;
        if (depth <= 0.02) {
          bucket[i] = 0;
          continue;
        }
        const px = cx + R * x1;
        const py = cy - R * (y * cosP - z1 * sinP);
        if (px < -4 || py < -4 || px > width + 4 || py > height + 4) {
          bucket[i] = 0;
          continue;
        }
        sx[i] = px;
        sy[i] = py;
        bucket[i] = depth > 0.6 ? 4 : depth > 0.35 ? 3 : depth > 0.15 ? 2 : 1;
      }
      const half = size / 2;
      for (let b = 1; b <= 4; b++) {
        ctx.fillStyle = `rgba(${COLORS.dot}, ${(0.12 + b * 0.16) * zoomFade})`;
        for (let i = 0; i < n; i++) {
          if (bucket[i] === b)
            ctx.fillRect((sx[i] as number) - half, (sy[i] as number) - half, size, size);
        }
      }

      // Ghana.
      ctx.beginPath();
      tracePath(GHANA_BORDER, true);
      ctx.fillStyle = COLORS.ghanaFill;
      ctx.fill();
      ctx.lineWidth = view.zoom > 3 ? 1.25 : 1;
      ctx.strokeStyle = COLORS.ghanaStroke;
      ctx.stroke();

      // Pilot basins and rivers become legible once zoomed in.
      const detail = Math.min(1, Math.max(0, (view.zoom - 2.5) / 2.5));
      if (detail > 0) {
        ctx.globalAlpha = detail;
        for (const basin of PILOT_BASINS) {
          ctx.beginPath();
          tracePath(basin.ring, true);
          ctx.fillStyle = COLORS.basinFill;
          ctx.fill();
          ctx.setLineDash([4, 3]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = COLORS.basinStroke;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = Math.min(1 + view.zoom * 0.15, 2.5);
        ctx.strokeStyle = COLORS.river;
        for (const river of PILOT_RIVERS) {
          ctx.beginPath();
          tracePath(river.course, false);
          ctx.stroke();
        }
        if (view.zoom > 6) {
          ctx.globalAlpha = Math.min(1, (view.zoom - 6) / 1.5);
          ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
          ctx.fillStyle = COLORS.label;
          ctx.textAlign = "center";
          for (const river of PILOT_RIVERS) {
            const [x, y, z] = project(river.label[0], river.label[1]);
            if (z > 0) ctx.fillText(river.name, x, y);
          }
        }
        ctx.globalAlpha = 1;
      }

      // Pilot marker: a pulse while the area is too small to read.
      const marker = 1 - detail;
      const [mx, my, mz] = project(PILOT_CENTER[0], PILOT_CENTER[1]);
      if (marker > 0 && mz > 0) {
        const t = lite ? 0.35 : ((now - start) / 2200) % 1;
        ctx.beginPath();
        ctx.arc(mx, my, 3 + t * 16, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${COLORS.pulse}, ${(1 - t) * 0.8 * marker})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${COLORS.pulse}, ${marker})`;
        ctx.fill();
      }
    };

    // --- motion ------------------------------------------------------------
    let frame = 0;
    let last = performance.now();
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let lastMoveTime = 0;

    const clampView = () => {
      view.lat = Math.max(-80, Math.min(80, view.lat));
      view.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom));
      view.lon = ((((view.lon + 180) % 360) + 360) % 360) - 180;
    };

    const step = (dt: number, now: number) => {
      let moving = false;
      const dragging = pointers.size > 0;

      if (target) {
        const k = 1 - Math.exp(-dt * 3.2);
        let dLon = target.lon - view.lon;
        dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
        view.lon += dLon * k;
        view.lat += (target.lat - view.lat) * k;
        view.zoom *= (target.zoom / view.zoom) ** k;
        if (
          Math.abs(dLon) < 0.01 &&
          Math.abs(target.lat - view.lat) < 0.01 &&
          Math.abs(target.zoom / view.zoom - 1) < 0.001
        ) {
          view.lon = target.lon;
          view.lat = target.lat;
          view.zoom = target.zoom;
          target = null;
        }
        moving = true;
      } else if (!dragging && (Math.abs(velocity.lon) > 0.001 || Math.abs(velocity.lat) > 0.001)) {
        // Inertia after a fling.
        view.lon += velocity.lon * dt;
        view.lat += velocity.lat * dt;
        const decay = Math.exp(-dt * 3);
        velocity.lon *= decay;
        velocity.lat *= decay;
        moving = true;
      } else if (!lite && !dragging && !isFocused && now - lastInteraction > IDLE_RETURN_MS) {
        // Idle: drift gently around the pilot area, easing home if moved away.
        const sway = Math.sin((now - start) / 9000) * 14;
        const k = 1 - Math.exp(-dt * 0.6);
        let dLon = HOME.lon + sway - view.lon;
        dLon = ((((dLon + 180) % 360) + 360) % 360) - 180;
        view.lon += dLon * k;
        view.lat += (HOME.lat - view.lat) * k;
        view.zoom *= (HOME.zoom / view.zoom) ** k;
        moving = true;
      }
      clampView();
      return moving;
    };

    const loop = (now: number) => {
      frame = 0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const moving = step(dt, now);
      // The pulse keeps animating only while it is on screen and motion is allowed.
      const pulsing = !lite && view.zoom < 5;
      if (moving || dirty || pulsing) draw(now);
      dirty = false;
      if (visible && (moving || pulsing || target)) frame = requestAnimationFrame(loop);
    };
    const wake = () => {
      dirty = true;
      if (!frame && visible) {
        last = performance.now();
        frame = requestAnimationFrame(loop);
      }
    };
    const interact = () => {
      lastInteraction = performance.now();
      target = null;
    };

    controls.current = {
      zoomBy: (f) => {
        interact();
        target = {
          lon: view.lon,
          lat: view.lat,
          zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * f)),
        };
        if (lite) {
          view.zoom = target.zoom;
          target = null;
        }
        wake();
      },
      focus: (on) => {
        interact();
        setFocus(on);
        target = on
          ? { lon: PILOT_CENTER[0], lat: PILOT_CENTER[1], zoom: FOCUS_ZOOM }
          : { ...HOME };
        if (lite) {
          Object.assign(view, target);
          target = null;
        }
        wake();
      },
    };

    // --- input -------------------------------------------------------------
    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastMoveTime = 0;
      velocity.lon = 0;
      velocity.lat = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
      interact();
      wake();
    };
    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, next);
      interact();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance > 0) view.zoom *= d / pinchDistance;
        pinchDistance = d;
      } else {
        const k = 1 / (R * DEG);
        const dLon = -(next.x - prev.x) * k;
        const dLat = (next.y - prev.y) * k;
        view.lon += dLon;
        view.lat += dLat;
        // Velocity in degrees per second, smoothed for a natural fling.
        const dt = Math.max(1, e.timeStamp - (lastMoveTime || e.timeStamp - 16)) / 1000;
        velocity.lon = velocity.lon * 0.5 + (dLon / dt) * 0.5;
        velocity.lat = velocity.lat * 0.5 + (dLat / dt) * 0.5;
      }
      lastMoveTime = e.timeStamp;
      clampView();
      if (lite) {
        velocity.lon = 0;
        velocity.lat = 0;
      }
      wake();
    };
    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinchDistance = 0;
      // A pause before release cancels the fling.
      if (e.timeStamp - lastMoveTime > 80) {
        velocity.lon = 0;
        velocity.lat = 0;
      }
      wake();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      interact();
      view.zoom *= Math.exp(-e.deltaY * 0.0015);
      clampView();
      wake();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const stepDeg = 8 / view.zoom;
      const keys: Record<string, () => void> = {
        ArrowLeft: () => (view.lon -= stepDeg),
        ArrowRight: () => (view.lon += stepDeg),
        ArrowUp: () => (view.lat += stepDeg),
        ArrowDown: () => (view.lat -= stepDeg),
        "+": () => (view.zoom *= 1.25),
        "=": () => (view.zoom *= 1.25),
        "-": () => (view.zoom /= 1.25),
      };
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      interact();
      action();
      clampView();
      wake();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKeyDown);

    // --- sizing and visibility ----------------------------------------------
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      wake();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting && document.visibilityState === "visible";
      if (visible) wake();
    });
    intersection.observe(canvas);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    resize();

    return () => {
      cancelAnimationFrame(frame);
      controls.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKeyDown);
    };
  }, [lite]);

  return (
    <div className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="Globe centred on the Western Region of Ghana, showing the approximate Pra and Ankobra pilot basins. Drag or use arrow keys to rotate, scroll or plus and minus to zoom."
        className="size-full cursor-grab touch-none outline-none select-none focus-visible:ring-1 focus-visible:ring-emerald-300/50 active:cursor-grabbing"
      />
      <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-px">
        <GlobeButton label="Zoom in" onClick={() => controls.current?.zoomBy(1.6)}>
          <Plus />
        </GlobeButton>
        <GlobeButton label="Zoom out" onClick={() => controls.current?.zoomBy(1 / 1.6)}>
          <Minus />
        </GlobeButton>
        <GlobeButton
          label={focused ? "Show whole globe" : "Focus on the pilot basins"}
          pressed={focused}
          onClick={() => controls.current?.focus(!focused)}
        >
          <Crosshair />
        </GlobeButton>
      </div>
    </div>
  );
}

function GlobeButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "border border-white/10 bg-white/5 text-emerald-50/80 backdrop-blur-sm hover:bg-white/10 hover:text-white dark:hover:bg-white/10",
        pressed && "border-amber-300/50 bg-amber-300/15 text-amber-100",
      )}
    >
      {children}
    </Button>
  );
}
