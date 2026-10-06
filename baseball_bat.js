import * as THREE from "three";
import { batPose } from "./bat_pose.js";
let assetRequest;
export function ensureBatAssets() {
  if (!assetRequest)
    assetRequest = Promise.all([
      fetch("/assets/bat/bat.json"),
      fetch("/assets/bat/bat.bin"),
    ])
      .then(async ([metadata, response]) => {
        if (!metadata.ok || !response.ok)
          throw Error("Could not load the baseball bat model.");
        const model = await metadata.json(),
          buffer = await response.arrayBuffer();
        const geometry = new THREE.BufferGeometry();
        for (const [name, part] of Object.entries(model.attributes)) {
          const ArrayType = part.type === "Uint16" ? Uint16Array : Float32Array;
          const array = new ArrayType(
            buffer,
            part.offset,
            part.count * part.components,
          );
          const attribute = new THREE.BufferAttribute(array, part.components);
          if (name === "index") geometry.setIndex(attribute);
          else geometry.setAttribute(name, attribute);
        }
        const loader = new THREE.TextureLoader();
        let textures;
        try {
          // allSettled lets us release any successfully loaded textures on failure.
          const names = Object.keys(model.textures);
          const results = await Promise.allSettled(
            names.map(async (name) => {
              const texture = await loader.loadAsync(
                "/assets/bat/" + model.textures[name],
              );
              texture.flipY = false;
              texture.colorSpace =
                name === "diffuse" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
              texture.userData.staticModelTexture = true;
              return texture;
            }),
          );
          const failure = results.find(
            (result) => result.status === "rejected",
          );
          if (failure) {
            for (const result of results)
              if (result.status === "fulfilled") result.value.dispose();
            throw failure.reason;
          }
          textures = Object.fromEntries(
            names.map((name, i) => [name, results[i].value]),
          );
        } catch (error) {
          geometry.dispose();
          throw error;
        }
        return { geometry, textures };
      })
      .catch((error) => {
        assetRequest = null;
        throw error;
      });
  return assetRequest;
}
function silhouette() {
  // A shaped, lightweight bat is visible immediately while the textures arrive.
  return new THREE.LatheGeometry(
    [
      [0, 0],
      [0.026, 0],
      [0.029, 0.012],
      [0.029, 0.02],
      [0.015, 0.03],
      [0.014, 0.25],
      [0.016, 0.4],
      [0.024, 0.55],
      [0.032, 0.68],
      [0.035, 0.8],
      [0.035, 0.97],
      [0.032, 1],
      [0, 1],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
}
export class BaseballBat extends THREE.Group {
  constructor(data) {
    super();
    this.name = "baseball-bat";
    this.data = data;
    this.visible = false;
    this.disposed = false;
    if (data.entry.discipline !== "hitting") return;
    this.mesh = new THREE.Mesh(
      silhouette(),
      new THREE.MeshStandardMaterial({ color: "#b88b53", roughness: 0.7 }),
    );
    this.add(this.mesh);
    this.load().catch(() => {});
  }
  load() {
    if (!this.mesh || this.disposed) return Promise.resolve();
    if (!this.loading)
      this.loading = ensureBatAssets()
        .then(({ geometry, textures }) => {
          if (this.disposed) return;
          this.mesh.geometry.dispose();
          this.mesh.material.dispose();
          this.mesh.geometry = geometry.clone();
          this.mesh.material = new THREE.MeshStandardMaterial({
            map: textures.diffuse,
            normalMap: textures.normal,
            roughnessMap: textures.arm,
            metalnessMap: textures.arm,
            aoMap: textures.arm,
            metalness: 0,
            roughness: 1,
            side: THREE.DoubleSide,
          });
          this.mesh.name = "textured-baseball-bat";
          this.loaded = true;
          window.dispatchEvent(new Event("obm-bat-ready"));
        })
        .catch((error) => {
          this.loading = null;
          if (!this.disposed)
            window.dispatchEvent(
              new CustomEvent("obm-bat-error", {
                detail: "Bat texture unavailable; showing the shaped bat.",
              }),
            );
          throw error;
        });
    return this.loading;
  }
  update(handle, sweetSpot, enabled = true) {
    const pose =
      enabled &&
      this.mesh &&
      batPose(handle, sweetSpot, this.data.metadata?.bat_length_in);
    this.visible = !!pose;
    if (!pose) return false;
    this.position.set(...pose.knob);
    this.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(...pose.direction),
    );
    this.scale.setScalar(pose.length);
    return true;
  }
  dispose() {
    // Scene cleanup owns the geometry/material. Pending loads must not recreate them.
    this.disposed = true;
  }
}
