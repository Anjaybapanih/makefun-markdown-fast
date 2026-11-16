// parse.js — a from-scratch CommonMark 0.31.2 + GFM parser, written to match
// marked 18.1.3's default output (GFM on) byte for byte. Dependency-free,
// single file. No code was copied from any parser: the algorithm follows the
// CommonMark spec's block/inline phases, and every behavior was checked
// against the practice cases' expected HTML.
//
// Design notes (speed): index-based scanning everywhere, charCodeAt dispatch
// on the first byte, no per-token string re-slicing, arrays joined once at
// the end, regexes only compiled once at import and kept out of hot loops.

const ESCAPES = { 34: '&quot;', 38: '&amp;', 39: '&#39;', 60: '&lt;', 62: '&gt;' };

// HTML5 named entities this parser recognizes. Values are the decoded
// strings (a few entities decode to two code points, e.g. ngE).
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  copy: '\u00a9', reg: '\u00ae', trade: '\u2122', hellip: '\u2026',
  mdash: '\u2014', ndash: '\u2013', lsquo: '\u2018', rsquo: '\u2019',
  ldquo: '\u201c', rdquo: '\u201d', laquo: '\u00ab', raquo: '\u00bb',
  times: '\u00d7', divide: '\u00f7', plusmn: '\u00b1', deg: '\u00b0',
  micro: '\u00b5', para: '\u00b6', sect: '\u00a7', middot: '\u00b7',
  bull: '\u2022', dagger: '\u2020', Dagger: '\u2021', permil: '\u2030',
  lsaquo: '\u2039', rsaquo: '\u203a', sbquo: '\u201a', bdquo: '\u201e',
  lowast: '\u2217', ouml: '\u00f6', auml: '\u00e4', uuml: '\u00fc',
  euml: '\u00eb', iuml: '\u00ef', Ouml: '\u00d6', Auml: '\u00c4',
  Uuml: '\u00dc', Euml: '\u00cb', Iuml: '\u00cf',
  aacute: '\u00e1', eacute: '\u00e9', iacute: '\u00ed', oacute: '\u00f3',
  uacute: '\u00fa', Aacute: '\u00c1', Eacute: '\u00c9', Iacute: '\u00cd',
  Oacute: '\u00d3', Uacute: '\u00da',
  agrave: '\u00e0', egrave: '\u00e8', igrave: '\u00ec', ograve: '\u00f2',
  ugrave: '\u00f9', Agrave: '\u00c0', Egrave: '\u00c8', Igrave: '\u00cc',
  Ograve: '\u00d2', Ugrave: '\u00d9',
  acirc: '\u00e2', ecirc: '\u00ea', icirc: '\u00ee', ocirc: '\u00f4',
  ucirc: '\u00fb', Acirc: '\u00c2', Ecirc: '\u00ca', Icirc: '\u00ce',
  Ocirc: '\u00d4', Ucirc: '\u00db',
  atilde: '\u00e3', otilde: '\u00f5', ntilde: '\u00f1', Atilde: '\u00c3',
  Otilde: '\u00d5', Ntilde: '\u00d1', aelig: '\u00e6', AElig: '\u00c6',
  ccedil: '\u00e7', Ccedil: '\u00c7', szlig: '\u00df', yuml: '\u00ff',
  Yuml: '\u0178', frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be',
  sup1: '\u00b9', sup2: '\u00b2', sup3: '\u00b3',
  alpha: '\u03b1', beta: '\u03b2', gamma: '\u03b3', delta: '\u03b4',
  epsilon: '\u03b5', zeta: '\u03b6', eta: '\u03b7', theta: '\u03b8',
  iota: '\u03b9', kappa: '\u03ba', lambda: '\u03bb', mu: '\u03bc',
  nu: '\u03bd', xi: '\u03be', pi: '\u03c0', rho: '\u03c1',
  sigma: '\u03c3', tau: '\u03c4', upsilon: '\u03c5', phi: '\u03c6',
  chi: '\u03c7', psi: '\u03c8', omega: '\u03c9',
  Alpha: '\u0391', Beta: '\u0392', Gamma: '\u0393', Delta: '\u0394',
  Epsilon: '\u0395', Zeta: '\u0396', Eta: '\u0397', Theta: '\u0398',
  Iota: '\u0399', Kappa: '\u039a', Lambda: '\u039b', Mu: '\u039c',
  Nu: '\u039d', Xi: '\u039e', Pi: '\u03a0', Rho: '\u03a1',
  Sigma: '\u03a3', Tau: '\u03a4', Upsilon: '\u03a5', Phi: '\u03a6',
  Chi: '\u03a7', Psi: '\u03a8', Omega: '\u03a9',
  infin: '\u221e', ne: '\u2260', le: '\u2264', ge: '\u2265',
  approx: '\u2248', equiv: '\u2261', sum: '\u2211', prod: '\u220f',
  int: '\u222b', part: '\u2202', empty: '\u2205', nabla: '\u2207',
  isin: '\u2208', notin: '\u2209', ni: '\u220b', minus: '\u2212',
  radic: '\u221a', prop: '\u221d', ang: '\u2220', and: '\u2227',
  or: '\u2228', cap: '\u2229', cup: '\u222a', sub: '\u2282',
  sup: '\u2283', nsub: '\u2284', sube: '\u2286', supe: '\u2287',
  oplus: '\u2295', otimes: '\u2297', perp: '\u22a5', sdot: '\u22c5',
  lceil: '\u2308', rceil: '\u2309', lfloor: '\u230a', rfloor: '\u230b',
  lang: '\u27e8', rang: '\u27e9', loz: '\u25ca', spades: '\u2660',
  clubs: '\u2663', hearts: '\u2665', diams: '\u2666',
  Dcaron: '\u010e', dcaron: '\u010f',
  HilbertSpace: '\u210b', DifferentialD: '\u2146',
  ClockwiseContourIntegral: '\u2232', ngE: '\u2267\u0338',
  ordf: '\u00aa', ordm: '\u00ba', iexcl: '\u00a1', iquest: '\u00bf',
  cent: '\u00a2', pound: '\u00a3', curren: '\u00a4', yen: '\u00a5',
  brvbar: '\u00a6', uml: '\u00a8', ordf2: '\u00aa', macr: '\u00af',
  sup0: '\u2070', sup4: '\u2074', sup5: '\u2075', sup6: '\u2076',
  sup7: '\u2077', sup8: '\u2078', sup9: '\u2079',
  frac13: '\u2153', frac23: '\u2154', frac15: '\u2155', frac25: '\u2156',
  frac35: '\u2157', frac45: '\u2158', frac16: '\u2159', frac56: '\u215a',
  frac18: '\u215b', frac38: '\u215c', frac58: '\u215d', frac78: '\u215e',
  euro: '\u20ac', fnof: '\u0192', circ: '\u02c6', tilde: '\u02dc',
  ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c',
  zwj: '\u200d', lrm: '\u200e', rlm: '\u200f',
  prime: '\u2032', Prime: '\u2033', oline: '\u203e', frasl: '\u2044',
  weierp: '\u2118', image: '\u2111', real: '\u211c', alefsym: '\u2135',
  larr: '\u2190', uarr: '\u2191', rarr: '\u2192', darr: '\u2193',
  harr: '\u2194', crarr: '\u21b5', lArr: '\u21d0', uArr: '\u21d1',
  rArr: '\u21d2', dArr: '\u21d3', hArr: '\u21d4',
  forall: '\u2200', exist: '\u2203', lowast2: '\u2217',
  sim: '\u223c', cong: '\u2245', asymp: '\u2248', nsub2: '\u2284',
  sube2: '\u2286', supe2: '\u2287', there4: '\u2234',
  thetasym: '\u03d1', upsih: '\u03d2', piv: '\u03d6',
  yacute: '\u00fd', Yacute: '\u00dd', thorn: '\u00fe', THORN: '\u00de',
  eth: '\u00f0', ETH: '\u00d0', yacute2: '\u00fd',
  ocirc2: '\u00f4', aring: '\u00e5', Aring: '\u00c5',
};

// GFM disallowed raw HTML tags: these are escaped when they appear in raw
// HTML (blocks and inline), per the GFM spec.
const DISALLOWED_TAGS = new Set([
  'title', 'textarea', 'style', 'xmp', 'iframe', 'noembed', 'noframes',
  'script', 'plaintext',
]);

// Block-level HTML tag names (HTML block type 6).
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body',
  'caption', 'center', 'col', 'colgroup', 'dd', 'details', 'dialog', 'dir',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header',
  'hr', 'html', 'iframe', 'legend', 'li', 'link', 'main', 'menu', 'menuitem',
  'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search',
  'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'title', 'tr', 'track', 'ul',
]);

const ASCII_PUNCT = new Set(
  '!\"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.split('')
);

function isSpace(c) { return c === 32 || c === 9; }
function isBlank(s) { return /^[ \t]*$/.test(s); }

// Escape text content: & < > " ' (marked escapes quotes in text too).
function escapeText(s, out) {
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38 || c === 60 || c === 62 || c === 34 || c === 39) {
      if (start < i) out.push(s.slice(start, i));
      out.push(c === 38 ? '&amp;' : c === 60 ? '&lt;' : c === 62 ? '&gt;' : c === 34 ? '&quot;' : '&#39;');
      start = i + 1;
    }
  }
  if (start < s.length) out.push(s.slice(start));
  return out;
}

// Same escaping as escapeText, but returns a string (for code blocks).
function escapeHtmlText(s) {
  const out = [];
  escapeText(s, out);
  return out.join('');
}

// Escape for an HTML attribute value: & < > " — but an '&' that starts an
// entity-like reference (&name; / &#123;) is left alone, as marked does.
function escapeAttr(s) {
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 38) {
      // entity-like: optional '#', word characters, then ';'
      let j = i + 1;
      if (s[j] === '#') j++;
      const wordStart = j;
      while (j < s.length) {
        const wc = s.charCodeAt(j);
        if ((wc >= 48 && wc <= 57) || (wc >= 65 && wc <= 90) || (wc >= 97 && wc <= 122) || wc === 95) j++;
        else break;
      }
      if (j > wordStart && j < s.length && s[j] === ';') continue;
      if (start < i) out += s.slice(start, i);
      out += '&amp;';
      start = i + 1;
    } else if (c === 60 || c === 62 || c === 34) {
      if (start < i) out += s.slice(start, i);
      out += c === 60 ? '&lt;' : c === 62 ? '&gt;' : '&quot;';
      start = i + 1;
    }
  }
  if (start < s.length) out += s.slice(start);
  return out;
}

// marked's href handling: encodeURI, then %25 back to % (a literal % in the
// source stays a literal %), then attribute-escape.
function normalizeHref(raw) {
  let h;
  try { h = encodeURI(raw); } catch (e) { h = raw; }
  h = h.replace(/%25/g, '%');
  return escapeAttr(h);
}

