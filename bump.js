var fs = require('fs');

// index.html
var c = fs.readFileSync('index.html', 'utf8');
c = c.replace(/CACHE='alfa-v\d+'/, "CACHE='alfa-v30'");
c = c.replace(/BUILD_ID='b\d+'/, "BUILD_ID='b76'");
fs.writeFileSync('index.html', c);
console.log('index.html bumped to b76');

// sw.js
var s = fs.readFileSync('sw.js', 'utf8');
s = s.replace(/CACHE='alfa-v\d+'/, "CACHE='alfa-v30'");
fs.writeFileSync('sw.js', s);
console.log('sw.js cache bumped to v30');

// ds-verify.js
var d = fs.readFileSync('ds-verify.js', 'utf8');
d = d.replace(/APP_BUILD_b\d+/, 'APP_BUILD_b76');
d = d.replace(/sw_b\d+/, 'sw_b76');
fs.writeFileSync('ds-verify.js', d);
console.log('ds-verify.js bumped to b76');
