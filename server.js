const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const PORT = 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.map':  'application/json',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/game/index.html';

  const fp = path.join(ROOT, url);
  // Safety: never escape root
  if (fp.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }

  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + url);
      return;
    }
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('Copilot dev server running at http://localhost:' + PORT + '/game/');
});
