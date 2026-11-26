'use strict';
// Compatibility URL only: delegate to the one strict proof worker.
importScripts('steady-certified-worker.js?v=20261126-current-pressure-33');
const strictHandler=self.onmessage;
self.onmessage=e=>strictHandler({data:{...e.data,uiBudget:true}});
