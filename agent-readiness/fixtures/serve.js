// Two local shops used to test the scanner end to end:
//   :4901 an agent-ready storefront, :4902 a client-side-rendered one.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

function serve(root, port, { slow = 0 } = {}) {
  http
    .createServer((req, res) => {
      const clean = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(dir, root, clean);
      if (clean === '/' || clean.startsWith('/p/') || clean.startsWith('/c/')) file = path.join(dir, root, 'index.html');
      const send = () => {
        fs.readFile(file, (err, data) => {
          if (err) return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
          const ext = path.extname(file);
          const type = ext === '.xml' ? 'application/xml' : ext === '.json' || file.endsWith('agentic-commerce') ? 'application/json' : ext === '.txt' ? 'text/plain' : 'text/html; charset=utf-8';
          res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=120', etag: '"fixture"' });
          res.end(data);
        });
      };
      slow ? setTimeout(send, slow) : send();
    })
    .listen(port, () => console.log(`fixture ${root} on http://localhost:${port}`));
}

serve('ready', 4901);
serve('poor', 4902);
