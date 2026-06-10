import * as THREE from 'three';

export class DataTower {
  constructor(x, z, radius = 400) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this.radius = radius;
    this.id = `TOWER_${Math.floor(x)}_${Math.floor(z)}`;

    // 1. The Monolith Base
    const baseGeom = new THREE.CylinderGeometry(2, 4, 100, 8);
    const baseMat = new THREE.MeshStandardMaterial({ 
      color: 0x111111, 
      metalness: 0.9, 
      roughness: 0.2 
    });
    this.baseMesh = new THREE.Mesh(baseGeom, baseMat);
    this.baseMesh.position.y = 50;
    this.baseMesh.castShadow = false; // Disable for FPS
    this.group.add(this.baseMesh);

    // 2. The Data Core (Glowing center)
    const coreGeom = new THREE.CylinderGeometry(0.5, 0.5, 120, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    this.coreMesh = new THREE.Mesh(coreGeom, coreMat);
    this.coreMesh.position.y = 60;
    this.group.add(this.coreMesh);

    // 3. Rotating Data Rings
    this.rings = [];
    const ringGeom = new THREE.TorusGeometry(8, 0.2, 4, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 });
    
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.y = 80 + (i * 10);
      ring.rotation.x = Math.PI / 2;
      this.rings.push(ring);
      this.group.add(ring);
    }

    // 4. Scanning Radius (Flat ring on the floor to save FPS)
    const domeGeom = new THREE.RingGeometry(this.radius - 2, this.radius, 64);
    const domeMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.domeMesh = new THREE.Mesh(domeGeom, domeMat);
    this.domeMesh.rotation.x = -Math.PI / 2; // Lay flat on the ground
    this.domeMesh.position.y = 0.5; // Slightly above ground to prevent z-fighting
    this.group.add(this.domeMesh);

    // 5. Data State
    this.activeEntities = 0;
    this.cpuLoad = Math.random() * 20; // Simulated load
  }

  update(time) {
    // Animate rings
    this.rings.forEach((ring, index) => {
      ring.rotation.z = time * (1 + index * 0.5);
      const scale = 1 + Math.sin(time * 2 + index) * 0.1;
      ring.scale.set(scale, scale, scale);
    });

    // Animate dome pulse
    this.domeMesh.material.opacity = 0.02 + Math.abs(Math.sin(time * 0.5)) * 0.03;
  }
}
