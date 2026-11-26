import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';

const HOSTS = new Set(['multimedia.nt.qq.com.cn', 'gchat.qpic.cn', 'c2cpicdw.qpic.cn']);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function trustedWorldImage(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !HOSTS.has(url.hostname) || url.username || url.password ||
      (url.port && url.port !== '443') || String(raw).length > 8192) return null;
    return url;
  } catch { return null; }
}

export function publicImageAddress(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && [0, 2].includes(c)) || (b === 88 && c === 99))) ||
    (a === 198 && ([18, 19].includes(b) || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function imageMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function downloadWorldImage(raw, { lookup = dns.lookup, request = https.get } = {}) {
  const url = trustedWorldImage(raw);
  if (!url) throw new Error('unsupported_image_host');
  let dnsTimer;
  let addresses;
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, family: 4 }),
      new Promise((_, reject) => {
        dnsTimer = setTimeout(() => reject(new Error('image_dns_timeout')), 5000);
        dnsTimer.unref?.();
      }),
    ]);
  } finally { clearTimeout(dnsTimer); }
  if (!addresses.length || addresses.some(value => !publicImageAddress(value.address))) {
    throw new Error('invalid_image_address');
  }
  // Pin the validated DNS result to the TLS request; never follow redirects.
  return new Promise((resolve, reject) => {
    const req = request(url, {
      family: 4,
      agent: false,
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp', 'Accept-Encoding': 'identity' },
      lookup(_host, options, callback) {
        if (options?.all) callback(null, [addresses[0]]);
        else callback(null, addresses[0].address, 4);
      },
    }, response => {
      if (response.statusCode !== 200 || Number(response.headers['content-length']) > MAX_IMAGE_BYTES) {
        response.destroy();
        reject(new Error('image_unavailable'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_IMAGE_BYTES) {
          response.destroy(new Error('image_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        const type = imageMime(bytes);
        if (!type) reject(new Error('invalid_image_content'));
        else resolve({ bytes, type });
      });
    });
    req.on('error', reject);
  });
}

export class WorldWebMedia {
  constructor({ directory, download = downloadWorldImage, now = Date.now,
    maxBytes = 128 * 1024 * 1024, retentionMs = 7 * 86400000 } = {}) {
    this.directory = path.resolve(directory);
    this.download = download;
    this.now = now;
    this.maxBytes = maxBytes;
    this.retentionMs = retentionMs;
    this.sources = new Map();
    this.pending = new Map();
    this.failures = new Map();
    this.queue = [];
    this.active = 0;
    this.closed = false;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.prune();
  }

  file(id, extension) { return path.join(this.directory, `${id}.${extension}`); }

  remember(raw) {
    if (!trustedWorldImage(raw)) return null;
    const id = crypto.createHash('sha256').update(raw).digest('hex');
    this.sources.set(id, raw);
    if (this.sources.size > 3000) this.sources.delete(this.sources.keys().next().value);
    return id;
  }

  cached(id) {
    try {
      const meta = JSON.parse(fs.readFileSync(this.file(id, 'json'), 'utf8'));
      if (this.now() - meta.createdAt >= this.retentionMs) return null;
      const bytes = fs.readFileSync(this.file(id, 'bin'));
      const type = imageMime(bytes);
      return type && bytes.length <= MAX_IMAGE_BYTES ? { bytes, type } : null;
    } catch { return null; }
  }

  prune(incoming = 0) {
    const entries = [];
    for (const name of fs.readdirSync(this.directory)) {
      if (!/^[a-f0-9]{64}\.bin$/.test(name)) continue;
      const id = name.slice(0, -4);
      const stat = fs.statSync(this.file(id, 'bin'));
      entries.push({ id, bytes: stat.size, time: stat.mtimeMs });
    }
    entries.sort((a, b) => a.time - b.time);
    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    let count = entries.length;
    for (const entry of entries) {
      if (this.now() - entry.time < this.retentionMs && total + incoming <= this.maxBytes && count < 1000) continue;
      for (const extension of ['json', 'bin']) {
        try { fs.unlinkSync(this.file(entry.id, extension)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      total -= entry.bytes;
      count--;
    }
    this.lastPruned = this.now();
  }

  get(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) return Promise.resolve(null);
    const cached = this.cached(id);
    if (cached) return Promise.resolve(cached);
    if (this.closed || !this.sources.has(id) || (this.failures.get(id) || 0) > this.now()) return Promise.resolve(null);
    if (this.pending.has(id)) return this.pending.get(id);
    if (this.queue.length >= 150) return Promise.resolve(null);
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    this.pending.set(id, promise);
    this.queue.push({ id, resolve });
    this.drain();
    return promise;
  }

  drain() {
    while (!this.closed && this.active < 2 && this.queue.length) {
      const { id, resolve } = this.queue.shift();
      this.active++;
      Promise.resolve().then(() => this.download(this.sources.get(id))).then(result => {
        if (!result || !Buffer.isBuffer(result.bytes) || result.bytes.length > MAX_IMAGE_BYTES ||
          result.bytes.length > this.maxBytes || !imageMime(result.bytes)) throw new Error('invalid_image_content');
        this.prune(result.bytes.length);
        fs.writeFileSync(this.file(id, 'bin'), result.bytes, { mode: 0o600 });
        fs.writeFileSync(this.file(id, 'json'), JSON.stringify({ createdAt: this.now() }), { mode: 0o600 });
        this.failures.delete(id);
        resolve({ bytes: result.bytes, type: imageMime(result.bytes) });
      }).catch(() => {
        this.failures.set(id, this.now() + 300000);
        if (this.failures.size > 3000) this.failures.delete(this.failures.keys().next().value);
        resolve(null);
      }).finally(() => {
        this.pending.delete(id);
        this.active--;
        this.drain();
      });
    }
  }

  rewrite(state) {
    const ids = [];
    const messages = (state?.messages || []).map(message => ({
      ...message,
      images: (message.images || []).map(raw => {
        const id = this.remember(raw);
        if (!id) return raw;
        ids.push(id);
        void this.get(id);
        return `/api/world/media/${id}`;
      }),
    }));
    return { state: { ...state, messages }, ids: [...new Set(ids)] };
  }

  start(client) {
    let running = false;
    let after;
    const poll = async () => {
      if (this.closed || running || !client.authed) return;
      running = true;
      try {
        const result = await client.query(100, after);
        if (result.ok && !this.closed) {
          const messages = result.messages || [];
          this.rewrite({ messages });
          if (messages.length) after = Math.max(after || 0, ...messages.map(message => Number(message.seq) || 0));
          if (this.now() - this.lastPruned > 3600000) this.prune();
        }
      } catch { /* Retry on the next polling cycle without logging signed URLs. */ }
      finally { running = false; }
    };
    this.timer = setInterval(poll, 5000);
    this.timer.unref?.();
    void poll();
  }

  close() {
    this.closed = true;
    clearInterval(this.timer);
    for (const item of this.queue.splice(0)) { this.pending.delete(item.id); item.resolve(null); }
  }
}
