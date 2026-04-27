// SSR'd forum list page. Same HTML for humans and crawlers — no cloaking.
// Fetches posts from app-backend's public /forum/posts endpoint and renders
// real <article> cards in the response, so Google indexes the content.

const API_BASE =
  (typeof Netlify !== "undefined" && Netlify.env?.get?.("DUOCORTEX_API_BASE")) ||
  "https://api.duocortex.com";
const SITE_ORIGIN = "https://duocortex.in";

export default async (request, context) => {
  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10) || 1, 1);
  const limit = 20;

  let data;
  try {
    const apiUrl = `${API_BASE}/forum/posts?page=${page}&limit=${limit}`;
    const apiRes = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    if (!apiRes.ok) {
      // API returned 4xx/5xx — fall through to the static shell so the user
      // at least sees the chrome and the client-side fallback can retry.
      return context.next();
    }
    data = await apiRes.json();
  } catch (_err) {
    return context.next();
  }

  if (!data?.success) return context.next();

  const posts = Array.isArray(data.posts) ? data.posts : [];
  const totalPages = data.pagination?.totalPages || 1;

  // Build pagination URL helper
  const pageUrl = (n) => (n <= 1 ? "/forum" : `/forum?page=${n}`);
  const canonical = `${SITE_ORIGIN}${pageUrl(page)}`;
  const prevUrl = page > 1 ? `${SITE_ORIGIN}${pageUrl(page - 1)}` : null;
  const nextUrl = page < totalPages ? `${SITE_ORIGIN}${pageUrl(page + 1)}` : null;

  const cardsHtml = posts.map(renderCard).join("\n");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "DuoCortex Medical Community Forum",
    description:
      "Browse discussions, questions, and answers from verified medical students and professionals on DuoCortex.",
    url: canonical,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: posts.map((p, i) => ({
        "@type": "ListItem",
        position: (page - 1) * limit + i + 1,
        url: `${SITE_ORIGIN}/post/${p._id}`,
        name: truncateText(p.title || p.description || "DuoCortex post", 110),
      })),
    },
  };

  const html = renderShell({
    title:
      page === 1
        ? "Forum | DuoCortex"
        : `Forum (Page ${page}) | DuoCortex`,
    description:
      "Read discussions, questions and answers from verified medical students and professionals on the DuoCortex community forum.",
    canonical,
    prevUrl,
    nextUrl,
    activeNav: "forum",
    jsonLd,
    body: `
      <section class="forum-hero">
        <div class="container">
          <h1>Medical Community Forum</h1>
          <p>Read what verified medical students and professionals are discussing on DuoCortex. Sign up to join the conversation.</p>
        </div>
      </section>

      <section class="forum-section">
        <div class="container">
          ${posts.length === 0
            ? `<div class="empty-state"><p>No discussions yet. Check back soon.</p></div>`
            : `<div class="row g-4" id="forum-list">${cardsHtml}</div>`
          }

          ${renderPagination(page, totalPages)}

          <div class="forum-cta">
            <h2>Want to ask a question or share an answer?</h2>
            <p>Posting and commenting is available in the DuoCortex app.</p>
            <div class="forum-cta-buttons">
              <a href="https://accounts.duocortex.in" class="btn-primary">
                <i class="bi bi-person-plus"></i> Create Account
              </a>
              <a href="https://play.google.com/store/apps/details?id=com.duocortex" target="_blank" rel="noopener noreferrer" class="btn-secondary">
                <i class="bi bi-google-play"></i> Get on Play Store
              </a>
            </div>
          </div>
        </div>
      </section>
    `,
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "cache-control": "public, max-age=600, stale-while-revalidate=1200",
    },
  });
};

export const config = {
  path: "/forum",
};

// ---------- helpers ----------

function renderCard(post) {
  const id = post._id || "";
  const title = post.title || truncateText(post.description, 80) || "DuoCortex post";
  const description = truncateText(post.description || "", 200);
  const author = post.createdBy || {};
  const authorName = author.name || "DuoCortex member";
  const college = author.collegeName || "";
  const time = relativeTime(post.createdAt);
  const upvotes = Number(post.upvoteCount) || 0;
  const comments = Number(post.commentCount) || 0;
  const answers = Number(post.answerCount) || 0;
  const detailUrl = `/post/${id}`;
  const isQa = !!post.allowAnswers;
  const imageUrl = post.image?.url ? safeUrl(post.image.url) : null;

  return `
    <div class="col-lg-6 col-md-12">
      <article class="forum-card">
        <header class="forum-card-meta">
          <span class="forum-card-author">${escapeHtml(authorName)}</span>
          ${college ? `<span class="forum-card-college">${escapeHtml(college)}</span>` : ""}
          <time datetime="${escapeHtml(post.createdAt || "")}" class="forum-card-time">${escapeHtml(time)}</time>
          ${isQa ? `<span class="forum-card-badge">Question</span>` : ""}
        </header>
        <h2 class="forum-card-title"><a href="${escapeHtml(detailUrl)}">${escapeHtml(title)}</a></h2>
        ${description ? `<p class="forum-card-body">${escapeHtml(description)}</p>` : ""}
        ${imageUrl
          ? `<div class="forum-card-image"><img src="${escapeHtml(imageUrl)}" alt="" loading="lazy"></div>`
          : ""
        }
        <footer class="forum-card-stats">
          <span title="Upvotes"><i class="bi bi-arrow-up-circle"></i> ${upvotes}</span>
          ${isQa
            ? `<span title="Answers"><i class="bi bi-chat-square-text"></i> ${answers}</span>`
            : `<span title="Comments"><i class="bi bi-chat"></i> ${comments}</span>`
          }
          <a class="forum-card-link" href="${escapeHtml(detailUrl)}">View discussion <i class="bi bi-arrow-right"></i></a>
        </footer>
      </article>
    </div>
  `;
}

