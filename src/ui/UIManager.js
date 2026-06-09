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

    // -- Theme Color Setting (God Only) --
    if (isGod) {
      const themeDiv = document.createElement('div');
      themeDiv.className = 'setting-group';
      
      const themeLabel = document.createElement('div');
      themeLabel.innerText = 'THEME COLOR (GOD)';
      themeLabel.className = 'setting-label';
      themeDiv.appendChild(themeLabel);

      const colorPicker = document.createElement('input');
      colorPicker.type = 'color';
      colorPicker.value = '#00aaff';
      colorPicker.style.cssText = 'width: 100%; height: 40px; border: none; border-radius: 8px; cursor: pointer; background: transparent;';
      
      colorPicker.oninput = (e) => {
        const color = e.target.value;
        document.documentElement.style.setProperty('--accent', color);
        document.documentElement.style.setProperty('--accent-glow', `0 0 20px ${color}`);
      };

      themeDiv.appendChild(colorPicker);
      sidebar.appendChild(themeDiv);
    }

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
}
