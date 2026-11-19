#!/bin/bash
cd /Users/haseebqureshi/Code/emoryvalley
node -e "
const { FIELDS, REQUIRED } = require('./api/lib/incidents-xlsx.js');
console.log('FIELDS:', JSON.stringify(FIELDS));
console.log('REQUIRED:', JSON.stringify(REQUIRED));
" 2>&1 | head -20
