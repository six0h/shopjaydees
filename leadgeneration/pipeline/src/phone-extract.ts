/**
 * Deterministic phone-number extraction from scraped company web pages.
 *
 * Ported from the standalone enrichment run validated across 100+ prospect
 * sites. Uses NANP validation, tel:-link priority, and guards against the
 * common false-positive sources (doubled numbers printed without a separator,
 * digit runs inside image-hash filenames, unassigned/service area codes).
 *
 * Pure and side-effect free so it can be unit-tested in isolation.
 */

export interface ScrapedPage {
  /** Source URL of the page (used to attribute where a number was found). */
  url: string;
  /** Markdown body returned by Firecrawl. */
  markdown: string;
  /** Hyperlinks returned by Firecrawl's "links" format (includes tel: links). */
  links?: string[];
}

export interface ExtractedPhones {
  /** Best single main/company line, e.g. "(604) 855-4214". Empty if none found. */
  companyPhone: string;
  /** Other plausible business lines (same area code or toll-free), "; "-joined. */
  otherPhoneLines: string;
  /** The named contact's cell/mobile, if explicitly labelled near their full name. */
  mobile: string;
  /** The named contact's extension digits, if found near their full name. */
  extension: string;
}

// Area & exchange must start 2-9 (enforced by the pattern); letter boundaries
// reject digit runs embedded in hashes/IDs; separators allow " - " style gaps.
const PHONE =
  /(?<![\dA-Za-z])(?:\+?1[\s.\-]{0,2})?\(?([2-9]\d{2})\)?[\s.\-]{0,3}([2-9]\d{2})[\s.\-]{0,3}(\d{4})(?![\dA-Za-z])/g;
const EXT = /(?:ext|extension)\.?\s*(\d{1,5})/i;
const FAX = /fax/i;
const PERSON_LABEL = /\b(cell|mobile|direct)\b/i;
const TOLLFREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);

function validNanp(area: string, exchange: string): boolean {
  // Reject N11 service codes (211, 311, 411, 511, 611, 711, 811, 911) in either slot.
  return area.slice(1, 3) !== "11" && exchange.slice(1, 3) !== "11";
}

/**
 * True when the match at `offset` is really the tail of a preceding dashed/dotted
 * digit run — e.g. a number printed twice without a separator:
 * "833-322-2722833-322-2722" would otherwise yield a phantom "322-272-2833".
 */
function isContinuation(text: string, offset: number): boolean {
  if (offset < 2) return false;
  const prev = text[offset - 1];
  return (prev === "-" || prev === ".") && /\d/.test(text[offset - 2]);
}

function fmt(area: string, exchange: string, line: string): string {
  return `(${area}) ${exchange}-${line}`;
}

interface Occurrence {
  canon: string;
  area: string;
  exchange: string;
  line: string;
  tel: boolean;
  fax: boolean;
  ext: string;
  url: string;
}

function scanPage(page: ScrapedPage): Occurrence[] {
  const out: Occurrence[] = [];
  const md = page.markdown ?? "";

  // tel: links are the highest-confidence source (survive onlyMainContent stripping).
  for (const link of page.links ?? []) {
    if (typeof link !== "string" || !link.toLowerCase().startsWith("tel:")) continue;
    PHONE.lastIndex = 0;
    const m = PHONE.exec(link);
    if (m && validNanp(m[1], m[2])) {
      out.push({
        canon: m[1] + m[2] + m[3], area: m[1], exchange: m[2], line: m[3],
        tel: true, fax: false, ext: "", url: page.url,
      });
    }
  }

  PHONE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE.exec(md)) !== null) {
    const [full, area, exchange, line] = m;
    if (!validNanp(area, exchange) || isContinuation(md, m.index)) continue;
    const pre = md.slice(Math.max(0, m.index - 25), m.index);
    const post = md.slice(m.index + full.length, m.index + full.length + 16);
    const extMatch = EXT.exec(post);
    out.push({
      canon: area + exchange + line, area, exchange, line,
      tel: false, fax: FAX.test(pre), ext: extMatch ? extMatch[1] : "",
      url: page.url,
    });
  }
  return out;
}