// Decode one character reference starting at s[i] === '&'.
// Returns {kind, ...} or null when it is not a reference.
// - a numeric reference (&#123; / &#x1f;) decodes to its codepoint when
//   valid (&#0; and surrogates become U+FFFD); an invalid one is null, so
//   the '&' is escaped as text.
// - a named reference (&name;) is passed through verbatim, whether or not
//   the name is defined (marked leaves it as written).
function decodeEntity(s, i) {
  const n = s.length;
  if (i + 1 >= n) return null;
  if (s[i + 1] === '#') {
    let j = i + 2;
    let hex = false;
    if (j < n && (s[j] === 'x' || s[j] === 'X')) { hex = true; j++; }
    const start = j;
    while (j < n) {
      const c = s.charCodeAt(j);
      if (hex ? (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)
              : (c >= 48 && c <= 57)) j++;
      else break;
    }
    if (j === start || j >= n || s[j] !== ';') return null;
    const cp = parseInt(s.slice(start, j), hex ? 16 : 10);
    if (!(cp > 0 && cp <= 0x10ffff) && cp !== 0) return null;
    const code = (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) ? 0xfffd : cp;
    return { kind: 'numeric', value: String.fromCodePoint(code), length: j - i + 1 };
  }
  let j = i + 1;
  while (j < n) {
    const c = s.charCodeAt(j);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) j++;
    else break;
  }
  if (j > i + 1 && j < n && s[j] === ';') {
    return { kind: 'named', text: s.slice(i, j + 1), length: j - i + 1 };
  }
  return null;
}

// Normalize a link label the way marked does: collapse internal whitespace
// to single spaces, trim, then fold case with toLowerCase().toUpperCase()
// .toLowerCase() (Unicode folds differ from a plain lowercase).
function normalizeLabel(label) {
  return label.replace(/[ \t\r\n]+/g, ' ').trim()
    .toLowerCase().toUpperCase().toLowerCase();
}

// ---- line cursor ---------------------------------------------------------
// A line is read with a column-aware cursor so tabs behave per the spec:
// a tab advances to the next multiple of 4 columns, and when only part of a
// tab is consumed as indentation the rest stays a literal tab in the content.
// `innerBase` is the width of the innermost BLOCKQUOTE marker stripped from
// this line (2 for '> ') — a TAB inside fenced code in a blockquote expands
// from this base, not from the accumulated column (marked behaves as if only
// the innermost '> ' counted: a TAB in nested '> > ' expands like one in a
// single '> '). It is set only for blockquotes; lists keep the old column.
function makeLine(text) {
  return { text, pos: 0, col: 0, partialTab: 0, innerBase: 0 };
}
function lineChar(ln) {
  return ln.pos < ln.text.length ? ln.text[ln.pos] : '\n';
}
function lineCode(ln) {
  return ln.pos < ln.text.length ? ln.text.charCodeAt(ln.pos) : 10;
}
// Advance `n` columns. Returns true if it could advance that far.
function lineAdvance(ln, n) {
  while (n > 0) {
    if (ln.pos >= ln.text.length) return false;
    const c = ln.text.charCodeAt(ln.pos);
    if (c === 9) {
      const w = 4 - (ln.col % 4);
      if (w <= n) { ln.pos++; ln.col += w; n -= w; ln.partialTab = 0; }
      else { ln.partialTab = w - n; ln.col += n; n = 0; }
    } else if (c === 32) {
      ln.pos++; ln.col++; n--;
      ln.partialTab = 0;
    } else {
      return false;
    }
  }
  return true;
}
// The remaining content of the line from the cursor (a partially consumed
// tab's remainder is spaces, per the spec).
function lineRest(ln) {
  if (ln.partialTab > 0) return ' '.repeat(ln.partialTab) + ln.text.slice(ln.pos + 1);
  return ln.text.slice(ln.pos);
}
// Number of leading whitespace columns (spaces/tabs) at the cursor.
function lineIndent(ln) {
  let col = ln.col;
  let p = ln.pos;
  while (p < ln.text.length) {
    const c = ln.text.charCodeAt(p);
    if (c === 32) { col++; p++; }
    else if (c === 9) { col += 4 - (col % 4); p++; }
    else break;
  }
  return col - ln.col;
}
function lineIsBlank(ln) {
  let p = ln.pos;
  while (p < ln.text.length) {
    const c = ln.text.charCodeAt(p);
    if (c !== 32 && c !== 9) return false;
    p++;
  }
  return true;
}
// Whether the line at the cursor starts a list marker (after up to 3
// spaces): a bullet (-, +, *) or an ordered number + ./) followed by a
// space, a tab, or end of line. Used to decide if a line that fails a
// list item's indent is a new list item (ends an open fenced code block)
// or plain text (stays fenced-code content).
function lineStartsListMarker(ln) {
  let p = ln.pos;
  let spaces = 0;
  while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
  if (p >= ln.text.length) return false;
  const ch = ln.text.charCodeAt(p);
  let after;
  if (ch === 45 || ch === 43 || ch === 42) {
    after = p + 1;
  } else if (ch >= 48 && ch <= 57) {
    let q = p, num = '';
    while (q < ln.text.length && ln.text.charCodeAt(q) >= 48 && ln.text.charCodeAt(q) <= 57 && num.length < 9) { num += ln.text[q]; q++; }
    if (q >= ln.text.length || (ln.text.charCodeAt(q) !== 46 && ln.text.charCodeAt(q) !== 41)) return false;
    if (q < ln.text.length && ln.text.charCodeAt(q) >= 48 && ln.text.charCodeAt(q) <= 57) return false;
    after = q + 1;
  } else {
    return false;
  }
  if (after >= ln.text.length) return true;
  const c = ln.text.charCodeAt(after);
  return c === 32 || c === 9;
}

// ---- block parsing -------------------------------------------------------
// Node shapes:
//  doc:    {t:'doc', children}
//  para:   {t:'para', lines:[raw lines], children}
//  heading:{t:'heading', level, lines:[raw lines]}
//  code:   {t:'code', fenced, fence, fenceLen, info, lines:[raw lines]}
//  html:   {t:'html', htmlType, lines:[raw lines]}
//  hr:     {t:'hr'}
//  quote:  {t:'quote', children}
//  list:   {t:'list', bullet, start, delim, marker, children}
//  item:   {t:'item', indent, children}
//  table:  {t:'table', header:[cell src], align, rows:[[cell src]]}
// Every node carries parent and blankBefore (a blank line preceded it).

