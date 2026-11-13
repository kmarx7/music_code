import type { NextConfig } from "next";

/*
 * Security headers (P6-07, D-04 #8). The app talks to no third-party origin: notation fonts ship inside
 * VexFlow, audio is synthesized locally, and the recording worklet is a same-origin blob: module.
 * - 'unsafe-inline' scripts/styles: Next's inline bootstrap scripts and React inline styles (a nonce would make
 *   every page dynamic). 'unsafe-eval' only in development for React's debugging tools.
 * - blob: in script-src/worker-src: AudioWorklet.addModule(blob URL) for microphone capture.
 */
const development = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' blob:${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${development ? " ws:" : ""}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
