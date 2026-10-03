const fs = require('fs');
const path = require('path');

const root = process.cwd();
const configPath = path.join(root, 'next.config.mjs');

if (!fs.existsSync(configPath)) {
  throw new Error('SECURITY_HEADERS_INTEGRITY_ERROR: next.config.mjs is missing.');
}

const content = fs.readFileSync(configPath, 'utf8');

const required = [
  ['Content-Security-Policy', 'Content-Security-Policy'],
  ['Strict-Transport-Security', 'Strict-Transport-Security'],
  ['X-Content-Type-Options', 'X-Content-Type-Options'],
  ['Referrer-Policy', 'Referrer-Policy'],
  ['Permissions-Policy', 'Permissions-Policy'],
  ['frame-ancestors', "frame-ancestors 'none'"],
  ['X-Frame-Options', "value: 'DENY'"],
  ['anti-MIME sniffing', "value: 'nosniff'"],
  ['HSTS max-age', 'max-age=63072000'],
  ['global route coverage', "source: '/(.*)'"],
];

for (const [label, marker] of required) {
  if (!content.includes(marker)) {
    throw new Error(
      'SECURITY_HEADERS_INTEGRITY_ERROR: missing ' + label + ' marker: ' + marker
    );
  }
}

if (/poweredByHeader\s*:\s*true/.test(content)) {
  throw new Error('SECURITY_HEADERS_INTEGRITY_ERROR: X-Powered-By must remain disabled.');
}

console.log(
  'Security headers integrity verified: CSP, HSTS, MIME sniffing protection, referrer policy, permissions policy, frame protection, and global coverage are present.'
);