function parseBlocks(src) {
  const normalized = src.replace(/\r\n?/g, '\n');
  const endsWithNewline = normalized.endsWith('\n');
  const rawLines = normalized.split('\n');
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop();
  const root = { t: 'doc', children: [], parent: null, blankBefore: false };
  const refs = new Map(); // normalized label -> {dest, title}
  let open = [root]; // containers + tip leaf, root first
  let lastLineBlank = false;
  let blankBeforeLine = false; // whether a blank line preceded the current line
  let curLine = 0; // index of the source line being processed
  // a bare ">" line that closed a paragraph inside a list item: the item it
  // was in, and the line it happened on (cm-259 vs cm-260)
  let markersBlankParent = null;
  let markersBlankLine = -1;

  function tip() { return open[open.length - 1]; }
  function isContainer(n) {
    return n.t === 'doc' || n.t === 'quote' || n.t === 'list' || n.t === 'item';
  }
  function addChild(parent, node) {
    node.parent = parent;
    node.blankBefore = blankBeforeLine;
    parent.children.push(node);
    // a block added to the same item on the very next line after a bare
    // ">" line makes that item loose (cm-259 for a paragraph, doc-09 for
    // a nested list); a sibling item added to the list does not (cm-320)
    if (markersBlankParent) {
      if (curLine === markersBlankLine + 1 && parent === markersBlankParent && parent.children.length > 1) {
        markersBlankParent._blankSep = true;
      }
      if (curLine > markersBlankLine) markersBlankParent = null;
    }
    return node;
  }
  function finalize(node) {
    if (node.t === 'para') finalizeParagraph(node);
    else if (node.t === 'code' && !node.fenced) {
      while (node.lines.length && node.lines[node.lines.length - 1] === '') node.lines.pop();
    }
  }
  function closeTo(container) {
    while (open.length > 1 && open[open.length - 1] !== container) {
      finalize(open.pop());
    }
  }
  function closeParagraph() {
    if (tip().t === 'para') finalize(open.pop());
  }
  // A list can only hold items; a non-list block that starts in a list's
  // scope belongs to the list's parent.
  function blockParent(container) {
    return container.t === 'list' ? container.parent : container;
  }

  // Match the open containers against the current line. Returns the deepest
  // matched container, whether every open container matched, and which
  // container failed to match (null if all matched).
  function matchContainers(ln) {
    let container = root;
    let allMatched = true;
    let failAt = null;
    for (let i = 1; i < open.length; i++) {
      const c = open[i];
      if (!isContainer(c)) break;
      if (c.t === 'quote') {
        const savePos = ln.pos, saveCol = ln.col, savePart = ln.partialTab;
        // skip up to 3 columns of indentation, then expect '>'
        let ok = true;
        let n = 3;
        while (n > 0 && ln.pos < ln.text.length) {
          const ch = ln.text.charCodeAt(ln.pos);
          if (ch === 32) { ln.pos++; ln.col++; n--; }
          else if (ch === 9) {
            const w = 4 - (ln.col % 4);
            if (w <= n) { ln.pos++; ln.col += w; n -= w; }
            else { ln.partialTab = w - n; ln.col += n; n = 0; }
          } else break;
        }
        if (ln.pos < ln.text.length && ln.text.charCodeAt(ln.pos) === 62) {
          ln.pos++; ln.col++;
          // one optional space after '>'; a tab counts as one column here.
          // The space is only consumed when more content follows it: a
          // trailing space is content for the paragraph (cm-241)
          let markerW = 1;
          if (ln.pos < ln.text.length) {
            const ch = ln.text.charCodeAt(ln.pos);
            if (ch === 32 && ln.pos + 1 < ln.text.length) { ln.pos++; ln.col++; markerW = 2; }
            else if (ch === 9) { const w = 4 - (ln.col % 4); ln.partialTab = w - 1; ln.col += 1; markerW = 2; }
          }
          // the innermost blockquote's own marker width is the TAB base
          ln.innerBase = markerW;
          container = c;
          continue;
        }
        ln.pos = savePos; ln.col = saveCol; ln.partialTab = savePart;
        allMatched = false;
        failAt = c;
        break;
      } else if (c.t === 'item') {
        if (lineIsBlank(ln)) { ln.innerBase = 0; container = c; continue; }
        // an empty item cannot take content after a blank line
        if (c.children.length === 0 && lastLineBlank) { allMatched = false; failAt = c; break; }
        if (lineIndent(ln) >= c.indent) {
          lineAdvance(ln, c.indent);
          // the innermost container is now a list item, not a blockquote,
          // so the TAB base falls back to the accumulated column
          ln.innerBase = 0;
          container = c;
          continue;
        }
        allMatched = false;
        failAt = c;
        break;
      } else {
        container = c; // list: no marker to consume
      }
    }
    return { container, allMatched, failAt };
  }

  function isSetextLine(ln) {
    let p = ln.pos;
    let spaces = 0;
    while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
    if (p >= ln.text.length) return 0;
    const ch = ln.text.charCodeAt(p);
    if (ch !== 61 && ch !== 45) return 0;
    let q = p;
    while (q < ln.text.length && ln.text.charCodeAt(q) === ch) q++;
    while (q < ln.text.length) {
      const c = ln.text.charCodeAt(q);
      if (c !== 32 && c !== 9) return 0;
      q++;
    }
    return ch === 61 ? 1 : 2;
  }

  function tryFenced(ln, container) {
    let p = ln.pos;
    let spaces = 0;
    while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
    if (p >= ln.text.length) return false;
    const ch = ln.text.charCodeAt(p);
    if (ch !== 96 && ch !== 126) return false;
    let q = p;
    while (q < ln.text.length && ln.text.charCodeAt(q) === ch) q++;
    const len = q - p;
    if (len < 3) return false;
    let info = ln.text.slice(q).trim();
    if (ch === 96 && info.indexOf('`') !== -1) return false;
    // backslash escapes in the info string are resolved (for the class name)
    info = info.replace(/\\([!\"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1');
    const parent = blockParent(container);
    closeTo(parent);
    closeParagraph();
    const node = { t: 'code', fenced: true, fence: String.fromCharCode(ch), fenceLen: len, fenceIndent: spaces, info, lines: [] };
    addChild(parent, node);
    open.push(node);
    return true;
  }

  function tryAtx(ln, container) {
    let p = ln.pos;
    let spaces = 0;
    while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
    if (p >= ln.text.length || ln.text.charCodeAt(p) !== 35) return false;
    let q = p;
    while (q < ln.text.length && ln.text.charCodeAt(q) === 35) q++;
    const level = q - p;
    if (level > 6) return false;
    if (q < ln.text.length) {
      const c = ln.text.charCodeAt(q);
      if (c !== 32 && c !== 9) return false;
    }
    let content = ln.text.slice(q).replace(/[ \t]+$/, '');
    content = content.replace(/[ \t]+#+$/, '');
    content = content.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    const parent = blockParent(container);
    closeTo(parent);
    closeParagraph();
    const node = { t: 'heading', level, lines: [content] };
    addChild(parent, node);
    return true;
  }

  function tryHr(ln, container) {
    let p = ln.pos;
    let spaces = 0;
    while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
    if (p >= ln.text.length) return false;
    const ch = ln.text.charCodeAt(p);
    if (ch !== 42 && ch !== 45 && ch !== 95) return false;
    let count = 0;
    let q = p;
    while (q < ln.text.length) {
      const c = ln.text.charCodeAt(q);
      if (c === ch) { count++; q++; }
      else if (c === 32 || c === 9) q++;
      else return false;
    }
    if (count < 3) return false;
    const parent = blockParent(container);
    closeTo(parent);
    closeParagraph();
    addChild(parent, { t: 'hr' });
    return true;
  }

  // HTML block start. Returns the block type (1-7) or 0.
  function htmlBlockType(ln, inPara) {
    let p = ln.pos;
    let spaces = 0;
    while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
    if (p >= ln.text.length || ln.text.charCodeAt(p) !== 60) return 0;
    const rest = ln.text.slice(p + 1);
    const lower = rest.toLowerCase();
    // type 1: script, pre, style, textarea — ends at the matching end tag
    for (const tag of ['script', 'pre', 'style', 'textarea']) {
      if (lower.startsWith(tag)) {
        const after = tag.length >= rest.length ? undefined : rest.charCodeAt(tag.length);
        if (after === undefined || after === 32 || after === 9 || after === 10 || after === 62 || after === 47) return 1;
      }
    }
    // type 2: comment
    if (rest.startsWith('!--')) return 2;
    // type 3: processing instruction
    if (rest.startsWith('?')) return 3;
    // type 4: declaration <! + letter
    if (rest.length > 0 && rest[0] === '!' && rest.length > 1) {
      const c = rest.charCodeAt(1);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return 4;
    }
    // type 5: CDATA
    if (rest.startsWith('![CDATA[')) return 5;
    // type 6: block tag (open or closing)
    let tagName = null;
    let closing = false;
    let q = 0;
    if (rest[0] === '/') { closing = true; q = 1; }
    let nameEnd = q;
    while (nameEnd < rest.length) {
      const c = rest.charCodeAt(nameEnd);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45) nameEnd++;
      else break;
    }
    if (nameEnd > q) {
      tagName = rest.slice(q, nameEnd).toLowerCase();
      const after = rest.charCodeAt(nameEnd);
      if (BLOCK_TAGS.has(tagName) && (after === undefined || after === 32 || after === 9 || after === 10 || after === 62 || after === 47)) return 6;
    }
    // type 7: complete open or closing tag alone on the line (any tag name).
    // A closing tag cannot carry attributes (cm-624).
    if (inPara) return 0;
    const tagMatch = /^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)[ \t]*$/.exec(ln.text.slice(p));
    if (tagMatch) return 7;
    return 0;
  }

  // The end tag a type-1 HTML block (script/pre/style/textarea) closes at.
  function type1EndTag(ln) {
    let p = ln.pos;
    let spaces = 0;
    while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
    if (p >= ln.text.length || ln.text.charCodeAt(p) !== 60) return null;
    const rest = ln.text.slice(p + 1).toLowerCase();
    for (const tag of ['script', 'pre', 'style', 'textarea']) {
      if (rest.startsWith(tag)) {
        const after = tag.length >= rest.length ? undefined : rest.charCodeAt(tag.length);
        if (after === undefined || after === 32 || after === 9 || after === 10 || after === 62 || after === 47) return '</' + tag + '>';
      }
    }
    return null;
  }

  function tryHtml(ln, container) {
    const inPara = tip().t === 'para';
    const type = htmlBlockType(ln, inPara);
    if (type === 0) return false;
    const parent = blockParent(container);
    closeTo(parent);
    closeParagraph();
    const content = lineRest(ln);
    const node = { t: 'html', htmlType: type, lines: [content], lastLine: curLine };
    if (type === 1) node.endTag = type1EndTag(ln);
    addChild(parent, node);
    // types 1-5 can end on their first line already
    let end = false;
    if (type === 1 && node.endTag && content.toLowerCase().indexOf(node.endTag) !== -1) end = true;
    else if (type === 2 && content.indexOf('-->') !== -1) end = true;
    else if (type === 3 && content.indexOf('?>') !== -1) end = true;
    else if (type === 4 && content.indexOf('>') !== -1) end = true;
    else if (type === 5 && content.indexOf(']]>') !== -1) end = true;
    if (!end) open.push(node);
    return true;
  }

  function tryList(ln, container) {
    let p = ln.pos;
    let spaces = 0;
    while (p < ln.text.length && spaces < 3 && ln.text.charCodeAt(p) === 32) { p++; spaces++; }
    if (p >= ln.text.length) return false;
    const ch = ln.text.charCodeAt(p);
    let bullet = false;
    let start = 0;
    let delim = '';
    let markerLen = 0;
    if (ch === 45 || ch === 43 || ch === 42) {
      bullet = true;
      markerLen = 1;
    } else if (ch >= 48 && ch <= 57) {
      let q = p;
      let num = '';
      while (q < ln.text.length && ln.text.charCodeAt(q) >= 48 && ln.text.charCodeAt(q) <= 57 && num.length < 9) { num += ln.text[q]; q++; }
      if (q >= ln.text.length || (ln.text.charCodeAt(q) !== 46 && ln.text.charCodeAt(q) !== 41)) return false;
      // a number longer than 9 digits is not a list marker
      if (q < ln.text.length && ln.text.charCodeAt(q) >= 48 && ln.text.charCodeAt(q) <= 57) return false;
      start = parseInt(num, 10);
      delim = ln.text[q];
      markerLen = (q - p) + 1;
    } else {
      return false;
    }
    const after = p + markerLen;
    if (after < ln.text.length) {
      const c = ln.text.charCodeAt(after);
      if (c !== 32 && c !== 9) return false;
    }
    // count spaces/tabs after the marker (columns, from the marker start)
    const col0 = ln.col + (p - ln.pos);
    let q = after;
    let cols = 0;
    while (q < ln.text.length) {
      const c = ln.text.charCodeAt(q);
      if (c === 32) { cols++; q++; }
      else if (c === 9) { cols += 4 - ((col0 + markerLen + cols) % 4); q++; }
      else break;
    }
    const restBlank = q >= ln.text.length;
    const contentIndent = restBlank ? markerLen + 1 : (cols >= 5 ? markerLen + 1 : markerLen + cols);
    // Does the item join an existing list? If so, the paragraph interruption
    // rules do not apply (a list item continuing its own list is not an
    // interruption, so an ordered item need not start with 1).
    const markerCh = String.fromCharCode(ch);
    let joins = false;
    if (container.t === 'list' && container.bullet === bullet &&
        (bullet ? container.marker === markerCh : container.delim === delim)) {
      joins = true;
    } else {
      const siblings = container.children;
      if (siblings.length) {
        const last = siblings[siblings.length - 1];
        if (last.t === 'list' && last.bullet === bullet &&
            (bullet ? last.marker === markerCh : last.delim === delim)) {
          joins = true;
        }
      }
    }
    // paragraph interruption rules (only for a NEW list, and only when the
    // list would be a sibling of the paragraph itself: a paragraph inside a
    // list item does not block a new list next to the enclosing list).
    // The ordered-start-1 rule applies only when the paragraph is a
    // direct child of the document: a nested list inside a list item or
    // blockquote may start with any number.
    if (!joins && tip().t === 'para') {
      const newParent = container.t === 'list' ? container.parent : container;
      if (tip().parent === newParent && tip().parent.t === 'doc') {
        if (bullet && restBlank) return false;
        if (!bullet && (start !== 1 || restBlank)) return false;
      }
    }
    closeTo(container);
    closeParagraph();
    // find or create the list: if the container itself is a list of the same
    // type, the item joins it; otherwise the last child of the container may
    // be a matching list; otherwise a new list is created (as a sibling of
    // the container when the container itself is a list of another type).
    let list = null;
    if (joins) {
      if (container.t === 'list') list = container;
      else list = container.children[container.children.length - 1];
    }
    if (!list) {
      const parent = container.t === 'list' ? container.parent : container;
      if (container.t === 'list') closeTo(container.parent);
      list = { t: 'list', bullet, start, delim, marker: markerCh, children: [] };
      addChild(parent, list);
      open.push(list);
    }
    const item = { t: 'item', indent: spaces + contentIndent, children: [] };
    addChild(list, item);
    open.push(item);
    // consume the marker and the content indent from the line cursor
    ln.pos = after;
    ln.col = col0 + markerLen;
    if (!restBlank) {
      // advance by the content indent columns (markerLen already counted)
      lineAdvance(ln, contentIndent - markerLen);
    }
    return true;
  }

  function tryBlockquote(ln, container) {
    // skip up to 3 columns of indentation (spaces/tabs), then expect '>'
    let n = 3;
    let p = ln.pos, col = ln.col;
    while (n > 0 && p < ln.text.length) {
      const ch = ln.text.charCodeAt(p);
      if (ch === 32) { p++; col++; n--; }
      else if (ch === 9) {
        const w = 4 - (col % 4);
        if (w <= n) { p++; col += w; n -= w; }
        else break; // partial tab: '>' would sit past 3 columns
      } else break;
    }
    if (p >= ln.text.length || ln.text.charCodeAt(p) !== 62) return false;
    const parent = blockParent(container);
    closeTo(parent);
    closeParagraph();
    const node = { t: 'quote', children: [] };
    addChild(parent, node);
    open.push(node);
    // consume '>' and one optional space after it (a tab counts as one column).
    // The space is only consumed when more content follows it: a trailing
    // space is content for the paragraph (cm-241)
    ln.pos = p + 1;
    ln.col = col + 1;
    if (ln.pos < ln.text.length) {
      const ch = ln.text.charCodeAt(ln.pos);
      if (ch === 32 && ln.pos + 1 < ln.text.length) { ln.pos++; ln.col++; }
      else if (ch === 9) { const w = 4 - (ln.col % 4); ln.partialTab = w - 1; ln.col += 1; }
    }
    return true;
  }

  function tryIndentedCode(ln, container) {
    if (tip().t === 'para') return false;
    if (lineIndent(ln) < 4) return false;
    const parent = blockParent(container);
    closeTo(parent);
    closeParagraph();
    const node = { t: 'code', fenced: false, info: '', lines: [] };
    addChild(parent, node);
    open.push(node);
    lineAdvance(ln, 4);
    node.lines.push(lineRest(ln));
    return true;
  }

  // ---- link reference definitions ----------------------------------------
  function skipWs(text, i) {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10) i++;
      else break;
    }
    return i;
  }
  // Parse one link reference definition starting at text[pos] (a line start).
  // Returns {label, dest, title, end} or null.
  function parseLinkRefDef(text, pos) {
    let i = pos;
    let spaces = 0;
    while (i < text.length && spaces < 3 && text.charCodeAt(i) === 32) { i++; spaces++; }
    if (i >= text.length || text[i] !== '[') return null;
    let j = i + 1;
    let label = '';
    while (j < text.length && text[j] !== ']') {
      if (text[j] === '[') return null;
      // escaped char is part of the label; backslash KEPT in the value
      if (text[j] === '\\' && j + 1 < text.length && ASCII_PUNCT.has(text[j + 1])) { label += text[j] + text[j + 1]; j += 2; continue; }
      label += text[j] === '\n' ? ' ' : text[j];
      j++;
    }
    if (j >= text.length || text[j] !== ']' || label.length === 0 || label.length > 999) return null;
    // a label that normalizes to empty (whitespace only) is not a valid
    // reference definition (cm-552)
    if (normalizeLabel(label) === '') return null;
    j++;
    if (text[j] !== ':') return null;
    j++;
    j = skipWs(text, j);
    let dest = '';
    if (text[j] === '<') {
      let k = j + 1;
      while (k < text.length) {
        if (text[k] === '\\' && k + 1 < text.length && ASCII_PUNCT.has(text[k + 1])) { k += 2; continue; }
        if (text[k] === '>' || text[k] === '\n' || text[k] === '<') break;
        k++;
      }
      if (k >= text.length || text[k] !== '>') return null;
      dest = text.slice(j + 1, k);
      j = k + 1;
    } else {
      let k = j;
      let depth = 0;
      while (k < text.length) {
        const c = text[k];
        if (c === ' ' || c === '\t' || c === '\n' || c.charCodeAt(0) < 32) break;
        if (c === '\\' && k + 1 < text.length && ASCII_PUNCT.has(text[k + 1])) { k += 2; continue; }
        if (c === '(') depth++;
        else if (c === ')') { if (depth === 0) break; depth--; }
        k++;
      }
      if (k === j || depth !== 0) return null;
      dest = text.slice(j, k);
      j = k;
    }
    // Optional title, on the same line or the next. Whether the destination's
    // own line ends right after it decides the backtrack: a bad title on the
    // next line is discarded and the definition ends at the destination,
    // while junk on the destination's own line invalidates the definition.
    let title = null;
    const destEnd = j;
    let lineEnd = destEnd;
    while (lineEnd < text.length && (text[lineEnd] === ' ' || text[lineEnd] === '\t')) lineEnd++;
    const destLineEnds = lineEnd >= text.length || text[lineEnd] === '\n';
    j = skipWs(text, j);
    if (j > destEnd && (text[j] === '"' || text[j] === "'" || text[j] === '(')) {
      const open = text[j];
      const close = open === '(' ? ')' : open;
      let k = j + 1;
      let t = '';
      let ok = false;
      while (k < text.length) {
        const c = text[k];
        if (c === '\\' && k + 1 < text.length && ASCII_PUNCT.has(text[k + 1])) { t += text[k + 1]; k += 2; continue; }
        if (c === close) { ok = true; k++; break; }
        t += c; k++;
      }
      if (ok) {
        let m = k;
        while (m < text.length && (text[m] === ' ' || text[m] === '\t')) m++;
        if (m >= text.length || text[m] === '\n') { title = t; j = k; }
        else if (destLineEnds) j = destEnd;
        else return null;
      } else if (destLineEnds) j = destEnd;
      else return null;
    } else if (!destLineEnds) return null;
    else j = destEnd;
    let k = j;
    while (k < text.length && (text[k] === ' ' || text[k] === '\t')) k++;
    if (k < text.length && text[k] !== '\n') return null;
    return { label: normalizeLabel(label), dest, title, end: k < text.length ? k + 1 : k };
  }

  // Pull leading link reference definitions out of a paragraph's text.
  function extractRefs(text) {
    let pos = 0;
    while (true) {
      const def = parseLinkRefDef(text, pos);
      if (!def) break;
      if (!refs.has(def.label)) refs.set(def.label, { dest: def.dest, title: def.title });
      pos = def.end;
    }
    return { text: text.slice(pos) };
  }

  // ---- GFM tables ----------------------------------------------------------
  function splitTableCells(line) {
    const cells = [];
    let cur = '';
    let i = 0;
    const n = line.length;
    while (i < n && (line[i] === ' ' || line[i] === '\t')) i++;
    if (i < n && line[i] === '|') i++;
    let lastSepAtEnd = false;
    while (i < n) {
      const c = line[i];
      // a backslash escape: \| is a literal pipe in the cell (gfm-200)
      if (c === '\\' && i + 1 < n && ASCII_PUNCT.has(line[i + 1])) {
        if (line[i + 1] === '|') cur += '|';
        else cur += line[i] + line[i + 1];
        i += 2; continue;
      }
      if (c === '`') {
        // marked does NOT protect '|' inside code spans when splitting
        // table cells (tc1/tc2/tc5: `x | y` splits; only \| is exempt).
        // A backtick is just an ordinary character here.
        cur += c; i++;
        continue;
      }
      if (c === '|') {
        cells.push(cur); cur = '';
        let k = i + 1;
        while (k < n && (line[k] === ' ' || line[k] === '\t')) k++;
        lastSepAtEnd = (k >= n);
        i++;
        continue;
      }
      cur += c; i++;
    }
    cells.push(cur);
    if (lastSepAtEnd) cells.pop();
    return cells.map(s => s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, ''));
  }
  function parseDelimiterRow(line) {
    const cells = splitTableCells(line);
    const aligns = [];
    for (const cell of cells) {
      const t = cell.trim();
      if (!/^:?-+:?$/.test(t)) return null;
      if (t.length >= 3 && t[0] === ':' && t[t.length - 1] === ':') aligns.push('center');
      else if (t[0] === ':') aligns.push('left');
      else if (t[t.length - 1] === ':') aligns.push('right');
      else aligns.push(null);
    }
    return aligns;
  }
  function padCells(cells, n) {
    const out = cells.slice(0, n);
    while (out.length < n) out.push('');
    return out;
  }

  function removeNode(node) {
    node.parent.children.pop();
  }
  function replaceNode(node, replacement) {
    replacement.parent = node.parent;
    replacement.blankBefore = node.blankBefore;
    node.parent.children[node.parent.children.length - 1] = replacement;
  }

  function finalizeParagraph(node) {
    const extracted = extractRefs(node.lines.join('\n'));
    const lines = extracted.text.split('\n');
    let first = 0;
    while (first < lines.length && lines[first].trim() === '') first++;
    if (first >= lines.length) {
      // a link-reference-only paragraph still makes its list loose if it
      // followed a blank line (cm-317)
      if (node.blankBefore && node.parent && node.parent.t === 'item') node.parent._refBlank = true;
      removeNode(node);
      return;
    }
    const contentLines = lines.slice(first);
    if (contentLines.length >= 2) {
      const delimCells = parseDelimiterRow(contentLines[1]);
      if (delimCells) {
        const headerCells = splitTableCells(contentLines[0]);
        if (headerCells.length === delimCells.length &&
            (contentLines[0].indexOf('|') !== -1 || delimCells.length > 1)) {
          const table = {
            t: 'table', header: headerCells, align: delimCells,
            rows: contentLines.slice(2).map(l => padCells(splitTableCells(l), headerCells.length)),
          };
          replaceNode(node, table);
          return;
        }
      }
    }
    node.text = contentLines.join('\n');
  }

  // ---- main line loop ------------------------------------------------------
  for (let li = 0; li < rawLines.length; li++) {
    const raw = rawLines[li];
    curLine = li;
    const ln = makeLine(raw);
    const { container, allMatched, failAt } = matchContainers(ln);
    // A line that does not match the open containers ends an indented
    // code or HTML block living inside them. A fenced code block ends
    // when a BLOCKQUOTE fails to match (the quote — and everything
    // inside it — is over, cm-128/cm-237), or when the line starts a new
    // list marker (it opens a sibling list item, doc-21); when only a
    // list item's indent fails and the line is plain text, it is still
    // fenced-code content (doc-02: a column-0 line inside a fenced block
    // in a list item is code, not a new block).
    if (!allMatched) {
      const t0 = tip();
      const endFenced = t0.t === 'code' && t0.fenced &&
        ((failAt && failAt.t === 'quote') ||
         (failAt && failAt.t === 'item' && lineStartsListMarker(ln)));
      if ((t0.t === 'code' && !t0.fenced) || t0.t === 'html' || endFenced) {
        // an HTML block cut off by a line that starts a sibling block has
        // no trailing newline (cm-175)
        if (t0.t === 'html') t0.cutOff = true;
        finalize(open.pop());
      }
    }
    const t = tip();
    // fenced code: content lines and the closing fence
    if (t.t === 'code' && t.fenced) {
      let p = ln.pos, sp = 0;
      while (p < ln.text.length && sp < 3 && ln.text.charCodeAt(p) === 32) { p++; sp++; }
      let ok = false;
      const fc = t.fence.charCodeAt(0);
      if (p < ln.text.length && ln.text.charCodeAt(p) === fc) {
        let q = p;
        while (q < ln.text.length && ln.text.charCodeAt(q) === fc) q++;
        if (q - p >= t.fenceLen) {
          let r = q;
          while (r < ln.text.length && (ln.text.charCodeAt(r) === 32 || ln.text.charCodeAt(r) === 9)) r++;
          if (r >= ln.text.length) ok = true;
        }
      }
      if (ok) { finalize(open.pop()); lastLineBlank = false; continue; }
      // content lines lose up to the opening fence's indentation — but
      // only for BACKTICK fences. Marked does NOT strip the fence indent
      // from a TILDE fence's content (probed b1–b6: ``` indented 2 strips
      // 2, ~~~ indented 2 strips 0, in and out of blockquotes).
      let content = lineRest(ln);
      let strip = t.fence === '`' ? (t.fenceIndent || 0) : 0;
      const qBase = ln.innerBase || 0;
      const col = qBase > 0 ? qBase : ln.col;
      if (content.charCodeAt(0) === 9) {
        if (strip > 0) { content = content.slice(1); strip = 0; }
        else if (col > 0) { content = ' '.repeat(4 - (col % 4)) + content.slice(1); }
      } else {
        let totalSpaces = 0;
        while (totalSpaces < content.length && content.charCodeAt(totalSpaces) === 32) totalSpaces++;
        const stripN = Math.min(strip, totalSpaces);
        if (qBase > 0 && totalSpaces < content.length && content.charCodeAt(totalSpaces) === 9) {
          const tcol = qBase + totalSpaces;
          content = ' '.repeat(totalSpaces - stripN) + ' '.repeat(4 - (tcol % 4)) + content.slice(totalSpaces + 1);
        } else {
          content = content.slice(stripN);
        }
      }
      t.lines.push(content);
      lastLineBlank = false;
      continue;
    }
    // indented code: content lines need 4+ indent; anything else ends it
    if (t.t === 'code' && !t.fenced) {
      if (lineIsBlank(ln)) {
        // a blank line contributes its indentation minus the 4 code columns
        const savePos = ln.pos, saveCol = ln.col, savePart = ln.partialTab;
        lineAdvance(ln, 4);
        t.lines.push(lineRest(ln));
        ln.pos = savePos; ln.col = saveCol; ln.partialTab = savePart;
        lastLineBlank = true; continue;
      }
      if (lineIndent(ln) >= 4) { lineAdvance(ln, 4); t.lines.push(lineRest(ln)); lastLineBlank = false; continue; }
      finalize(open.pop());
    }
    // html block: content lines until the end condition (or blank line for 6/7)
    if (tip().t === 'html') {
      const h = tip();
      if (lineIsBlank(ln) && (h.htmlType === 6 || h.htmlType === 7)) {
        // an HTML block that ends at a blank line has no trailing newline
        h.endsAtBlank = true;
        finalize(open.pop());
        lastLineBlank = true;
        continue;
      }
      const content = lineRest(ln);
      h.lines.push(content);
      h.lastLine = curLine;
      let end = false;
      if (h.htmlType === 1 && h.endTag && content.toLowerCase().indexOf(h.endTag) !== -1) end = true;
      else if (h.htmlType === 2 && content.indexOf('-->') !== -1) end = true;
      else if (h.htmlType === 3 && content.indexOf('?>') !== -1) end = true;
      else if (h.htmlType === 4 && content.indexOf('>') !== -1) end = true;
      else if (h.htmlType === 5 && content.indexOf(']]>') !== -1) end = true;
      if (end) finalize(open.pop());
      lastLineBlank = false;
      continue;
    }
    // A whitespace-only line that contains a TAB is not a blank line
    // inside a table: it is an empty table row (doc-02/26/33). A
    // spaces-only (or truly empty) line still ends the table. Only when
    // the open paragraph already looks like a table (header + delimiter
    // row) does the tab line become a row; otherwise it is a blank line.
    if (/^[ \t]*\t[ \t]*$/.test(raw) && tip().t === 'para') {
      const pl = tip().lines;
      let f = 0;
      while (f < pl.length && pl[f].trim() === '') f++;
      if (f + 1 < pl.length && parseDelimiterRow(pl[f + 1])) {
        tip().lines.push('');
        lastLineBlank = false;
        continue;
      }
    }
    // blank line: closes a paragraph (and nothing else at this level)
    // A blank line also ends every open blockquote (and the blocks inside it).
    // Blankness is judged on the raw line: a blockquote line like ">  " still
    // carries a space of content for the paragraph inside it.
    if (/^[ \t]*$/.test(raw)) {
      if (tip().t === 'para') finalize(open.pop());
      while (open.some(n => n.t === 'quote')) {
        const top = open[open.length - 1];
        if (top.t === 'list' || top.t === 'item') {
          let quoteBelow = false;
          for (let k = open.length - 2; k >= 1; k--) {
            if (open[k].t === 'quote') { quoteBelow = true; break; }
          }
          if (!quoteBelow) break;
        }
        finalize(open.pop());
      }
      lastLineBlank = true;
      continue;
    }
    // a line that is blank once container markers are consumed (a bare ">")
    // is a blank line too: it ends the paragraph, but it does not itself
    // close the blockquote — the next line that fails to match the quote
    // closes it (cm-244, cm-249). It is not a blank line for an enclosing
    // list, so it does not make the list loose (cm-320); but when the very
    // next line starts a second paragraph inside the same list item, that
    // item is loose (cm-259) — so remember the item here and confirm it
    // when the paragraph is created, rather than flagging it now (cm-260).
    if (lineRest(ln) === '') {
      if (tip().t === 'para') {
        const par = tip().parent;
        if (par && par.t === 'item') { markersBlankParent = par; markersBlankLine = curLine; }
        finalize(open.pop());
      }
      continue;
    }
    blankBeforeLine = lastLineBlank;
    lastLineBlank = false;
    // setext heading: the paragraph becomes a heading (not a lazy line)
    if (tip().t === 'para' && allMatched) {
      const level = isSetextLine(ln);
      if (level) {
        const para = tip();
        const extracted = extractRefs(para.lines.join('\n'));
        if (extracted.text.trim() !== '') {
          open.pop();
          // a setext heading's text is the paragraph's text with leading and
          // trailing whitespace stripped
          const trimmed = extracted.text.replace(/^[ \t\n]+/, '').replace(/[ \t\n]+$/, '');
          const h = { t: 'heading', level, lines: trimmed.split('\n') };
          h.parent = para.parent; h.blankBefore = para.blankBefore;
          para.parent.children[para.parent.children.length - 1] = h;
          continue;
        }
        // a paragraph of only link reference definitions cannot become a
        // setext heading: the line is a plain continuation instead
      }
    }
    // try to start new blocks; a list item's content may itself start blocks
    let cur = container;
    while (true) {
      if (tryFenced(ln, cur)) break;
      if (tryAtx(ln, cur)) break;
      if (tryHtml(ln, cur)) break;
      if (tryHr(ln, cur)) break;
      if (tryList(ln, cur)) { cur = tip(); if (lineIsBlank(ln)) break; continue; }
      if (tryIndentedCode(ln, cur)) break;
      if (tryBlockquote(ln, cur)) { cur = tip(); continue; }
      if (tip().t === 'para') {
        // a lazy continuation line inside a blockquote or list item loses
        // up to 4 columns of leading whitespace (the indented-code
        // indent) when it has 4 or more; fewer than 4 columns are kept
        // whole (cm-238, cm-291 strip 4; doc-29 / l1 / o1 keep 1–3).
        // A matched or top-level line keeps it all (cm-049, cm-113,
        // cm-222, cm-223, cm-241, cm-649).
        if (!allMatched) {
          let anc = tip().parent;
          while (anc) {
            if (anc.t === 'quote' || anc.t === 'item') {
              if (lineIndent(ln) >= 4) lineAdvance(ln, 4);
              break;
            }
            anc = anc.parent;
          }
        }
        let text = lineRest(ln);
        // a setext underline cannot be a lazy continuation inside a
        // blockquote or list item: it joins the paragraph indented four
        // spaces (cm-093)
        if (/^(=+|-+)[ \t]*$/.test(text)) {
          let anc = tip().parent;
          while (anc) {
            if (anc.t === 'quote' || anc.t === 'item') { text = '    ' + text; break; }
            anc = anc.parent;
          }
        }
        tip().lines.push(text);
        break;
      }
      const parent = blockParent(cur);
      closeTo(parent);
      const p = { t: 'para', lines: [lineRest(ln)] };
      addChild(parent, p);
      open.push(p);
      break;
    }
  }
  // An HTML block still open at EOF, when the source does not end with a
  // newline, has no trailing newline in its output (gfm-657).
  if (!endsWithNewline && tip().t === 'html') tip().noTrailingNewline = true;
  closeTo(root);
  // An HTML block whose next source line is blank loses its trailing newline.
  (function markHtmlEnds(node) {
    if (node.t === 'html') {
      // only a TRULY empty next line makes the block lose its trailing
      // newline; a spaces-only or tab-only line keeps it (doc-15/19,
      // oracle: "<!-- -->\n   \npara" keeps -->\n, "<!-- -->\n\npara"
      // strips it)
      const next = rawLines[node.lastLine + 1];
      if (next !== undefined && next === '') node.endsAtBlank = true;
    }
    if (node.children) for (const child of node.children) markHtmlEnds(child);
  })(root);
  return { root, refs };
}

