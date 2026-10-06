import * as THREE from "three";
import { gripPose } from "./grip_pose.js";
const z = new THREE.Vector3(0, 0, 1);
const dummy = new THREE.Object3D();
export class HandGrip {
  constructor(parent, part, material, side) {
    this.side = side;
    this.group = new THREE.Group();
    this.group.name = side + "-illustrative-bat-grip";
    this.group.visible = false;
    parent.add(this.group);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(part.positions, 3),
    );
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    this.extent = geometry.boundingBox.getSize(new THREE.Vector3());
    this.bones = new THREE.InstancedMesh(geometry, material, 19);
    this.bones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bones.frustumCulled = false;
    this.carpals = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 6),
      material,
      8,
    );
    this.carpals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.carpals.frustumCulled = false;
    this.group.add(this.bones, this.carpals);
  }
  update(wrist, hand, map, batLength) {
    const pose = gripPose(
      wrist,
      hand,
      map.blast_hand,
      map.sweet_spot,
      batLength,
      this.side === "left",
    );
    this.group.visible = !!pose;
    this.pose = pose;
    if (!pose) return false;
    pose.bones.forEach(({ a, b, width }, i) => {
      const direction = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
      const length = direction.length();
      dummy.position.set(...a);
      dummy.quaternion.setFromUnitVectors(z, direction.normalize());
      dummy.scale.set(width / this.extent.x, width / this.extent.y, length);
      dummy.updateMatrix();
      this.bones.setMatrixAt(i, dummy.matrix);
    });
    this.bones.instanceMatrix.needsUpdate = true;
    pose.carpals.forEach((point, i) => {
      dummy.position.set(...point);
      dummy.quaternion.identity();
      dummy.scale.set(0.006, 0.0045, 0.006);
      dummy.updateMatrix();
      this.carpals.setMatrixAt(i, dummy.matrix);
    });
    this.carpals.instanceMatrix.needsUpdate = true;
    return true;
  }
  dispose() {
    this.group.removeFromParent();
    this.bones.dispose();
    this.carpals.dispose();
    this.bones.geometry.dispose();
    this.carpals.geometry.dispose();
  }
}