interface PersonHit {
  canon: string;
  display: string;
  ext: string;
  label: string;
  url: string;
}

function scanPerson(pages: ScrapedPage[], contactName: string): PersonHit[] {
  const full = contactName.trim().toLowerCase();
  if (!full) return [];
  const NEAR = 70;
  const hits: PersonHit[] = [];
  for (const page of pages) {
    const md = page.markdown ?? "";
    const low = md.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = low.indexOf(full, from);
      if (idx < 0) break;
      from = idx + full.length;
      const lo = Math.max(0, idx - NEAR);
      const hi = idx + full.length + NEAR;
      const win = md.slice(lo, hi);
      PHONE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PHONE.exec(win)) !== null) {
        const [fullMatch, area, exchange, line] = m;
        if (!validNanp(area, exchange) || isContinuation(win, m.index)) continue;
        const label = PERSON_LABEL.exec(win.slice(Math.max(0, m.index - 26), m.index));
        const extMatch = EXT.exec(win.slice(m.index + fullMatch.length, m.index + fullMatch.length + 16));
        if (!label && !extMatch) continue; // require an explicit signal, not mere proximity
        hits.push({
          canon: area + exchange + line,
          display: fmt(area, exchange, line),
          ext: extMatch ? extMatch[1] : "",
          label: label ? label[1].toLowerCase() : "",
          url: page.url,
        });
      }
    }
  }
  return hits;
}

export function extractPhones(pages: ScrapedPage[], contactName: string): ExtractedPhones {
  const result: ExtractedPhones = { companyPhone: "", otherPhoneLines: "", mobile: "", extension: "" };

  const occ = pages.flatMap(scanPage);
  interface Agg {
    area: string; exchange: string; line: string;
    tel: boolean; fax: boolean; count: number; url: string;
  }
  const agg = new Map<string, Agg>();
  for (const o of occ) {
    const g = agg.get(o.canon);
    if (!g) {
      agg.set(o.canon, {
        area: o.area, exchange: o.exchange, line: o.line,
        tel: o.tel, fax: o.fax, count: 1, url: o.url,
      });
    } else {
      g.count += 1;
      g.tel = g.tel || o.tel;
      g.fax = g.fax || o.fax;
      if (o.tel) g.url = o.url;
    }
  }

  // Split fax (labelled fax and never a tel: link) from voice lines.
  const voice: Agg[] = [];
  const faxes: Agg[] = [];
  for (const g of agg.values()) {
    if (g.fax && !g.tel) faxes.push(g);
    else voice.push(g);
  }
  // Rank: tel: link first, then frequency.
  voice.sort((a, b) => (a.tel === b.tel ? b.count - a.count : a.tel ? -1 : 1));

  if (voice.length > 0) {
    const primary = voice[0];
    result.companyPhone = fmt(primary.area, primary.exchange, primary.line);
    const keepArea = new Set<string>([primary.area, ...TOLLFREE]);
    const others: string[] = [];
    for (const g of voice.slice(1)) {
      if (keepArea.has(g.area)) others.push(fmt(g.area, g.exchange, g.line));
    }
    for (const g of faxes) {
      if (keepArea.has(g.area)) others.push(`${fmt(g.area, g.exchange, g.line)} (fax)`);
    }
    result.otherPhoneLines = [...new Set(others)].join("; ");
  }

  // Person-level: mobile via cell/mobile label, extension via explicit ext, near the full name.
  for (const h of scanPerson(pages, contactName)) {
    if (h.ext && !result.extension) result.extension = h.ext;
    if ((h.label === "cell" || h.label === "mobile") && !result.mobile) result.mobile = h.display;
  }

  return result;
}
