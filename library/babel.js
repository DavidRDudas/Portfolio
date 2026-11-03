// ==========================================================
// THE LIBRARY'S ARITHMETIC
// Every book is 410 pages of 40 lines of 80 characters, each character one of
// the 95 a keyboard types (space to tilde), so there are 95^1,312,000 books
// that could be written, and the library shelves each of them exactly once.
//
// A book's address and its text are the same number written two ways. The
// address counts shelves: which floor, which section along the gallery,
// which slot in the bookcase (5 shelves of 19). The text is that count passed
// through a reversible scramble, so every address holds exactly one book and
// every book stands at exactly one address. Run the scramble backwards on a
// text and you get the one place it is shelved; that is how the book that
// lets you out has a real address like any other.
//
// Numbers are kept as arrays of base-95 digits, least significant first,
// because a floor number here runs to about 1.3 million decimal digits.
// Works in the page, in a worker and in Node.
// ==========================================================
(function (root) {
  'use strict';
  const PAGES = 410, LINES = 40, COLS = 80;
  const PAGE_LEN = LINES * COLS;                    // 3,200 characters a page
  const LEN = PAGES * PAGE_LEN;                     // 1,312,000 characters a book
  const BASE = 95;                                  // ' ' (32) to '~' (126)
  const SHELVES = 5, PER_SHELF = 19;                // 95 books to a bookcase
  // address digits: [0] the slot in the bookcase, then the section, then the floor
  const S_FROM = 1, S_DIGITS = LEN / 2 - 1;         // 655,999 digits of section
  const F_FROM = S_FROM + S_DIGITS, F_DIGITS = LEN - F_FROM;   // 656,000 digits of floor
  const HALF = LEN / 2;
  const ROUNDS = 4;
  // the library's key: change it and every book moves (none is lost or doubled)
  const KEY = [0x6c696272, 0x61727920, 0x6f662062, 0x6162656c];

  // ---- the scramble: a four-round Feistel network on the two halves ----
  // Each round adds to one half a stream of digits drawn from a hash of the
  // other half. Changing any one digit of an address changes the whole text.
  function hashHalf(src, round) {
    let a = KEY[0] ^ Math.imul(round + 1, 0x9e3779b1), b = KEY[1], c = KEY[2] ^ round, d = KEY[3];
    for (let i = 0; i < src.length; i++) {
      const x = src[i] + 1;
      a = Math.imul(a ^ x, 0x85ebca6b); a = (a << 13) | (a >>> 19);
      b = Math.imul(b + x + a, 0xc2b2ae35); b = (b << 17) | (b >>> 15);
      c = Math.imul(c ^ b, 0x27d4eb2f) + x;
      d = Math.imul(d + c, 0x165667b1) ^ (d >>> 11);
    }
    const fmix = h => {
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
      return (h ^ (h >>> 16)) >>> 0;
    };
    return [fmix(a ^ d), fmix(b ^ c), fmix(c + a), fmix(d ^ b ^ round)];
  }
  // add (sign = 1) or take away (sign = -1) the round's stream, digit by digit
  function applyStream(target, seeds, sign) {
    let [a, b, c, d] = seeds;
    for (let i = 0; i < 12; i++) {             // warm the generator up
      const t = (a + b | 0) + d | 0; d = d + 1 | 0;
      a = b ^ (b >>> 9); b = c + (c << 3) | 0; c = (c << 21) | (c >>> 11); c = c + t | 0;
    }
    for (let i = 0; i < target.length; i++) {
      const t = (a + b | 0) + d | 0; d = d + 1 | 0;          // sfc32
      a = b ^ (b >>> 9); b = c + (c << 3) | 0; c = (c << 21) | (c >>> 11); c = c + t | 0;
      const k = (t >>> 0) % BASE;
      const v = target[i] + sign * k;
      target[i] = v >= BASE ? v - BASE : v < 0 ? v + BASE : v;
    }
  }
  // address digits → text digits
  function textOf(address) {
    const out = Uint8Array.from(address);
    let L = out.subarray(0, HALF), R = out.subarray(HALF);
    for (let r = 0; r < ROUNDS; r++) {
      applyStream(R, hashHalf(L, r), 1);
      const t = L; L = R; R = t;
    }
    return out;   // both halves change in place; the rounds just take turns
  }
  // text digits → address digits (the scramble run backwards)
  function addressOf(text) {
    const out = Uint8Array.from(text);
    let L = out.subarray(0, HALF), R = out.subarray(HALF);
    for (let r = ROUNDS - 1; r >= 0; r--) {
      const t = L; L = R; R = t;
      applyStream(R, hashHalf(L, r), -1);
    }
    return out;
  }

  // ---- big numbers as digit arrays ----
  // add a small integer to digits[from, from + n); false if it runs off either end
  function addSmall(digits, from, n, delta) {
    let carry = delta;
    for (let i = from; i < from + n && carry !== 0; i++) {
      let v = digits[i] + carry;
      carry = Math.floor(v / BASE);
      v -= carry * BASE;
      digits[i] = v;
    }
    return carry === 0;
  }
  // the number mod m (m up to about 9e13, so the arithmetic stays exact)
  function modOf(digits, from, n, m) {
    let r = 0;
    for (let i = from + n - 1; i >= from; i--) r = (r * BASE + digits[i]) % m;
    return r;
  }
  // how many decimal digits the number has
  function decimalLength(digits, from, n) {
    let top = from + n - 1;
    while (top > from && digits[top] === 0) top--;
    const lead = digits[top] + (top > from ? digits[top - 1] / BASE : 0) + (top > from + 1 ? digits[top - 2] / BASE / BASE : 0);
    if (lead === 0) return 1;
    return Math.floor(Math.log10(lead) + (top - from) * Math.log10(BASE)) + 1;
  }
  // a uniformly random address (crypto when there is one)
  function randomAddress() {
    const out = new Uint8Array(LEN), buf = new Uint8Array(65536);
    const fill = typeof crypto !== 'undefined' && crypto.getRandomValues ? b => crypto.getRandomValues(b)
      : b => { for (let i = 0; i < b.length; i++) b[i] = Math.random() * 256 | 0; };
    let n = 0;
    while (n < LEN) {
      fill(buf);
      for (let i = 0; i < buf.length && n < LEN; i++) if (buf[i] < BASE * 2) out[n++] = buf[i] % BASE;
    }
    return out;
  }

  // ---- texts ----
  function digitsOfText(str) {
    const out = new Uint8Array(LEN);
    for (let i = 0; i < str.length && i < LEN; i++) {
      const c = str.charCodeAt(i) - 32;
      out[i] = c >= 0 && c < BASE ? c : 0;
    }
    return out;
  }
  function pageText(digits, page) {
    let s = '';
    const from = page * PAGE_LEN;
    for (let line = 0; line < LINES; line++) {
      let row = '';
      for (let c = 0; c < COLS; c++) row += String.fromCharCode(32 + digits[from + line * COLS + c]);
      s += (line ? '\n' : '') + row;
    }
    return s;
  }
  // lay paragraphs out on 80-column lines, a blank line between them, page 1 onward
  function layOut(paragraphs) {
    const lines = [];
    for (const p of paragraphs) {
      let line = '';
      for (const word of p.split(' ')) {
        if (line && line.length + 1 + word.length > COLS) { lines.push(line); line = word; }
        else line = line ? line + ' ' + word : word;
      }
      lines.push(line, '');
    }
    return lines.map(l => l.padEnd(COLS, ' ')).join('');
  }

  // The book that lets you out. Like every other book it is 1,312,000
  // characters; after these lines the rest of its 410 pages are blank.
  const EXIT_TEXT = layOut([
    'This is the book that lets you out.',
    'It was always here. Every book in this library is worked out from where it stands, and this one stands at one place like all the others: run its text back through the same arithmetic and you get its floor, its section, its shelf and its slot.',
    'Put it through the slot at any rest area and you can go home.',
  ]);

  const api = {
    PAGES, LINES, COLS, PAGE_LEN, LEN, BASE, SHELVES, PER_SHELF,
    S_FROM, S_DIGITS, F_FROM, F_DIGITS,
    textOf, addressOf, addSmall, modOf, decimalLength, randomAddress,
    digitsOfText, pageText, EXIT_TEXT,
    exitAddress: () => addressOf(digitsOfText(EXIT_TEXT)),
    sameBook: (a, b) => { for (let i = 0; i < LEN; i++) if (a[i] !== b[i]) return false; return true; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Babel = api;
})(typeof self !== 'undefined' ? self : this);
