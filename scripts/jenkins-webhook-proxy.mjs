import http from 'node:http';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.KERODI_WEBHOOK_PROXY_PORT || 8788);
const TARGET_HOST = process.env.KERODI_JENKINS_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.KERODI_JENKINS_PORT || 8080);
const WEBHOOK_PATH = '/generic-webhook-trigger/invoke';
const DEFAULT_TOKEN_FILE = path.join(os.homedir(), '.kerodi', 'jenkins-webhook-token');

async function loadToken() {
  const envToken = process.env.KERODI_WEBHOOK_TOKEN;
  if (envToken) return envToken.trim();

  const tokenFile = process.env.KERODI_WEBHOOK_TOKEN_FILE || DEFAULT_TOKEN_FILE;
  try {
    const token = await readFile(tokenFile, 'utf8');
    return token.trim();
  } catch (error) {
    throw new Error(`Cannot read webhook token from ${tokenFile}: ${error.message}`);
  }
}

const token = await loadToken();

function tokenMatches(candidate) {
  const actual = Buffer.from(String(candidate ?? ''));
  const expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const server = http.createServer(async (request, response) => {
  let url;
  try {
    url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }

  if (
    request.method !== 'POST' ||
    url.pathname !== WEBHOOK_PATH ||
    !tokenMatches(url.searchParams.get('token'))
  ) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const headers = {};
  const skip = new Set([
    'host',
    'content-length',
    'connection',
    'transfer-encoding',
    'keep-alive',
    'proxy-connection',
    'upgrade',
  ]);
  for (const [key, value] of Object.entries(request.headers)) {
    if (!skip.has(key.toLowerCase()) && value !== undefined) headers[key] = value;
  }
  headers.host = `${TARGET_HOST}:${TARGET_PORT}`;
  headers['content-length'] = String(body.length);

  const upstream = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: 'POST',
      path: `${url.pathname}${url.search}`,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on('error', (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    response.end(`Bad gateway: ${error.message}`);
  });

  upstream.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`webhook proxy listening on http://127.0.0.1:${PORT}${WEBHOOK_PATH}`);
});
