import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { beamFootprints, entranceSectors, obstacleFootprint, openingPlacement, storageSectors, wallSolids, windowRecess } from "../domain/fixtures";
import { analyzeLayout, issueIsActive } from "../domain/geometry";
import { activeFurniture } from "../domain/schema";
import { roundM } from "../domain/units";
import type { Furniture, Room } from "../domain/types";
import { useEditor } from "../state/store";

export function RoomScene() {
  return (
    <div className="viewport" data-testid="view-3d">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        camera={{ fov: 42, near: 0.05, far: 80, position: [1.3, 4.2, -2.4] }}
        onCreated={({ gl }) => {
          gl.domElement.style.touchAction = "none";
        }}
      >
        <color attach="background" args={["#d9d3c6"]} />
        <Scene />
      </Canvas>
    </div>
  );
}

function Scene() {
  const room = useEditor((s) => s.project.room);
  const furniture = useEditor((s) => activeFurniture(s.project));
  const selectedId = useEditor((s) => s.selectedId);
  const wallsVisible = useEditor((s) => s.wallsVisible);
  const wallsTransparent = useEditor((s) => s.wallsTransparent);
  const orbitEnabled = useEditor((s) => s.orbitEnabled);
  const issues = useMemo(() => new Map(analyzeLayout(room, furniture).map((issue) => [issue.id, issue])), [room, furniture]);
  const walls = useMemo(() => wallSolids(room, 0.08), [room]);

  return (
    <>
      <ambientLight intensity={0.72} />
      <directionalLight position={[room.width, room.ceilingHeight * 1.6, -1]} intensity={1.05} />
      <hemisphereLight args={["#f7f1e6", "#c9bfb0", 0.45]} />
      <Floor room={room} />
      <FloorGrid width={room.width} depth={room.depth} />
      <FixtureMeshes />
      {wallsVisible &&
        walls.map((wall, index) => (
          <mesh
            key={index}
            position={[wall.cx, wall.cy, wall.cz]}
            raycast={() => undefined}
          >
            <boxGeometry args={[wall.sx, wall.sy, wall.sz]} />
            <meshStandardMaterial
              color="#f4f1ea"
              transparent={wallsTransparent}
              opacity={wallsTransparent ? 0.28 : 1}
              depthWrite={!wallsTransparent}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      {furniture.map((item) => (
        <FurnitureMesh
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          warned={Boolean(
            issues.get(item.id) &&
              (issues.get(item.id) ? issueIsActive(issues.get(item.id)!) : false),
          )}
        />
      ))}
      <OrbitControls
        makeDefault
        enabled={orbitEnabled}
        enableDamping
        dampingFactor={0.12}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={0.5}
        maxDistance={40}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
      <MatchPlanCamera />
      <CameraRig />
      <PointerDrag />
    </>
  );
}

function Floor({ room }: { room: Room }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[room.width / 2, 0, room.depth / 2]} userData={{ floor: true }}>
      <planeGeometry args={[room.width, room.depth]} />
      <meshStandardMaterial color="#e7e0d4" side={THREE.DoubleSide} />
    </mesh>
  );
}

function FixtureMeshes() {
  const room = useEditor((s) => s.project.room);
  return (
    <>
      {room.fixtures.map((fixture) => {
        if (fixture.type === "window") return <WindowMesh key={fixture.id} fixture={fixture} room={room} />;
        if (fixture.type === "entrance") return <EntranceSwing key={fixture.id} fixture={fixture} room={room} />;
        if (fixture.type === "beam") {
          return beamFootprints(fixture, room).map((box, index) => (
            <mesh
              key={`${fixture.id}-${index}`}
              position={[
                (box.minX + box.maxX) / 2,
                room.ceilingHeight - fixture.drop / 2,
                (box.minZ + box.maxZ) / 2,
              ]}
              raycast={() => undefined}
            >
              <boxGeometry args={[box.maxX - box.minX, fixture.drop, box.maxZ - box.minZ]} />
              <meshStandardMaterial color="#8d8680" transparent opacity={0.9} />
            </mesh>
          ));
        }
        const box = obstacleFootprint(fixture, room);
        if (!box) return null;
        const height = fixture.type === "pillar" ? room.ceilingHeight : fixture.height;
        return (
          <group key={fixture.id}>
            <mesh
              position={[(box.minX + box.maxX) / 2, height / 2, (box.minZ + box.maxZ) / 2]}
              raycast={() => undefined}
            >
              <boxGeometry args={[Math.max(0.001, box.maxX - box.minX), height, Math.max(0.001, box.maxZ - box.minZ)]} />
              <meshStandardMaterial color={fixture.type === "pillar" ? "#9a938a" : "#c2b8aa"} />
            </mesh>
            {fixture.type === "storage" &&
              storageSectors(fixture, room).map((sector, index) => (
                <SwingMesh key={`${fixture.id}-swing-${index}`} sector={sector} />
              ))}
          </group>
        );
      })}
    </>
  );
}

function WindowMesh({ fixture, room }: { fixture: Extract<Room["fixtures"][number], { type: "window" }>; room: Room }) {
  const place = openingPlacement(fixture.wall, fixture.offset, fixture.width, room);
  const recess = windowRecess(fixture, room);
  if (!place) return null;
  const mid = { x: (place.start.x + place.end.x) / 2, z: (place.start.z + place.end.z) / 2 };
  const horizontal = fixture.wall === "front" || fixture.wall === "back";
  const alongSign = horizontal ? Math.sign(place.end.x - place.start.x) || 1 : Math.sign(place.end.z - place.start.z) || 1;
  const panes = fixture.style === "sliding" ? [-fixture.width * 0.12, fixture.width * 0.12] : [0];
  return (
    <group>
      {panes.map((delta, index) => (
        <mesh
          key={index}
          position={[
            mid.x + (horizontal ? delta * alongSign : place.outward.x * (index === 0 ? 0.015 : -0.015)),
            fixture.sillHeight + fixture.height / 2,
            mid.z + (horizontal ? place.outward.z * (index === 0 ? 0.015 : -0.015) : delta * alongSign),
          ]}
          raycast={() => undefined}
        >
          <boxGeometry args={[horizontal ? fixture.width * 0.46 : 0.02, fixture.height * 0.96, horizontal ? 0.02 : fixture.width * 0.46]} />
          <meshStandardMaterial color="#8ebbd4" transparent opacity={0.55} />
        </mesh>
      ))}
      {recess && (
        <mesh
          position={[(recess.minX + recess.maxX) / 2, Math.max(0.02, fixture.sillHeight - 0.02), (recess.minZ + recess.maxZ) / 2]}
          raycast={() => undefined}
        >
          <boxGeometry args={[Math.max(0.02, recess.maxX - recess.minX), 0.04, Math.max(0.02, recess.maxZ - recess.minZ)]} />
          <meshStandardMaterial color="#d9c7ae" />
        </mesh>
      )}
    </group>
  );
}

function EntranceSwing({ fixture, room }: { fixture: Extract<Room["fixtures"][number], { type: "entrance" }>; room: Room }) {
  return (
    <>
      {entranceSectors(fixture, room).map((sector, index) => (
        <SwingMesh key={`${fixture.id}-${index}`} sector={sector} />
      ))}
    </>
  );
}

function SwingMesh({ sector }: { sector: { hinge: { x: number; z: number }; closed: { x: number; z: number }; into: { x: number; z: number }; radius: number } }) {
  const geometry = useMemo(() => {
    const steps = 18;
    const vertices: number[] = [];
    const hinge = sector.hinge;
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * (Math.PI / 2);
      const t1 = ((i + 1) / steps) * (Math.PI / 2);
      const p = (t: number) => [
        hinge.x + sector.radius * (Math.cos(t) * sector.closed.x + Math.sin(t) * sector.into.x),
        0.015,
        hinge.z + sector.radius * (Math.cos(t) * sector.closed.z + Math.sin(t) * sector.into.z),
      ];
      const a = p(t0);
      const b = p(t1);
      vertices.push(hinge.x, 0.015, hinge.z, a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
  }, [sector.hinge.x, sector.hinge.z, sector.closed.x, sector.closed.z, sector.into.x, sector.into.z, sector.radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => undefined}>
      <meshBasicMaterial color="#c4a574" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function FloorGrid({ width, depth }: { width: number; depth: number }) {
  const geometry = useMemo(() => buildGrid(width, depth), [width, depth]);
  useEffect(() => {
    return () => {
      geometry.minor.dispose();
      geometry.mid.dispose();
      geometry.major.dispose();
    };
  }, [geometry]);
  return (
    <>
      <lineSegments geometry={geometry.minor} position={[0, 0.003, 0]}>
        <lineBasicMaterial color="#d2c9ba" />
      </lineSegments>
      <lineSegments geometry={geometry.mid} position={[0, 0.004, 0]}>
        <lineBasicMaterial color="#b3a898" />
      </lineSegments>
      <lineSegments geometry={geometry.major} position={[0, 0.005, 0]}>
        <lineBasicMaterial color="#7d7568" />
      </lineSegments>
    </>
  );
}

function FurnitureMesh({ item, selected, warned }: { item: Furniture; selected: boolean; warned: boolean }) {
  const rotationY = (-item.rotation * Math.PI) / 180;
  const geometry = useMemo(() => {
    if (item.shape === "cylinder") {
      return new THREE.CylinderGeometry(item.width / 2, item.width / 2, item.height, 40);
    }
    return new THREE.BoxGeometry(item.width, item.height, item.depth);
  }, [item.shape, item.width, item.height, item.depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group userData={{ furnitureId: item.id }} position={[item.x, (item.elevation ?? 0) + item.height / 2, item.z]} rotation={[0, rotationY, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={item.color}
          emissive={warned ? "#9d2c2c" : selected ? "#10241c" : "#000000"}
          emissiveIntensity={warned ? 0.55 : selected ? 0.35 : 0}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geometry, 25]} />
        <lineBasicMaterial color={warned ? "#9d2c2c" : selected ? "#143028" : "#2b2824"} />
      </lineSegments>
    </group>
  );
}

/**
 * The camera sits on the 手前 side (negative Z) and looks toward +Z.
 * Three.js then puts world +X on the left of the screen. Negating the
 * projection's X scale puts +X back on the right, matching the floor plan.
 * Raycasts use the same matrix, so hits stay in room coordinates.
 */
function MatchPlanCamera() {
  const camera = useThree((s) => s.camera);

  useLayoutEffect(() => {
    const original = camera.updateProjectionMatrix.bind(camera);
    camera.updateProjectionMatrix = () => {
      original();
      const elements = camera.projectionMatrix.elements;
      if (elements[0] > 0) elements[0] = -elements[0];
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    };
    camera.updateProjectionMatrix();
    return () => {
      camera.updateProjectionMatrix = original;
      original();
    };
  }, [camera]);

  return null;
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const room = useEditor((s) => s.project.room);
  const viewCommand = useEditor((s) => s.viewCommand);
  const seen = useRef(viewCommand?.id ?? 0);

  const frame = (mode: "reset" | "zoom-in" | "zoom-out") => {
    if (!controls) return;
    const target = controls.target;
    target.set(room.width / 2, Math.min(0.55, room.ceilingHeight * 0.25), room.depth * 0.42);
    if (mode === "reset") {
      camera.position.set(
        room.width / 2,
        Math.max(room.ceilingHeight * 1.55, 2.8),
        -Math.max(1.8, room.depth * 0.72),
      );
    } else {
      const offset = camera.position.clone().sub(target);
      if (offset.lengthSq() < 1e-6) offset.set(0, 2, -2);
      const distance = THREE.MathUtils.clamp(offset.length() * (mode === "zoom-in" ? 0.8 : 1.25), 0.7, 40);
      offset.setLength(distance);
      camera.position.copy(target).add(offset);
    }
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    controls.update();
  };

  useEffect(() => {
    if (!controls) return;
    frame("reset");
  }, [Boolean(controls), room.width, room.depth, room.ceilingHeight]);

  useEffect(() => {
    if (!viewCommand || !controls || seen.current === viewCommand.id) return;
    seen.current = viewCommand.id;
    frame(viewCommand.type);
  }, [viewCommand, controls]);

  return null;
}

function PointerDrag() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    let drag: { id: string; dx: number; dz: number; pointerId: number } | null = null;
    let floorPress: { x: number; y: number; pointerId: number } | null = null;

    const setNdc = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const furnitureId = (object: THREE.Object3D): string | null => {
      let current: THREE.Object3D | null = object;
      while (current) {
        if (typeof current.userData.furnitureId === "string") return current.userData.furnitureId;
        current = current.parent;
      }
      return null;
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      setNdc(event);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      const picked = hits.find((entry) => furnitureId(entry.object));
      if (picked && raycaster.ray.intersectPlane(plane, hit)) {
        const id = furnitureId(picked.object);
        const item = id ? activeFurniture(useEditor.getState().project).find((entry) => entry.id === id) : undefined;
        if (!id || !item) return;
        event.preventDefault();
        event.stopPropagation();
        drag = { id, dx: item.x - hit.x, dz: item.z - hit.z, pointerId: event.pointerId };
        floorPress = null;
        if (controls) controls.enabled = false;
        useEditor.getState().select(id);
        useEditor.getState().beginGesture();
        return;
      }
      if (hits.some((entry) => entry.object.userData.floor === true)) {
        floorPress = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      }
    };

    const onMove = (event: PointerEvent) => {
      if (floorPress && event.pointerId === floorPress.pointerId) {
        if (Math.hypot(event.clientX - floorPress.x, event.clientY - floorPress.y) > 5) floorPress = null;
      }
      if (!drag || event.pointerId !== drag.pointerId) return;
      setNdc(event);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      useEditor.getState().updateFurniture(drag.id, { x: roundM(hit.x + drag.dx), z: roundM(hit.z + drag.dz) }, "preview");
    };

    const finish = (event: PointerEvent) => {
      if (drag && event.pointerId === drag.pointerId) {
        drag = null;
        useEditor.getState().endGesture();
        if (controls) controls.enabled = useEditor.getState().orbitEnabled;
      } else if (floorPress && event.pointerId === floorPress.pointerId) {
        const moved = Math.hypot(event.clientX - floorPress.x, event.clientY - floorPress.y) > 5;
        floorPress = null;
        if (!moved) useEditor.getState().select(null);
      }
    };

    el.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [camera, scene, gl, controls]);

  return null;
}

function buildGrid(width: number, depth: number): {
  minor: THREE.BufferGeometry;
  mid: THREE.BufferGeometry;
  major: THREE.BufferGeometry;
} {
  const minor: number[] = [];
  const mid: number[] = [];
  const major: number[] = [];
  const vertical = (x: number, bucket: number[]) => {
    bucket.push(x, 0, 0, x, 0, depth);
  };
  const horizontal = (z: number, bucket: number[]) => {
    bucket.push(0, 0, z, width, 0, z);
  };
  const countX = Math.ceil(width / 0.1);
  const countZ = Math.ceil(depth / 0.1);
  for (let i = 0; i <= countX; i++) {
    const x = Math.min(width, Math.round(i * 100) / 1000);
    classify(x, (bucket) => vertical(x, bucket), minor, mid, major);
  }
  for (let i = 0; i <= countZ; i++) {
    const z = Math.min(depth, Math.round(i * 100) / 1000);
    classify(z, (bucket) => horizontal(z, bucket), minor, mid, major);
  }
  return {
    minor: lines(minor),
    mid: lines(mid),
    major: lines(major),
  };
}

function classify(value: number, push: (bucket: number[]) => void, minor: number[], mid: number[], major: number[]) {
  const tenth = Math.round(value * 10);
  if (tenth % 10 === 0) push(major);
  else if (tenth % 5 === 0) push(mid);
  else push(minor);
}

function lines(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
