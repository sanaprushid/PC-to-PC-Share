const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3210;

const app = express();
app.use(express.json({ limit: '2mb' }));

// Ensure uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.static(path.join(__dirname, 'public')));

// Store uploaded items in-memory for quick polling.
// For persistence across restarts, you can enhance later.
let items = [];

function getLocalIPv4() {
  const nets = os.networkInterfaces();
  const res = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        res.push(net.address);
      }
    }
  }
  // De-duplicate
  return Array.from(new Set(res));
}

app.get('/api/info', (req, res) => {
  res.json({
    name: 'webshare-offline-lan',
    port: PORT,
    ips: getLocalIPv4(),
    createdAt: Date.now()
  });
});

// Receiver: fetch newest items
app.get('/api/items', (req, res) => {
  // simple pagination support
  const since = Number(req.query.since || 0);
  const filtered = items.filter(it => it.ts > since).sort((a, b) => b.ts - a.ts);
  res.json({ items: filtered });
});

// Cleanup (optional). Currently no automatic cleanup.
app.post('/api/clear', (req, res) => {
  items = [];
  res.json({ ok: true });
});

// Text sharing endpoint
app.post('/api/share-text', (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const id = crypto.randomBytes(12).toString('hex');
  const now = Date.now();

  const item = {
    id,
    type: 'text',
    text,
    filename: null,
    size: Buffer.byteLength(text, 'utf8'),
    ts: now
  };
  items.unshift(item);

  // Broadcast-like response
  res.json({ ok: true, item });
});

// File upload (single request, not chunked, but suitable for most LAN use).
// For very large files, chunked uploads can be added later.
app.post('/api/share-file', (req, res) => {
  // We accept multipart via multer dynamically to avoid extra setup.
  // But since we want minimal deps, we’ll implement a simple streaming parser.
  // To keep this robust, we’ll use multer.
  res.status(501).json({ error: 'Not implemented. Please use multipart endpoint with multer (next iteration).' });
});

// Use multer for file uploads
const multer = require('multer');
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const id = crypto.randomBytes(12).toString('hex');
      const ext = path.extname(file.originalname || '') || '';
      cb(null, `${id}${ext}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024 // 10GB
  }
});

app.post('/api/share-file-multipart', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  const id = crypto.randomBytes(12).toString('hex');
  const now = Date.now();

  const savedName = req.file.filename; // e.g. <id><ext>
  const savedPath = path.join(uploadsDir, savedName);

  const item = {
    id,
    type: 'file',
    filename: req.file.originalname,
    savedName,
    size: req.file.size,
    ts: now
  };
  items.unshift(item);

  res.json({ ok: true, item });
});

app.get('/uploads/:savedName', (req, res) => {
  const savedName = req.params.savedName;
  const filePath = path.join(uploadsDir, savedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Not found');
  }
  // Find original filename for Content-Disposition
  const item = items.find(i => i.savedName === savedName);
  if (item?.filename) {
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(item.filename)}`);
  }
  res.sendFile(filePath);
});

app.listen(PORT, () => {
  const ips = getLocalIPv4();
  console.log(`webshare-offline-lan running on http://localhost:${PORT}`);
  if (ips.length) {
    console.log(`LAN IP(s): ${ips.map(ip => `http://${ip}:${PORT}`).join(', ')}`);
  }
});

