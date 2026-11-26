'use strict';
const canvas=document.getElementById('map');let ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id);
const copy=o=>JSON.parse(JSON.stringify(o));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={name:'空白工厂',machines:[],routes:[]},selection=null,tool='select',stampType=null,stampFace='E',stampMode='',stampItem='钛合金锭',stampPanel=0,stampInletItem='',stampSplitterFilters=['','',''],stampPrefs={},draft=null,hoverCell=null,hoverPort=null,drag=null,spaceDown=false;
let multiSelection=null,marquee=null,groupTransform=null,groupClipboard=null,beltTrim=null;
let camera={x:45,y:38,z:12},pix={w:100,h:100,dpr:1},idSeed=900,undoStack=[],redoStack=[],running=false,simTime=0,ware={},simLog=[],toastTimer=null,animationLast=0,simPaintTimer=0;
