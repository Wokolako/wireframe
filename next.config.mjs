const production=process.env.NODE_ENV==='production';
const contentSecurityPolicy=[
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' https: data:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "img-src 'self' data: https://img.clerk.com",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${production?'':" 'unsafe-eval'"} https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.protect.clerk.com`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com",
  `connect-src 'self'${production?'':" ws://localhost:* ws://127.0.0.1:*"} https://*.clerk.accounts.dev https://*.clerk.com https://*.protect.clerk.com:* https://clerk-telemetry.com https://*.clerk-telemetry.com`,
  "frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com https://*.clerk.accounts.dev https://*.clerk.com",
  "worker-src 'self' blob:",
  ...(production?['upgrade-insecure-requests']:[]),
].join('; ');

const securityHeaders=[
  {key:'Content-Security-Policy',value:contentSecurityPolicy},
  {key:'Cross-Origin-Opener-Policy',value:'same-origin'},
  {key:'Cross-Origin-Resource-Policy',value:'same-origin'},
  {key:'Origin-Agent-Cluster',value:'?1'},
  {key:'Referrer-Policy',value:'no-referrer'},
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-DNS-Prefetch-Control',value:'off'},
  {key:'X-Frame-Options',value:'SAMEORIGIN'},
  {key:'X-Permitted-Cross-Domain-Policies',value:'none'},
  {key:'X-XSS-Protection',value:'0'},
  ...(production?[{key:'Strict-Transport-Security',value:'max-age=15552000; includeSubDomains'}]:[]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output:'standalone',
  poweredByHeader:false,
  turbopack:{root:process.cwd()},
  serverExternalPackages:['express','@clerk/express','@neondatabase/serverless','twilio'],
  outputFileTracingIncludes:{
    '/api/*':['./server/**/*.mjs','./shared/**/*.mjs'],
  },
  async headers() {
    return [
      {source:'/:path*',headers:securityHeaders},
      {source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache'},{key:'Service-Worker-Allowed',value:'/'}]},
    ];
  },
};
export default nextConfig;
