export default async (request, context) => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Only handle /post/* URLs
  if (!pathname.startsWith('/post/')) {
    return context.next();
  }

  // Get post ID from URL
  const postId = pathname.replace('/post/', '');

  if (!postId) {
    return context.next();
  }

  // Check if request is from a crawler (WhatsApp, Facebook, Twitter, LinkedIn, etc.)
  const userAgent = request.headers.get('user-agent') || '';
  const crawlerPatterns = [
    'facebookexternalhit',
    'Facebot',
    'WhatsApp',
    'Twitterbot',
    'LinkedInBot',
    'Pinterest',
    'Slackbot',
    'TelegramBot',
    'Discordbot',
    'Googlebot',
    'bingbot',
    'Embedly',
    'Quora Link Preview',
    'Showyoubot',
    'outbrain',
    'vkShare',
    'W3C_Validator'
  ];

  const isCrawler = crawlerPatterns.some(pattern =>
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );

  // If not a crawler, serve the regular post.html page
  if (!isCrawler) {
    // Rewrite to post.html and let it handle via JavaScript
    const response = await context.next();
    return response;
  }

  // For crawlers, fetch post data and return HTML with OG tags
  try {
    const apiResponse = await fetch(`https://api.duocortex.com/posts/post/${postId}`);

    if (!apiResponse.ok) {
      return context.next();
    }

    const post = await apiResponse.json();

    // Extract post data - using new API structure
    const title = post.title || truncateText(post.description, 60) || 'DuoCortex Post';
    const description = truncateText(post.description || 'View this post on DuoCortex - Every Medico\'s Digital Campus', 160);
    const image = post.image?.url || 'https://duocortex.in/assets/img/logo-1.png';
    const postUrl = `https://duocortex.in/post/${postId}`;
    const userName = post.createdBy?.name || 'DuoCortex User';

    // Return HTML with proper OG tags for crawlers
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${escapeHtml(title)} | DuoCortex</title>
  <meta name="description" content="${escapeHtml(description)}">

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="DuoCortex">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeHtml(postUrl)}">
  <meta property="article:author" content="${escapeHtml(userName)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@duocortex">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <!-- Redirect real users to the actual page -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(postUrl)}">

  <link rel="icon" href="https://duocortex.in/assets/img/logo-1.png" type="image/png">
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <p>Posted by ${escapeHtml(userName)} on DuoCortex</p>
  <img src="${escapeHtml(image)}" alt="Post image">
  <a href="${escapeHtml(postUrl)}">View on DuoCortex</a>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'content-type': 'text/html;charset=UTF-8',
        'cache-control': 'public, max-age=300' // Cache for 5 minutes
      }
    });

  } catch (error) {
    console.error('Error fetching post:', error);
    return context.next();
  }
};

// Helper function to truncate text
function truncateText(text, maxLength) {
  if (!text) return '';
  // Remove newlines and extra spaces
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Helper function to escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const config = {
  path: '/post/*'
};
