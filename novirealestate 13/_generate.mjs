// Runs on every Netlify deploy (see netlify.toml in the repo root).
// Turns data/listings.json into one crawlable page per listing, plus sitemap.xml.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = "https://noviwidiawati.com/";
const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const wr = (f, s) => { const p = path.join(ROOT, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const all = (JSON.parse(rd("data/listings.json")).listings || []).filter(l => l && l.slug && l.title);
const tpl = rd("listing.html");

// Reuse the exact render code from listing.html so the static page matches what the browser draws.
const code = tpl.slice(tpl.indexOf("/*RENDER-START*/"), tpl.indexOf("/*RENDER-END*/"));
const ctx = { NWCUR: { html: () => "" }, encodeURIComponent, String, Array, Math, JSON };
vm.createContext(ctx);
vm.runInContext(code + "\n;globalThis.__r={renderMain,cardHTML,esc,img};", ctx);
const { renderMain, cardHTML, esc, img } = ctx.__r;

const abs = p => SITE + String(p || "").replace(/^\//, "");
const clip = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t; };
const num = s => { const d = String(s || "").replace(/[^\d]/g, ""); return d ? +d : undefined; };
const sqm = s => { const m = String(s || "").replace(/,/g, "").match(/[\d.]+/); return m ? +m[0] : undefined; };
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

let n = 0;
for (const l of all) {
  const url = SITE + "property/" + encodeURIComponent(l.slug) + "/";
  const title = `${l.title} · ${l.area} · Novi Widiyawati`;
  const desc = clip(l.summary || l.description || l.title, 158);
  const photo = (l.photos || []).map(img).find(Boolean);
  const listing = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: l.title, description: desc, url,
    image: (l.photos || []).map(img).filter(Boolean).slice(0, 8).map(abs),
    offers: { "@type": "Offer", price: num(l.price), priceCurrency: "IDR", availability: /sold/i.test(l.status || "") ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      seller: { "@type": "RealEstateAgent", name: "Novi Widiyawati", url: SITE } },
    about: { "@type": l.type === "Apartment" ? "Apartment" : "House", name: l.title,
      address: { "@type": "PostalAddress", addressLocality: l.area, addressRegion: "Bali", addressCountry: "ID" },
      numberOfBedrooms: l.bed || undefined, numberOfBathroomsTotal: l.bath || undefined,
      floorSize: sqm(l.building) ? { "@type": "QuantitativeValue", value: sqm(l.building), unitCode: "MTK" } : undefined }
  };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: SITE },
    { "@type": "ListItem", position: 2, name: "Listings", item: SITE + "listings" },
    { "@type": "ListItem", position: 3, name: l.title, item: url } ] };
  const head = `<base href="/">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(l.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
${photo ? `<meta property="og:image" content="${abs(photo)}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
${ld(listing)}
${ld(crumbs)}`;
  let page = tpl
    .replace(/<meta name="robots" content="noindex">\n?/, "")
    .replace(/<title>[\s\S]*?<\/title>\n?/, "")
    .replace(/<meta name="description"[^>]*>\n?/, "")
    .replace(/(<meta name="viewport"[^>]*>)/, `$1\n${head}`)
    .replace(/<main class="wrap" id="main">[\s\S]*?<\/main>/, `<main class="wrap" id="main">${renderMain(l, all)}</main>`)
    .replace(/<script>\n?const esc=|<script>\n?\/\*RENDER-START\*\//, m => `<script>window.__SLUG__=${JSON.stringify(l.slug)};</script>\n` + m);
  if (!page.includes("window.__SLUG__")) throw new Error("could not inject slug for " + l.slug);
  wr(`property/${l.slug}/index.html`, page);
  n++;
}

// Pre-render the cards on the All listings page so Google sees every link.
const lp = rd("listings.html");
const grid = all.map(cardHTML).join("");
const lp2 = lp.replace(/<div class="lgrid" id="grid">[\s\S]*?<\/div><\/div>/, `<div class="lgrid" id="grid">${grid}</div>`);
if (lp2 === lp) console.warn("listings grid marker not found; leaving listings.html as is");
wr("listings.html", lp2);

// Sitemap
const today = new Date().toISOString().slice(0, 10);
const urls = [SITE, SITE + "listings", ...all.map(l => SITE + "property/" + encodeURIComponent(l.slug) + "/")];
wr("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);

console.log(`Generated ${n} property pages + sitemap.xml (${urls.length} URLs)`);
