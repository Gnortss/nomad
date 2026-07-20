// Per-trip Open Graph / Twitter tags injected into the share page shell so
// link-preview crawlers (which do not run JS) show trip-specific title + summary.

// Escapes text for safe insertion into an HTML attribute value or element body.
// The trip name is user input, so this is a correctness/XSS requirement.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "8 days · 1,240 km · 18h drive". Zero-route trips collapse to just the day count.
export function buildDescription(stats: {
  dayCount: number;
  totalDistanceM: number;
  totalDurationS: number;
}): string {
  const parts = [`${stats.dayCount} day${stats.dayCount === 1 ? "" : "s"}`];
  if (stats.totalDistanceM > 0) {
    const km = Math.round(stats.totalDistanceM / 1000);
    parts.push(`${new Intl.NumberFormat("en-US").format(km)} km`);
    parts.push(`${Math.round(stats.totalDurationS / 3600)}h drive`);
  }
  return parts.join(" · ");
}

// Replaces the shell's <title> with the trip name and inserts the OG/Twitter
// block before </head> (appends if the shell somehow lacks one).
export function injectOgTags(
  shellHtml: string,
  meta: { name: string; description: string; shareUrl: string },
): string {
  const name = esc(meta.name);
  const description = esc(meta.description);
  const url = esc(meta.shareUrl);
  const tags =
    `<meta property="og:title" content="${name}" />` +
    `<meta property="og:description" content="${description}" />` +
    `<meta property="og:url" content="${url}" />` +
    `<meta property="og:type" content="website" />` +
    `<meta name="twitter:card" content="summary" />`;

  const html = shellHtml.replace(/<title>.*?<\/title>/is, `<title>${name}</title>`);
  return html.includes("</head>") ? html.replace("</head>", `${tags}</head>`) : html + tags;
}
