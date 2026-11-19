const path = '/Users/haseebqureshi/Code/emoryvalley/api/lib/incidents-xlsx.js';
const mod = require(path);
console.log('exports:', Object.keys(mod));
console.log('lines:', require('fs').readFileSync(path, 'utf8').split('\n').length);
