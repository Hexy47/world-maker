import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { worldGroup } from './WorldManager.js';

export class StudioManager {
  static init(camera, renderer, scene, controls) {
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;
    this.controls = controls; // Player controls
    this.isActive = false;
    this.undoStack = [];
    this.startMatrix = new THREE.Matrix4();

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Setup TransformControls
    this.transformControl = new TransformControls(camera, renderer.domElement);
    this.transformControl.addEventListener('dragging-changed', (event) => {
      // Disable camera movement if dragging (already handled by pointerlock unlock)
      if (this.isActive) {
        if (event.value) {
          // Drag started
          const targetMatrix = this.selectedProxy ? this.selectedProxy.matrixWorld : (this.selectedMesh ? this.selectedMesh.matrixWorld : new THREE.Matrix4());
          this.startMatrix.copy(targetMatrix);
        } else {
          // Drag ended
          if (this.selectedMesh) {
            const endMatrix = new THREE.Matrix4().copy(this.selectedProxy ? this.selectedProxy.matrixWorld : this.selectedMesh.matrixWorld);
            if (!endMatrix.equals(this.startMatrix)) {
              this.undoStack.push({
                mesh: this.selectedMesh,
                index: this.selectedIndex,
                oldMatrix: new THREE.Matrix4().copy(this.startMatrix),
                newMatrix: endMatrix
              });
            }
          }
        }
      }
    });

    this.transformControl.addEventListener('change', () => {
      this.update();
    });

    this.scene.add(this.transformControl);

    // Click handlers for selection and sculpting
    window.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    // Keybinds for TransformControls mode (W/E/R for Translate/Rotate/Scale)
    window.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
        this.undo();
        e.preventDefault();
        return;
      }
      if (e.code === 'KeyZ') this.transformControl.setMode('translate');
      if (e.code === 'KeyX') this.transformControl.setMode('rotate');
      if (e.code === 'KeyC') this.transformControl.setMode('scale');
      if (e.code === 'Escape') this.deselect();
    });

    // Proxy object to attach TransformControls to
    this.selectedProxy = new THREE.Object3D();
    this.scene.add(this.selectedProxy);
    
    this.selectedMesh = null;
    this.selectedIndex = -1;
  }

  static toggle() {
    this.isActive = !this.isActive;
    
    if (this.isActive) {
      this.controls.unlock();
      // Show Studio UI
      if (window.studioUI) window.studioUI.style.display = 'block';
    } else {
      this.deselect();
      if (window.studioUI) window.studioUI.style.display = 'none';
      this.controls.lock();
    }
  }

  static update() {
    if (this.isActive && this.selectedMesh) {
      if (this.selectedIndex !== -1 && this.selectedProxy) {
        // InstancedMesh
        this.selectedMesh.setMatrixAt(this.selectedIndex, this.selectedProxy.matrixWorld);
        this.selectedMesh.instanceMatrix.needsUpdate = true;
      } else {
        // Standard Mesh (GLTF) updates itself via TransformControls automatically
      }
    }
  }

  static toolMode = 'transform'; // 'transform', 'raise', 'lower', 'flatten', 'eraser'
  static brushSize = 5;
  static brushIntensity = 0.2;
  static isSculpting = false;

  static setToolMode(mode) {
    this.toolMode = mode;
    if (mode === 'transform') {
       if (this.selectedMesh) this.transformControl.attach(this.selectedProxy || this.selectedMesh);
    } else {
       this.transformControl.detach();
    }
  }

  static onClick(event) {
    // Replaced by onPointerDown
  }

  static onPointerDown(event) {
    if (!this.isActive || event.target !== this.renderer.domElement) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObjects(worldGroup.children, true);
    if (intersects.length === 0) return;

    const intersect = intersects[0];

    // ERASER TOOL
    if (this.toolMode === 'eraser') {
      let root = intersect.object;
      while(root && root.parent && !root.userData.isEditable) {
         root = root.parent;
      }
      if (root && root.userData.isEditable) {
         root.removeFromParent(); // Instant delete!
         // Optionally, emit a delete event to server here
      }
      return;
    }

    // TEXTURE FIX-IT BRUSH
    if (this.toolMode === 'fix_texture') {
      if (intersect.object.isMesh && intersect.object.material) {
         // Revert to a basic material or strip the map
         intersect.object.material = intersect.object.material.clone();
         intersect.object.material.map = null;
         intersect.object.material.color.setHex(0xffffff);
         intersect.object.material.needsUpdate = true;
         // Optionally remove the AI tag so the AI doesn't paint it again
         intersect.object.userData.tag = null;
      }
      return;
    }

    // SCULPT TOOL
    if (['raise', 'lower', 'flatten'].includes(this.toolMode)) {
      if (intersect.object.name === 'Terrain') {
         this.isSculpting = true;
         this.controls.enabled = false; // Disable camera orbit while sculpting
         import('./TerrainManager.js').then(tm => {
            tm.sculptTerrain(intersect.point, this.brushSize, this.brushIntensity, this.toolMode);
         });
      }
      return;
    }

    // TRANSFORM TOOL (Default)
    if (this.toolMode === 'transform') {
        let root = intersect.object;
        while(root && root.parent && !root.userData.isEditable) {
           root = root.parent;
        }

        if (root && root.userData.isEditable) {
          this.selectedMesh = root;
          
          if (root.isInstancedMesh) {
             this.selectedIndex = intersect.instanceId;
             const matrix = new THREE.Matrix4();
             root.getMatrixAt(this.selectedIndex, matrix);
             
             if (!this.selectedProxy) {
               this.selectedProxy = new THREE.Object3D();
               this.scene.add(this.selectedProxy);
             }
             
             matrix.decompose(
               this.selectedProxy.position,
               this.selectedProxy.quaternion,
               this.selectedProxy.scale
             );
             this.selectedProxy.updateMatrixWorld();
             
             this.transformControl.attach(this.selectedProxy);
          } else {
             this.selectedIndex = -1;
             this.transformControl.attach(root);
             this.selectedProxy = null; 
          }
        }
    }
  }

  static onPointerMove(event) {
    if (!this.isActive || !this.isSculpting) return;
    
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const intersects = this.raycaster.intersectObjects(worldGroup.children, true);
    if (intersects.length > 0 && intersects[0].object.name === 'Terrain') {
       import('./TerrainManager.js').then(tm => {
          tm.sculptTerrain(intersects[0].point, this.brushSize, this.brushIntensity, this.toolMode);
       });
    }
  }

  static onPointerUp(event) {
    if (this.isSculpting) {
       this.isSculpting = false;
       this.controls.enabled = true;
       // Commit physics once drag is done to avoid lag
       import('./TerrainManager.js').then(tm => tm.commitTerrainPhysics());
    }
  }

  static selectInstance(instancedMesh, instanceId) {
    this.selectedMesh = instancedMesh;
    this.selectedIndex = instanceId;

    // Extract the matrix of the selected instance
    const matrix = new THREE.Matrix4();
    instancedMesh.getMatrixAt(instanceId, matrix);

    // Apply the matrix to our proxy object
    matrix.decompose(
      this.selectedProxy.position,
      this.selectedProxy.quaternion,
      this.selectedProxy.scale
    );

    // Attach TransformControls to the proxy
    this.transformControl.attach(this.selectedProxy);
  }

  static deselect() {
    this.transformControl.detach();
    this.selectedMesh = null;
    this.selectedIndex = -1;
  }

  static undo() {
    if (this.undoStack.length === 0) return;
    const action = this.undoStack.pop();
    
    if (action.index !== -1) {
      // Instanced Mesh
      action.mesh.setMatrixAt(action.index, action.oldMatrix);
      action.mesh.instanceMatrix.needsUpdate = true;
      
      if (this.selectedMesh === action.mesh && this.selectedIndex === action.index && this.selectedProxy) {
        action.oldMatrix.decompose(
          this.selectedProxy.position,
          this.selectedProxy.quaternion,
          this.selectedProxy.scale
        );
      }
    } else {
      // GLTF / Standard Mesh
      action.mesh.matrixAutoUpdate = false;
      action.mesh.matrix.copy(action.oldMatrix);
      action.mesh.matrix.decompose(action.mesh.position, action.mesh.quaternion, action.mesh.scale);
      action.mesh.updateMatrixWorld(true);
      action.mesh.matrixAutoUpdate = true;
    }
  }
}
