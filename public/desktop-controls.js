'use strict';
(() => {
  const canvas=document.getElementById('rsc');
  const screen=document.getElementById('rs');
  const view=document.getElementById('rsv');
  const input=document.getElementById('typeText');
  if(!canvas||!screen||!view||!input)return;
  const hint=document.createElement('div');
  hint.id='desktopKeyboardHint';
  hint.className='desktopKeyboardHint';
  hint.innerHTML='<span>Click the picture, then type. Ctrl+V pastes the PC clipboard.</span><button type="button">Keyboard / clipboard</button>';
  view.before(hint);
  hint.querySelector('button').addEventListener('click',()=>rsKb());
  canvas.addEventListener('focus',()=>{hint.dataset.active='true';});
  canvas.addEventListener('blur',()=>{hint.dataset.active='false';});
  const special={Backspace:8,Tab:9,Enter:13,Escape:27,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Delete:46,Home:36,End:35,PageUp:33,PageDown:34,Insert:45,Pause:19,PrintScreen:44,ScrollLock:145};
  const punctuation={Semicolon:186,Equal:187,Comma:188,Minus:189,Period:190,Slash:191,Backquote:192,BracketLeft:219,Backslash:220,BracketRight:221,Quote:222};
  function virtualKey(event){
    if(special[event.key])return special[event.key];
    if(/^F([1-9]|1\d|2[0-4])$/.test(event.key))return 111+Number(event.key.slice(1));
    if(/^Key[A-Z]$/.test(event.code))return event.code.charCodeAt(3);
    if(/^Digit[0-9]$/.test(event.code))return event.code.charCodeAt(5);
    if(punctuation[event.code])return punctuation[event.code];
    if(event.key===' ')return 32;
    if(/^[a-z0-9]$/i.test(event.key))return event.key.toUpperCase().charCodeAt(0);
    return null;
  }
  function mayControl(){
    if(window.PCRCanAccess&&!window.PCRCanAccess('control'))return false;
    return document.activeElement===canvas&&rs.on&&!screen.classList.contains('hide')&&
      document.getElementById('rsSettings').classList.contains('hide')&&
      !document.getElementById('modal').classList.contains('on')&&
      !document.querySelector('dialog[open]');
  }
  function typeCharacter(character){
    if(!liveTyping||live.paused||!rs.m){
      msg('Open Keyboard, turn on live typing and select New field to continue.');return;
    }
    if(input.value.length+character.length>16000){
      msg('Start a new field or use compose mode for a longer message.');return;
    }
    input.value+=character;
    input.setSelectionRange(input.value.length,input.value.length);
    rsScheduleLive();
  }
  canvas.addEventListener('keydown',event=>{
    if(!mayControl())return;
    if(['Control','Alt','Meta','Shift','CapsLock','NumLock'].includes(event.key))return;
    if(event.isComposing||event.key==='Process'||event.key==='Dead'){
      event.preventDefault();rsKb();
      rsTypeStatus('Use this typing field for language input and composition.');return;
    }
    const altGraph=event.getModifierState?.('AltGraph');
    const chord=(event.ctrlKey||event.altKey||event.metaKey)&&!altGraph;
    const vk=virtualKey(event);
    if(chord){
      if(vk===null)return;
      event.preventDefault();
      const keys=[];
      if(event.ctrlKey)keys.push(17);
      if(event.altKey)keys.push(18);
      if(event.metaKey)keys.push(91);
      if(event.shiftKey)keys.push(16);
      keys.push(vk);
      if(keys.length>4){msg('This shortcut has too many modifiers.');return;}
      void rsQueueRemoteCommand('combo '+keys.join(','));return;
    }
    if(event.key==='Enter'&&event.shiftKey){event.preventDefault();void rsQueueRemoteCommand('combo 16,13');return;}
    if(event.key==='Backspace'||event.key==='Enter'){
      event.preventDefault();void rsTypeKey(special[event.key]);
      // Keep hardware keys on the canvas without touching the phone editor.
      return;
    }
    if((vk!==null&&special[event.key])||/^F([1-9]|1\d|2[0-4])$/.test(event.key)){
      event.preventDefault();
      const command=event.shiftKey?'combo 16,'+vk:'key '+vk;
      void rsQueueRemoteCommand(command);return;
    }
    if(Array.from(event.key).length===1){event.preventDefault();typeCharacter(event.key);}
  });
  window.PCRDesktopControls={virtualKey};
})();
