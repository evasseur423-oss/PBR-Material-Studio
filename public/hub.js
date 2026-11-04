/**
 * PBR Material Studio — Hub Controller
 * Manages:
 *  - Switching between [01. Material Library] and [02. PBR Alchemist]
 *  - Strict WebGL GPU lifecycle optimization (pausing inactive workspace)
 *  - Inter-module bridge (PBR Alchemist -> Material Library)
 *  - Desktop integration (opening external storage folder)
 */

(function () {
  'use strict';

  const WORKSPACES = [
    { id: 0, key: 'library', name: '[01. Material Library]', frameId: 'frame-0', containerId: 'ws-container-0' },
    { id: 1, key: 'alchemist', name: '[02. PBR Alchemist]', frameId: 'frame-1', containerId: 'ws-container-1' }
  ];

  let currentWorkspaceIndex = 0;

  const navTabs = document.querySelectorAll('.nav-tab');
  const containers = WORKSPACES.map(w => document.getElementById(w.containerId));
  const frames = WORKSPACES.map(w => document.getElementById(w.frameId));
  const gpuStatusText = document.getElementById('gpuStatusText');
  const hubToastHost = document.getElementById('hubToastHost');

  // =========================================================================
  // WORKSPACE SWITCHER & STRICT GPU LIFECYCLE
  // =========================================================================

  function switchWorkspace(newIndex) {
    if (newIndex < 0 || newIndex >= WORKSPACES.length) return;
    if (newIndex === currentWorkspaceIndex && containers[newIndex].classList.contains('active')) return;

    const oldIndex = currentWorkspaceIndex;
    currentWorkspaceIndex = newIndex;
    const target = WORKSPACES[newIndex];

    // 1. Notify OLD workspace to SUSPEND WebGL render loop (GPU 0%)
    const oldFrame = frames[oldIndex];
    if (oldFrame && oldFrame.contentWindow) {
      try {
        oldFrame.contentWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: false }, '*');
      } catch (_) {}
    }

    // 2. Update Tab Styles
    navTabs.forEach((tab, idx) => {
      tab.classList.toggle('active', idx === newIndex);
    });

    // 3. Toggle Visibility of Container Frames
    containers.forEach((container, idx) => {
      container.classList.toggle('active', idx === newIndex);
    });

    // 4. Notify NEW workspace to RESUME WebGL render loop
    const newFrame = frames[newIndex];
    if (newFrame && newFrame.contentWindow) {
      try {
        newFrame.contentWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: true }, '*');
        newFrame.contentWindow.postMessage({ type: 'ARCHFORGE_REINIT_LISTENERS', active: true }, '*');
      } catch (_) {}
    }

    // 5. Update GPU Status Monitor
    if (gpuStatusText) {
      gpuStatusText.textContent = `GPU: ${target.name} active (1 suspended)`;
    }

    initModuleListeners();
  }

  // Keyboard Shortcuts (Alt+1 and Alt+2)
  window.addEventListener('keydown', (e) => {
    const isAlt = e.altKey;
    const tag = (e.target.tagName || '').toLowerCase();
    const inInput = (tag === 'input' || tag === 'textarea' || tag === 'select');

    if (isAlt && ['1', '2'].includes(e.key)) {
      e.preventDefault();
      const idx = parseInt(e.key, 10) - 1;
      switchWorkspace(idx);
    } else if (!isAlt && !inInput && ['1', '2'].includes(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      switchWorkspace(idx);
    }
  });

  // =========================================================================
  // INTER-MODULE BRIDGE (PBR ALCHEMIST -> MATERIAL LIBRARY)
  // =========================================================================

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    const { type } = event.data;

    // 1. Child Frame Ready Signal
    if (type === 'ARCHFORGE_FRAME_READY') {
      const senderWindow = event.source;
      frames.forEach((frame, idx) => {
        if (frame.contentWindow === senderWindow) {
          const isActive = (idx === currentWorkspaceIndex);
          senderWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: isActive }, '*');
        }
      });
    }

    // 2. BRIDGE: [02. PBR Alchemist] -> [01. Material Library]
    if (type === 'ARCHFORGE_ALCHEMIST_SAVED') {
      const { category, materialName } = event.data;
      console.log(`[PBR Studio Bridge] Alchemist saved new material: ${category}/${materialName}`);

      const libFrame = frames[0];
      if (libFrame && libFrame.contentWindow) {
        libFrame.contentWindow.postMessage({
          type: 'ARCHFORGE_REFRESH_CATALOG',
          category,
          materialName
        }, '*');
      }

      showToast(`✨ New material '${materialName}' saved to '${category}'!`, {
        actionLabel: 'View in Library',
        actionFn: () => switchWorkspace(0)
      });
    }
  });

  // =========================================================================
  // STUDIO ACTIONS & EVENT LISTENERS
  // =========================================================================

  let isOpeningMaterialsDir = false;

  async function openMaterialsDir() {
    if (isOpeningMaterialsDir) return;
    isOpeningMaterialsDir = true;
    try {
      if (window.archforgeDesktop && window.archforgeDesktop.openMaterialsFolder) {
        const res = await window.archforgeDesktop.openMaterialsFolder();
        showToast(`📁 Materials folder opened in File Explorer: ${res.path || 'Workspace_Materials'}`);
      } else {
        const resp = await fetch('/api/open-folder');
        const data = await resp.json();
        showToast(`📁 Materials folder opened: ${data.path || 'Workspace_Materials'}`);
      }
    } catch (err) {
      console.error('Error opening materials directory:', err);
      showToast('Unable to open folder automatically.');
    } finally {
      setTimeout(() => { isOpeningMaterialsDir = false; }, 1000);
    }
  }

  function openAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.removeAttribute('hidden');
  }

  function closeAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (modal) modal.setAttribute('hidden', '');
  }

  function closeApp() {
    if (window.archforgeDesktop && typeof window.archforgeDesktop.close === 'function') {
      window.archforgeDesktop.close();
    } else {
      window.close();
    }
  }

  function initModuleListeners() {
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      if (!tab.dataset.hubBound) {
        tab.dataset.hubBound = 'true';
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetIndex = parseInt(tab.dataset.workspace, 10);
          switchWorkspace(targetIndex);
        });
      }
    });

    const btnMat = document.getElementById('btnOpenMaterialsDir');
    if (btnMat && !btnMat.dataset.hubBound) {
      btnMat.dataset.hubBound = 'true';
      btnMat.addEventListener('click', (e) => {
        e.stopPropagation();
        openMaterialsDir();
      });
    }

    const btnAbout = document.getElementById('btnOpenAbout');
    if (btnAbout && !btnAbout.dataset.hubBound) {
      btnAbout.dataset.hubBound = 'true';
      btnAbout.addEventListener('click', (e) => {
        e.stopPropagation();
        openAboutModal();
      });
    }

    const btnCloseAb = document.getElementById('btnCloseAbout');
    if (btnCloseAb && !btnCloseAb.dataset.hubBound) {
      btnCloseAb.dataset.hubBound = 'true';
      btnCloseAb.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAboutModal();
      });
    }

    const btnClose = document.getElementById('btnCloseApp');
    if (btnClose && !btnClose.dataset.hubBound) {
      btnClose.dataset.hubBound = 'true';
      btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeApp();
      });
    }
  }

  document.addEventListener('click', (e) => {
    const modal = document.getElementById('aboutModal');
    if (modal && e.target === modal) {
      closeAboutModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('aboutModal');
      if (modal && !modal.hasAttribute('hidden')) {
        closeAboutModal();
      }
    }
  });

  initModuleListeners();

  // =========================================================================
  // TOAST NOTIFICATIONS
  // =========================================================================

  function showToast(message, { actionLabel = null, actionFn = null, duration = 5000 } = {}) {
    if (!hubToastHost) return;

    const toast = document.createElement('div');
    toast.className = 'hub-toast';

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    if (actionLabel && typeof actionFn === 'function') {
      const btn = document.createElement('button');
      btn.className = 'hub-toast-action';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        actionFn();
        toast.remove();
      });
      toast.appendChild(btn);
    }

    hubToastHost.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, duration);
  }

  frames.forEach((frame, idx) => {
    frame.addEventListener('load', () => {
      const isActive = (idx === currentWorkspaceIndex);
      try {
        frame.contentWindow.postMessage({ type: 'ARCHFORGE_SET_ACTIVE', active: isActive }, '*');
        frame.contentWindow.dispatchEvent(new Event('resize'));
      } catch (_) {}
    });
  });

  window.archforgeHub = {
    switchWorkspace,
    initModuleListeners,
    openMaterialsDir,
    openAboutModal,
    closeAboutModal,
    closeApp,
    showToast,
    getCurrentWorkspace: () => WORKSPACES[currentWorkspaceIndex]
  };
  window.initModuleListeners = initModuleListeners;
  window.switchWorkspace = switchWorkspace;

  setTimeout(() => {
    switchWorkspace(0);
  }, 200);

})();
