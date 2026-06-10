import { SETTINGS } from '../../game.config.js';

export class UIManager {
  static init(controls, isGod) {
    this.controls = controls;
    
    // Create the global UI container
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'ui-manager-container';
    document.body.appendChild(this.uiContainer);

    // Build the menus
    this.buildWorldShiftMenu();
    this.buildPauseMenu(isGod);
    if (isGod) {
      this.buildStudioUI();
    }
  }

  static buildWorldShiftMenu() {
    const worldShiftMenu = document.createElement('div');
    worldShiftMenu.className = 'menu-overlay world-shift-menu';
    worldShiftMenu.id = 'worldShiftMenu';
    worldShiftMenu.style.display = 'none';

    const title = document.createElement('h1');
    title.innerText = 'WORLD SHIFT';
    title.className = 'menu-title text-glow';
    worldShiftMenu.appendChild(title);

    const worldContainer = document.createElement('div');
    worldContainer.className = 'card-container';

    const worlds = [
      { name: 'THE SIM', id: 'sim', color: '#ff0055' },
      { name: 'THE SANDBOX', id: 'sandbox', color: '#00ffaa' },
      { name: 'THE LAB', id: 'lab', color: '#0088ff' }
    ];

    worlds.forEach(w => {
      const card = document.createElement('div');
      card.className = 'world-card';
      card.style.borderColor = w.color;
      card.style.color = w.color;
      card.style.boxShadow = `0 0 20px rgba(0,0,0,0.5)`;
      card.innerText = w.name;
      
      card.onmouseenter = () => {
        card.style.background = w.color;
        card.style.color = '#000';
        card.style.boxShadow = `0 0 40px ${w.color}`;
      };
      card.onmouseleave = () => {
        card.style.background = 'rgba(255, 255, 255, 0.05)';
        card.style.color = w.color;
        card.style.boxShadow = `0 0 20px rgba(0,0,0,0.5)`;
      };
      
      card.onclick = () => {
        worldShiftMenu.style.display = 'none';
        if (this.controls) this.controls.lock();
        window.dispatchEvent(new CustomEvent('shiftWorld', { detail: w.id }));
      };
      
      worldContainer.appendChild(card);
    });

    worldShiftMenu.appendChild(worldContainer);
    
    const closeText = document.createElement('div');
    closeText.innerText = 'Press [Q] to close';
    closeText.className = 'menu-hint';
    worldShiftMenu.appendChild(closeText);

    this.uiContainer.appendChild(worldShiftMenu);
    window.worldShiftMenu = worldShiftMenu; // Expose for keydown logic in main.js
  }

  static buildPauseMenu(isGod) {
    const pauseMenu = document.createElement('div');
    pauseMenu.className = 'menu-overlay pause-menu';
    pauseMenu.id = 'pauseMenu';
    pauseMenu.style.display = 'none';
    
    // Clicking the empty blurred background closes the menu
    pauseMenu.addEventListener('click', (e) => {
      if (e.target === pauseMenu) this.controls.lock();
    });

    const sidebar = document.createElement('div');
    sidebar.className = 'settings-sidebar';
    sidebar.addEventListener('click', (e) => e.stopPropagation());

    const title = document.createElement('h1');
    title.innerText = 'SETTINGS';
    title.className = 'sidebar-title';
    sidebar.appendChild(title);

    // -- Sensitivity Setting --
    const sensDiv = document.createElement('div');
    sensDiv.className = 'setting-group';
    
    const sensLabel = document.createElement('div');
    sensLabel.innerText = 'MOUSE SENSITIVITY';
    sensLabel.className = 'setting-label';
    sensDiv.appendChild(sensLabel);

    const sensSlider = document.createElement('input');
    sensSlider.type = 'range';
    sensSlider.min = '0.0001';
    sensSlider.max = '0.01';
    sensSlider.step = '0.0001';
    sensSlider.value = SETTINGS.SENSITIVITY;
    sensSlider.className = 'setting-slider';
    
    const sensValue = document.createElement('div');
    sensValue.innerText = SETTINGS.SENSITIVITY.toFixed(4);
    sensValue.className = 'setting-value';

    sensSlider.oninput = (e) => { 
      SETTINGS.SENSITIVITY = parseFloat(e.target.value); 
      sensValue.innerText = SETTINGS.SENSITIVITY.toFixed(4);
    };

    sensDiv.appendChild(sensSlider);
    sensDiv.appendChild(sensValue);
    sidebar.appendChild(sensDiv);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flexGrow = '1';
    sidebar.appendChild(spacer);

    // -- Buttons --
    const resumeBtn = document.createElement('button');
    resumeBtn.innerText = 'RESUME';
    resumeBtn.className = 'btn-primary';
    resumeBtn.onclick = () => this.controls.lock();
    sidebar.appendChild(resumeBtn);

    const disconnectBtn = document.createElement('button');
    disconnectBtn.innerText = 'DISCONNECT';
    disconnectBtn.className = 'btn-danger';
    disconnectBtn.onclick = () => window.location.reload(); 
    sidebar.appendChild(disconnectBtn);

    pauseMenu.appendChild(sidebar);
    this.uiContainer.appendChild(pauseMenu);
    window.pauseMenu = pauseMenu;
  }

