import * as THREE from "three";

let assetRequest;
export function ensureBoneAssets() {
  if (!assetRequest)
    assetRequest = Promise.all([
      fetch("/assets/anatomy/bones.json"),
      fetch("/assets/anatomy/bones.bin"),
    ])
      .then(async ([metadata, geometry]) => {
        if (!metadata.ok || !geometry.ok)
          throw Error("Could not load anatomical bone meshes.");
        const model = await metadata.json();
        const buffer = await geometry.arrayBuffer();
        for (const part of Object.values(model.parts)) {
          part.positions = new Float32Array(
            buffer,
            part.positionOffset,
            part.vertexCount * 3,
          );
          part.indices = new Uint32Array(
            buffer,
            part.indexOffset,
            part.indexCount,
          );
        }
        return model;
      })
      .catch((error) => {
        assetRequest = null;
        throw error;
      });
  return assetRequest;
}
const valid = (p) =>
  Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const vec = (p) => new THREE.Vector3(...p);
const midpoint = (a, b) =>
  valid(a) && valid(b)
    ? vec(a).add(vec(b)).multiplyScalar(0.5).toArray()
    : null;
function frame(up, lateral) {
  if (up.lengthSq() < 1e-8 || lateral.lengthSq() < 1e-8) return null;
  const z = up.clone().normalize();
  const x = lateral.clone().addScaledVector(z, -lateral.dot(z));
  if (x.lengthSq() < 1e-8) return null;
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x, y, z),
  );
}

