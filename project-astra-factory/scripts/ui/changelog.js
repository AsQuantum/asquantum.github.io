'use strict';
(function initChangelog(){
 const opener=document.getElementById('changelogOpen');
 const backdrop=document.getElementById('changelogOverlay');
 const dialog=document.getElementById('changelogPanel');
 const entries=document.getElementById('changelogEntries');
 const closeButton=document.getElementById('changelogClose');
 if(!opener||!backdrop||!dialog||!entries||!closeButton)return;
 for(const release of FACTORY_LAB_RELEASES){
  const section=document.createElement('section');section.className='changelog-release';
  const heading=document.createElement('div');heading.className='changelog-release-top';
  const version=document.createElement('strong');version.textContent='v'+release.version;
  const date=document.createElement('time');date.dateTime=release.date;date.textContent=release.date;
  heading.append(version,date);
  const title=document.createElement('h3');title.textContent=release.title;
  const list=document.createElement('ul');
  for(const item of release.items){
   const li=document.createElement('li');li.textContent=item;list.appendChild(li);
  }
  section.append(heading,title,list);entries.appendChild(section);
 }
 let previousFocus=null;
 function open(){
  if(!backdrop.hidden)return;
  previousFocus=document.activeElement;
  backdrop.hidden=false;
  opener.setAttribute('aria-expanded','true');
  closeButton.focus();
 }
 function close(){
  if(backdrop.hidden)return;
  backdrop.hidden=true;
  opener.setAttribute('aria-expanded','false');
  if(previousFocus?.isConnected)previousFocus.focus();
  else opener.focus();
  previousFocus=null;
 }
 opener.setAttribute('aria-expanded','false');
 opener.addEventListener('click',open);
 closeButton.addEventListener('click',close);
 backdrop.addEventListener('pointerdown',e=>{if(e.target===backdrop)close();});
 // Capture so editor Escape never cancels a route behind this modal.
 document.addEventListener('keydown',e=>{
  if(backdrop.hidden)return;
  if(e.key==='Escape'){
   e.preventDefault();e.stopImmediatePropagation();close();return;
  }
  if(e.key!=='Tab')return;
  const focusable=[...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')];
  if(!focusable.length){e.preventDefault();dialog.focus();return;}
  const first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 },true);
})();
