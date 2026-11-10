import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { arcPoints, beamFootprints, entranceSectors, obstacleFootprint, openingPlacement, storageSectors, windowRecess } from "../domain/fixtures";
import { analyzeLayout, drawsAsAllowedOverlap, footprintCorners, issueIsActive, rotateLocal } from "../domain/geometry";
import { activeFurniture } from "../domain/schema";
import { formatCm, normalizeDegrees } from "../domain/units";
import { useEditor } from "../state/store";

interface DragMove {
  mode: "move";
  pointerId: number;
  id: string;
  grabX: number;
  grabZ: number;
}
interface DragRotate {
  mode: "rotate";
  pointerId: number;
  id: string;
  moved: boolean;
}
interface DragPan {
  mode: "pan";
  pointerId: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
}
type Drag = DragMove | DragRotate | DragPan;

/**
 * World +X is screen-right. World +Z is screen-up (the back of the room).
 * z = 0, labeled 手前, sits at the bottom of the plan.
 * The group is translate(offset) scale(ppm) and SVG y = -z, so the scale stays positive.
 * screenY = offsetY - z * ppm.
 */
export function PlanView() {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const updateFurniture = useEditor((s) => s.updateFurniture);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const viewCommand = useEditor((s) => s.viewCommand);
  const room = project.room;
  const furniture = activeFurniture(project);
  const issues = useMemo(() => analyzeLayout(room, furniture), [room, furniture]);
  const issueById = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [ppm, setPpm] = useState(80);
  const [offsetX, setOffsetX] = useState(48);
  const [offsetY, setOffsetY] = useState(480);
  const view = useRef({ ppm, offsetX, offsetY });
  view.current = { ppm, offsetX, offsetY };
  const drag = useRef<Drag | null>(null);
  const userAdjusted = useRef(false);
  const seenCommand = useRef(viewCommand?.id ?? 0);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const viewW = svg.clientWidth;
    const viewH = svg.clientHeight;
    if (viewW < 20 || viewH < 20) return;
    const margin = 72;
    const next = Math.min((viewW - margin * 2) / room.width, (viewH - margin * 2) / room.depth);
    const fitted = Math.max(12, Math.min(next, 400));
    const roomPxH = room.depth * fitted;
    setPpm(fitted);
    setOffsetX((viewW - room.width * fitted) / 2);
    setOffsetY((viewH + roomPxH) / 2);
  }, [room.width, room.depth]);

  useEffect(() => {
    userAdjusted.current = false;
    fit();
  }, [fit]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(() => {
      if (!userAdjusted.current) fit();
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [fit]);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const rect = svg.getBoundingClientRect();
    const { ppm: scale, offsetX: ox, offsetY: oy } = view.current;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { x: (sx - ox) / scale, z: (oy - sy) / scale };
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const world = clientToWorld(clientX, clientY);
    const next = Math.max(12, Math.min(800, view.current.ppm * factor));
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    setPpm(next);
    setOffsetX(sx - world.x * next);
    setOffsetY(sy + world.z * next);
  }, [clientToWorld]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      userAdjusted.current = true;
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    if (!viewCommand || viewCommand.id === seenCommand.current) return;
    seenCommand.current = viewCommand.id;
    const svg = svgRef.current;
    if (!svg) return;
    if (viewCommand.type === "reset") {
      userAdjusted.current = false;
      fit();
      return;
    }
    userAdjusted.current = true;
    const rect = svg.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, viewCommand.type === "zoom-in" ? 1.2 : 1 / 1.2);
  }, [viewCommand, fit, zoomAt]);

  const grid = useMemo(() => {
    const minor: number[] = [];
    const mid: number[] = [];
    const major: number[] = [];
    const push = (value: number, span: number, bucket: number[]) => {
      if (value >= -1e-6 && value <= span + 1e-6) bucket.push(value);
    };
    const steps = Math.ceil(Math.max(room.width, room.depth) / 0.1) + 1;
    for (let i = 0; i <= steps; i++) {
      const value = Math.round(i * 100) / 1000;
      const tenth = Math.round(value * 10);
      if (tenth % 10 === 0) {
        push(value, room.width, major);
        push(value, room.depth, major);
      } else if (tenth % 5 === 0) {
        push(value, room.width, mid);
        push(value, room.depth, mid);
      } else {
        push(value, room.width, minor);
        push(value, room.depth, minor);
      }
    }
    return {
      xMinor: uniqueWithin(minor, room.width),
      xMid: uniqueWithin(mid, room.width),
      xMajor: uniqueWithin(major, room.width),
      zMinor: uniqueWithin(minor, room.depth),
      zMid: uniqueWithin(mid, room.depth),
      zMajor: uniqueWithin(major, room.depth),
    };
  }, [room.width, room.depth]);

  function onBackgroundDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    drag.current = {
      mode: "pan",
      pointerId: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      ox: view.current.offsetX,
      oy: view.current.offsetY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onItemDown(event: PointerEvent, id: string, mode: "move" | "rotate") {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    svgRef.current?.setPointerCapture(event.pointerId);
    select(id);
    beginGesture();
    if (mode === "rotate") {
      drag.current = { mode: "rotate", pointerId: event.pointerId, id, moved: false };
      return;
    }
    const world = clientToWorld(event.clientX, event.clientY);
    const item = activeFurniture(useEditor.getState().project).find((entry) => entry.id === id);
    if (!item) return;
    drag.current = {
      mode: "move",
      pointerId: event.pointerId,
      id,
      grabX: world.x - item.x,
      grabZ: world.z - item.z,
    };
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.mode === "pan") {
      const dx = event.clientX - current.sx;
      const dy = event.clientY - current.sy;
      if (Math.hypot(dx, dy) > 3) current.moved = true;
      userAdjusted.current = true;
      setOffsetX(current.ox + dx);
      setOffsetY(current.oy + dy);
      return;
    }
    const world = clientToWorld(event.clientX, event.clientY);
    if (current.mode === "move") {
      updateFurniture(current.id, { x: world.x - current.grabX, z: world.z - current.grabZ }, "preview");
      return;
    }
    const item = activeFurniture(useEditor.getState().project).find((entry) => entry.id === current.id);
    if (!item) return;
    const dx = world.x - item.x;
    const dz = world.z - item.z;
    if (Math.hypot(dx, dz) < 0.03) return;
    current.moved = true;
    const degrees = (Math.atan2(dx, -dz) * 180) / Math.PI;
    updateFurniture(current.id, { rotation: normalizeDegrees(Math.round(degrees / 90) * 90) }, "preview");
  }

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.mode === "pan") {
      if (!current.moved) select(null);
      return;
    }
    if (current.mode === "rotate" && !current.moved) {
      const item = activeFurniture(useEditor.getState().project).find((entry) => entry.id === current.id);
      if (item) updateFurniture(current.id, { rotation: normalizeDegrees(item.rotation + 90) }, "preview");
    }
    endGesture();
  }

  const outline =
    room.outline.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${-point.z}`).join(" ") + " Z";

  return (
    <div className="viewport">
      <svg
        ref={svgRef}
        className="plan"
        data-testid="view-2d"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Positive scale only. World +Z is up the screen because SVG y is -z. */}
        <g transform={`translate(${offsetX} ${offsetY}) scale(${ppm})`}>
          {grid.zMinor.map((z) => (
            <line key={`zh-${z}`} x1={0} y1={-z} x2={room.width} y2={-z} className="grid minor" strokeWidth={1 / ppm} />
          ))}
          {grid.xMinor.map((x) => (
            <line key={`xv-${x}`} x1={x} y1={0} x2={x} y2={-room.depth} className="grid minor" strokeWidth={1 / ppm} />
          ))}
          {grid.zMid.map((z) => (
            <line key={`zm-${z}`} x1={0} y1={-z} x2={room.width} y2={-z} className="grid mid" strokeWidth={1.25 / ppm} />
          ))}
          {grid.xMid.map((x) => (
            <line key={`xm-${x}`} x1={x} y1={0} x2={x} y2={-room.depth} className="grid mid" strokeWidth={1.25 / ppm} />
          ))}
          {grid.zMajor.map((z) => (
            <line key={`zj-${z}`} x1={0} y1={-z} x2={room.width} y2={-z} className="grid major" strokeWidth={1.7 / ppm} />
          ))}
          {grid.xMajor.map((x) => (
            <line key={`xj-${x}`} x1={x} y1={0} x2={x} y2={-room.depth} className="grid major" strokeWidth={1.7 / ppm} />
          ))}
          <path d={outline} className="room-fill" />
          <defs>
            <pattern id="fixture-hatch" width="0.08" height="0.08" patternUnits="userSpaceOnUse">
              <path d="M-0.02 0.02 L0.02 -0.02 M0 0.08 L0.08 0" stroke="#6d675e" strokeWidth={1 / ppm} />
            </pattern>
          </defs>
          {room.fixtures.map((fixture) => {
            if (fixture.type === "beam") {
              return beamFootprints(fixture, room).map((box, index) => (
                <rect
                  key={`${fixture.id}-${index}`}
                  data-fixture-type="beam"
                  className="fixture fixture-beam"
                  x={box.minX}
                  y={-box.maxZ}
                  width={box.maxX - box.minX}
                  height={box.maxZ - box.minZ}
                  strokeWidth={1.4 / ppm}
                  strokeDasharray={`${7 / ppm} ${5 / ppm}`}
                />
              ));
            }
            if (fixture.type === "window" || fixture.type === "entrance") return null;
            const box = obstacleFootprint(fixture, room);
            if (!box) return null;
            return (
              <g key={fixture.id} data-fixture-type={fixture.type} data-testid={`fixture-${fixture.type}`}>
                <rect
                  className="fixture fixture-solid"
                  x={box.minX}
                  y={-box.maxZ}
                  width={box.maxX - box.minX}
                  height={box.maxZ - box.minZ}
                  strokeWidth={1.4 / ppm}
                />
                <rect
                  className="fixture fixture-hatch"
                  x={box.minX}
                  y={-box.maxZ}
                  width={box.maxX - box.minX}
                  height={box.maxZ - box.minZ}
                />
              </g>
            );
          })}
          <path d={outline} className="room-edge" strokeWidth={2 / ppm} />
          <OpeningGraphics room={room} ppm={ppm} />
          {[...furniture]
            .sort((a, b) => Number(drawsAsAllowedOverlap(a, furniture)) - Number(drawsAsAllowedOverlap(b, furniture)))
            .map((item) => {
            const issue = issueById.get(item.id);
            const warn = Boolean(issue && issueIsActive(issue));
            const selected = item.id === selectedId;
            const allowed = drawsAsAllowedOverlap(item, furniture);
            const className = `${warn ? "furniture warn" : selected ? "furniture selected" : "furniture"}${allowed ? " allow-overlap" : ""}`;
            const strokeWidth = (warn || selected ? 2.6 : 1.4) / ppm;
            const dash = allowed ? `${0.05} ${0.035}` : undefined;
            return (
              <g key={item.id} className={className}>
                {item.shape === "cylinder" ? (
                  <circle
                    cx={item.x}
                    cy={-item.z}
                    r={item.width / 2}
                    fill={item.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dash}
                    onPointerDown={(event) => onItemDown(event, item.id, "move")}
                  />
                ) : (
                  <polygon
                    points={footprintCorners(item)
                      .map((point) => `${point.x},${-point.z}`)
                      .join(" ")}
                    fill={item.color}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                    strokeDasharray={dash}
                    onPointerDown={(event) => onItemDown(event, item.id, "move")}
                  />
                )}
              </g>
            );
          })}
          {room.fixtures.map((fixture) => {
            if (fixture.type !== "storage") return null;
            return storageSectors(fixture, room).map((sector, index) => {
              const points = arcPoints(sector);
              const line = points.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${point.x} ${-point.z}`).join(" ");
              return (
                <path
                  key={`${fixture.id}-swing-${index}`}
                  data-testid="door-swing"
                  className="swing"
                  d={`${line} L${sector.hinge.x} ${-sector.hinge.z} Z`}
                  strokeWidth={1.4 / ppm}
                />
              );
            });
          })}
          {furniture
            .filter((item) => item.id === selectedId)
            .map((item) => {
              const reach = (item.shape === "cylinder" ? item.width : item.depth) / 2;
              const edge = rotateLocal(0, -(reach + 0.02), item.rotation);
              const handle = rotateLocal(0, -(reach + 0.18), item.rotation);
              return (
                <g key={`${item.id}-handle`} className="handle">
                  <line
                    x1={item.x + edge.x}
                    y1={-(item.z + edge.z)}
                    x2={item.x + handle.x}
                    y2={-(item.z + handle.z)}
                    strokeWidth={1.5 / ppm}
                  />
                  <circle
                    cx={item.x + handle.x}
                    cy={-(item.z + handle.z)}
                    r={11 / ppm}
                    strokeWidth={2 / ppm}
                    onPointerDown={(event) => onItemDown(event, item.id, "rotate")}
                  />
                </g>
              );
            })}
        </g>
        <g className="labels" style={{ pointerEvents: "none" }}>
          {room.fixtures.map((fixture) => {
            if (fixture.type !== "entrance") return null;
            const place = openingPlacement(fixture.wall, fixture.offset, fixture.width, room);
            if (!place) return null;
            const at = screenPoint(
              (place.start.x + place.end.x) / 2 + place.into.x * 0.22,
              (place.start.z + place.end.z) / 2 + place.into.z * 0.22,
              offsetX,
              offsetY,
              ppm,
            );
            return (
              <text key={`entrance-${fixture.id}`} x={at.x} y={at.y} textAnchor="middle" fontSize={12} fill="#245074">
                入口
              </text>
            );
          })}
          {furniture.map((item) => {
            const at = screenPoint(item.x, item.z, offsetX, offsetY, ppm);
            return (
              <text key={`label-${item.id}`} x={at.x} y={at.y} textAnchor="middle" dominantBaseline="central" fontSize={12}>
                {item.name}
              </text>
            );
          })}
          <text
            x={screenPoint(room.width / 2, -0.18, offsetX, offsetY, ppm).x}
            y={screenPoint(room.width / 2, -0.18, offsetX, offsetY, ppm).y}
            textAnchor="middle"
            fontSize={12}
          >
            手前 {formatCm(room.width)} cm
          </text>
          <text
            x={screenPoint(room.width / 2, room.depth + 0.14, offsetX, offsetY, ppm).x}
            y={screenPoint(room.width / 2, room.depth + 0.14, offsetX, offsetY, ppm).y}
            textAnchor="middle"
            fontSize={12}
          >
            奥
          </text>
          <text
            textAnchor="middle"
            fontSize={12}
            transform={`translate(${screenPoint(-0.18, room.depth / 2, offsetX, offsetY, ppm).x} ${screenPoint(-0.18, room.depth / 2, offsetX, offsetY, ppm).y}) rotate(-90)`}
          >
            {formatCm(room.depth)} cm
          </text>
        </g>
      </svg>
    </div>
  );
}

