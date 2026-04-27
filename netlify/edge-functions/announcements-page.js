// SSR'd announcements page. Same content for humans and crawlers so Google
// indexes the announcement bodies for SEO. The legacy announcements.html JS
// fetcher remains as a backstop in case this function fails.

const API_BASE =
  (typeof Netlify !== "undefined" && Netlify.env?.get?.("DUOCORTEX_API_BASE")) ||
  "https://api.duocortex.com";
const SITE_ORIGIN = "https://duocortex.in";

export default async (request, context) => {
  let announcements = [];
  try {
    const res = await fetch(`${API_BASE}/announcements`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return context.next();
    const data = await res.json();
    if (data?.success && Array.isArray(data.announcements)) {
      announcements = data.announcements.filter((a) => a.type === "announcement");
    }
  } catch (_) {
    return context.next();
  }

  const canonical = `${SITE_ORIGIN}/announcements`;
  const cardsHtml = announcements.map(renderCard).join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Announcements | DuoCortex",
    description:
      "Latest announcements from DuoCortex — recruitment opportunities, exam updates, and community news for verified medical professionals.",
    url: canonical,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: announcements.slice(0, 50).map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Article",
          headline: truncateText(a.title || "Announcement", 110),
          datePublished: a.createdAt,
          articleBody: truncateText(a.body || "", 500),
          ...(a.link ? { url: safeUrl(a.link) || canonical } : {}),
        },
      })),
    },
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Announcements | DuoCortex</title>
  <meta name="description" content="Latest announcements from DuoCortex — recruitment opportunities, exam updates, and community news for medical professionals.">
  <link rel="canonical" href="${canonical}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DuoCortex">
  <meta property="og:title" content="Announcements | DuoCortex">
  <meta property="og:description" content="Latest announcements from DuoCortex.">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://duocortex.in/assets/img/logo-1.png">

  <link rel="icon" href="/assets/img/logo-1.png" type="image/png">
  <link href="/assets/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
  <link href="/assets/vendor/bootstrap-icons/bootstrap-icons.css" rel="stylesheet">
  <link href="/assets/css/style.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&family=Montserrat:wght@500;600;700&display=swap" rel="stylesheet">

  <style>
    body { font-family: "Open Sans", sans-serif; background: #fafbfc; color: #313035; }
    .ann-hero { background: linear-gradient(135deg, #5b2ef0, #d424f3); color: #fff; padding: 120px 0 50px; text-align: center; }
    .ann-hero h1 { font-family: "Montserrat", sans-serif; font-weight: 700; font-size: 2.5rem; margin-bottom: 12px; }
    .ann-hero p { font-size: 1.1rem; opacity: 0.95; max-width: 720px; margin: 0 auto; }
    .ann-section { padding: 50px 0 80px; }
    .ann-card { background: #fff; border-radius: 14px; padding: 26px 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #eef0f3; margin-bottom: 22px; transition: transform .2s, box-shadow .2s; }
    .ann-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.12); }
    .ann-title { font-family: "Montserrat", sans-serif; color: #d424f3; font-size: 1.4rem; font-weight: 700; margin-bottom: 8px; }
    .ann-date { color: #6b6b75; font-size: 0.92rem; margin-bottom: 14px; }
    .ann-body { color: #313035; line-height: 1.7; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word; margin-bottom: 16px; }
    .ann-body a { overflow-wrap: anywhere; word-break: break-all; }
    .ann-image { margin: 16px 0; max-height: 300px; overflow: hidden; border-radius: 10px; }
    .ann-image img { width: 100%; height: auto; display: block; }
    .ann-link { display: inline-flex; align-items: center; gap: 6px; padding: 10px 22px; background: #5b2ef0; color: #fff; border-radius: 24px; text-decoration: none; font-weight: 600; }
    .ann-link:hover { background: #4A1B98; color: #fff; }
    .empty-state { text-align: center; padding: 60px 20px; color: #8e8e98; }
    @media (max-width: 768px) { .ann-hero { padding: 100px 0 40px; } .ann-hero h1 { font-size: 1.8rem; } }
  </style>

  <script type="application/ld+json">${jsonStringifyForHtml(jsonLd)}</script>
</head>
<body>
  ${renderHeader("announcements")}

  <main>
    <section class="ann-hero">
      <div class="container">
        <h1>Announcements</h1>
        <p>Latest updates, recruitment opportunities and exam news for the DuoCortex community.</p>
      </div>
    </section>

    <section class="ann-section">
      <div class="container">
        <div id="announcements-container" class="row">
          ${announcements.length === 0
            ? `<div class="col-12 empty-state"><p>No announcements at the moment. Check back soon.</p></div>`
            : announcements.map((a) => `<div class="col-12">${renderCard(a)}</div>`).join("\n")
          }
        </div>
      </div>
    </section>
  </main>

  ${renderFooter()}
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "cache-control": "public, max-age=600, stale-while-revalidate=1800",
    },
  });
};

export const config = {
  path: ["/announcements", "/announcements.html"],
};

// ---------- helpers ----------

function renderCard(a) {
  const title = a.title || "Announcement";
  const body = a.body || "";
  const time = formatDate(a.createdAt);
  const linkUrl = safeUrl(a.link);
  const imageUrl = safeUrl(a.image);
  return `
    <article class="ann-card">
      <h2 class="ann-title">${escapeHtml(title)}</h2>
      <div class="ann-date"><i class="bi bi-calendar"></i> ${escapeHtml(time)}</div>
      ${body ? `<div class="ann-body">${escapeHtml(body)}</div>` : ""}
      ${imageUrl ? `<div class="ann-image"><img src="${escapeHtml(imageUrl)}" alt="" loading="lazy"></div>` : ""}
      ${linkUrl ? `<a class="ann-link" href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-box-arrow-up-right"></i> Learn More</a>` : ""}
    </article>
  `;
}

function renderHeader(active) {
  const isActive = (k) => (active === k ? "active" : "");
  return `
    <style>
      #header .navbar a, #header .navbar a:focus { color: #4a4658; padding: 10px 0; }
      #header .navbar a:hover, #header .navbar .active, #header .navbar .active:focus, #header .navbar li:hover > a { color: #6023d2; }
      #header .navbar > ul > li > a:before { left: 0; background-color: #6023d2; }
      #header .mobile-nav-toggle { color: #4a4658; }
    </style>
    <header id="header" class="fixed-top d-flex align-items-center" style="background: rgba(255,255,255,0.96); box-shadow: 0 2px 16px rgba(0,0,0,0.06); height: 72px;">
      <div class="container d-flex align-items-center justify-content-between">
        <a href="/" class="d-flex align-items-center" style="text-decoration: none; gap: 10px;">
          <img src="/assets/img/logo-1.png" alt="DuoCortex" style="height: 36px;">
          <span style="font-family: 'Montserrat', sans-serif; font-weight: 700; color: #6023d2; font-size: 1.4rem;">DuoCortex</span>
        </a>
        <nav id="navbar" class="navbar">
          <ul style="display: flex; gap: 22px; margin: 0; padding: 0; list-style: none; align-items: center;">
            <li><a class="nav-link ${isActive("home")}" href="/">Home</a></li>
            <li><a class="nav-link ${isActive("announcements")}" href="/announcements">Announcements</a></li>
            <li><a class="nav-link ${isActive("forum")}" href="/forum">Forum</a></li>
            <li><a class="nav-link" href="https://accounts.duocortex.in" target="_blank" rel="noopener noreferrer">
              <i class="bi bi-person-circle"></i> Login
            </a></li>
          </ul>
        </nav>
      </div>
    </header>
  `;
}

function renderFooter() {
  return `
    <footer style="background: #1f1d2c; color: #c8c8d0; padding: 40px 0 20px; margin-top: 60px;">
      <div class="container" style="text-align: center;">
        <p style="margin-bottom: 8px;">DuoCortex &mdash; Every Medico's Digital Campus</p>
        <p style="font-size: 0.85rem; opacity: 0.7;">
          <a href="/privacy-policy.html" style="color: #c8c8d0; margin-right: 16px;">Privacy Policy</a>
          <a href="/" style="color: #c8c8d0;">Home</a>
        </p>
      </div>
    </footer>
  `;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function truncateText(text, maxLength) {
  if (!text) return "";
  const s = String(text).replace(/\s+/g, " ").trim();
  if (s.length <= maxLength) return s;
  return s.substring(0, maxLength - 3) + "...";
}

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeUrl(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const u = new URL(raw, SITE_ORIGIN);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch (_) {
    return null;
  }
}

function jsonStringifyForHtml(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
