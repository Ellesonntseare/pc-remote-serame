'use strict';
(() => {
  function mount() {
    const app = document.querySelector('.app');
    const grid = document.querySelector('.heroactions');
    const screen = document.getElementById('screenBtn');
    if (!app || !grid || !screen || !window.PCRDashboard) return;
    app.classList.add('controlWorkspace');

    const paths = {
      keyboard: '<rect x="3" y="7" width="26" height="19" rx="3"/><path d="M8 12h1m6 0h1m6 0h1M8 17h1m6 0h1m6 0h1M10 22h12"/>',
      apps: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M12 24v3a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V14a2 2 0 0 0-2-2h-3"/>'
    };
    function shortcut(id, name, title, description, permission, action) {
      const button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.className = 'quick wide homeShortcut';
      button.dataset.dashboardTile = name;
      button.dataset.homePermission = permission;
      button.innerHTML = '<span class="dashboardTileIcon"><svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg></span><span class="dashboardTileCopy"><strong>' + title + '</strong><small>' + description + '</small></span>';
      button.addEventListener('click', () => {
        if (!window.PCRCanAccess?.(permission)) return;
        action();
      });
      grid.append(button);
      return button;
    }
    const keyboard = shortcut('homeKeyboard', 'keyboard', 'Keyboard', 'Type on your PC', 'control', () => {
      if (screen.classList.contains('hide')) return;
      if (!rs.on) rsOpen();
      rsKb();
    });
    const apps = shortcut('homeApps', 'apps', 'Switch apps', 'Find an open window', 'apps', () => {
      document.getElementById('pcAppsButton')?.click();
    });

    const order = {screen: 0, file: 1, keyboard: 2, apps: 3, audio: 4, video: 5, guest: 6, collaborate: 7, devices: 8, power: 9, camera: 10, 'send-audio': 11};
    const labels = {
      screen: ['Remote screen', 'View & control'],
      file: ['Files & clipboard', 'Move files and text'],
      video: ['Watch PC', 'Video & PC sound'],
      devices: ['Devices', 'Wake & switch devices'],
      power: ['Power', 'Lock, sleep & restart']
    };
    for (const button of grid.querySelectorAll('[data-dashboard-tile]')) {
      const name = button.dataset.dashboardTile;
      button.style.order = order[name] ?? 10;
      if (!labels[name]) continue;
      const copy = button.querySelector('.dashboardTileCopy');
      copy.querySelector('strong').textContent = labels[name][0];
      let detail = copy.querySelector('small');
      if (!detail) { detail = document.createElement('small'); copy.append(detail); }
      detail.textContent = labels[name][1];
    }
    function compactTiles(){
      for(const button of grid.querySelectorAll('[data-dashboard-tile]')){
        const detail=button.querySelector('.dashboardTileCopy small');if(detail){button.dataset.homeDescription=detail.textContent;detail.remove();}
      }
    }
    compactTiles();
    // Each tile is a direct grid child so saved order also matches keyboard order.
    const audioStack = grid.querySelector('.dashboardAudioStack');
    if (audioStack) { for (const tile of Array.from(audioStack.children)) grid.append(tile); audioStack.remove(); }
    for (const item of [screen, keyboard, grid.querySelector('[data-dashboard-tile=file]'), apps,
      grid.querySelector('[data-dashboard-tile=audio]'), grid.querySelector('[data-dashboard-tile=video]'), grid.querySelector('[data-dashboard-tile=guest]'),
      grid.querySelector('[data-dashboard-tile=collaborate]'), grid.querySelector('[data-dashboard-tile=devices]'),
      grid.querySelector('[data-dashboard-tile=power]')]) if (item) grid.append(item);
    const heading = document.createElement('div');
    heading.className = 'workspaceSectionHeading';
    heading.innerHTML = '<h2>Your controls</h2><span>Choose what you need</span>';
    grid.before(heading);

    // Playback and volume are common actions, so put them before status/history.
    const media = document.querySelector('.mediaWrap');
    const stats = document.querySelector('.dashboardStatus');
    if (media && stats) stats.before(media);
    const drawer = document.getElementById('powerDrawer');
    if (drawer) drawer.open = false;
    document.querySelector('.brandtext>span').textContent = 'Your PC, within reach';

    const storageKey = 'pcr_home_layout_v1';
    const defaults = Object.keys(order).sort((a, b) => order[a] - order[b]);
    const known = new Set(defaults);
    function normalize(value) {
      const safe = value && typeof value === 'object' && value.version === 1 ? value : {};
      const clean = list => Array.isArray(list) ? [...new Set(list.filter(name => typeof name === 'string' && known.has(name)))].slice(0, defaults.length) : [];
      const savedOrder = clean(safe.order);
      return {version: 1, order: [...savedOrder, ...defaults.filter(name => !savedOrder.includes(name))], hidden: clean(safe.hidden)};
    }
    let preferences;
    try { preferences = normalize(JSON.parse(localStorage.getItem(storageKey))); } catch { preferences = normalize(null); }
    const tiles = new Map(Array.from(grid.querySelectorAll('[data-dashboard-tile]'), button => [button.dataset.dashboardTile, button]));
    const empty = document.createElement('div'); empty.className = 'workspaceHomeEmpty'; empty.hidden = true;
    empty.innerHTML = '<strong>Make room for what you use.</strong><p>Add your controls in Settings whenever you need them.</p><button type="button">Choose home controls</button>';
    empty.querySelector('button').addEventListener('click', () => window.PCRWorkspaceSettings?.open()); grid.after(empty);
    function applyLayout() {
      const children = Array.from(grid.children);
      const desired = preferences.order.map(name => tiles.get(name)).filter(Boolean);
      if (desired.some((button, index) => children[index] !== button)) for (const button of desired) grid.append(button);
      for (const [index, name] of preferences.order.entries()) {
        const button = tiles.get(name); if (!button) continue;
        button.style.order = String(index);
        const hidden = String(preferences.hidden.includes(name));
        if (button.dataset.homeHidden !== hidden) button.dataset.homeHidden = hidden;
      }
    }
    function setLayout(value) {
      preferences = normalize({...value, version: 1}); applyLayout();
      let saved = true; try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { saved = false; }
      sync(); window.dispatchEvent(new CustomEvent('pcr:home-layout', {detail: {saved}})); return saved;
    }
    function getTiles() {
      return preferences.order.map(name => {
        const node = tiles.get(name); if (!node) return null;
        return {id: name, title: node.querySelector('strong')?.textContent || node.textContent.trim(), description: node.dataset.homeDescription || '', icon: node.querySelector('.dashboardTileIcon')?.innerHTML || '', available: !node.hidden && !node.classList.contains('hide') && node.dataset.pcrDenied !== 'true', visible: !preferences.hidden.includes(name)};
      }).filter(Boolean);
    }
    window.PCRWorkspace = {getTiles, getLayout: () => ({version: 1, order: preferences.order.slice(), hidden: preferences.hidden.slice()}), setLayout, reset: () => setLayout({}), defaults: defaults.slice()};
    applyLayout();

    let queued = false, availability = '';
    function sync() {
      queued = false;
      // Screen-sharing updates its label on account changes. Keep the same
      // icon/copy composition after that existing lifecycle handler runs.
      const guest = grid.querySelector('[data-dashboard-tile=guest]');
      if (guest && !guest.querySelector('.dashboardTileIcon')) {
        const owner = window.PCRAuth?.role === 'owner';
        const glyph = document.createElement('span'); glyph.className = 'dashboardTileIcon'; glyph.innerHTML = window.PCRDashboard.icon('guest');
        const copy = document.createElement('span'); copy.className = 'dashboardTileCopy';
        const native = typeof window.PCRAndroid?.postMessage === 'function';
        const title = document.createElement('strong'); title.textContent = native ? 'PC mouse on phone' : owner ? 'Phone control' : 'Share screen';
        const detail = document.createElement('small'); detail.textContent = native ? 'Control this phone from your PC' : owner ? 'Control a shared phone' : 'Share your display';
        copy.append(title, detail); guest.replaceChildren(glyph, copy);
      }
      compactTiles();
      const denied = (node, value) => {
        if (node.dataset.pcrDenied !== String(value)) node.dataset.pcrDenied = String(value);
      };
      denied(keyboard, !window.PCRCanAccess?.('control') || screen.classList.contains('hide'));
      denied(apps, !window.PCRCanAccess?.('apps'));
      const visible = Array.from(grid.querySelectorAll('[data-dashboard-tile]')).filter(button =>
        !button.hidden && !button.classList.contains('hide') && button.dataset.pcrDenied !== 'true' && button.dataset.homeHidden !== 'true'
      ).sort((a, b) => Number(a.style.order) - Number(b.style.order));
      const solo = visible.length % 2 ? visible.at(-1) : null;
      for (const button of grid.querySelectorAll('[data-dashboard-tile]')) if (button.classList.contains('homeSoloTile') !== (button === solo)) button.classList.toggle('homeSoloTile', button === solo);
      empty.hidden = visible.length > 0;
      const nextAvailability = getTiles().map(tile => tile.id + ':' + tile.available + ':' + tile.title).join('|');
      if (availability !== nextAvailability) { availability = nextAvailability; window.dispatchEvent(new CustomEvent('pcr:home-availability')); }
    }
    function scheduleSync() { if (!queued) { queued = true; queueMicrotask(sync); } }
    new MutationObserver(scheduleSync).observe(grid, {subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'data-pcr-denied', 'data-home-hidden']});
    window.addEventListener('pcr:auth', scheduleSync);
    sync();
    window.dispatchEvent(new CustomEvent('pcr:workspace-ready'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