function OpeningGraphics({ room, ppm }: { room: { width: number; depth: number; fixtures: import("../domain/types").Room["fixtures"] }; ppm: number }) {
  return (
    <>
      {room.fixtures.map((fixture) => {
        if (fixture.type === "window") {
          const place = openingPlacement(fixture.wall, fixture.offset, fixture.width, room);
          const recess = windowRecess(fixture, room);
          if (!place) return null;
          const dx = place.end.x - place.start.x;
          const dz = place.end.z - place.start.z;
          const len = Math.hypot(dx, dz) || 1;
          const along = { x: dx / len, z: dz / len };
          const mid = { x: (place.start.x + place.end.x) / 2, z: (place.start.z + place.end.z) / 2 };
          const pane = (shift: number, lift: number) => {
            const center = {
              x: mid.x + along.x * shift + place.outward.x * lift,
              z: mid.z + along.z * shift + place.outward.z * lift,
            };
            const half = fixture.width * 0.28;
            const thick = 0.03;
            const a = { x: center.x - along.x * half + place.outward.x * thick, z: center.z - along.z * half + place.outward.z * thick };
            const b = { x: center.x + along.x * half + place.outward.x * thick, z: center.z + along.z * half + place.outward.z * thick };
            const c = { x: center.x + along.x * half - place.outward.x * thick, z: center.z + along.z * half - place.outward.z * thick };
            const d = { x: center.x - along.x * half - place.outward.x * thick, z: center.z - along.z * half - place.outward.z * thick };
            return [a, b, c, d];
          };
          const panes = fixture.style === "sliding" ? [pane(-fixture.width * 0.12, 0.02), pane(fixture.width * 0.12, -0.02)] : [pane(0, 0)];
          return (
            <g key={fixture.id} data-fixture-type="window" data-testid="fixture-window" className="fixture">
              {recess && (
                <rect className="window-recess" x={recess.minX} y={-recess.maxZ} width={recess.maxX - recess.minX} height={recess.maxZ - recess.minZ} strokeWidth={1.2 / ppm} />
              )}
              {panes.map((corners, index) => (
                <polygon key={index} className="window-pane" points={corners.map((point) => `${point.x},${-point.z}`).join(" ")} strokeWidth={1.2 / ppm} />
              ))}
            </g>
          );
        }
        if (fixture.type !== "entrance") return null;
        const place = openingPlacement(fixture.wall, fixture.offset, fixture.width, room);
        if (!place) return null;
        return (
          <g key={fixture.id} data-fixture-type="entrance" data-testid="fixture-entrance" className="fixture">
            <polygon
              className="entrance-gap"
              points={[place.start, place.end, { x: place.end.x + place.into.x * 0.08, z: place.end.z + place.into.z * 0.08 }, { x: place.start.x + place.into.x * 0.08, z: place.start.z + place.into.z * 0.08 }]
                .map((point) => `${point.x},${-point.z}`)
                .join(" ")}
            />
            {entranceSectors(fixture, room).map((sector, index) => {
              const points = arcPoints(sector);
              const line = points.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${point.x} ${-point.z}`).join(" ");
              return <path key={index} className="swing" d={`${line} L${sector.hinge.x} ${-sector.hinge.z} Z`} strokeWidth={1.4 / ppm} />;
            })}
          </g>
        );
      })}
    </>
  );
}

function screenPoint(x: number, z: number, offsetX: number, offsetY: number, ppm: number): { x: number; y: number } {
  return { x: offsetX + x * ppm, y: offsetY - z * ppm };
}

function uniqueWithin(values: number[], span: number): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (value < -1e-6 || value > span + 1e-4) continue;
    const key = Math.round(value * 1000);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(Math.min(value, span));
  }
  return result;
}
