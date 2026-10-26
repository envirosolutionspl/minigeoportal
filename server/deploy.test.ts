import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/** The files a deployment runs with: what they promise each other must hold (see the deployment docs). */
const compose = parse(readFileSync('compose.yaml', 'utf8')) as { services: Record<string, Record<string, unknown>> };
const proxy = parse(readFileSync('compose.proxy.yaml', 'utf8')) as { services: Record<string, Record<string, unknown>> };
const nginx = readFileSync('deploy/nginx/minigeoportal.conf', 'utf8');

describe('deployment files', () => {
  it('lets every replica hold far more than the 1024 open files Docker gives by default', () => {
    expect(compose.services.app.ulimits).toEqual({ nofile: { soft: 65536, hard: 65536 } });
  });

  it('runs two replicas behind nginx, on the two ports the nginx template names', () => {
    expect(proxy.services.app.deploy).toEqual({ replicas: 2 });
    expect(proxy.services.app.ports).toEqual(['127.0.0.1:8787-8788:8787']);
    expect(nginx).toContain('server 127.0.0.1:8787 ');
    expect(nginx).toContain('server 127.0.0.1:8788 ');
    expect(nginx).toContain('proxy_pass http://minigeoportal;');
  });

  it('keeps connections to the app open and moves a visitor to the other replica when one is down', () => {
    expect(nginx).toMatch(/upstream minigeoportal \{[^}]*keepalive 64;/s);
    expect(nginx).toContain('proxy_set_header Connection "";');
    expect(nginx).toContain('proxy_http_version 1.1;');
    expect(nginx).toMatch(/proxy_next_upstream error timeout http_502 http_503;/);
    expect(nginx).toMatch(/hash \$binary_remote_addr consistent;/);
    // A compressed script of 68 KB is answered from memory, not from a temporary file.
    expect(nginx).toContain('proxy_buffers 16 32k;');
  });
});