  static buildStudioUI() {
    const studioUI = document.createElement('div');
    studioUI.id = 'studioUI';
    studioUI.style.cssText = `
      display: none;
      position: absolute; top: 20px; right: 20px;
      background: rgba(10, 15, 30, 0.9); border: 1px solid rgba(0, 170, 255, 0.3);
      border-radius: 12px; padding: 15px; color: white;
      font-family: monospace; z-index: 1000; box-shadow: 0 5px 20px rgba(0,0,0,0.8);
      pointer-events: auto;
    `;

    const title = document.createElement('div');
    title.innerText = '🛠 WORLD STUDIO';
    title.style.cssText = 'color: #00aaff; font-weight: bold; margin-bottom: 10px; font-size: 1.1rem;';
    studioUI.appendChild(title);

    const help = document.createElement('div');
    help.innerHTML = 'Click building to select<br/><b>Z</b>: Move | <b>X</b>: Rotate | <b>C</b>: Scale<br/><b>ESC</b>: Deselect';
    help.style.cssText = 'color: #aaa; margin-bottom: 15px; line-height: 1.4;';
    studioUI.appendChild(help);

    const publishBtn = document.createElement('button');
    publishBtn.id = 'publish-btn';
    publishBtn.innerText = 'PUBLISH TO SERVER';
    publishBtn.className = 'btn-primary';
    publishBtn.style.padding = '10px';
    publishBtn.style.fontSize = '0.9rem';
    
    const toolsSection = document.createElement('div');
    toolsSection.style.marginTop = '15px';
    toolsSection.style.borderTop = '1px solid #444';
    toolsSection.style.paddingTop = '10px';
    toolsSection.innerHTML = `
      <div style="font-size: 10px; color: #888; margin-bottom: 5px;">GOD TOOLS</div>
      <div style="display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 10px;">
        <button id="tool-transform" class="btn-primary" style="flex:1; padding:5px;">Move</button>
        <button id="tool-raise" class="btn-primary" style="flex:1; padding:5px; background:#3d4f35">Raise</button>
        <button id="tool-lower" class="btn-primary" style="flex:1; padding:5px; background:#3d4f35">Lower</button>
        <button id="tool-flatten" class="btn-primary" style="flex:1; padding:5px; background:#3d4f35">Flatten</button>
      </div>
      <div style="display: flex; gap: 5px; margin-bottom: 10px;">
        <button id="tool-fix_texture" class="btn-primary" style="flex:1; padding:5px; background:#aa5500">Fix Texture</button>
        <button id="tool-eraser" class="btn-danger" style="flex:1; padding:5px;">Eraser</button>
      </div>
    `;
    studioUI.appendChild(toolsSection);

    // Asset Importer
    const assetSection = document.createElement('div');
    assetSection.style.borderTop = '1px solid #444';
    assetSection.style.paddingTop = '10px';
    assetSection.innerHTML = `
      <div style="font-size: 10px; color: #888; margin-bottom: 5px;">IMPORT CUSTOM GLTF</div>
      <div style="display: flex; gap: 5px; margin-bottom: 10px;">
        <input type="text" id="model-input" placeholder="model.glb" style="flex: 1; padding: 5px; background: #222; color: white; border: 1px solid #555;" />
        <button id="spawn-btn" class="btn-primary" style="padding: 5px 10px;">Spawn</button>
      </div>
    `;
    studioUI.appendChild(assetSection);

    setTimeout(() => {
      document.getElementById('publish-btn').addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('publishWorld'));
      });
      document.getElementById('spawn-btn').addEventListener('click', () => {
        const val = document.getElementById('model-input').value;
        if (val) window.dispatchEvent(new CustomEvent('spawnModel', { detail: val }));
      });
      
      const tools = ['transform', 'raise', 'lower', 'flatten', 'fix_texture', 'eraser'];
      tools.forEach(tool => {
         const btn = document.getElementById(`tool-${tool}`);
         if (btn) {
           btn.addEventListener('click', () => {
             window.dispatchEvent(new CustomEvent('setToolMode', { detail: tool }));
           });
         }
      });
    }, 100);
    studioUI.appendChild(publishBtn);

    this.uiContainer.appendChild(studioUI);
    window.studioUI = studioUI;
  }
}
