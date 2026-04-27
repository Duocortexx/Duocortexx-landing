// SSR'd post detail page. Replaces og-image.js.
// Same HTML for humans and crawlers (no UA branching) — Google indexes the
// full post + author + first 20 comments/answers, plus DiscussionForumPosting
// JSON-LD for rich-result snippets.

const API_BASE =
  (typeof Netlify !== "undefined" && Netlify.env?.get?.("DUOCORTEX_API_BASE")) ||
  "https://api.duocortex.com";
const SITE_ORIGIN = "https://duocortex.in";
const COMMENT_LIMIT = 20;
const ANSWER_LIMIT = 20;

export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (!pathname.startsWith("/post/")) {
    return context.next();
  }

  const postId = pathname.replace("/post/", "").split("/")[0];
  if (!postId) return context.next();

  // 1. Fetch the post (includes first page of comments)
  let post;
  try {
    const apiRes = await fetch(
      `${API_BASE}/posts/post/${encodeURIComponent(postId)}?page=1&limit=${COMMENT_LIMIT}`,
      { headers: { Accept: "application/json" } }
    );
    if (apiRes.status === 404) {
      return notFoundResponse();
    }
    if (!apiRes.ok) {
      return context.next();
    }
    post = await apiRes.json();
  } catch (_err) {
    return context.next();
  }
  if (!post || !post._id) return context.next();

  // 2. If it's a Q&A post, also fetch answers
  let answers = [];
  let answersTotal = 0;
  if (post.allowAnswers) {
    try {
      const ansRes = await fetch(
        `${API_BASE}/forum/posts/${encodeURIComponent(postId)}/answers?page=1&limit=${ANSWER_LIMIT}`,
        { headers: { Accept: "application/json" } }
      );
      if (ansRes.ok) {
        const ansBody = await ansRes.json();
        if (ansBody?.success) {
          answers = Array.isArray(ansBody.answers) ? ansBody.answers : [];
          answersTotal = ansBody.pagination?.totalAnswers || answers.length;
        }
      }
    } catch (_) {
      // Non-fatal — page still renders without answers
    }
  }

  const comments = Array.isArray(post.comments) ? post.comments : [];
  const commentsTotal = post.commentsPagination?.totalCount || comments.length;

  const title = post.title || truncateText(post.description, 60) || "DuoCortex Post";
  const description = truncateText(
    post.description ||
      "Read this discussion on DuoCortex — Every Medico's Digital Campus.",
    160
  );
  const image =
    post.image?.url || "https://duocortex.in/assets/img/logo-1.png";
  const postUrl = `${SITE_ORIGIN}/post/${postId}`;
  const author = post.createdBy || {};
  const authorName = author.name || "DuoCortex member";
  const upvotes = Array.isArray(post.upvotes) ? post.upvotes.length : 0;
  const downvotes = Array.isArray(post.downvotes) ? post.downvotes.length : 0;

  const isQa = !!post.allowAnswers;
  const discussionTotal = isQa ? answersTotal : commentsTotal;
  const discussionItems = isQa ? answers : comments;

  // JSON-LD: DiscussionForumPosting + nested Comment list
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: title,
    articleBody: post.description || "",
    datePublished: post.createdAt,
    dateModified: post.updatedAt || post.createdAt,
    url: postUrl,
    mainEntityOfPage: postUrl,
    author: { "@type": "Person", name: authorName },
    image,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: upvotes,
      },
      {
        "@type": "InteractionCounter",
        interactionType: isQa
          ? "https://schema.org/ReplyAction"
          : "https://schema.org/CommentAction",
        userInteractionCount: discussionTotal,
      },
    ],
    comment: discussionItems.slice(0, 20).map((item) => ({
      "@type": "Comment",
      text: isQa ? item.text || "" : item.text || "",
      dateCreated: item.createdAt,
      author: {
        "@type": "Person",
        name: (isQa ? item.user?.name : item.user?.name) || "DuoCortex member",
      },
    })),
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | DuoCortex</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(postUrl)}">

  <meta property="og:type" content="article">
  <meta property="og:site_name" content="DuoCortex">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeHtml(postUrl)}">
  <meta property="article:author" content="${escapeHtml(authorName)}">
  <meta property="article:published_time" content="${escapeHtml(post.createdAt || "")}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@duocortex">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <link rel="icon" href="/assets/img/logo-1.png" type="image/png">
  <link href="/assets/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
  <link href="/assets/vendor/bootstrap-icons/bootstrap-icons.css" rel="stylesheet">
  <link href="/assets/css/style.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&family=Montserrat:wght@500;600;700&display=swap" rel="stylesheet">

  <style>
    body { font-family: "Open Sans", sans-serif; background: #fafbfc; color: #313035; }
    main { padding-top: 92px; padding-bottom: 60px; }
    .post-detail { max-width: 760px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
    .post-detail h1 { font-family: "Montserrat", sans-serif; font-weight: 700; font-size: 1.8rem; color: #1f1d2c; margin-bottom: 18px; line-height: 1.3; }
    .post-meta { display: flex; gap: 12px; align-items: center; font-size: 0.9rem; color: #6b6b75; margin-bottom: 20px; padding-bottom: 18px; border-bottom: 1px solid #f1f2f5; }
    .post-meta-author { font-weight: 600; color: #313035; }
    .post-meta-college { color: #6023d2; }
    .post-body { font-size: 1.05rem; line-height: 1.7; color: #313035; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word; margin-bottom: 22px; }
    .post-body a { overflow-wrap: anywhere; word-break: break-all; }
    .post-hero { width: 100%; max-height: 480px; object-fit: cover; border-radius: 12px; margin-bottom: 22px; }
    .post-stats { display: flex; gap: 22px; align-items: center; padding: 14px 0; border-top: 1px solid #f1f2f5; border-bottom: 1px solid #f1f2f5; color: #6b6b75; font-size: 0.95rem; }
    .post-stats i { margin-right: 6px; }

    #discussion { max-width: 760px; margin: 32px auto 0; }
    #discussion h2 { font-family: "Montserrat", sans-serif; font-size: 1.35rem; color: #1f1d2c; margin-bottom: 16px; }
    .comment { background: #fff; border-radius: 12px; padding: 18px 20px; margin-bottom: 12px; border: 1px solid #eef0f3; }
    .comment-meta { display: flex; gap: 10px; align-items: baseline; font-size: 0.85rem; color: #6b6b75; margin-bottom: 6px; }
    .comment-author { font-weight: 600; color: #313035; }
    .comment-text { color: #313035; line-height: 1.6; white-space: pre-line; overflow-wrap: anywhere; word-break: break-word; }
    .comment-stats { margin-top: 8px; font-size: 0.85rem; color: #6b6b75; }
    .comment-replies { margin-top: 8px; font-size: 0.85rem; color: #6023d2; }
    .accepted-badge { background: rgba(16,185,129,0.12); color: #047857; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    #load-more { display: block; margin: 18px auto 0; padding: 10px 24px; background: #fff; color: #6023d2; border: 2px solid #6023d2; border-radius: 24px; font-weight: 600; cursor: pointer; }
    #load-more:hover { background: #6023d2; color: #fff; }
    #load-more:disabled { opacity: 0.5; cursor: not-allowed; }

    .post-cta { max-width: 760px; margin: 32px auto 0; padding: 28px; background: linear-gradient(135deg, #5b2ef0, #d424f3); color: #fff; border-radius: 16px; text-align: center; }
    .post-cta h3 { font-family: "Montserrat", sans-serif; margin-bottom: 8px; font-size: 1.25rem; }
    .post-cta p { opacity: 0.95; margin-bottom: 18px; }
    .post-cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .post-cta a { padding: 10px 20px; background: #fff; color: #6023d2; border-radius: 24px; text-decoration: none; font-weight: 600; }
    .post-cta a:hover { background: rgba(255,255,255,0.92); }

    .empty-discussion { text-align: center; color: #8e8e98; padding: 40px 20px; background: #fff; border-radius: 12px; }

    @media (max-width: 768px) {
      main { padding-top: 84px; }
      .post-detail { padding: 22px; border-radius: 12px; }
      .post-detail h1 { font-size: 1.4rem; }
    }
  </style>

  <script type="application/ld+json">${jsonStringifyForHtml(jsonLd)}</script>
</head>
<body data-post-id="${escapeHtml(postId)}" data-is-qa="${isQa ? "1" : "0"}" data-discussion-total="${discussionTotal}">
  ${renderHeader("forum")}

  <main>
    <article class="post-detail">
      <h1>${escapeHtml(title)}</h1>
      <div class="post-meta">
        <span class="post-meta-author">${escapeHtml(authorName)}</span>
        ${author.collegeName ? `<span class="post-meta-college">${escapeHtml(author.collegeName)}</span>` : ""}
        <time datetime="${escapeHtml(post.createdAt || "")}">${escapeHtml(formatDate(post.createdAt))}</time>
        ${isQa ? `<span class="accepted-badge">Question</span>` : ""}
      </div>
      ${post.description ? `<div class="post-body">${escapeHtml(post.description)}</div>` : ""}
      ${post.image?.url
        ? `<img class="post-hero" src="${escapeHtml(post.image.url)}" alt="${escapeHtml(title)}" loading="lazy">`
        : ""
      }
      <div class="post-stats">
        <span><i class="bi bi-arrow-up-circle"></i> ${upvotes}</span>
        <span><i class="bi bi-arrow-down-circle"></i> ${downvotes}</span>
        <span><i class="bi bi-chat"></i> ${isQa ? answersTotal : commentsTotal}</span>
      </div>
    </article>

    <section id="discussion">
      <h2>${isQa ? "Answers" : "Comments"} (${discussionTotal})</h2>
      <div id="discussion-list">
        ${discussionItems.length === 0
          ? `<div class="empty-discussion">No ${isQa ? "answers" : "comments"} yet. Be the first to respond — sign up to join the conversation.</div>`
          : discussionItems.map((item) => renderDiscussionItem(item, isQa)).join("\n")
        }
      </div>
      ${discussionTotal > (isQa ? ANSWER_LIMIT : COMMENT_LIMIT)
        ? `<button id="load-more" type="button">Load more</button>`
        : ""
      }
    </section>

    <aside class="post-cta">
      <h3>Want to join this discussion?</h3>
      <p>Posting and commenting is available in the DuoCortex app.</p>
      <div class="post-cta-buttons">
        <a href="https://accounts.duocortex.in" target="_blank" rel="noopener noreferrer">Create Account</a>
        <a href="https://play.google.com/store/apps/details?id=com.duocortex" target="_blank" rel="noopener noreferrer"><i class="bi bi-google-play"></i> Play Store</a>
        <a href="https://apps.apple.com/app/duocortex" target="_blank" rel="noopener noreferrer"><i class="bi bi-apple"></i> App Store</a>
      </div>
    </aside>
  </main>

  ${renderFooter()}

  <script>
    (function () {
      const API_BASE = ${JSON.stringify(API_BASE)};
      const body = document.body;
      const postId = body.dataset.postId;
      const isQa = body.dataset.isQa === "1";
      const total = parseInt(body.dataset.discussionTotal || "0", 10);
      const pageSize = ${isQa ? ANSWER_LIMIT : COMMENT_LIMIT};
      let nextPage = 2;
      const list = document.getElementById("discussion-list");
      const btn = document.getElementById("load-more");
      if (!btn) return;

      function escape(text) {
        if (text == null) return "";
        return String(text)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      }

      function relTime(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        return d.toLocaleDateString();
      }

      function renderItem(item) {
        const author = (item.user && item.user.name) || "DuoCortex member";
        const accepted = item.isAccepted ? '<span class="accepted-badge">Accepted</span>' : "";
        const score = (typeof item.voteScore === "number") ? '<span class="comment-stats"><i class="bi bi-arrow-up-circle"></i> ' + item.voteScore + '</span>' : "";
        const replies = (item.replyCount > 0) ? '<div class="comment-replies">↳ ' + item.replyCount + ' repl' + (item.replyCount === 1 ? 'y' : 'ies') + ' &mdash; open in app to view</div>' : "";
        return '<article class="comment">' +
          '<div class="comment-meta">' +
            '<span class="comment-author">' + escape(author) + '</span>' +
            '<time>' + escape(relTime(item.createdAt)) + '</time>' +
            accepted +
          '</div>' +
          '<div class="comment-text">' + escape(item.text || "") + '</div>' +
          score +
          replies +
        '</article>';
      }

      btn.addEventListener("click", async function () {
        btn.disabled = true;
        btn.textContent = "Loading…";
        try {
          const url = isQa
            ? API_BASE + "/forum/posts/" + encodeURIComponent(postId) + "/answers?page=" + nextPage + "&limit=" + pageSize
            : API_BASE + "/posts/post/" + encodeURIComponent(postId) + "?page=" + nextPage + "&limit=" + pageSize;
          const res = await fetch(url, { headers: { Accept: "application/json" } });
          const data = await res.json();
          const items = isQa
            ? (data.answers || [])
            : (data.comments || []);
          if (items.length === 0) {
            btn.style.display = "none";
            return;
          }
          list.insertAdjacentHTML("beforeend", items.map(renderItem).join(""));
          nextPage += 1;
          // Hide button if we've loaded everything
          const loadedSoFar = list.querySelectorAll("article.comment").length;
          if (loadedSoFar >= total) {
            btn.style.display = "none";
          } else {
            btn.disabled = false;
            btn.textContent = "Load more";
          }
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "Try again";
        }
      });
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
};

export const config = {
  path: "/post/*",
};

// ---------- helpers ----------

function renderDiscussionItem(item, isQa) {
  const author = item.user?.name || "DuoCortex member";
  const text = item.text || "";
  const time = formatDate(item.createdAt);
  const accepted = item.isAccepted ? `<span class="accepted-badge">Accepted</span>` : "";
  const score =
    typeof item.voteScore === "number"
      ? `<span class="comment-stats"><i class="bi bi-arrow-up-circle"></i> ${item.voteScore}</span>`
      : "";
  const replyCount = item.replyCount || (Array.isArray(item.replies) ? item.replies.length : 0);
  const replies =
    replyCount > 0
      ? `<div class="comment-replies">↳ ${replyCount} repl${replyCount === 1 ? "y" : "ies"} &mdash; open in app to view</div>`
      : "";
  return `
    <article class="comment">
      <div class="comment-meta">
        <span class="comment-author">${escapeHtml(author)}</span>
        <time datetime="${escapeHtml(item.createdAt || "")}">${escapeHtml(time)}</time>
        ${accepted}
      </div>
      <div class="comment-text">${escapeHtml(text)}</div>
      ${score}
      ${replies}
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

function notFoundResponse() {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Post not found | DuoCortex</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/assets/img/logo-1.png" type="image/png">
  <style>body{font-family:sans-serif;text-align:center;padding:80px 20px;color:#313035}h1{color:#d424f3}a{color:#6023d2}</style>
</head><body>
  <h1>Post not found</h1>
  <p>This post may have been removed.</p>
  <p><a href="/forum">&larr; Back to Forum</a></p>
</body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html;charset=UTF-8" },
  });
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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

// JSON.stringify is safe inside a <script type="application/ld+json"> ONLY if
// we also escape `</script>` and `<!--` sequences that could break out of the
// script context. JSON.stringify already escapes `<` is NOT default — do it.
function jsonStringifyForHtml(obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
