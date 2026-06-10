import * as THREE from 'three';

const CHUNK_SIZE = 400;

export function generateCityData() {
  const blockSize = 40;
  const roadWidth = 20;
  const cityExtent = 1200; 

  const chunks = {};

  let globalIdx = 0;
  for (let x = -cityExtent; x < cityExtent; x += blockSize + roadWidth) {
    for (let z = -cityExtent; z < cityExtent; z += blockSize + roadWidth) {
      if (Math.abs(x) < 50 && Math.abs(z) < 50) continue;
      if (Math.random() > 0.8) continue;

      const blockW = blockSize;
      const blockD = blockSize;
      
      const numBldgs = Math.floor(Math.random() * 4) + 1;
      
      for (let i=0; i<numBldgs; i++) {
        const bw = THREE.MathUtils.randFloat(10, 20);
        const bd = THREE.MathUtils.randFloat(10, 20);
        const bx = x + THREE.MathUtils.randFloat(-blockW/2 + bw/2, blockW/2 - bw/2);
        const bz = z + THREE.MathUtils.randFloat(-blockD/2 + bd/2, blockD/2 - bd/2);
        
        let bh = THREE.MathUtils.randFloat(20, 80);
        if (Math.abs(x) < 300 && Math.abs(z) < 300) {
          bh = THREE.MathUtils.randFloat(50, 150);
        }
        
        const by = bh / 2;
        const color = new THREE.Color().setHSL(THREE.MathUtils.randFloat(0.5, 0.7), Math.random()*0.5, Math.random()*0.2 + 0.1);

        const isNeon = Math.random() > 0.9;
        
        const cx = Math.floor((bx + cityExtent) / CHUNK_SIZE);
        const cz = Math.floor((bz + cityExtent) / CHUNK_SIZE);
        const chunkKey = `${cx}_${cz}`;
        
        if (!chunks[chunkKey]) chunks[chunkKey] = { dark: [], neon: [], cx, cz };
        
        const building = { x: bx, y: by, z: bz, width: bw, height: bh, depth: bd, color, isNeon, globalIdx };
        
        if (isNeon) {
          building.color.setHSL(THREE.MathUtils.randFloat(0, 1), 1.0, 0.5);
          chunks[chunkKey].neon.push(building);
        } else {
          chunks[chunkKey].dark.push(building);
        }
        
        globalIdx++;
      }
    }
  }

  // Filter out buildings around data towers
  Object.values(chunks).forEach(chunk => {
    const towerX = chunk.cx * CHUNK_SIZE - cityExtent + CHUNK_SIZE / 2;
    const towerZ = chunk.cz * CHUNK_SIZE - cityExtent + CHUNK_SIZE / 2;
    
    chunk.dark = chunk.dark.filter(b => Math.hypot(b.x - towerX, b.z - towerZ) > 25);
    chunk.neon = chunk.neon.filter(b => Math.hypot(b.x - towerX, b.z - towerZ) > 25);
  });

  return chunks;
}