function renderPagination(page, totalPages) {
  if (totalPages <= 1) return "";
  const prev = page > 1 ? `<a class="page-nav" href="${page - 1 === 1 ? "/forum" : `/forum?page=${page - 1}`}" rel="prev">&laquo; Previous</a>` : `<span class="page-nav disabled">&laquo; Previous</span>`;
  const next = page < totalPages ? `<a class="page-nav" href="/forum?page=${page + 1}" rel="next">Next &raquo;</a>` : `<span class="page-nav disabled">Next &raquo;</span>`;
  return `
    <nav class="pagination" aria-label="Forum pagination">
      ${prev}
      <span class="page-info">Page ${page} of ${totalPages}</span>
      ${next}
    </nav>
  `;
}

function renderShell({ title, description, canonical, prevUrl, nextUrl, activeNav, jsonLd, body }) {
  const ogImage = "https://duocortex.in/assets/img/logo-1.png";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  ${prevUrl ? `<link rel="prev" href="${escapeHtml(prevUrl)}">` : ""}
  ${nextUrl ? `<link rel="next" href="${escapeHtml(nextUrl)}">` : ""}

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="DuoCortex">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${ogImage}">

  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImage}">

  <link rel="icon" href="/assets/img/logo-1.png" type="image/png">
  <link href="/assets/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
  <link href="/assets/vendor/bootstrap-icons/bootstrap-icons.css" rel="stylesheet">
  <link href="/assets/css/style.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&family=Montserrat:wght@500;600;700&display=swap" rel="stylesheet">

  <style>
    body { font-family: "Open Sans", sans-serif; background: #fafbfc; color: #313035; }
    .forum-hero { background: linear-gradient(135deg, #5b2ef0, #d424f3); color: #fff; padding: 120px 0 50px; text-align: center; }
    .forum-hero h1 { font-family: "Montserrat", sans-serif; font-weight: 700; font-size: 2.5rem; margin-bottom: 12px; }
    .forum-hero p { font-size: 1.1rem; opacity: 0.95; max-width: 720px; margin: 0 auto; }
    .forum-section { padding: 50px 0 80px; }
    .forum-card { background: #fff; border-radius: 14px; padding: 22px 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #eef0f3; height: 100%; display: flex; flex-direction: column; transition: transform .2s, box-shadow .2s; }
    .forum-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(0,0,0,0.12); }
    .forum-card-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 0.85rem; color: #6b6b75; margin-bottom: 8px; align-items: center; }
    .forum-card-author { font-weight: 600; color: #313035; }
    .forum-card-college { color: #6023d2; }
    .forum-card-badge { background: rgba(212,36,243,0.1); color: #d424f3; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .forum-card-title { font-family: "Montserrat", sans-serif; font-size: 1.2rem; font-weight: 600; margin: 4px 0 10px; line-height: 1.35; }
    .forum-card-title a { color: #1f1d2c; text-decoration: none; }
    .forum-card-title a:hover { color: #6023d2; }
    .forum-card-body { color: #525058; font-size: 0.95rem; line-height: 1.6; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .forum-card-image { margin: 8px 0 14px; border-radius: 10px; overflow: hidden; max-height: 220px; }
    .forum-card-image img { width: 100%; height: auto; display: block; }
    .forum-card-stats { margin-top: auto; display: flex; gap: 18px; align-items: center; font-size: 0.9rem; color: #6b6b75; padding-top: 10px; border-top: 1px solid #f1f2f5; }
    .forum-card-stats i { margin-right: 4px; }
    .forum-card-link { margin-left: auto; color: #6023d2; text-decoration: none; font-weight: 600; }
    .forum-card-link:hover { color: #d424f3; }
    .pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin: 24px 0; }
    .page-nav { padding: 8px 18px; border-radius: 22px; background: #fff; border: 1px solid #e5e7eb; color: #6023d2; text-decoration: none; font-weight: 600; }
    .page-nav:hover { background: #6023d2; color: #fff; border-color: #6023d2; }
    .page-nav.disabled { color: #c4c4cc; background: #f4f4f7; cursor: not-allowed; }
    .page-info { color: #6b6b75; font-size: 0.95rem; }
    .empty-state { text-align: center; padding: 60px 20px; color: #8e8e98; }
    .forum-cta { margin: 50px 0 0; padding: 36px; text-align: center; background: #fff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
    .forum-cta h2 { font-family: "Montserrat", sans-serif; font-size: 1.4rem; color: #1f1d2c; margin-bottom: 8px; }
    .forum-cta p { color: #525058; margin-bottom: 18px; }
    .forum-cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn-primary { background: #6023d2; color: #fff; padding: 12px 24px; border-radius: 28px; text-decoration: none; font-weight: 600; }
    .btn-primary:hover { background: #4A1B98; color: #fff; }
    .btn-secondary { background: #fff; color: #6023d2; border: 2px solid #6023d2; padding: 10px 22px; border-radius: 28px; text-decoration: none; font-weight: 600; }
    .btn-secondary:hover { background: #6023d2; color: #fff; }
    @media (max-width: 768px) {
      .forum-hero { padding: 100px 0 40px; }
      .forum-hero h1 { font-size: 1.8rem; }
      .forum-section { padding: 32px 0 60px; }
    }
  </style>

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  ${renderHeader(activeNav)}
  <main>
    ${body}
  </main>
  ${renderFooter()}
</body>
</html>`;
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

function relativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  const diffYr = Math.floor(diffMo / 12);
  return `${diffYr}y ago`;
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
