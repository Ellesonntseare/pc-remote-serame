'use strict';
(() => {
  function mount() {
    const workspace = window.PCRWorkspace, topbar = document.querySelector('.topbar');
    if (!workspace || !topbar || window.PCRWorkspaceSettings) return;
    const dialog = document.createElement('dialog'); dialog.id = 'workspaceSettings'; dialog.className = 'nativeDialog workspacePage workspaceSettings'; dialog.setAttribute('aria-labelledby', 'workspaceSettingsTitle');
    dialog.innerHTML = '<header class="nativeDialogHead"><div><span class="nativeEyebrow">PC REMOTE</span><h2 id="workspaceSettingsTitle">Settings</h2></div><button type="button" data-close aria-label="Close settings">×</button></header><p class="workspaceSettingsIntro">Put your everyday controls where they feel right. Changes are saved on this device.</p><section class="workspaceSettingsCard" aria-labelledby="homeLayoutTitle"><div class="workspaceSettingsSectionHead"><div><h3 id="homeLayoutTitle">Your home controls</h3><p>Drag the grip to reorder. Use the arrows to move a tile, or hide controls you rarely use.</p></div><button type="button" id="homeLayoutReset" class="settingsQuietButton">Reset layout</button></div><div id="homeTileBoard" class="settingsTileBoard" role="list" aria-label="Home controls in display order"></div><div class="settingsHiddenControls"><h4>Add a control</h4><div id="homeTileTray" class="settingsTileTray"></div></div><p id="homeLayoutStatus" class="settingsStatus" role="status" aria-live="polite"></p></section><section id="workspaceSplitSettings" class="workspaceSettingsCard" aria-labelledby="workspaceSplitTitle"><h3 id="workspaceSplitTitle">Screen &amp; trackpad</h3><p>Give the picture more room, or make the trackpad easier to reach. You can also drag the divider while controlling your PC.</p><div class="workspaceSplitControls"></div><button type="button" id="workspaceRemotePreferences" class="settingsQuietButton">Keyboard, pointer &amp; shortcuts <span aria-hidden="true">→</span></button></section><section id="workspaceSettingsPreferences" class="workspaceSettingsCard" hidden></section>';
    document.body.append(dialog);
    const accountSection=document.createElement('section');accountSection.className='workspaceSettingsCard';accountSection.innerHTML='<h3>Your account</h3><p data-current-account></p><button type="button" id="workspaceSignOut" class="settingsQuietButton">Sign out</button>';dialog.querySelector('.workspaceSettingsIntro').after(accountSection);accountSection.querySelector('button').onclick=()=>{dialog.close();void window.unpair?.();};
    const launcher = document.createElement('button'); launcher.type = 'button'; launcher.id = 'workspaceSettingsButton'; launcher.className = 'workspaceSettingsButton'; launcher.title = 'Settings'; launcher.setAttribute('aria-label', 'Settings'); launcher.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 3-.8 3-2.3 1.4L4 7l-1.5 3 2.1 2-.1 2.7-1.8 2.2 2 2.6 2.9-.8 2.4 1.1 1.1 2.2h3.1l.8-2.8 2.2-1.5 2.8.4 1.6-2.8-2-2 .1-2.6 1.6-2.2-2-2.5-2.7.6-2.4-1.3L13 3Z"/><circle cx="12" cy="12" r="3.2"/></svg>';
    topbar.append(launcher);
    const board = dialog.querySelector('#homeTileBoard'), tray = dialog.querySelector('#homeTileTray'), status = dialog.querySelector('#homeLayoutStatus');
    let drag = null, nativeDrag = null, dragFrame = 0, dragPoint = null;
    function say(message, saved = true) { status.textContent = message + (saved ? '' : ' Your browser could not save this change; it applies for this visit.'); }
    function button(label, text, action) { const node = document.createElement('button'); node.type = 'button'; node.setAttribute('aria-label', label); node.textContent = text; node.dataset.tileAction = action; return node; }
    function renderTiles(focusId, action) {
      if (!dialog.open) return;
      const tiles = workspace.getTiles(), visible = tiles.filter(tile => tile.available && tile.visible); board.replaceChildren(); tray.replaceChildren();
      visible.forEach((tile, index) => {
        const card = document.createElement('div'); card.className = 'settingsTileCard'; card.dataset.tileId = tile.id; card.draggable = true; card.setAttribute('role', 'listitem');
        const grip = button('Drag to move ' + tile.title, '⠿', 'drag'); grip.className = 'settingsTileGrip'; grip.title = 'Drag to reorder';
        const glyph = document.createElement('span'); glyph.className = 'settingsTileIcon'; glyph.setAttribute('aria-hidden', 'true'); glyph.innerHTML = tile.icon;
        const copy = document.createElement('span'); copy.className = 'settingsTileCopy'; const title = document.createElement('strong'); title.textContent = tile.title; const detail = document.createElement('small'); detail.textContent = tile.description; copy.append(title, detail);
        const actions = document.createElement('span'); actions.className = 'settingsTileActions'; const up = button('Move ' + tile.title + ' earlier', '↑', 'up'), down = button('Move ' + tile.title + ' later', '↓', 'down'), hide = button('Hide ' + tile.title + ' from home', '−', 'hide'); up.disabled = index === 0; down.disabled = index === visible.length - 1; actions.append(up, down, hide); card.append(grip, glyph, copy, actions); board.append(card);
      });
      if (!visible.length) { const message = document.createElement('p'); message.className = 'settingsEmptyMessage'; message.textContent = 'Your home is clear. Add a control below to get started.'; board.append(message); }
      for (const tile of tiles.filter(item => item.available && !item.visible)) { const add = button('Add ' + tile.title + ' to home', '+ ' + tile.title, 'add'); add.dataset.tileId = tile.id; tray.append(add); }
      if (!tray.children.length) { const message = document.createElement('p'); message.className = 'settingsEmptyMessage'; message.textContent = 'All available controls are on your home.'; tray.append(message); }
      if (tiles.some(tile => !tile.available)) { const note = document.createElement('p'); note.className = 'settingsAccountNote'; note.textContent = 'Your host manages which controls this account can use.'; tray.append(note); }
      if (focusId) { const card = Array.from(board.children).find(node => node.dataset.tileId === focusId); (card?.querySelector('[data-tile-action="' + (action || 'drag') + '"]:not(:disabled)') || card?.querySelector('button:not(:disabled)'))?.focus({preventScroll: true}); }
    }
    function reorderVisible(ids) {
      const layout = workspace.getLayout(), visible = new Set(workspace.getTiles().filter(tile => tile.available && tile.visible).map(tile => tile.id));
      if (ids.length !== visible.size || new Set(ids).size !== visible.size || ids.some(id => !visible.has(id))) return false;
      let index = 0; return workspace.setLayout({...layout, order: layout.order.map(id => visible.has(id) ? ids[index++] : id)});
    }
    function move(id, offset) {
      const shown = workspace.getTiles().filter(tile => tile.available && tile.visible), index = shown.findIndex(tile => tile.id === id), destination = index + offset;
      if (index < 0 || destination < 0 || destination >= shown.length) return;
      const ids = shown.map(tile => tile.id); ids.splice(index, 1); ids.splice(destination, 0, id); const saved = reorderVisible(ids); renderTiles(id, offset < 0 ? 'up' : 'down'); say(shown[index].title + ' moved to position ' + (destination + 1) + '.', saved);
    }
    board.addEventListener('click', event => {
      const control = event.target.closest('[data-tile-action]'), card = control?.closest('[data-tile-id]'); if (!control || !card) return;
      if (control.dataset.tileAction === 'up' || control.dataset.tileAction === 'down') { move(card.dataset.tileId, control.dataset.tileAction === 'up' ? -1 : 1); return; }
      if (control.dataset.tileAction !== 'hide') return;
      const tile = workspace.getTiles().find(item => item.id === card.dataset.tileId && item.available); if (!tile) return;
      const layout = workspace.getLayout(), saved = workspace.setLayout({...layout, hidden: [...layout.hidden, tile.id]}); renderTiles(); say(tile.title + ' hidden. Add it again below.', saved); tray.querySelector('[data-tile-id="' + tile.id + '"]')?.focus({preventScroll: true});
    });
    tray.addEventListener('click', event => {
      const control = event.target.closest('[data-tile-id]'), tile = workspace.getTiles().find(item => item.id === control?.dataset.tileId && item.available); if (!tile) return;
      const layout = workspace.getLayout(), saved = workspace.setLayout({...layout, hidden: layout.hidden.filter(id => id !== tile.id)}); renderTiles(tile.id); say(tile.title + ' added to home.', saved);
    });
    function previewMove(id, target, after) { const source = Array.from(board.children).find(node => node.dataset.tileId === id); if (!source || !target?.dataset.tileId || source === target) return; board.insertBefore(source, after ? target.nextSibling : target); }
    function commitOrder(id) { const ids = Array.from(board.children).map(node => node.dataset.tileId).filter(Boolean), saved = reorderVisible(ids); renderTiles(id); say('Home controls reordered.', saved); }
    function previewPointer() {
      dragFrame = 0; if (!drag || !dragPoint) return;
      const target = document.elementFromPoint?.(dragPoint.x, dragPoint.y)?.closest('.settingsTileCard');
      if (target && board.contains(target)) { const box = target.getBoundingClientRect(); previewMove(drag.id, target, dragPoint.y > box.top + box.height / 2); }
      const direction = dragPoint.y < 90 ? -1 : dragPoint.y > innerHeight - 70 ? 1 : 0, current = dialog.scrollTop;
      if (direction) dialog.scrollTop = Math.max(0, Math.min(Math.max(0, dialog.scrollHeight - dialog.clientHeight), current + direction * 14));
      if (dialog.scrollTop !== current) dragFrame = requestAnimationFrame(previewPointer);
    }
    board.addEventListener('pointerdown', event => {
      const grip = event.target.closest('[data-tile-action=drag]'), card = grip?.closest('[data-tile-id]'); if (!card || event.button !== 0) return;
      event.preventDefault(); board.setPointerCapture?.(event.pointerId); drag = {id: card.dataset.tileId, pointer: event.pointerId, grip, x: event.clientX, y: event.clientY, moved: false};
    });
    board.addEventListener('pointermove', event => {
      if (!drag || drag.pointer !== event.pointerId) return; event.preventDefault(); if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      drag.moved = true; board.classList.add('settingsDragging'); dragPoint = {x: event.clientX, y: event.clientY}; if (!dragFrame) dragFrame = requestAnimationFrame(previewPointer);
    });
    function endPointer(event, commit) { if (!drag || drag.pointer !== event.pointerId) return; if (dragFrame) cancelAnimationFrame(dragFrame); if (commit) previewPointer(); if (dragFrame) cancelAnimationFrame(dragFrame); dragFrame = 0; const ended = drag; drag = null; dragPoint = null; board.classList.remove('settingsDragging'); if (ended.moved && commit) commitOrder(ended.id); else if (ended.moved) renderTiles(ended.id); }
    board.addEventListener('pointerup', event => endPointer(event, true)); for (const name of ['pointercancel', 'lostpointercapture']) board.addEventListener(name, event => endPointer(event, false));
    board.addEventListener('dragstart', event => { const card = event.target.closest('.settingsTileCard'); if (!card) return; nativeDrag = card.dataset.tileId; event.dataTransfer?.setData('text/plain', nativeDrag); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; board.classList.add('settingsDragging'); });
    board.addEventListener('dragover', event => { if (!nativeDrag) return; event.preventDefault(); const target = event.target.closest('.settingsTileCard'); if (target) { const box = target.getBoundingClientRect(); previewMove(nativeDrag, target, event.clientY > box.top + box.height / 2); } });
    board.addEventListener('drop', event => { if (!nativeDrag) return; event.preventDefault(); const id = nativeDrag; nativeDrag = null; board.classList.remove('settingsDragging'); commitOrder(id); });
    board.addEventListener('dragend', () => { board.classList.remove('settingsDragging'); if (nativeDrag) { nativeDrag = null; renderTiles(); } });
    dialog.querySelector('#homeLayoutReset').addEventListener('click', () => { const saved = workspace.reset(); renderTiles(); say('Default order and all available controls restored.', saved); });
    function open(section) { if (window.PCRAuth && !window.PCRAuth.signedIn) return; accountSection.querySelector('[data-current-account]').textContent=window.PCRAuth?.account?.email||'Connected with your PC password';if (!dialog.open) dialog.showModal(); renderTiles();refreshControls();if(typeof section==='string')requestAnimationFrame(()=>jump(section)); }
    function close() { if (dialog.open) dialog.close(); }
    launcher.addEventListener('click', open); dialog.querySelector('[data-close]').addEventListener('click', close);
    dialog.addEventListener('close', () => { if (dragFrame) cancelAnimationFrame(dragFrame); dragFrame = 0; drag = null; dragPoint = null; nativeDrag = null; board.classList.remove('settingsDragging'); });
    window.addEventListener('pcr:home-availability', () => { if (dialog.open && !drag && !nativeDrag) renderTiles(); });
    window.addEventListener('pcr:auth', event => { if (!event.detail?.signedIn) close(); });
    function refreshControls(){document.getElementById('sensitivity').value=sens;document.getElementById('sensValue').textContent=sens.toFixed(1)+'×';document.getElementById('keyColumns').value=cols;document.getElementById('keySize').value=keyHeight;rsRenderEditor();}
    function markSection(section){for(const button of dialog.querySelectorAll('.settingsSectionNav button')){if(button.dataset.section===section)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');}}
    function jump(section){const target=dialog.querySelector('[data-settings-section="'+section+'"]');if(!target)return;target.scrollIntoView?.({block:'start',behavior:'instant'});target.querySelector('h3')?.focus({preventScroll:true});markSection(section);}
    function organize(){
      if(dialog.dataset.organized==='true')return;dialog.dataset.organized='true';
      const intro=dialog.querySelector('.workspaceSettingsIntro');intro.textContent='Your connection, controls and personal preferences. Saved on this device.';
      const nav=document.createElement('nav');nav.className='settingsSectionNav';nav.setAttribute('aria-label','Settings sections');intro.after(nav);
      const groups={};for(const [id,label]of [['connection','Connection'],['controls','Controls'],['appearance','Appearance'],['privacy','Privacy']]){const section=document.createElement('section');section.className='settingsGroup';section.dataset.settingsSection=id;section.innerHTML='<h3 tabindex="-1" id="settings-'+id+'">'+label+'</h3><div class="settingsGroupContent"></div>';section.setAttribute('aria-labelledby','settings-'+id);dialog.append(section);groups[id]=section.querySelector('div');const link=document.createElement('button');link.type='button';link.textContent=label;link.dataset.section=id;link.onclick=()=>jump(id);nav.append(link);}
      let sectionFrame=0;dialog.addEventListener('scroll',()=>{if(sectionFrame||!dialog.open)return;sectionFrame=requestAnimationFrame(()=>{sectionFrame=0;let selected='connection';for(const section of dialog.querySelectorAll('.settingsGroup'))if(section.getBoundingClientRect().top<=110)selected=section.dataset.settingsSection;if(dialog.scrollHeight>dialog.clientHeight&&dialog.scrollTop+dialog.clientHeight>=dialog.scrollHeight-5)selected='privacy';markSection(selected);});},{passive:true});markSection('connection');
      const connection=document.querySelector('#localConnectionPage .localConnectionCard');if(connection)groups.connection.append(connection);
      const endpoint=document.createElement('p');endpoint.className='settingsEndpoint';endpoint.textContent='Current host · '+location.origin;groups.connection.prepend(endpoint);
      const split=dialog.querySelector('#workspaceSplitSettings');split.querySelector('#workspaceRemotePreferences').remove();groups.controls.append(split);
      const sheet=document.querySelector('#rsSettings .controlSheet');if(sheet){sheet.id='workspaceControlPreferences';sheet.classList.add('workspaceSettingsCard');sheet.querySelector('.controlHead')?.remove();const heading=document.createElement('h4');heading.textContent='Pointer & keyboard';sheet.prepend(heading);groups.controls.append(sheet);}
      groups.controls.append(dialog.querySelector('#workspaceSettingsPreferences'));
      const appearance=dialog.querySelector('.appearanceSettings');if(appearance){appearance.querySelector('h3').textContent='Visual effects';groups.appearance.append(appearance);}
      groups.appearance.append(dialog.querySelector('#homeLayoutTitle').closest('section'));groups.privacy.append(accountSection);
      const privacy=document.createElement('p');privacy.className='settingsPrivacyNote';privacy.textContent='Camera, microphone and screen sharing start when you choose them. Review and stop each source in its sharing page.';groups.privacy.append(privacy);
      // All launchers now reach this same page; remote customization no longer
      // opens a second settings dialog or maintains another copy of sliders.
      window.rsPrefsOpen=()=>open('controls');window.rsPrefsClose=()=>{document.getElementById('rsSettings').classList.add('hide');if(dialog.open)close();};
    }
    window.PCRWorkspaceSettings = {open, close,get ready(){return dialog.dataset.organized==='true';}};
    installSplit(dialog);
    // Run after every feature's mount callback, including when this module was
    // itself mounted during DOMContentLoaded (embedded/older browser engines).
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(organize,0),{once:true});else setTimeout(organize,0);
  }

  function installSplit(dialog) {
    const screen = document.getElementById('rs'), view = document.getElementById('rsv'), dock = document.getElementById('remoteSwipeDock'); if (!screen || !view || !dock) return;
    const key = 'pcr_remote_split_v1', fallback = {version: 1, portrait: 32, landscape: 34};
    const clamp = value => Math.max(22, Math.min(55, value));
    let preference; try { const saved = JSON.parse(localStorage.getItem(key)); preference = saved?.version === 1 ? {version: 1, portrait: Number.isFinite(saved.portrait) ? clamp(saved.portrait) : 32, landscape: Number.isFinite(saved.landscape) ? clamp(saved.landscape) : 34} : {...fallback}; } catch { preference = {...fallback}; }
    const groups = [], separator = document.createElement('div'); separator.id = 'remoteSplitHandle'; separator.className = 'remoteSplitHandle'; separator.tabIndex = 0; separator.setAttribute('role', 'separator'); separator.setAttribute('aria-label', 'Resize screen and trackpad'); separator.setAttribute('aria-valuemin', '22'); separator.setAttribute('aria-valuemax', '55'); separator.innerHTML = '<span aria-hidden="true"></span>'; dock.before(separator);
    let frame = 0, dragging = null, watching = false;
    const landscape = () => innerWidth >= 600 && innerWidth > (window.visualViewport?.height || innerHeight);
    function persist() { try { localStorage.setItem(key, JSON.stringify(preference)); return true; } catch { return false; } }
    function syncControls() { for (const group of groups) { for (const mode of ['portrait', 'landscape']) { group.querySelector('[data-split-mode=' + mode + ']').value = preference[mode]; group.querySelector('[data-split-value=' + mode + ']').textContent = Math.round(preference[mode]) + '%'; } for (const button of group.querySelectorAll('[data-split-preset]')) { const target = presets[button.dataset.splitPreset]; button.setAttribute('aria-pressed', String(target[0] === preference.portrait && target[1] === preference.landscape)); } } }
    const presets = {screen: [26, 28], balanced: [32, 34], trackpad: [44, 44]};
    function controls(parent, prefix) {
      const group = document.createElement('div'); group.className = 'workspaceSplitControlsInner';
      group.innerHTML = '<div class="workspaceSplitPresets"><button type="button" data-split-preset="screen">More screen</button><button type="button" data-split-preset="balanced">Balanced</button><button type="button" data-split-preset="trackpad">More trackpad</button></div>' + ['portrait', 'landscape'].map(mode => '<label class="workspaceSplitRange" for="' + prefix + mode + '"><span>' + (mode === 'portrait' ? 'Portrait · bottom panel' : 'Landscape · side panel') + '<output data-split-value="' + mode + '"></output></span><input id="' + prefix + mode + '" data-split-mode="' + mode + '" type="range" min="22" max="55" step="1" aria-label="' + mode + ' trackpad space"></label>').join('');
      group.addEventListener('input', event => { const mode = event.target.dataset.splitMode; if (!mode) return; preference[mode] = clamp(Number(event.target.value)); syncControls(); schedule(); }); group.addEventListener('change', persist);
      group.addEventListener('click', event => { const name = event.target.closest('[data-split-preset]')?.dataset.splitPreset, preset = presets[name]; if (!preset) return; preference.portrait = preset[0]; preference.landscape = preset[1]; persist(); syncControls(); schedule(); }); parent.append(group); groups.push(group);
    }
    controls(dialog.querySelector('.workspaceSplitControls'), 'homeSplit');
    function visible() { return !document.hidden && !screen.classList.contains('hide'); }
    function watchingResize(on) { if (on === watching) return; watching = on; resize?.disconnect(); if (on) for (const node of [screen, dock.querySelector('.dockQuickKeys'), document.getElementById('rsk')]) if (node) resize?.observe(node); }
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    function apply() {
      frame = 0; syncControls(); const shown = visible(); watchingResize(shown);
      const typingPanel = document.getElementById('typePanel'), typing = screen.classList.contains('typing') || !!typingPanel && !typingPanel.classList.contains('hide');
      const enabled = shown && !typing && !screen.classList.contains('screenClean') && !screen.classList.contains('guestViewOnly');
      if (screen.classList.contains('workspaceSplit') !== enabled) screen.classList.toggle('workspaceSplit', enabled);
      const wide = enabled && landscape(); if (screen.classList.contains('workspaceLandscape') !== wide) screen.classList.toggle('workspaceLandscape', wide);
      separator.hidden = !enabled; if (!enabled) return;
      const rect = screen.getBoundingClientRect(), mode = wide ? 'landscape' : 'portrait', percent = preference[mode];
      separator.setAttribute('aria-orientation', wide ? 'vertical' : 'horizontal'); separator.setAttribute('aria-valuenow', String(Math.round(percent))); separator.setAttribute('aria-valuetext', Math.round(percent) + ' percent trackpad space');
      let size;
      if (wide) size = Math.max(240, Math.min((rect.width || innerWidth) * .55, (rect.width || innerWidth) * percent / 100));
      else {
        const style = getComputedStyle(screen), height = rect.height || window.visualViewport?.height || innerHeight;
        let available = height - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - 18;
        for (const child of screen.children) { if ([view, dock, separator].includes(child)) continue; const computed = getComputedStyle(child); if (computed.display === 'none' || ['fixed', 'absolute'].includes(computed.position)) continue; available -= child.getBoundingClientRect().height; }
        const dockStyle = getComputedStyle(dock), surfaces = dock.querySelector('.remoteSwipeSurfaces'); let fixed = (parseFloat(dockStyle.paddingTop) || 0) + (parseFloat(dockStyle.paddingBottom) || 0);
        for (const child of dock.children) { if (child === surfaces || getComputedStyle(child).display === 'none') continue; const computed = getComputedStyle(child); fixed += child.getBoundingClientRect().height + (parseFloat(computed.marginTop) || 0) + (parseFloat(computed.marginBottom) || 0); }
        const minimum = Math.min(Math.max(0, available - 100), fixed + 80); size = Math.max(minimum, Math.min(Math.max(minimum, available - 100), available * percent / 100));
      }
      const value = Math.round(size) + 'px'; if (screen.style.getPropertyValue('--remote-dock-size') !== value) screen.style.setProperty('--remote-dock-size', value);
    }
    function schedule() { if (!frame && !document.hidden) frame = requestAnimationFrame(apply); }
    separator.addEventListener('pointerdown', event => { if (event.button !== 0 || separator.hidden) return; event.preventDefault(); window.PCRSwipeDock?.release(); separator.setPointerCapture?.(event.pointerId); dragging = {id: event.pointerId, mode: landscape() ? 'landscape' : 'portrait', rect: screen.getBoundingClientRect()}; separator.classList.add('resizing'); });
    separator.addEventListener('pointermove', event => { if (dragging?.id !== event.pointerId) return; event.preventDefault(); const {rect, mode} = dragging, value = mode === 'landscape' ? (rect.right - event.clientX) / rect.width * 100 : (rect.bottom - event.clientY) / rect.height * 100; if (Number.isFinite(value)) { preference[mode] = Math.round(clamp(value)); schedule(); } });
    function finish(event) { if (dragging?.id !== event.pointerId) return; dragging = null; separator.classList.remove('resizing'); persist(); }
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) separator.addEventListener(name, finish);
    separator.addEventListener('keydown', event => { const mode = landscape() ? 'landscape' : 'portrait', delta = {ArrowUp: 2, ArrowLeft: 2, ArrowDown: -2, ArrowRight: -2}[event.key]; if (!delta && !['Home', 'End'].includes(event.key)) return; event.preventDefault(); preference[mode] = event.key === 'Home' ? 22 : event.key === 'End' ? 55 : clamp(preference[mode] + delta); persist(); syncControls(); schedule(); });
    new MutationObserver(schedule).observe(screen, {attributes: true, attributeFilter: ['class']}); const typing = document.getElementById('typePanel'); if (typing) new MutationObserver(schedule).observe(typing, {attributes: true, attributeFilter: ['class']});
    window.addEventListener('resize', schedule); window.visualViewport?.addEventListener('resize', schedule); window.addEventListener('pcr:auth', schedule); document.addEventListener('visibilitychange', () => { if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; watchingResize(false); dragging = null; separator.classList.remove('resizing'); } else schedule(); });
    window.PCRWorkspaceSplit = {get: () => ({...preference}), set: value => {if(value?.version!==1)return;preference={version:1,portrait:Number.isFinite(value.portrait)?clamp(value.portrait):fallback.portrait,landscape:Number.isFinite(value.landscape)?clamp(value.landscape):fallback.landscape};persist();syncControls();schedule();}, reset: () => { preference = {...fallback}; persist(); syncControls(); schedule(); }}; syncControls(); schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true}); else mount();
})();
