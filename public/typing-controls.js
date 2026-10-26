'use strict';
(() => {
  function mount() {
    const screen = document.getElementById('rs'), view = document.getElementById('rsv'), panel = document.getElementById('typePanel'), input = document.getElementById('typeText');
    if (!screen || !view || !panel || !input || window.PCRTypingControls) return;
    const toolbar = document.createElement('div'); toolbar.className = 'remoteTypingToolbar';
    toolbar.innerHTML = '<button type="button" id="choosePCField" aria-pressed="false">Choose PC field</button><button type="button" id="typingTextOptions" aria-expanded="false">Text options</button><button type="button" id="typingDone">Done</button>';
    const resume = document.createElement('button'); resume.type = 'button'; resume.id = 'typingResumeDraft'; resume.textContent = 'Send saved draft here'; resume.hidden = true;
    panel.prepend(toolbar); panel.append(resume); input.setAttribute('aria-label', 'Type to the selected PC field');
    const hint = document.createElement('div'); hint.id = 'typingFieldHint'; hint.className = 'typingFieldHint'; hint.hidden = true; hint.setAttribute('role', 'status'); hint.textContent = 'Tap the text box you want to type into'; view.prepend(hint);
    const choose = toolbar.querySelector('#choosePCField'), options = toolbar.querySelector('#typingTextOptions');
    let selection = null, pointer = null, epoch = 0, confirmedDraft = false;
    const feedback=document.createElement('div');feedback.id='remoteTypingFeedback';feedback.className='remoteTypingFeedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.innerHTML='<span class="typingStateDot" aria-hidden="true"></span><strong></strong><span data-typing-destination></span>';panel.prepend(feedback);
    const badge=document.createElement('span');badge.id='remoteTypingState';badge.className='remoteTypingState';document.querySelector('.screenConnectionGroup')?.append(badge);
    const permitted = () => (!window.PCRCanAccess || window.PCRCanAccess('control')) && (!window.PCRHoldControl || window.PCRHoldControl.can('pc'));
    const connected = () => rs.on && !!rs.m && !screen.classList.contains('hide');
    const open = () => !panel.classList.contains('hide') && !input.readOnly;
    function updateState(){
      let state='paused',title='Paused',detail='Open Keyboard to type into the current PC field.';
      if(selection){state='waiting';title='Waiting for PC field';detail=selection.pending?'Selecting the field on your PC…':'Tap the text box in the PC picture. Your draft stays here.';}
      else if(open()&&!connected()){state='waiting';title='Waiting for PC connection';detail='Your draft stays on this device until the screen reconnects.';}
      else if(open()&&!permitted()){title='Paused';detail='Control access is required. Your draft stays here.';}
      else if(open()&&live.paused){title='Paused';detail=confirmedDraft?'Field chosen. Send your saved draft when you are ready.':'Tap a PC text field to continue. Your draft stays here.';}
      else if(open()&&!liveTyping){title='Paused · compose mode';detail='Text stays here until you tap Paste into PC.';}
      else if(open()){state='active';title='Active · current PC field';detail='Text goes to the PC cursor. Tap another field to switch.';}
      feedback.dataset.state=state;feedback.querySelector('strong').textContent=title;feedback.querySelector('[data-typing-destination]').textContent=detail;badge.dataset.state=state;badge.textContent=state==='active'?'Typing active':state==='waiting'?'Typing waiting':'Typing paused';badge.title=title+'. '+detail;
    }
    function focusKeyboard() { updateState();if (!open()) return; input.focus({preventScroll: true}); window.PCRDeviceInput?.focusKeyboard?.(input); }
    async function tap(point){
      if(!permitted()||!connected())return false;const position=coordinates(point);if(!position)return false;
      if(typeBusy||qb||qq.length||composing||rsTypingDirty()){window.msg?.('Wait for the current input to finish, then tap again.');return false;}
      const metadata=rs.m,wasPaused=live.paused,draft=live.paused||!liveTyping?input.value:'';
      window.PCRPointerSafety?.release?.();window.PCRDeviceInput?.haptic?.();
      const result=await submitTyping(['abs '+position.x+' '+position.y,'click l','focus '+position.x+' '+position.y],true);
      if(!result||!connected()||rs.m!==metadata||!permitted())return false;
      if(!draft)rsResetTypingContext(false);
      if(result.editable===true){
        if(draft){input.value=draft;rsPauseLive('Your saved draft is kept. Send it into this field when ready.');confirmedDraft=true;resume.hidden=false;}
        window.rsKb();updateState();return true;
      }
      if(wasPaused)live.paused=true;
      rsTypeStatus(result.editable===null?'Tap sent. If this is a text field, use Keyboard.':'Tap sent to your PC.');updateState();return true;
    }
    function updateSelection() {
      const active = !!selection; screen.classList.toggle('choosingTypingField', active); hint.hidden = !active;
      choose.setAttribute('aria-pressed', String(active)); choose.textContent = selection?.pending ? 'Selecting field…' : active ? 'Cancel selection' : 'Choose PC field'; choose.disabled = !!selection?.pending;
      if (selection?.pending) hint.textContent = 'Selecting the PC field…'; else hint.textContent = 'Tap the text box you want to type into';
      updateState();
    }
    function cancel(reason) {
      if (!selection) return; const previous = selection; selection = null; pointer = null; epoch++; confirmedDraft = false; resume.hidden = true; updateSelection();
      if (!previous.pending && live.generation === previous.generation && input.value === '') { input.value = previous.value; live.paused = previous.paused; rsScheduleLive(); }
      else if (reason) rsTypeStatus(reason, 'pending');
    }
    function beginChoose() {
      if (selection) { cancel('Field selection cancelled. Your draft is kept.'); focusKeyboard(); return false; }
      if (!permitted() || !connected()) { rsTypeStatus('Connect to your PC with control access before choosing a field.', 'error'); return false; }
      if (typeBusy || qb || qq.length || live.keys.length || composing) { rsTypeStatus('Wait for the current text to finish, then choose another field.', 'pending'); return false; }
      const paused = live.paused, value = input.value, carry = !liveTyping || paused || value !== live.sent;
      rsPauseLive('Tap a text box on the PC picture. Typing waits until it is selected.');
      selection = {id: ++epoch, generation: live.generation, metadata: rs.m, value, paused, carry, pending: false};
      if (!carry) input.value = ''; confirmedDraft = false; resume.hidden = true; updateSelection(); focusKeyboard(); return true;
    }
    function coordinates(point) {
      const box = window.PCRScreenTools?.imageBox?.() || window.box?.();
      if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0 || point.x < box.x || point.x > box.x + box.w || point.y < box.y || point.y > box.y + box.h) return null;
      return {x: Math.round(Math.max(0, Math.min(1, (point.x - box.x) / box.w)) * (rs.m.w - 1)), y: Math.round(Math.max(0, Math.min(1, (point.y - box.y) / box.h)) * (rs.m.h - 1))};
    }
    async function selectAt(point) {
      if (!selection || selection.pending || !permitted() || !connected()) return false;
      const position = coordinates(point); if (!position) { rsTypeStatus('Tap inside the PC picture to choose its text box.', 'pending'); return false; }
      const current = selection; current.pending = true; updateSelection(); focusKeyboard();
      const delivered = await submitTyping(['abs ' + position.x + ' ' + position.y, 'click l']);
      if (selection !== current || epoch !== current.id || live.generation !== current.generation || rs.m !== current.metadata || !connected() || !permitted()) { if (selection === current) cancel('The connection changed. Choose the PC field again.'); return false; }
      selection = null; pointer = null; updateSelection();
      if (!delivered) { rsTypeStatus('The PC did not confirm the field. Your draft is kept; check the screen before choosing again.', 'error'); return false; }
      const draft = input.value; rsResetTypingContext(false); input.value = draft;
      if (current.paused && draft) { rsPauseLive('Field selected. Your saved draft is kept. Send it here when you are ready.'); confirmedDraft = true; resume.hidden = false; }
      else { confirmedDraft = false; resume.hidden = true; rsTypeStatus('Field selected. Type on your phone to write on the PC.'); rsScheduleLive(); }
      focusKeyboard(); return true;
    }
    for (const button of [choose, options, resume]) button.addEventListener('pointerdown', event => event.preventDefault());
    choose.addEventListener('click', beginChoose);
    options.addEventListener('click', () => { const expanded = screen.classList.contains('compactTyping'); screen.classList.toggle('compactTyping', !expanded); options.setAttribute('aria-expanded', String(expanded)); options.textContent = expanded ? 'Less' : 'Text options'; focusKeyboard(); });
    toolbar.querySelector('#typingDone').addEventListener('click', () => window.rsTypeClose?.());
    resume.addEventListener('click', () => { if (!confirmedDraft || !permitted() || !connected() || typeBusy) return; const draft = input.value; rsResetTypingContext(false); input.value = draft; confirmedDraft = false; resume.hidden = true; rsScheduleLive(); focusKeyboard(); });
    const nativeKb = window.rsKb;
    if (typeof nativeKb === 'function') window.rsKb = function(...args) { if (!permitted()) { window.msg?.('Control access is required to type on this PC.'); return; } const result = nativeKb.apply(this, args); screen.classList.add('compactTyping'); options.setAttribute('aria-expanded', 'false'); options.textContent = 'Text options'; focusKeyboard(); return result; };
    function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    // Window capture runs before the existing document keyboard-dismiss handler.
    function capturePointer(event) {
      if (!selection || !view.contains(event.target)) return; consume(event);
      if (selection.pending) return;
      if (event.type === 'pointerdown') { if (event.button !== 0 || event.isPrimary === false || pointer) { if (pointer) pointer.moved = true; return; } pointer = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false}; focusKeyboard(); }
      else if (event.type === 'pointermove' && pointer?.id === event.pointerId) { if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) pointer.moved = true; }
      else if (event.type === 'pointerup' && pointer?.id === event.pointerId) { const ended = pointer; pointer = null; if (!ended.moved) void selectAt({x: event.clientX, y: event.clientY}); }
      else if (event.type === 'pointercancel') pointer = null;
    }
    for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(name, capturePointer, {capture: true, passive: false});
    for (const name of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) window.addEventListener(name, event => {
      if (!selection || !view.contains(event.target)) return; consume(event); if ('PointerEvent' in window || selection.pending) return;
      const point = event.changedTouches?.[0]; if (!point) return;
      if (name === 'touchstart') { if (event.touches.length !== 1) { pointer = null; return; } pointer = {id: point.identifier, x: point.clientX, y: point.clientY, moved: false}; focusKeyboard(); }
      else if (name === 'touchmove' && pointer?.id === point.identifier && Math.hypot(point.clientX - pointer.x, point.clientY - pointer.y) > 10) pointer.moved = true;
      else if (name === 'touchend' && pointer?.id === point.identifier) { const ended = pointer; pointer = null; if (!ended.moved) void selectAt({x: point.clientX, y: point.clientY}); }
      else if (name === 'touchcancel') pointer = null;
    }, {capture: true, passive: false});
    window.addEventListener('wheel', event => { if (selection && view.contains(event.target)) consume(event); }, {capture: true, passive: false});
    new MutationObserver(() => { if (!open()) { cancel(); screen.classList.remove('compactTyping'); confirmedDraft = false; resume.hidden = true; }updateState(); }).observe(panel, {attributes: true, attributeFilter: ['class']});
    const connection=document.getElementById('screenConnection');if(connection)new MutationObserver(updateState).observe(connection,{childList:true,attributes:true,attributeFilter:['data-state']});
    window.addEventListener('pcr:auth', () => { if (!permitted()) cancel('Control access changed. Your draft is kept.');updateState(); });window.addEventListener('pcr:hold-release',updateState);
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
    window.PCRTypingControls = {tap,choose: beginChoose, cancel: () => cancel('Field selection cancelled. Your draft is kept.'),updateState, get choosing() { return !!selection; }};updateState();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true}); else mount();
})();
