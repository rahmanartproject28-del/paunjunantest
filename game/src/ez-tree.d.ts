declare module 'ez-tree-src/index.js' {
  import * as THREE from 'three';
  export class Tree extends THREE.Group {
    options: { seed: number; leaves: { tint: number; count: number; [k: string]: unknown }; [k: string]: unknown };
    branchesMesh: THREE.Mesh; leavesMesh: THREE.Mesh;
    loadPreset(name: string): void; generate(): void; update(t: number): void;
  }
}
