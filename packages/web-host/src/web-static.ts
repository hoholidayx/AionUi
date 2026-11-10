import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import serveHandler from 'serve-handler';

// Match Vite's flat /assets output with its default eight-character hash.
const HASHED_ASSET = /^\/assets\/[\w.-]+-[\w-]{8}\.[\w]+$/;
const IMMUTABLE = 'public, max-age=31536000, immutable';

function acceptedEncodings(header: string | undefined) {
  const qualities = new Map<string, number>();
  for (const value of header?.split(',') ?? []) {
    const [coding, ...params] = value.trim().toLowerCase().split(';');
    const quality = params
      .find((param) => param.trim().startsWith('q='))
      ?.trim()
      .slice(2);
    const parsed = quality === undefined ? 1 : Number(quality);
    if (parsed >= 0 && parsed <= 1) qualities.set(coding.trim(), parsed);
  }
  const qualityOf = (coding: string) => qualities.get(coding) ?? qualities.get('*') ?? 0;
  return {
    encodings: (['br', 'gzip'] as const)
      .filter((coding) => qualityOf(coding) > 0)
      .sort((left, right) => qualityOf(right) - qualityOf(left)),
    identity: qualities.get('identity') ?? (qualities.get('*') === 0 ? 0 : 1),
    explicitIdentity: qualities.get('identity'),
    qualityOf,
  };
}

async function statFile(filename: string) {
  try {
    const stats = await lstat(filename);
    return stats.isFile() ? stats : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}

export async function serveWebStatic(req: IncomingMessage, res: ServerResponse, staticDir: string): Promise<void> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method ?? '')) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  if (/^\/assets\/.*\.(js|css)\.(br|gz)$/.test(pathname)) {
    res.writeHead(404).end();
    return;
  }

  const hashed = HASHED_ASSET.test(pathname);
  const compressible = hashed && /\.(js|css)$/.test(pathname);
  const navigation = !pathname.startsWith('/assets/') && !path.extname(pathname);
  const revalidate = navigation || pathname === '/index.html' || pathname === '/sw.js';
  if (revalidate) res.setHeader('Cache-Control', 'no-cache');

  const headers: NonNullable<NonNullable<Parameters<typeof serveHandler>[2]>['headers']> = [];
  if (hashed) {
    const originalPath = path.join(staticDir, pathname);
    if (!(await statFile(originalPath))) {
      res.writeHead(404).end();
      return;
    }
    const basename = path.basename(pathname);
    const accepted = acceptedEncodings(req.headers['accept-encoding']);
    const variant = req.headers.range ? [] : accepted.encodings;
    if (compressible) res.setHeader('Vary', 'Accept-Encoding');
    for (const encoding of compressible ? variant : []) {
      if (accepted.explicitIdentity !== undefined && accepted.explicitIdentity > accepted.qualityOf(encoding)) break;
      const encodedPath = `${originalPath}.${encoding === 'gzip' ? 'gz' : 'br'}`;
      const stats = await statFile(encodedPath);
      if (!stats) continue;
      const etag = `W/"${basename}-${encoding}"`;
      res.setHeader('Cache-Control', IMMUTABLE);
      res.setHeader('ETag', etag);
      res.setHeader(
        'Content-Type',
        pathname.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8'
      );
      res.setHeader('Content-Encoding', encoding);
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304).end();
        return;
      }
      res.setHeader('Content-Length', stats.size);
      if (req.method === 'HEAD') {
        res.writeHead(200).end();
      } else {
        await pipeline(createReadStream(encodedPath), res);
      }
      return;
    }
    if (compressible && accepted.identity === 0) {
      res.writeHead(406).end();
      return;
    }
    headers.push({
      source: pathname.slice(1),
      headers: [
        { key: 'Cache-Control', value: IMMUTABLE },
        { key: 'ETag', value: `W/"${basename}"` },
      ],
    });
  }

  await serveHandler(req, res, {
    public: staticDir,
    cleanUrls: false,
    directoryListing: false,
    etag: revalidate,
    rewrites: navigation ? [{ source: '**', destination: '/index.html' }] : [],
    headers,
  });
}
