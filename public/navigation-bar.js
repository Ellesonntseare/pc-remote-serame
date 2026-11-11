'use strict';

(() => {
  const storageKey = 'elleson_navigation_bar_v1';
  const idleDelay = 3000;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

  function readPreference() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      const layout = value => value && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key])) ? value : null;
      return {hidden: stored?.hidden === true, bottom: layout(stored?.bottom), rail: layout(stored?.rail)};
    } catch {
      return {hidden: false, bottom: null, rail: null};
    }
  }

  function mount() {
    const bar = document.querySelector('.ecNavigation');
    if (!bar || bar.classList.contains('ecNavAdjustable')) return;
    const preference = readPreference();
    const viewport = window.visualViewport;
    let drag = null, idleTimer, keyboardFocus = false;

    function control(name, label, icon, text = '') {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ecNavAdjust ecNav${name}`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="${icon}"/></svg>${text}`;
      bar.append(button);
      return button;
    }
    const move = control('Move', 'Move navigation bar. Arrow keys move it. Enter restores the default layout.', 'M5 9h14M5 15h14');
    const resize = control('Resize', 'Resize navigation bar. Arrow keys resize it. Enter restores the default layout.', 'M19 7v12H7m4-4h4v-4');
    const hide = control('Hide', 'Hide navigation bar', 'm6 9 6 6 6-6');
    const show = control('Show', 'Show navigation tabs', 'm6 15 6-6 6 6', '<span>Show tabs</span>');
    bar.classList.add('ecNavAdjustable');

    function mode() {
      return innerWidth >= 1000 || (bar.dataset.environment === 'remote' && innerWidth > innerHeight && innerHeight <= 520) ? 'rail' : 'bottom';
    }

    function area() {
      const gap = 7;
      return {
        left: (viewport?.offsetLeft || 0) + gap,
        top: (viewport?.offsetTop || 0) + gap,
        width: Math.max(1, (viewport?.width || innerWidth) - 2 * gap),
        height: Math.max(1, (viewport?.height || innerHeight) - 2 * gap),
      };
    }

    function constrain(box, kind) {
      const limits = area();
      const minWidth = kind === 'rail' ? 64 : 250;
      const minHeight = kind === 'rail' ? 275 : 65;
      const width = clamp(box.width, Math.min(minWidth, limits.width), Math.min(kind === 'rail' ? 112 : 700, limits.width));
      const height = clamp(box.height, Math.min(minHeight, limits.height), Math.min(kind === 'rail' ? 540 : 125, limits.height));
      return {
        left: clamp(box.left, limits.left, limits.left + limits.width - width),
        top: clamp(box.top, limits.top, limits.top + limits.height - height),
        width,
        height,
      };
    }

    function paint(box) {
      bar.dataset.navCustom = 'true';
      for (const [name, value] of Object.entries(box)) bar.style.setProperty(`--ec-nav-${name}`, `${value}px`);
    }

    function save() {
      try { localStorage.setItem(storageKey, JSON.stringify(preference)); } catch {}
    }

    function remember(box, kind) {
      const limits = area();
      preference[kind] = {
        x: (box.left - limits.left) / Math.max(1, limits.width - box.width),
        y: (box.top - limits.top) / Math.max(1, limits.height - box.height),
        width: box.width,
        height: box.height,
      };
      save();
      window.dispatchEvent(new Event('pcr:navigation-layout'));
    }

    function layout() {
      if (drag || Math.abs((viewport?.scale || 1) - 1) > .05) return;
      const kind = mode(), stored = preference[kind];
      bar.dataset.navShape = kind;
      bar.dataset.navCollapsed = String(preference.hidden);
      if (preference.hidden || !stored) delete bar.dataset.navCustom;
      else {
        const limits = area();
        const size = constrain({left: limits.left, top: limits.top, width: stored.width, height: stored.height}, kind);
        paint(constrain({...size,
          left: limits.left + clamp(stored.x, 0, 1) * (limits.width - size.width),
          top: limits.top + clamp(stored.y, 0, 1) * (limits.height - size.height),
        }, kind));
      }
      window.dispatchEvent(new Event('pcr:navigation-layout'));
    }

    function wake() {
      clearTimeout(idleTimer);
      bar.classList.remove('ecNavIdle');
      if (drag || keyboardFocus || bar.hidden || preference.hidden || document.hidden) return;
      idleTimer = setTimeout(() => bar.classList.add('ecNavIdle'), idleDelay);
    }

    function dragControl(button, sizing) {
      button.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag) return;
        event.preventDefault();
        drag = {id: event.pointerId, kind: mode(), box: bar.getBoundingClientRect(), x: event.clientX, y: event.clientY, next: null};
        button.setPointerCapture?.(event.pointerId);
        bar.classList.add('ecNavDragging');
        wake();
      });
      button.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (!drag.next && Math.hypot(dx, dy) < 4) return;
        const {left, top, width, height} = drag.box;
        drag.next = constrain(sizing ? {left, top, width: width + dx, height: height + dy} : {left: left + dx, top: top + dy, width, height}, drag.kind);
        paint(drag.next);
      });
      function finish(event) {
        if (!drag || (event && drag.id !== event.pointerId)) return;
        if (event?.type === 'pointerup' && drag.next) remember(drag.next, drag.kind);
        drag = null;
        bar.classList.remove('ecNavDragging');
        layout();
        wake();
      }
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, finish);
      window.addEventListener('pcr:page', () => finish());
      button.addEventListener('keydown', event => {
        const kind = mode();
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          preference[kind] = null;
          save();layout();wake();
          return;
        }
        const offset = {ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10]}[event.key];
        if (!offset) return;
        event.preventDefault();
        const [dx, dy] = offset, {left, top, width, height} = bar.getBoundingClientRect();
        const next = constrain(sizing ? {left, top, width: width + dx, height: height + dy} : {left: left + dx, top: top + dy, width, height}, kind);
        paint(next);remember(next, kind);wake();
      });
      button.addEventListener('dblclick', () => {preference[mode()] = null;save();layout();wake();});
    }
    dragControl(move, false);
    dragControl(resize, true);

    function setHidden(value) {
      preference.hidden = value;
      save();layout();wake();
      (value ? show : hide).focus({preventScroll: true});
    }
    hide.onclick = () => setHidden(true);
    show.onclick = () => setHidden(false);
    bar.addEventListener('pointerdown', () => {keyboardFocus = false;wake();});
    bar.addEventListener('pointermove', wake);
    bar.addEventListener('focusin', event => {keyboardFocus = event.target.matches(':focus-visible');wake();});
    bar.addEventListener('focusout', () => {keyboardFocus = false;wake();});
    bar.addEventListener('keydown', () => {keyboardFocus = true;wake();});
    for (const event of ['pcr:page', 'pcr:auth']) window.addEventListener(event, () => {keyboardFocus = false;layout();wake();});
    window.addEventListener('resize', layout);
    viewport?.addEventListener('resize', layout);
    viewport?.addEventListener('scroll', layout);
    document.addEventListener('visibilitychange', wake);
    layout();wake();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
