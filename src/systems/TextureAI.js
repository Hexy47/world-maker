import * as THREE from 'three';

/**
 * AI Texture Applicator
 * Takes a dropped image file, gathers semantic tags from the scene,
 * asks the Groq LLM backend which tag matches the texture,
 * and seamlessly applies the material.
 */
export async function applyTextureAI(file, scene) {
  const fileName = file.name;
  
  // 1. Gather semantic tags from the scene
  const availableTags = new Set();
  const taggedMeshes = {};
  
  scene.traverse((child) => {
    if (child.isMesh) {
      // Prioritize Blender 'tag' metadata. (Generic name fallback removed as it causes dangerous AI groupings)
      const tag = child.userData.tag;
      if (tag && typeof tag === 'string') {
        availableTags.add(tag);
        if (!taggedMeshes[tag]) taggedMeshes[tag] = [];
        taggedMeshes[tag].push(child);
      }
    }
  });

  const tagsArray = Array.from(availableTags);
  if (tagsArray.length === 0) {
    console.warn("AI Texture Error: No semantic tags found in world.");
    return;
  }

  // 2. Ask Server (Groq) to pick the best tag
  try {
    const response = await fetch('/api/analyze-texture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textureName: fileName, availableTags: tagsArray })
    });
    
    const data = await response.json();
    
    if (data.selectedTag && taggedMeshes[data.selectedTag]) {
       // 3. Load Texture safely
       const url = URL.createObjectURL(file);
       const textureLoader = new THREE.TextureLoader();
       textureLoader.load(url, (texture) => {
         // GLTF compatibility requirements
         texture.flipY = false;
         texture.colorSpace = THREE.SRGBColorSpace;
         texture.wrapS = THREE.RepeatWrapping;
         texture.wrapT = THREE.RepeatWrapping;
         
         // 4. Apply to all matched meshes safely (handling multi-material arrays)
         taggedMeshes[data.selectedTag].forEach(mesh => {
            if (Array.isArray(mesh.material)) {
               mesh.material = mesh.material.map(mat => {
                  const cloned = mat.clone();
                  cloned.map = texture;
                  cloned.needsUpdate = true;
                  return cloned;
               });
            } else {
               mesh.material = mesh.material.clone(); 
               mesh.material.map = texture;
               mesh.material.needsUpdate = true;
            }
         });
         
         console.log(`[TextureAI] Successfully mapped ${fileName} to [${data.selectedTag}]!`);
         URL.revokeObjectURL(url);
       });
    } else {
       console.warn(`[TextureAI] AI could not match ${fileName} to any objects.`);
    }
  } catch (e) {
    console.error(`[TextureAI] Backend Error: ${e.message}`);
  }
}