// ---- inline parsing --------------------------------------------------------
// Scans a string once, building HTML parts. Delimiter runs (* _ ~) are
// recorded in a stack and resolved after the scan (CommonMark emphasis
// algorithm); brackets are recorded for link/image resolution.

function isUnicodeSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' ||
    ch === '\u00a0' || ch === '\u1680' || (ch >= '\u2000' && ch <= '\u200a') ||
    ch === '\u2028' || ch === '\u2029' || ch === '\u202f' || ch === '\u205f' ||
    ch === '\u3000' || ch === '\ufeff';
}
function isUnicodePunct(ch) {
  if (ch === undefined) return false;
  const c = ch.charCodeAt(0);
  if (c < 128) return ASCII_PUNCT.has(ch);
  // CommonMark punctuation for flanking: Unicode P (punctuation) or S (symbol)
  return /[\p{P}\p{S}]/u.test(ch);
}
// Remove `count` trailing space/tab characters from the end of `parts`.
function trimTrailingSpaces(parts, count) {
  while (count > 0 && parts.length) {
    const last = parts[parts.length - 1];
    let k = last.length;
    while (k > 0 && count > 0 && (last[k - 1] === ' ' || last[k - 1] === '\t')) { k--; count--; }
    if (k === last.length) break;
    if (k === 0) parts.pop();
    else parts[parts.length - 1] = last.slice(0, k);
  }
}
// Columns of spaces/tabs immediately before position i in s (s[i] === '\n').
function trailingSpaceCols(s, i) {
  let j = i - 1;
  let run = 0;
  while (j >= 0 && (s[j] === ' ' || s[j] === '\t')) { j--; run++; }
  if (run === 0) return 0;
  // column of the run's start: scan forward from the previous newline
  let lineStart = j + 1;
  let col = 0;
  for (let k = lineStart; k < j + 1; k++) {
    col += s[k] === '\t' ? 4 - (col % 4) : 1;
  }
  let cols = 0;
  for (let k = j + 1; k < i; k++) {
    cols += s[k] === '\t' ? 4 - ((col + cols) % 4) : 1;
  }
  return cols;
}

