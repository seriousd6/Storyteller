// Hand-rolled sitemap — no @astrojs/sitemap dependency. Enumerates the static
// pages plus every generator/composite tool route (same glob the [tool].astro
// routes use), so all 40+ tool pages are discoverable. Rendered to
// /sitemap.xml at build time (static output).
import type { APIRoute } from 'astro';
import type { GeneratorConfig } from '../engine/types';
import type { CompositeModule } from '../engine/composite';

const STATIC_ROUTES = [
  '/',
  '/gm/',
  '/solo/',
  '/writing/',
  '/world/',
  '/sheet/',
  '/writing/inspiration/',
  '/labs/',
  '/about/',
  '/privacy/',
  '/terms/',
];

const gens = import.meta.glob<GeneratorConfig>('../generators/*.json', { eager: true, import: 'default' });
const comps = import.meta.glob<CompositeModule>('../composites/*.ts', { eager: true });

const toolRoutes = [
  ...Object.values(gens).map((c) => `/${c.pillar}/${c.id.split('/')[1]}/`),
  // meta-less files (composites/srd.ts) are shared helpers, not tools
  ...Object.values(comps).filter(({ meta }) => meta).map(({ meta }) => `/${meta.pillar}/${meta.id.split('/')[1]}/`),
];

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://storytellertoolbox.com')).origin;
  const routes = [...new Set([...STATIC_ROUTES, ...toolRoutes])].sort();
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    routes.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
