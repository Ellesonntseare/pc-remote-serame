'use strict';

(() => {
  const restartStorage = 'elleson_restart_watch_v1';
  const check = async (path, timeout = 4500) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(path, {headers: {'X-PCR': '1'}, signal: controller.signal, cache: 'no-store'});
      if (!response.ok) return {ok: false, status: response.status};
      return await response.json();
    } catch { return {ok: false, status: 0}; }
    finally { clearTimeout(timer); }
  };

  function mount() {
    const settings = document.getElementById('workspaceSettings');
    if (!settings) return;
    const card = document.createElement('section');
    card.className = 'workspaceSettingsCard connectionHealth';
    card.innerHTML = '<h3>Connection health</h3><p role="status" data-check-status></p><dl data-check-results></dl><button type="button" data-check>Run connection checks</button><label data-auto-option hidden><input type="checkbox" data-auto>Switch connections automatically</label>';
    (settings.querySelector('[data-settings-section=connection] .settingsGroupContent') || settings).prepend(card);
    const report = card.querySelector('[data-check-results]');
    const status = card.querySelector('[data-check-status]');
    const auto = card.querySelector('[data-auto]');
    const checkButton = card.querySelector('[data-check]');
    let checks = null, generation = 0, checking = false;
    const native = value => {try {window.PCRAndroid?.postMessage(JSON.stringify(value));} catch {}};
    function paint() {
      const caps = window.PCRNativeCapabilities;
      card.querySelector('[data-auto-option]').hidden = !caps?.routeRecovery || window.PCRAuth?.role !== 'owner';
      auto.checked = checks?.automatic ?? (caps?.automaticRoute === true);
      report.replaceChildren();
      for (const [name, key] of [['Windows host','host'], ['Local Wi-Fi','local'], ['Website route','website']]) {
        const title = document.createElement('dt'), message = document.createElement('dd');
        title.textContent = name;
        const otherRoute = key === 'local' ? location.protocol === 'https:' : location.protocol !== 'https:';
        message.textContent = checks?.[key] || (key === 'host' ? 'Run checks to test your PC.' : otherRoute ? 'Check from the Android app.' : 'Current connection');
        report.append(title, message);
      }
    }
    async function run() {
      if (checking) return;
      checking = true;checkButton.disabled = true;
      const version = ++generation;
      status.textContent = 'Checking the PC and connection routes…';
      const started = Date.now();
      const ping = await check('/api/ping');
      if (version !== generation) return;
      const reachable = ping.ok === true && typeof ping.requirePassword === 'boolean';
      const key = location.protocol === 'https:' ? 'website' : 'local';
      checks = {host: reachable ? `Reachable · ${Date.now()-started} ms` : 'Unreachable. Make sure the PC is awake and Elleson Connect Host is running.', [key]:reachable ? 'Reachable on this connection.' : key==='website'?'Check that the tunnel is connected on the PC.':'Connect to the same network and check Windows Firewall.'};
      paint();
      if (window.PCRNativeCapabilities?.routeRecovery) native({type:'connection-health'});
      else status.textContent = reachable ? 'PC responded.' : 'PC did not respond.';
      checkButton.disabled = false;checking = false;
    }
    function open() {
      window.PCRWorkspaceSettings?.open('connection');
      setTimeout(() => {
        const accordion = card.querySelector('details');
        if (accordion) accordion.open = true;
        card.scrollIntoView?.({block:'nearest'});
        void run();
      }, 80);
    }
    checkButton.onclick = run;
    auto.onchange = () => native({type:'automatic-route',enabled:auto.checked});
    const home = document.querySelector('[data-ec-connection]');
    if (home) {
      const button = document.createElement('button');button.type = 'button';button.className = 'connectionHealthLink';
      button.textContent = 'Connection health';button.onclick = open;home.after(button);
    }
    window.addEventListener('pcr:connection-health', event => {
      checks = {...checks, ...event.detail};paint();
      status.textContent = event.detail?.message || 'Connection checks complete.';
    });
    window.addEventListener('pcr:native-ready', paint);
    window.addEventListener('pcr:auth', () => {generation++;checking=false;checkButton.disabled=false;checks=null;paint();});
    paint();

    function routeSession() {
      if (!window.PCRNativeCapabilities?.routeRecovery) return;
      const owner = window.PCRAuth?.signedIn===true && window.PCRAuth.role==='owner';
      const view = window.PCRPrivacy?.active?'privacy':window.PCRSecondScreen?.active?'secondScreenPage':window.PCRPages?.current||'home';
      native({type:'route-session',owner,view});
      if (!owner || !/^#route-(home|files|remote|privacy)$/.test(location.hash)) return;
      const destination = location.hash.slice(7);
      history.replaceState(history.state,'',location.pathname+location.search);
      if (destination==='files'||destination==='remote') setTimeout(()=>window.EllesonFlow?.navigate(destination),250);
      if (destination==='privacy') window.PCRPrivacy?.routeInterrupted?.();
      else window.msg?.(`Reconnected via ${location.protocol==='https:'?'the website':'local Wi-Fi'}.`);
    }
    for (const event of ['pcr:auth','pcr:native-ready','pcr:page','pcr:privacy-state','pcr:second-screen-state']) window.addEventListener(event, routeSession);
    routeSession();

    const restart = document.createElement('dialog');
    restart.className = 'nativeDialog';restart.setAttribute('aria-labelledby','restartTitle');
    restart.innerHTML = '<h2 id="restartTitle">Restarting your PC</h2><p role="status" data-restart-status></p><p>Elleson Connect will check for your PC. If Windows asks you to sign in on the PC, do that to start the host.</p><button type="button" data-restart-close>Keep using the app</button>';
    document.body.append(restart);
    const restartStatus = restart.querySelector('[data-restart-status]');
    restart.querySelector('button').onclick = () => restart.close();
    let pending = null, restartTimer = 0;
    try {pending=JSON.parse(sessionStorage.getItem(restartStorage));} catch {}
    function keep(value) {pending=value;try{if(value)sessionStorage.setItem(restartStorage,JSON.stringify(value));else sessionStorage.removeItem(restartStorage);}catch{}}
    function display(message) {restartStatus.textContent=message;if(!restart.open)restart.showModal();}
    async function watch() {
      const current = pending;
      if (!current) return;
      if (Date.now()>=current.until) {keep(null);display('The PC has not come back online yet. Run Connection health to check it.');return;}
      const ping=await check('/api/ping');
      if (current!==pending) return;
      if (ping.ok && ping.hostRunId && ping.hostRunId!==current.hostRunId) {
        keep(null);
        display(ping.paired?'Your PC is back online.':'Your PC is back online. Sign in again to reconnect.');
        window.init?.();
        return;
      }
      restartStatus.textContent=ping.ok?'Waiting for Windows to restart…':'Waiting for your PC to come back online…';
      restartTimer=setTimeout(watch,3500);
    }
    window.addEventListener('pcr:restart-requested', event => {
      if (!/^[a-f0-9]{32}$/.test(event.detail?.hostRunId||'')) return;
      clearTimeout(restartTimer);
      keep({hostRunId:event.detail.hostRunId,until:Date.now()+240000});
      display('Restart requested. Checking for your PC…');
      void watch();
    });
    if (pending && /^[a-f0-9]{32}$/.test(pending.hostRunId||'') && pending.until>Date.now()) {display('Checking for your PC…');void watch();}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