// Document-level flag: once an unclosed <a> tag appears in a paragraph's
// inline content, GFM extended autolinks (email + http/www) are suppressed
// for the rest of the document (doc-03). A </a> tag re-enables them.
// Reset at the start of every parse() call. HTML blocks do not touch it
// (they never go through parseInline), and regular links / angle autolinks
// are unaffected by it.
let inLinkRaw = false;

function parseInline(s, refs) {
  const parts = [];
  const delims = [];
  const brackets = [];
  const n = s.length;
  let i = 0;
  let linkIdCounter = 0;
  const labelStarts = new Set();

  function pushText(str) { escapeText(str, parts); }

  // Resolve emphasis/delimiters after the scan.
  function resolveEmphasis() {
    // spans already formed, as [openerIdx, closerIdx] in delims order
    const spans = [];
    let ci = 0;
    while (ci < delims.length) {
      const closer = delims[ci];
      if (!closer.active || !closer.canClose) { ci++; continue; }
      let oi = ci - 1;
      let opener = null;
      let shadowed = false;
      while (oi >= 0) {
        const o = delims[oi];
        // A strong closer that stayed behind (see below) bars a later
        // closer of the same char from a one-delimiter match with an
        // earlier opener; a two-delimiter (strong) match may still form
        // past it, so keep searching instead of failing outright.
        if (o.ch === closer.ch && o.blocking) { shadowed = true; oi--; continue; }
        // Odd-match rule: if either delimiter can both open and close,
        // the sum of the lengths must not be a multiple of 3, unless both
        // lengths are multiples of 3 (cm-416, cm-417).
        const oddBlocked = ((o.canOpen && o.canClose) || (closer.canOpen && closer.canClose)) &&
          (o.len + closer.len) % 3 === 0 &&
          !(o.len % 3 === 0 && closer.len % 3 === 0);
        // A closer cannot match an opener across a link boundary: the two
        // must sit inside the same bracket (or both outside) (cm-473).
        // Nor may the new span cross one already formed (cm-469, cm-470).
        let blocked = oddBlocked || o.linkId !== closer.linkId;
        if (!blocked) {
          for (const [a, b] of spans) {
            if ((a < oi && oi < b && b < ci) || (oi < a && a < ci && ci < b)) { blocked = true; break; }
          }
        }
        if (o.active && o.ch === closer.ch && o.canOpen && !blocked) {
          // past a blocking closer, only a strong (two-delimiter) match
          // may still form; a one-delimiter match is barred
          if (shadowed && !(o.len >= 2 && closer.len >= 2)) { oi--; continue; }
          opener = o;
          break;
        }
        oi--;
      }
      if (!opener) { ci++; continue; }
      const use = (opener.len >= 2 && closer.len >= 2) ? 2 : 1;
      const tag = closer.ch === '~' ? 'del' : (use === 2 ? 'strong' : 'em');
      // A later closer makes an outer element, so its open tag goes before
      // the tags already on the opener; its close tag goes after them.
      parts[opener.part] = opener.ch.repeat(opener.len - use) + '<' + tag + '>' + opener.openTags;
      opener.openTags = '<' + tag + '>' + opener.openTags;
      parts[closer.part] = closer.closeTags + '</' + tag + '>' + closer.ch.repeat(closer.len - use);
      closer.closeTags = closer.closeTags + '</' + tag + '>';
      opener.len -= use;
      closer.len -= use;
      // A strong whose opener could only open and whose closer could both
      // open and close leaves its closer behind as a block: a later closer
      // of the same char cannot reach past it to an earlier opener (marked
      // leaves `*a **b**c*` un-emphasised while `*a **b** c*` and
      // `*a b**c**d*` do emphasise).
      if (use === 2 && closer.canOpen && closer.canClose && opener.canOpen && !opener.canClose) {
        closer.blocking = true;
      }
      spans.push([oi, ci]);
      if (opener.len === 0) opener.active = false;
      if (closer.len === 0) { closer.active = false; ci++; }
      // if the closer still has length, re-process it (do not advance ci)
    }
  }

  // Strip tags from rendered HTML (for image alt text).
  function stripTags(html) {
    // an inner image contributes its alt text (cm-574)
    html = html.replace(/<img\b[^>]*\salt="([^"]*)"[^>]*>/g, '$1');
    return html.replace(/<[^>]*>/g, '');
  }

  // Parse the raw link text (for an image's alt) as plain text.
  function altText(raw) {
    return escapeAttr(stripTags(parseInline(raw, refs)));
  }

  function makeLink(br, dest, title, closePos) {
    const href = normalizeHref(dest.replace(/\\([!\"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1'));
    const titleAttr = title === null ? '' : ' title="' + escapeAttr(title.replace(/\\([!\"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1')) + '"';
    // deactivate brackets inside the link text
    for (let k = brackets.length - 1; k >= 0; k--) {
      if (brackets[k].part > br.part) brackets[k].active = false;
    }
    // a link cannot contain another link: forming one deactivates every
    // still-open outer LINK bracket (an image bracket may still sit inside
    // a link, so images survive an inner link forming) (cm-520)
    if (!br.image) {
      for (let k = 0; k < brackets.length; k++) {
        if (brackets[k] !== br && !brackets[k].image) brackets[k].active = false;
      }
    }
    br.active = false;
    // a used bracket leaves the stack, so a later ']' can reach a farther
    // bracket that is still open (cm-520)
    const bi = brackets.indexOf(br);
    if (bi !== -1) brackets.splice(bi, 1);
    if (br.image) {
      const raw = s.slice(br.pos + 1, closePos);
      const img = '<img src="' + href + '" alt="' + altText(raw) + '"' + titleAttr + '>';
      // the link text is not rendered for an image: deactivate its delimiters
      for (let k = 0; k < delims.length; k++) {
        if (delims[k].part > br.bangPart) delims[k].active = false;
      }
      parts[br.bangPart] = img;
      for (let k = br.bangPart + 1; k < parts.length; k++) parts[k] = '';
    } else {
      parts[br.part] = '<a href="' + href + '"' + titleAttr + '>';
      parts.push('</a>');
    }
  }

  // Parse an inline link's (destination "title") starting at s[j] === '('.
  // Returns {dest, title, end} or null.
  function parseInlineLink(j) {
    let k = j + 1;
    k = skipWsInline(s, k);
    if (k >= n) return null;
    let dest = '';
    if (s[k] === '<') {
      let m = k + 1;
      while (m < n) {
        if (s[m] === '\\' && m + 1 < n && ASCII_PUNCT.has(s[m + 1])) { m += 2; continue; }
        if (s[m] === '>' || s[m] === '\n' || s[m] === '<') break;
        m++;
      }
      if (m >= n || s[m] !== '>') return null;
      dest = s.slice(k + 1, m);
      k = m + 1;
    } else {
      let m = k;
      let depth = 0;
      while (m < n) {
        const c = s[m];
        if (c === ' ' || c === '\t' || c === '\n' || c.charCodeAt(0) < 32) break;
        if (c === '\\' && m + 1 < n && ASCII_PUNCT.has(s[m + 1])) { m += 2; continue; }
        if (c === '(') depth++;
        else if (c === ')') { if (depth === 0) break; depth--; }
        m++;
      }
      if (depth !== 0) return null;
      dest = s.slice(k, m);
      k = m;
    }
    let title = null;
    const saveK = k;
    k = skipWsInline(s, k);
    // a title must be separated from the destination by whitespace
    if (k > saveK && (s[k] === '"' || s[k] === "'" || s[k] === '(')) {
      const open = s[k];
      const close = open === '(' ? ')' : open;
      let m = k + 1;
      let t = '';
      let ok = false;
      while (m < n) {
        const c = s[m];
        if (c === '\\' && m + 1 < n && ASCII_PUNCT.has(s[m + 1])) { t += s[m + 1]; m += 2; continue; }
        if (c === close) { ok = true; m++; break; }
        t += c; m++;
      }
      if (ok) { title = t; k = m; }
      else k = saveK;
    }
    k = skipWsInline(s, k);
    if (k >= n || s[k] !== ')') return null;
    return { dest, title, end: k + 1 };
  }
  function skipWsInline(str, k) {
    while (k < str.length) {
      const c = str.charCodeAt(k);
      if (c === 32 || c === 9 || c === 10) k++;
      else break;
    }
    return k;
  }

  // Parse a link label starting at s[j] === '['. Returns {label, end} or null.
  function parseLabel(j) {
    let k = j + 1;
    let label = '';
    while (k < n && s[k] !== ']') {
      if (s[k] === '[') return null;
      // an escaped char is part of the label (so `\]` does not end it),
      // but the backslash is KEPT in the value: `foo\!` does not match a
      // ref labelled `foo!` (cm-545)
      if (s[k] === '\\' && k + 1 < n && ASCII_PUNCT.has(s[k + 1])) { label += s[k] + s[k + 1]; k += 2; continue; }
      label += s[k] === '\n' ? ' ' : s[k];
      k++;
    }
    if (k >= n || s[k] !== ']' || label.length > 999) return null;
    return { label, end: k + 1 };
  }

  // Try to resolve a link at the ']' at position i. Returns the new index
  // (position after the link) or -1 when no link formed.
  function tryLink(i) {
    // The ']' matches only the most recent bracket. A used bracket has
    // already left the stack (see makeLink); if the top bracket is
    // inactive, it is discarded and this ']' is literal — it does not
    // reach for a farther bracket (cm-520).
    if (brackets.length === 0) return -1;
    const br = brackets[brackets.length - 1];
    if (!br.active) { brackets.pop(); return -1; }
    const j = i + 1;
    // a bracket tried at this ']' and failing to form a link is consumed
    // by the ']' and leaves the stack, so the next ']' can reach a
    // farther bracket (cm-512); only brackets blocked by a link forming
    // inside them stay inactive to be popped literally (cm-520).
    // Delimiters inside a failed bracket are released to the enclosing
    // bracket, so emphasis can still match across it (cm-523).
    const fail = () => {
      const bi = brackets.indexOf(br);
      if (bi !== -1) brackets.splice(bi, 1);
      let outerId = 0;
      for (let k = brackets.length - 1; k >= 0; k--) {
        if (brackets[k].active) { outerId = brackets[k].id; break; }
      }
      for (let k = 0; k < delims.length; k++) {
        if (delims[k].linkId === br.id) delims[k].linkId = outerId;
      }
      return -1;
    };
    if (s[j] === '(') {
      const parsed = parseInlineLink(j);
      if (parsed) {
        makeLink(br, parsed.dest, parsed.title, i);
        return parsed.end;
      }
      // an inline link that fails to parse falls back to a shortcut
      // reference link (cm-568)
      const raw = s.slice(br.pos + 1, i).replace(/\\([!\"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/g, '$1');
      const ref = refs.get(normalizeLabel(raw));
      if (ref) { makeLink(br, ref.dest, ref.title, i); return i + 1; }
      return fail();
    }
    if (s[j] === '[') {
      const lab = parseLabel(j);
      if (!lab) return fail();
      let dest, title;
      if (lab.label === '') {
        // collapsed reference: label is the bracket's text
        const raw = s.slice(br.pos + 1, i);
        const ref = refs.get(normalizeLabel(raw));
        if (!ref) return fail();
        dest = ref.dest; title = ref.title;
      } else {
        const ref = refs.get(normalizeLabel(lab.label));
        if (!ref) {
          // a bracket used as a label may still form a full/collapsed
          // link later, but not a shortcut link (cm-545, cm-569)
          labelStarts.add(j);
          return fail();
        }
        dest = ref.dest; title = ref.title;
      }
      makeLink(br, dest, title, i);
      return lab.end;
    }
    // shortcut reference: label is the bracket's text (escapes kept)
    if (br.noShortcut) return fail();
    const raw = s.slice(br.pos + 1, i);
    const ref = refs.get(normalizeLabel(raw));
    if (!ref) return fail();
    makeLink(br, ref.dest, ref.title, i);
    return i + 1;
  }

  // Try an HTML tag, comment, PI, declaration or CDATA at s[i] === '<'.
  // Returns the tag text or null.
  function parseHtmlTag(i) {
    const rest = s.slice(i);
    let m;
    // <!--> and <!---> are complete (empty) comments (cm-626)
    if (rest.startsWith('<!-->')) return '<!-->';
    if (rest.startsWith('<!--->')) return '<!--->';
    if ((m = /^<!--(?:(?!-->)[\s\S])*?-->/.exec(rest))) return m[0];
    if ((m = /^<\?(?:(?!\?>)[\s\S])*?\?>/.exec(rest))) return m[0];
    if ((m = /^<![A-Za-z][^>]*>/.exec(rest))) return m[0];
    if ((m = /^<!\[CDATA\[(?:(?!\]\]>)[\s\S])*?\]\]>/.exec(rest))) return m[0];
    if ((m = /^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)/.exec(rest))) return m[0];
    return null;
  }
  function tagNameOf(tag) {
    const m = /^<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(tag);
    return m ? m[1].toLowerCase() : null;
  }
  // Try an autolink <scheme:...> or <email> at s[i] === '<'.
  function parseAutolink(i) {
    const rest = s.slice(i);
    let m = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*)>/.exec(rest);
    if (m) return { href: m[1], text: m[1], len: m[0].length };
    m = /^<([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+)>/.exec(rest);
    if (m) return { href: 'mailto:' + m[1], text: m[1], len: m[0].length };
    return null;
  }

  // GFM extended autolinks in plain text. Returns {href, text, len} or null.
  function parseExtAutolink(i) {
    const prev = i === 0 ? '' : s[i - 1];
    const boundary = prev === '' || isUnicodeSpace(prev) ||
      '*_~([{<"\'`:;,!?'.indexOf(prev) !== -1;
    if (!boundary) return null;
    // www. (lowercase only)
    if (s.startsWith('www.', i)) {
      // after the domain, any non-space non-'<' run is part of the URL
      // (doc-40: a trailing '\' stays in the URL, encoded as %5C);
      // trimExtUrl strips trailing punctuation afterwards (but not '\')
      const m = /^www\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?:\.[A-Za-z]{2,})(?:[^\s<]*)?/.exec(s.slice(i));
      if (m) {
        let url = trimExtUrl(truncateUnmatchedParen(m[0]));
        if (url) return { href: 'http://' + url, text: url, len: url.length };
      }
      return null;
    }
    // http:// or https:// (scheme is case-insensitive: Https://, HTTP://)
    if (/^https?:\/\//i.test(s.slice(i, i + 8))) {
      const m = /^https?:\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*(?:\.[A-Za-z]{2,})?(?::\d+)?(?:[^\s<]*)?/i.exec(s.slice(i));
      if (m) {
        let url = trimExtUrl(truncateUnmatchedParen(m[0]));
        if (url) return { href: url, text: url, len: url.length };
      }
      return null;
    }
    return null;
  }
  // Strip trailing punctuation from an extended autolink per GFM rules.
  // ']' and '}' are NOT trailing punctuation (u12/tr1: they stay in the
  // URL); only ? ! . , : ; * _ ~ and quotes are stripped, plus a trailing
  // ')' when it has no matching '(' (depth floored at 0, so an unmatched
  // ')' earlier in the URL does not make a matched final ')' drop: m6).
  function trimExtUrl(url) {
    // drop trailing ? ! . , : ; * _ ~ and quotes
    let end = url.length;
    while (end > 0 && '?!,.:;*_~"\' )'.indexOf(url[end - 1]) !== -1) {
      const ch = url[end - 1];
      if (ch === ')') {
        // keep only if parens are balanced (depth over the URL without
        // this ')', floored at 0, must be > 0)
        let depth = 0;
        for (let k = 0; k < end - 1; k++) {
          if (url[k] === '(') depth++;
          else if (url[k] === ')' && depth > 0) depth--;
        }
        if (depth > 0) break;
        end--; continue;
      }
      if (ch === ';') {
        // a trailing entity reference is not part of the URL at all (gfm-627)
        const semi = url.lastIndexOf('&', end - 1);
        if (semi !== -1 && /^&[A-Za-z0-9#]+;$/.test(url.slice(semi, end))) { end = semi; continue; }
        // a plain trailing ';' is punctuation: trim it and keep trimming
        end--; continue;
      }
      end--;
    }
    return url.slice(0, end);
  }
  // A '(' with no ')' after it in the URL ends the autolink there
  // (u8/u9/m1: an unmatched '(' and everything after it is not part of
  // the URL). A '(' that does have a ')' after it stays (u5/m6).
  function truncateUnmatchedParen(url) {
    let start = 0;
    while (true) {
      const open = url.indexOf('(', start);
      if (open === -1) return url;
      if (url.indexOf(')', open + 1) === -1) return url.slice(0, open);
      start = open + 1;
    }
  }
  // Email autolink when s[i] === '@': look back for the local part.
  // Returns {href, text, start, len} (start = local part's index) or null.
  function parseEmailAt(i) {
    // scan back for the local part
    let j = i - 1;
    while (j >= 0 && /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]/.test(s[j])) j--;
    const local = s.slice(j + 1, i);
    if (local.length === 0) return null;
    // the character before the local part must be a word boundary, unless
    // it is ':' ending a scheme (mailto:, xmpp: ...) (gfm-633/634/635)
    const before = j < 0 ? '' : s[j];
    let schemeStart = -1;
    if (before === ':') {
      let k = j - 1;
      while (k >= 0 && /[A-Za-z0-9+.-]/.test(s[k])) k--;
      const scheme = s.slice(k + 1, j);
      if (/^[A-Za-z][A-Za-z0-9+.-]{1,31}$/.test(scheme)) {
        const beforeScheme = k < 0 ? '' : s[k];
        if (beforeScheme === '' || isUnicodeSpace(beforeScheme) || '*_~([{<"\'`:;,!?'.indexOf(beforeScheme) !== -1) {
          schemeStart = k + 1;
        }
      }
    }
    if (schemeStart === -1) {
      if (before !== '' && !isUnicodeSpace(before) && '*_~([{<"\'`:;,!?'.indexOf(before) === -1) return null;
    }
    // the local part must contain no inline-special characters that cannot
    // be undone (code, image, entity); emphasis/strikethrough delimiters
    // inside it are dropped when the link forms (gfm-632)
    if (/[`!&]/.test(local)) return null;
    const m = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+/.exec(s.slice(i + 1));
    if (!m) return null;
    // the domain must end with a TLD of letters (a 1-letter TLD is valid)
    const domain = m[0];
    const lastDot = domain.lastIndexOf('.');
    if (lastDot === -1 || !/^[A-Za-z]+$/.test(domain.slice(lastDot + 1))) return null;
    // the character after the domain must not extend it (gfm-632: a.b- / a.b_)
    // — except a '_' that closes an open '_' emphasis delimiter: the '_'
    // is a delimiter, not part of the email (doc-31: _warning
    // when@atlas.example.com_ forms the link). A bare trailing '_' with
    // no opener waiting still blocks (gfm-632).
    const afterDomain = s[i + 1 + domain.length] || '';
    if (afterDomain !== '' && /[A-Za-z0-9_-]/.test(afterDomain)) {
      if (afterDomain === '_') {
        let hasOpener = false;
        for (let d = delims.length - 1; d >= 0; d--) {
          if (delims[d].ch === '_' && delims[d].canOpen) { hasOpener = true; break; }
        }
        if (!hasOpener) return null;
      } else {
        return null;
      }
    }
    // trailing punctuation on the domain
    let d = domain;
    while (d.length && '?!,.:;*_~'.indexOf(d[d.length - 1]) !== -1) d = d.slice(0, -1);
    if (d.length === 0) return null;
    const addr = local + '@' + d;
    if (schemeStart !== -1) {
      // scheme:email — the scheme is part of the link; a single /segment
      // resource may follow the domain (xmpp:foo@bar.baz/txt)
      let resource = '';
      const end = i + 1 + d.length;
      if (s[end] === '/') {
        let r = end + 1;
        while (r < n && s[r] !== '/' && s[r] !== '<' && !isUnicodeSpace(s[r])) r++;
        // only a resource if something follows the '/' (gfm-633: a trailing
        // '/' after mailto: is not part of the link)
        if (r > end + 1) {
          resource = s.slice(end, r);
          while (resource.length > 1 && '?!,.:;*_~'.indexOf(resource[resource.length - 1]) !== -1) resource = resource.slice(0, -1);
        }
      }
      const full = s.slice(schemeStart, end) + resource;
      return { href: full, text: full, start: schemeStart, len: full.length };
    }
    return { href: 'mailto:' + addr, text: addr, start: j + 1, len: local.length + 1 + d.length };
  }
  // Remove `count` characters from the end of the emitted parts (plain text).
  function trimChars(parts, count) {
    while (count > 0 && parts.length) {
      const last = parts[parts.length - 1];
      if (last.length <= count) { count -= last.length; parts.pop(); }
      else { parts[parts.length - 1] = last.slice(0, last.length - count); count = 0; }
    }
  }

  function inLinkText() {
    for (let k = brackets.length - 1; k >= 0; k--) if (brackets[k].active) return true;
    return false;
  }

  while (i < n) {
    const c = s.charCodeAt(i);
    // newline: hard break (2+ trailing spaces) or soft break
    if (c === 10) {
      const cols = trailingSpaceCols(s, i);
      if (cols >= 2) {
        trimTrailingSpaces(parts, cols);
        parts.push('<br>');
        i++;
        // a hard break strips leading whitespace from the next line (cm-636)
        while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
      } else {
        parts.push('\n');
        i++;
      }
      continue;
    }
    // backslash escape or hard break
    if (c === 92) {
      if (i + 1 < n) {
        const nc = s[i + 1];
        if (nc === '\n') {
          parts.push('<br>');
          i += 2;
          // a hard break strips leading whitespace from the next line (cm-637)
          while (i < n && (s[i] === ' ' || s[i] === '\t')) i++;
          continue;
        }
        if (ASCII_PUNCT.has(nc)) { pushText(nc); i += 2; continue; }
      }
      pushText('\\');
      i++;
      continue;
    }
    // code span
    if (c === 96) {
      let j = i;
      while (j < n && s[j] === '`') j++;
      const run = j - i;
      let k = j;
      let found = -1;
      while (k < n) {
        if (s[k] === '`') {
          let e = k;
          while (e < n && s[e] === '`') e++;
          if (e - k === run) { found = k; break; }
          k = e;
        } else k++;
      }
      if (found === -1) { pushText(s.slice(i, j)); i = j; continue; }
      let content = s.slice(j, found).replace(/\n/g, ' ');
      if (content.length >= 2 && content[0] === ' ' && content[content.length - 1] === ' ' && /[^ ]/.test(content)) {
        content = content.slice(1, -1);
      }
      parts.push('<code>');
      escapeText(content, parts);
      parts.push('</code>');
      i = found + run;
      continue;
    }
    // delimiter runs: * _ ~
    if (c === 42 || c === 95 || c === 126) {
      const ch = s[i];
      let j = i;
      while (j < n && s[j] === ch) j++;
      const len = j - i;
      const before = i === 0 ? '' : s[i - 1];
      const after = j >= n ? '' : s[j];
      const beforeWs = before === '' || isUnicodeSpace(before);
      const afterWs = after === '' || isUnicodeSpace(after);
      const beforePunct = isUnicodePunct(before);
      const afterPunct = isUnicodePunct(after);
      const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct);
      const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct);
      let canOpen, canClose;
      if (ch === '_') {
        canOpen = leftFlanking && (!rightFlanking || beforePunct);
        canClose = rightFlanking && (!leftFlanking || afterPunct);
      } else {
        canOpen = leftFlanking;
        canClose = rightFlanking;
      }
      parts.push(s.slice(i, j));
      // a run of three or more tildes is not a strikethrough delimiter (gfm-493)
      if (!(ch === '~' && len >= 3)) {
        // record which bracket (if any) this delimiter sits inside, so a
        // closer cannot match an opener across a link boundary (cm-473)
        let linkId = 0;
        for (let b = brackets.length - 1; b >= 0; b--) {
          // innermost enclosing bracket, active or blocked: a delimiter
          // inside its span shares its id (cm-519)
          linkId = brackets[b].id; break;
        }
        delims.push({ ch, len, canOpen, canClose, part: parts.length - 1, active: true, openTags: '', closeTags: '', linkId, blocking: false });
      }
      i = j;
      continue;
    }
    // link / image open
    if (c === 91 || (c === 33 && i + 1 < n && s[i + 1] === '[')) {
      if (c === 33) {
        parts.push('!');
        brackets.push({ part: parts.length, image: true, active: true, pos: i + 1, bangPart: parts.length - 1, id: ++linkIdCounter, noShortcut: labelStarts.has(i + 1) });
        parts.push('[');
        i += 2;
      } else {
        parts.push('[');
        brackets.push({ part: parts.length - 1, image: false, active: true, pos: i, bangPart: -1, id: ++linkIdCounter, noShortcut: labelStarts.has(i) });
        i++;
      }
      continue;
    }
    // link close
    if (c === 93) {
      const next = tryLink(i);
      if (next !== -1) { i = next; continue; }
      pushText(']');
      i++;
      continue;
    }
    // < : autolink, html tag, or literal
    if (c === 60) {
      // an angle-bracket autolink forms even inside link text (cm-526):
      // it consumes the ']' that would otherwise close the link
      const auto = parseAutolink(i);
      if (auto) {
        parts.push('<a href="' + normalizeHref(auto.href) + '">');
        pushText(auto.text);
        parts.push('</a>');
        i += auto.len;
        continue;
      }
      const tag = parseHtmlTag(i);
      if (tag) {
        // marked does not filter disallowed tags (gfm-657): emit raw
        parts.push(tag);
        // an <a> tag suppresses extended autolinks for the rest of the
        // document; </a> re-enables them. The check is exact (probed):
        // open sets ONLY for '<a ' / '<A ' (a space after the tag name,
        // i.e. an attributed anchor); bare '<a>', '<A>', '<a/>',
        // '<a\t>' and '<a\nhref=...>' do NOT set. Close clears only for
        // exactly '</a>' or '</A>' (no trailing space); '</a >',
        // '</ab>' do not.
        if ((tag[1] === 'a' || tag[1] === 'A') && tag[2] === ' ') {
          inLinkRaw = true;
        } else if (tag === '</a>' || tag === '</A>') {
          inLinkRaw = false;
        }
        i += tag.length;
        continue;
      }
      pushText('<');
      i++;
      continue;
    }
    // & : entity
    if (c === 38) {
      const ent = decodeEntity(s, i);
      if (ent) {
        if (ent.kind === 'named') parts.push(ent.text);
        else pushText(ent.value);
        i += ent.length;
        continue;
      }
      pushText('&');
      i++;
      continue;
    }
    // GFM extended autolinks: www. / http(s):// (scheme case-insensitive)
    if (c === 119 || c === 104 || c === 87 || c === 72) {
      if (!inLinkText() && !inLinkRaw) {
        const ext = parseExtAutolink(i);
        if (ext) {
          parts.push('<a href="' + normalizeHref(ext.href) + '">');
          pushText(ext.text);
          parts.push('</a>');
          i += ext.len;
          continue;
        }
      }
    }
    // email autolink at '@'
    if (c === 64) {
      if (!inLinkText() && !inLinkRaw) {
        const em = parseEmailAt(i);
        if (em) {
          trimChars(parts, i - em.start);
          // drop emphasis delimiters whose text was trimmed away with the
          // local part (gfm-632: the '_' in a.b-c_d@a.b)
          for (let d = delims.length - 1; d >= 0; d--) {
            if (delims[d].part >= parts.length) delims.splice(d, 1);
          }
          parts.push('<a href="' + normalizeHref(em.href) + '">');
          pushText(em.text);
          parts.push('</a>');
          i = em.start + em.len;
          continue;
        }
      }
    }
    // plain text run until the next special character
    let start = i;
    while (i < n) {
      const cc = s.charCodeAt(i);
      if (cc === 92 || cc === 96 || cc === 42 || cc === 95 || cc === 126 ||
          cc === 91 || cc === 93 || cc === 33 || cc === 60 || cc === 38 || cc === 10) break;
      if (cc === 119 && s.startsWith('www.', i)) break;
      if (cc === 104 && (s.startsWith('http://', i) || s.startsWith('https://', i))) break;
      if (cc === 72 && /^https?:\/\//i.test(s.slice(i, i + 8))) break;
      if (cc === 64) break;
      i++;
    }
    if (i > start) pushText(s.slice(start, i));
    else { pushText(s[i]); i++; }
  }
  resolveEmphasis();
  return parts.join('');
}

// ---- rendering -------------------------------------------------------------
function renderRawHtml(text) {
  // marked does not filter disallowed tags (gfm-657): emit raw
  return text;
}
function renderBlock(node, refs, out, tight) {
  switch (node.t) {
    case 'doc':
      for (const child of node.children) renderBlock(child, refs, out, false);
      break;
    case 'para': {
      const html = parseInline(node.text || '', refs);
      if (tight) out.push(html);
      else out.push('<p>' + html + '</p>\n');
      break;
    }
    case 'heading': {
      const html = parseInline(node.lines.join('\n'), refs);
      out.push('<h' + node.level + '>' + html + '</h' + node.level + '>\n');
      break;
    }
    case 'code': {
      let lines = node.lines;
      // a fenced code block drops a single trailing blank line (cm-318)
      if (node.fenced && lines.length && lines[lines.length - 1] === '') lines = lines.slice(0, -1);
      const content = lines.map(l => l + '\n').join('');
      let cls = '';
      if (node.info) {
        const word = node.info.split(/\s+/)[0];
        if (word) cls = ' class="language-' + escapeAttr(word) + '"';
      }
      out.push('<pre><code' + cls + '>' + escapeHtmlText(content) + '</code></pre>\n');
      break;
    }
    case 'html': {
      let content = node.lines.map(l => l + '\n').join('');
      if ((node.endsAtBlank || node.noTrailingNewline || node.cutOff) && content.endsWith('\n')) content = content.slice(0, -1);
      out.push(renderRawHtml(content));
      break;
    }
    case 'hr':
      out.push('<hr>\n');
      break;
    case 'quote': {
      out.push('<blockquote>\n');
      for (const child of node.children) renderBlock(child, refs, out, false);
      out.push('</blockquote>\n');
      break;
    }
    case 'list': {
      const tag = node.bullet ? 'ul' : 'ol';
      let open = '<' + tag;
      if (tag === 'ol' && node.start !== 1) open += ' start="' + node.start + '"';
      open += '>\n';
      out.push(open);
      const loose = listIsLoose(node);
      for (const item of node.children) renderItem(item, refs, out, loose);
      out.push('</' + tag + '>\n');
      break;
    }
    case 'table': {
      out.push('<table>\n<thead>\n<tr>\n');
      for (let k = 0; k < node.header.length; k++) {
        const align = node.align[k];
        out.push('<th' + (align ? ' align="' + align + '"' : '') + '>' +
          parseInline(node.header[k], refs) + '</th>\n');
      }
      out.push('</tr>\n</thead>\n');
      // no <tbody> at all when there are no body rows (gfm-205)
      if (node.rows.length) {
        out.push('<tbody>');
        for (const row of node.rows) {
          out.push('<tr>\n');
          for (let k = 0; k < node.header.length; k++) {
            const align = node.align[k];
            out.push('<td' + (align ? ' align="' + align + '"' : '') + '>' +
              parseInline(row[k] || '', refs) + '</td>\n');
          }
          out.push('</tr>\n');
        }
        out.push('</tbody>');
      }
      out.push('</table>\n');
      break;
    }
    default:
      break;
  }
}
function listIsLoose(list) {
  for (let k = 0; k < list.children.length; k++) {
    const item = list.children[k];
    if (item._refBlank || item._blankSep) return true;
    if (k > 0 && item.blankBefore) return true;
    for (let m = 1; m < item.children.length; m++) {
      if (item.children[m].blankBefore) return true;
    }
  }
  return false;
}
function renderItem(item, refs, out, loose) {
  out.push('<li>');
  let first = true;
  for (const child of item.children) {
    if (first && child.t === 'para') {
      const task = taskInfo(child.text || '');
      if (task) {
        const input = task.checked
          ? '<input checked="" disabled="" type="checkbox">'
          : '<input disabled="" type="checkbox">';
        const stripped = { ...child, text: task.stripped };
        // the checkbox sits INSIDE the paragraph: after `<p>` when the
        // list is loose, at the start of the content when tight
        const tmp = [];
        renderBlock(stripped, refs, tmp, !loose);
        if (tmp.length && tmp[0].startsWith('<p>')) {
          tmp[0] = '<p>' + input + tmp[0].slice(3);
        } else {
          tmp.unshift(input);
        }
        out.push(...tmp);
        first = false;
        continue;
      }
    }
    renderBlock(child, refs, out, !loose && child.t === 'para');
    first = false;
  }
  out.push('</li>\n');
}
// Task list item marker at the start of a paragraph's text.
function taskInfo(text) {
  if (text.length < 3) return null;
  if (text[0] !== '[') return null;
  const c = text[1];
  if (text[2] !== ']') return null;
  let checked;
  if (c === ' ') checked = false;
  else if (c === 'x' || c === 'X') checked = true;
  else return null;
  if (text.length > 3 && text[3] !== ' ') return null;
  return { checked, stripped: text.slice(3) };
}

// ---- entry point -----------------------------------------------------------
export function parse(markdown) {
  inLinkRaw = false;
  const { root, refs } = parseBlocks(markdown);
  const out = [];
  renderBlock(root, refs, out, false);
  return out.join('');
}
