'use strict';
(() => {
 function mount(){
  const page=document.getElementById('workspaceSettings');if(!page||page.dataset.settingsTabs==='true')return false;
  const nav=page.querySelector('.settingsSectionNav'),groups=[...page.querySelectorAll('[data-settings-section]')];if(page.dataset.organized!=='true'||!nav||groups.length!==4)return false;
  page.dataset.settingsTabs='true';page.classList.add('settingsRedesigned');
  const intro=page.querySelector('.workspaceSettingsIntro'),banner=document.createElement('section');banner.className='suiteSettingsBanner';banner.innerHTML='<div><strong>Preferences &amp; Settings</strong><p>Connection, controls, visual effects and account privacy.</p><span>Device preferences</span></div><label>Search settings<input type="search" placeholder="Find a setting…" aria-label="Search settings"></label>';intro.after(banner);intro.hidden=true;
  const layout=document.createElement('div');layout.className='suiteSettingsLayout';const content=document.createElement('div');content.className='suiteSettingsContent';layout.append(nav,content);for(const group of groups)content.append(group);banner.after(layout);
  const definitions={connection:['Devices & connection','IP host, clipboard and network','◉'],controls:['Input & controls','Trackpad, pointer and shortcuts','⌘'],appearance:['Appearance & effects','Visual modes, touch trails and tiles','✦'],privacy:['Privacy & security','Account workspace and signed-in devices','◇']};
  let selected='connection';const search=banner.querySelector('input');
  function show(section){selected=section;const query=search.value.trim().toLocaleLowerCase();let count=0;
   for(const group of groups){let matches=0;for(const card of group.querySelector('.settingsGroupContent').children){const text=(card.textContent+' '+[...card.querySelectorAll('input,select,button')].map(node=>node.getAttribute('aria-label')||node.getAttribute('placeholder')||'').join(' ')).toLocaleLowerCase();const hit=!query||text.includes(query);card.classList.toggle('settingsFiltered',!hit);if(hit)matches++;}group.hidden=query?!matches:group.dataset.settingsSection!==section;if(!group.hidden)count+=matches;}
   for(const button of nav.querySelectorAll('button')){if(button.dataset.section===selected)button.setAttribute('aria-current','location');else button.removeAttribute('aria-current');}
   empty.hidden=!query||count>0;if(!query&&page.open)window.dispatchEvent(new CustomEvent('pcr:settings-category',{detail:{section}}));
  }
  const empty=document.createElement('p');empty.className='suiteSettingsEmpty';empty.hidden=true;empty.textContent='No matching settings. Try connection, pointer, keyboard or updates.';content.append(empty);
  for(const button of nav.querySelectorAll('button')){const section=button.dataset.section,[label,detail,glyph]=definitions[section];button.innerHTML='<span class="suiteSettingsGlyph" aria-hidden="true">'+glyph+'</span><span><strong>'+label+'</strong><small>'+detail+'</small></span><b aria-hidden="true">›</b>';button.setAttribute('aria-label',label);button.onclick=()=>{search.value='';show(section);page.scrollTop=0;};}
  let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;const current=nav.querySelector('[aria-current="location"]')?.dataset.section;if(current&&current!==selected){search.value='';show(current);}});}).observe(nav,{attributes:true,subtree:true,attributeFilter:['aria-current']});
  search.oninput=()=>show(selected);search.onkeydown=event=>{if(event.key==='Escape'){search.value='';show(selected);}};page.addEventListener('close',()=>{search.value='';show(selected);});show(selected);return true;
 }
 function start(){if(mount())return;const page=document.getElementById('workspaceSettings');if(!page)return;const observer=new MutationObserver(()=>{if(mount())observer.disconnect();});observer.observe(page,{childList:true,subtree:true,attributes:true,attributeFilter:['data-organized']});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
