// Dynamic sitemap of every forum post URL. Google fetches this and discovers
// every /post/:id without us hand-maintaining sitemap.xml.

const API_BASE =
  (typeof Netlify !== "undefined" && Netlify.env?.get?.("DUOCORTEX_API_BASE")) ||
  "https://api.duocortex.com";
const SITE_ORIGIN = "https://duocortex.in";
const PAGE_SIZE = 10000;
const SITEMAP_LIMIT = 50000; // Google's per-sitemap URL cap

export default async () => {
  const allPosts = [];
  let cursor = 0;
  // Pull pages until we hit Google's per-sitemap limit or the API is exhausted.
  for (let i = 0; i < Math.ceil(SITEMAP_LIMIT / PAGE_SIZE); i++) {
    let data;
    try {
      const res = await fetch(
        `${API_BASE}/forum/sitemap-data?cursor=${cursor}&limit=${PAGE_SIZE}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) break;
      data = await res.json();
    } catch (_) {
      break;
    }
    if (!data?.success || !Array.isArray(data.posts)) break;
    allPosts.push(...data.posts);
    if (!data.hasMore) break;
    cursor = data.cursor;
    if (allPosts.length >= SITEMAP_LIMIT) break;
  }

  const urls = allPosts
    .slice(0, SITEMAP_LIMIT)
    .map((p) => {
      const lastmod = p.updatedAt
        ? new Date(p.updatedAt).toISOString().split("T")[0]
        : "";
      return `  <url>
    <loc>${SITE_ORIGIN}/post/${escapeXml(p.id)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml;charset=UTF-8",
      "cache-control": "public, max-age=3600",
    },
  });
};

export const config = {
  path: "/sitemap-forum.xml",
};

function escapeXml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
