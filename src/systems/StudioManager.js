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
          if (this.selectedProxy) {
            this.startMatrix.copy(this.selectedProxy.matrixWorld);
          }
        } else {
          // Drag ended
          if (this.selectedProxy && this.selectedMesh) {
            const endMatrix = new THREE.Matrix4().copy(this.selectedProxy.matrixWorld);
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
      // Sync proxy transform back to InstancedMesh
      if (this.selectedProxy && this.selectedMesh) {
        this.selectedProxy.updateMatrixWorld();
        this.selectedMesh.setMatrixAt(this.selectedIndex, this.selectedProxy.matrixWorld);
        this.selectedMesh.instanceMatrix.needsUpdate = true;
      }
    });

    this.scene.add(this.transformControl);

    // Click handler for selection
    window.addEventListener('pointerdown', (e) => this.onClick(e));
    
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

  static onClick(event) {
    if (!this.isActive) return;
    
    // Only raycast if clicking the canvas (not UI)
    if (event.target !== this.renderer.domElement) return;

    // Calculate mouse position in normalized device coordinates
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Only intersect visible children in the worldGroup
    const intersects = this.raycaster.intersectObjects(worldGroup.children, true);

    if (intersects.length > 0) {
      // Find the first valid instanced mesh
      const hit = intersects.find(i => i.object.isInstancedMesh);
      if (hit) {
        this.selectInstance(hit.object, hit.instanceId);
      }
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
    
    // Set instance back to old matrix
    action.mesh.setMatrixAt(action.index, action.oldMatrix);
    action.mesh.instanceMatrix.needsUpdate = true;
    
    // If it's currently selected, update the proxy too
    if (this.selectedMesh === action.mesh && this.selectedIndex === action.index) {
      action.oldMatrix.decompose(
        this.selectedProxy.position,
        this.selectedProxy.quaternion,
        this.selectedProxy.scale
      );
    }
  }
}