// Atlas bone shapes fitted to released joint-center trajectories. This renderer
// changes presentation only; it does not estimate athlete-specific anatomy.
export class AnatomicalBody {
  constructor(parent, data, tint = null) {
    this.data = data;
    this.group = new THREE.Group();
    this.group.name = "anatomical-bones";
    this.group.visible = false;
    parent.add(this.group);
    this.meshes = new Map();
    this.labels = new Map(
      (data.motion?.labels || []).map((label, i) => [label, i]),
    );
    this.tint = tint;
    this.disposed = false;
  }
  load() {
    if (this.loading) return this.loading;
    this.loading = ensureBoneAssets()
      .then((assets) => {
        if (this.disposed) return;
        const ivory = new THREE.Color("#dfd3ad");
        if (this.tint) ivory.lerp(new THREE.Color(this.tint), 0.16);
        this.material = new THREE.MeshStandardMaterial({
          color: ivory,
          roughness: 0.8,
          side: THREE.DoubleSide,
        });
        for (const [name, part] of Object.entries(assets.parts)) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(part.positions, 3),
          );
          geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, this.material);
          mesh.name = name;
          mesh.visible = false;
          mesh.frustumCulled = false;
          this.group.add(mesh);
          this.meshes.set(name, mesh);
        }
        if (this.last) this.update(...this.last);
        window.dispatchEvent(new Event("obm-bones-ready"));
      })
      .catch((error) => {
        this.loading = null;
        this.failed = true;
        if (!this.disposed)
          window.dispatchEvent(
            new CustomEvent("obm-bones-error", { detail: error.message }),
          );
        throw error;
      });
    return this.loading;
  }
  raw(name, t) {
    const motion = this.data.motion,
      index = this.labels.get(name);
    if (!motion || index == null) return null;
    const sample =
      motion.frames[
        Math.max(
          0,
          Math.min(motion.frames.length - 1, Math.round(t * motion.rate)),
        )
      ]?.[index];
    return valid(sample) ? sample : null;
  }
  segment(name, proximal, distal, lateral) {
    const mesh = this.meshes.get(name);
    if (!mesh || !valid(proximal) || !valid(distal)) return;
    const up = vec(proximal).sub(vec(distal)),
      length = up.length();
    const rotation = frame(up, lateral);
    if (!rotation || length < 0.015) return;
    mesh.position.copy(vec(distal));
    mesh.quaternion.copy(rotation);
    mesh.scale.setScalar(length);
    mesh.visible = true;
  }
  place(name, position, rotation, scale) {
    const mesh = this.meshes.get(name);
    if (
      !mesh ||
      !valid(position) ||
      !rotation ||
      !Number.isFinite(scale) ||
      scale <= 0.001
    )
      return;
    mesh.position.set(...position);
    mesh.quaternion.copy(rotation);
    mesh.scale.setScalar(scale);
    mesh.visible = true;
  }
  update(map, t, enabled) {
    this.last = [map, t, enabled];
    this.group.visible = !!enabled && !!this.data.signals?.landmarks;
    if (!this.group.visible) {
      this.failed = false;
      return;
    }
    if (!this.meshes.size) {
      if (!this.failed) this.load().catch(() => {});
      return;
    }
    for (const mesh of this.meshes.values()) mesh.visible = false;
    const pitch = this.data.entry.discipline === "pitching",
      leftThrow = this.data.entry.side === "L";
    const hipL =
      map[pitch ? (leftThrow ? "rear_hip" : "lead_hip") : "left_hip"];
    const hipR =
      map[pitch ? (leftThrow ? "lead_hip" : "rear_hip") : "right_hip"];
    const hips = midpoint(hipL, hipR),
      base = map.thorax_dist,
      neck = map.thorax_prox;
    const shoulderL =
      map[pitch ? (leftThrow ? "shoulder_jc" : "glove_shoulder_jc") : "lsjc"];
    const shoulderR =
      map[pitch ? (leftThrow ? "glove_shoulder_jc" : "shoulder_jc") : "rsjc"];
    const lateral =
      valid(hipL) && valid(hipR)
        ? vec(hipL).sub(vec(hipR))
        : new THREE.Vector3(0, 1, 0);
    const torsoLateral =
      valid(shoulderL) && valid(shoulderR)
        ? vec(shoulderL).sub(vec(shoulderR))
        : lateral;
    const torsoUp =
      valid(neck) && valid(base) ? vec(neck).sub(vec(base)) : null;
    const torsoFrame = torsoUp ? frame(torsoUp, torsoLateral) : null;
    const pelvisFrame =
      valid(hips) && valid(base)
        ? frame(vec(base).sub(vec(hips)), lateral)
        : null;
    const width =
      valid(hipL) && valid(hipR) ? vec(hipL).distanceTo(vec(hipR)) : 0;
    this.place("pelvis", hips, pelvisFrame, width);
    if (valid(base) && valid(neck))
      this.place("chest", base, torsoFrame, vec(base).distanceTo(vec(neck)));
    if (valid(hips) && valid(base)) this.segment("lumbar", base, hips, lateral);
    for (const side of ["left", "right"]) {
      const isLeft = side === "left",
        role = pitch ? (isLeft === leftThrow ? "rear" : "lead") : null;
      const hip = isLeft ? hipL : hipR;
      const knee = map[pitch ? `${role}_knee_jc` : isLeft ? "lkjc" : "rkjc"];
      const ankle = map[pitch ? `${role}_ankle_jc` : isLeft ? "lajc" : "rajc"];
      const arm = pitch ? (isLeft === leftThrow ? "" : "glove_") : null;
      const shoulder = isLeft ? shoulderL : shoulderR;
      const elbow = map[pitch ? `${arm}elbow_jc` : isLeft ? "lejc" : "rejc"];
      const wrist = map[pitch ? `${arm}wrist_jc` : isLeft ? "lwjc" : "rwjc"];
      const hand = map[pitch ? `${arm}hand_jc` : isLeft ? "lhjc" : "rhjc"];
      this.segment(`${side}Femur`, hip, knee, lateral);
      this.segment(`${side}Shin`, knee, ankle, lateral);
      this.segment(`${side}Humerus`, shoulder, elbow, torsoLateral);
      this.segment(`${side}Forearm`, elbow, wrist, torsoLateral);
      // Hand center is not a fingertip; atlas hand extends beyond that anchor.
      if (valid(wrist) && valid(hand)) {
        const fingertips = vec(wrist).lerp(vec(hand), 2).toArray();
        this.segment(`${side}Hand`, wrist, fingertips, torsoLateral);
      }
      const toe = this.raw(isLeft ? "LTOE" : "RTOE", t),
        heel = this.raw(isLeft ? "LHEE" : "RHEE", t);
      if (valid(ankle) && valid(toe) && valid(heel)) {
        const forward = vec(toe).sub(vec(heel));
        forward.z = 0;
        const rotation = frame(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), forward),
        );
        this.place(
          `${side}Foot`,
          ankle,
          rotation,
          Math.max(0.15, Math.min(0.35, forward.length())),
        );
      }
    }
    if (valid(neck) && torsoFrame) {
      const lf = this.raw("LFHD", t),
        rf = this.raw("RFHD", t),
        lb = this.raw("LBHD", t),
        rb = this.raw("RBHD", t);
      const front = midpoint(lf, rf),
        back = midpoint(lb, rb),
        head = midpoint(front, back);
      const headX = midpoint(lf, lb),
        headR = midpoint(rf, rb);
      if (valid(head) && valid(headX) && valid(headR)) {
        const rotation = frame(
          new THREE.Vector3().crossVectors(
            vec(front).sub(vec(back)),
            vec(headX).sub(vec(headR)),
          ),
          vec(headX).sub(vec(headR)),
        );
        this.place("skull", head, rotation, 0.22);
        this.segment(
          "cervical",
          vec(head)
            .addScaledVector(
              new THREE.Vector3(0, 0, 1).applyQuaternion(rotation),
              -0.1,
            )
            .toArray(),
          neck,
          torsoLateral,
        );
      } else {
        this.segment(
          "cervical",
          vec(neck).addScaledVector(torsoUp.clone().normalize(), 0.1).toArray(),
          neck,
          torsoLateral,
        );
        this.place(
          "skull",
          vec(neck)
            .addScaledVector(torsoUp.clone().normalize(), 0.16)
            .toArray(),
          torsoFrame,
          0.22,
        );
      }
    }
  }
  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    this.material?.dispose();
    this.meshes.clear();
    this.last = null;
  }
}
