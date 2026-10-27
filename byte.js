/* Byte, the robot guide from the 3D world (world.html), on the homepage and
   the portfolio: a button in the corner that opens a small chat. Like the
   cabin's Byte he's scripted (keyword matching over PORTFOLIO_SECTIONS), not
   an AI service, so he works offline on a static site. This file makes its
   own markup (styles in byte.css). Until someone opens the chat, all that
   runs is one short hello per visit; the project index is built on the first
   question. */
(() => {
  'use strict';

  const root = document.documentElement;
  const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const touch = mq('(pointer: coarse)');
  const isSheet = () => mq('(max-width: 640px), (max-height: 480px)');   // the chat is a bottom sheet (byte.css)
  const onCatalogue = !!document.getElementById('project-sections');
  const onHome = !!document.getElementById('featured-projects');
  const QUIET_KEY = 'portfolio.guideQuiet';         // shared with Byte in the 3D world
  const GREETED_KEY = 'portfolio.guideGreeted';     // sessionStorage: one hello per visit
  const EMAIL = 'daviddudas@outlook.com';
  const GITHUB = 'https://github.com/davidrdudas';
  const verb = touch ? 'Tap' : 'Click';
  const pick = list => list[Math.floor(Math.random() * list.length)];

  // storage can be switched off (private windows, strict settings); Byte then just forgets
  const readStore = (area, key) => { try { return window[area].getItem(key); } catch (e) { return null; } };
  const writeStore = (area, key, value) => { try { window[area].setItem(key, value); } catch (e) {} };

  /* ---------------------------------------------------------------- *
   * Markup: the cabin's robot, a hello bubble and the chat
   * ---------------------------------------------------------------- */
  document.body.insertAdjacentHTML('beforeend', `
<div class="guide" id="guide">
  <div class="guide-bubble" id="guide-bubble" role="status">
    <p id="guide-bubble-text"></p>
    <button class="guide-x" id="guide-bubble-x" type="button" aria-label="Dismiss">×</button>
  </div>
  <div class="guide-panel" id="guide-panel" role="dialog" aria-labelledby="guide-name" aria-describedby="guide-role" tabindex="-1" hidden>
    <div class="guide-head">
      <div class="guide-title"><strong id="guide-name">Byte</strong><span id="guide-role">Portfolio guide</span></div>
      <button class="guide-btn guide-quiet" id="guide-quiet" type="button">Mute tips</button>
      <button class="guide-x" id="guide-close" type="button" aria-label="Close chat">×</button>
    </div>
    <div class="guide-log" id="guide-log" role="log"></div>
    <div class="guide-chips" id="guide-chips" role="group" aria-label="Suggestions"></div>
    <form class="guide-form" id="guide-form" autocomplete="off">
      <label class="sr-only" for="guide-input">Ask Byte a question</label>
      <input id="guide-input" type="text" enterkeyhint="send" maxlength="160" placeholder="Ask about a project…">
      <button type="submit" aria-label="Send">↑</button>
    </form>
  </div>
  <button class="guide-bot" id="guide-bot" type="button" aria-label="Chat with Byte, your guide" aria-expanded="false" aria-controls="guide-panel">
    <svg viewBox="0 0 72 72" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="guideGlow"><stop offset="0" stop-color="#ffd9a8" stop-opacity="0.95"/><stop offset="1" stop-color="#ffb87a" stop-opacity="0"/></radialGradient>
        <linearGradient id="guideShell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff5e4"/><stop offset="1" stop-color="#e2c8a4"/></linearGradient>
        <linearGradient id="guideFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d16"/><stop offset="1" stop-color="#140e0a"/></linearGradient>
      </defs>
      <ellipse class="guide-shadow" cx="36" cy="69" rx="14" ry="2.6" fill="#000"/>
      <g class="guide-float">
        <line x1="36" y1="15" x2="36" y2="7.5" stroke="#8a6646" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="36" cy="6" r="6.5" fill="url(#guideGlow)"/>
        <circle class="guide-bulb" cx="36" cy="6" r="3.2" fill="#ffb87a"/>
        <rect x="6.5" y="25.5" width="6.5" height="14" rx="3.25" fill="#c9a37a"/>
        <rect x="59" y="25.5" width="6.5" height="14" rx="3.25" fill="#c9a37a"/>
        <rect x="11" y="14" width="50" height="38" rx="15" fill="url(#guideShell)" stroke="#8a6646" stroke-width="1.6"/>
        <rect x="17" y="21" width="38" height="24" rx="10" fill="url(#guideFace)"/>
        <path d="M21 24.5 Q24 22.6 29 22.4" stroke="#fff" stroke-opacity="0.12" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <g class="guide-eyes">
          <ellipse class="guide-eye" cx="28" cy="32" rx="3.6" ry="4.5" fill="#ffc48a"/>
          <ellipse class="guide-eye" cx="44" cy="32" rx="3.6" ry="4.5" fill="#ffc48a"/>
        </g>
        <path class="guide-mouth" d="M32.5 39.6 Q36 42.4 39.5 39.6" stroke="#ffc48a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <ellipse class="guide-mouth-open" cx="36" cy="40.4" rx="2.6" ry="2" fill="#ffc48a"/>
        <circle cx="21.6" cy="39" r="2.2" fill="#ff8f7a" opacity="0.45"/>
        <circle cx="50.4" cy="39" r="2.2" fill="#ff8f7a" opacity="0.45"/>
        <rect x="24" y="51" width="24" height="11.5" rx="5.75" fill="url(#guideShell)" stroke="#8a6646" stroke-width="1.6"/>
        <circle class="guide-bulb" cx="36" cy="56.8" r="2.1" fill="#ffb87a"/>
      </g>
    </svg>
  </button>
</div>`);

  const $ = id => document.getElementById(id);
  const el = $('guide'), bot = $('guide-bot');
  const bubble = $('guide-bubble'), bubbleText = $('guide-bubble-text');
  const panel = $('guide-panel'), log = $('guide-log'), chips = $('guide-chips');
  const form = $('guide-form'), input = $('guide-input'), quietBtn = $('guide-quiet');
  let quiet = readStore('localStorage', QUIET_KEY) === '1';
  let greeted = !!readStore('sessionStorage', GREETED_KEY);
  let started = false, hideTimer = 0, talkTimer = 0, helloTimer = 0;

  /* ---------------------------------------------------------------- *
   * Talking
   * ---------------------------------------------------------------- */
  // an action is a link ({ href }, in a new tab when it leaves the site) or a
  // button ({ run })
  function renderActions(container, actions) {
    for (const a of actions) {
      const b = document.createElement(a.href ? 'a' : 'button');
      b.className = 'guide-btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      if (!a.href) {
        b.type = 'button';
        b.addEventListener('click', () => a.run());
      } else {
        b.href = a.href;
        if (leavesSite(a.href)) {
          b.target = '_blank';
          b.rel = 'noopener noreferrer';
          b.insertAdjacentHTML('beforeend', '<span aria-hidden="true">&nbsp;↗</span><span class="sr-only"> (opens in a new tab)</span>');
        }
      }
      container.appendChild(b);
    }
  }
  function leavesSite(href) {
    try {
      const url = new URL(href, location.href);
      return /^https?:$/.test(url.protocol) && url.host !== location.host;
    } catch (e) { return false; }
  }

  // `project` ({ lead, title, kicker }) heads the text like a small card
  function addMessage(who, text, actions = [], project = null) {
    const m = document.createElement('div');
    m.className = 'guide-msg ' + who;
    if (project) {
      for (const [tag, part] of [['span', 'lead'], ['strong', 'title'], ['span', 'kicker']]) {
        if (!project[part]) continue;
        const line = document.createElement(tag);
        line.className = 'guide-msg-' + part;
        line.textContent = project[part];
        m.appendChild(line);
      }
    }
    m.append(text);
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'guide-actions';
      renderActions(row, actions);
      m.appendChild(row);
    }
    log.appendChild(m);
    while (log.children.length > 60) log.firstChild.remove();
    // the whole reply in view, or at least its start when it's taller than the log
    const top = m.offsetHeight + 24 > log.clientHeight ? m.offsetTop - 12 : log.scrollHeight;
    log.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }
  function say(text, actions = [], project = null) {
    addMessage('bot', text, actions, project);
    talk(text);
  }
  function talk(text) {
    el.classList.add('talking');
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => el.classList.remove('talking'), Math.min(2600, 380 + text.length * 22));
  }
  function hop() {
    el.classList.remove('hop');
    void el.offsetWidth;   // restart the animation
    el.classList.add('hop');
    setTimeout(() => el.classList.remove('hop'), 520);
  }
  // the visitor asks something (typed, a suggestion or a reply's button);
  // `answer` is a query for respond() or a function that replies
  function ask(text, answer = text) {
    addMessage('me', text);
    setTimeout(() => (typeof answer === 'function' ? answer() : respond(answer)), reduced ? 0 : 240);
  }

  function showBubble(text) {
    el.classList.remove('tucked');   // he stands up to talk
    bubble.classList.add('visible');
    // filled in once it's visible, so screen readers announce it
    requestAnimationFrame(() => { bubbleText.textContent = text; });
    talk(text);
    hop();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBubble, Math.min(12000, 4200 + text.length * 45));
  }
  function hideBubble() {
    clearTimeout(hideTimer);
    if (!bubble.classList.contains('visible')) return;
    bubble.classList.remove('visible');
    settle();
  }
  bubble.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  bubble.addEventListener('pointerleave', () => {
    if (bubble.classList.contains('visible')) hideTimer = setTimeout(hideBubble, 4000);
  });
  $('guide-bubble-x').addEventListener('click', hideBubble);
  bubbleText.addEventListener('click', () => openPanel());   // the words are a shortcut to the chat

  /* ---------------------------------------------------------------- *
   * The chat
   * ---------------------------------------------------------------- */
  const CHIPS = (onHome ? [['What’s on this page?', 'this page']] : []).concat(
    [['Surprise me', 'surprise me'], ['Games', 'games'], ['Simulations', 'simulations']],
    onCatalogue ? [['Rust', 'rust'], ['Three.js', 'three.js']] : [],
    [['Books', 'books'], ['Who is David?', 'who is david'], ['The 3D world', '3d world'], ['Contact David', 'contact']]
  );
  function start() {
    started = true;
    renderActions(chips, CHIPS.map(([label, query]) => ({ label, run: () => ask(label, query) })));
    say('Hi! Ask me about David’s work, or pick something below. 🙂 I’m a simple keyword robot, so short questions work best.');
  }

  function openPanel() {
    if (!panel.hidden) return;
    hideBubble();
    skipHello();   // they've found Byte; no need to say hello this visit
    panel.hidden = false;
    el.classList.remove('tucked');
    el.classList.add('open');
    bot.setAttribute('aria-expanded', 'true');
    fitViewport();
    if (!started) start();
    // touch screens: don't throw the keyboard up before they've read anything
    (touch ? panel : input).focus({ preventScroll: true });
  }
  function closePanel(focusTo) {
    if (panel.hidden) return;
    const hadFocus = el.contains(document.activeElement);
    panel.hidden = true;
    el.classList.remove('open');
    bot.setAttribute('aria-expanded', 'false');
    if (focusTo) focusTo.focus({ preventScroll: true });
    else if (hadFocus) bot.focus({ preventScroll: true });
    settle();
  }
  bot.addEventListener('click', () => {
    hop();
    if (panel.hidden) openPanel(); else closePanel();
  });
  $('guide-close').addEventListener('click', () => closePanel(bot));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const focus = document.activeElement;
    if (!panel.hidden && (el.contains(focus) || !focus || focus === document.body)) closePanel(bot);
    else hideBubble();
  });

  // phones: keep the sheet inside what's visible while the keyboard is up
  function fitViewport() {
    if (window.visualViewport) el.style.setProperty('--guide-vh', Math.round(visualViewport.height) + 'px');
  }
  if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (!panel.hidden) fitViewport(); });

  // quiet: no hello here and no unprompted tips in the 3D world
  function refreshQuiet() { quietBtn.textContent = quiet ? 'Unmute tips' : 'Mute tips'; }
  quietBtn.addEventListener('click', () => {
    quiet = !quiet;
    writeStore('localStorage', QUIET_KEY, quiet ? '1' : '0');
    refreshQuiet();
    say(quiet ? `Okay, I’ll keep quiet here and in the 3D world. ${verb} me whenever you need me.`
      : 'Okay! I’ll say hello when you visit.');
  });
  window.addEventListener('storage', e => {   // changed in another tab
    if (e.key !== QUIET_KEY) return;
    quiet = e.newValue === '1';
    refreshQuiet();
  });
  refreshQuiet();

  /* ---------------------------------------------------------------- *
   * Staying out of the way: Byte tucks into the corner, peeking, while a
   * link, button or field he'd cover sits under him. Checked once the page
   * comes to rest; big click areas (whole cards, index rows) stay usable
   * around him.
   * ---------------------------------------------------------------- */
  let restTimer = 0;
  function checkUnder() {
    let covered = false;
    if (panel.hidden && !bubble.classList.contains('visible')) {
      const box = el.getBoundingClientRect();
      for (const [fx, fy] of [[0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]]) {
        const under = document.elementsFromPoint(box.left + box.width * fx, box.top + box.height * fy).find(n => !el.contains(n));
        const control = under && under.closest('a[href], button, input, select, textarea');
        if (!control) continue;
        const r = control.getBoundingClientRect();
        if (r.width * r.height < box.width * box.height * 4 &&
            r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom) {
          covered = true;
          break;
        }
      }
    }
    el.classList.toggle('tucked', covered);
  }
  function settle() {
    clearTimeout(restTimer);
    restTimer = setTimeout(checkUnder, 150);
  }
  window.addEventListener('scroll', settle, { passive: true });
  window.addEventListener('resize', settle);
  window.addEventListener('load', settle);

  /* ---------------------------------------------------------------- *
   * Hello: one short line per visit, a few seconds in, never when muted
   * ---------------------------------------------------------------- */
  function sayHello() {
    if (quiet || greeted || !panel.hidden) return;
    if (document.hidden) {   // wait until they're looking
      document.addEventListener('visibilitychange', () => { helloTimer = setTimeout(sayHello, 1500); }, { once: true });
      return;
    }
    skipHello();
    showBubble(onCatalogue
      ? 'Hi, I’m Byte! 👋 Ask me to find a project, a section or a technology.'
      : 'Hi, I’m Byte! 👋 I usually live in the 3D cabin. Ask me about David’s work.');
  }
  function skipHello() {
    clearTimeout(helloTimer);
    greeted = true;
    writeStore('sessionStorage', GREETED_KEY, '1');
  }
  // the homepage's opening has the screen to itself first (html.intro, set in
  // index.html and cleared by home.js); Byte steps in once it's over
  function afterIntro(fn) {
    const playing = () => root.classList.contains('intro') && !root.classList.contains('intro-failsafe');
    if (!playing()) return fn();
    const watch = new MutationObserver(() => {
      if (playing()) return;
      watch.disconnect();
      fn();
    });
    watch.observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  afterIntro(() => {
    el.classList.add('ready');
    settle();
    if (!quiet && !greeted) helloTimer = setTimeout(sayHello, 3500);
  });

  // the eyes follow the mouse a little
  if (!touch && !reduced) {
    let x = 0, y = 0, frame = 0;
    const look = () => {
      frame = 0;
      const r = bot.getBoundingClientRect();
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      bot.style.setProperty('--ex', (dx / d * 2.4 * k).toFixed(2) + 'px');
      bot.style.setProperty('--ey', (dy / d * 1.6 * k).toFixed(2) + 'px');
    };
    window.addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      if (!frame) frame = requestAnimationFrame(look);
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- *
   * What Byte knows, indexed from PORTFOLIO_SECTIONS on the first question
   * ---------------------------------------------------------------- */
  // lower case, no accents or punctuation, padded so whole words can be
  // matched: 'Three.js' → ' three js '
  const norm = text => ' ' + String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9#+]+/g, ' ').trim() + ' ';
  const stem = word => (word.length > 3 ? word.replace(/s$/, '') : word);
  const wordSet = text => new Set(text.split(' '));

  // more words that find a section, by the first word of its title
  const SECTION_WORDS = {
    systems: 'system enterprise backend',
    languages: 'language compiler programming',
    simulations: 'simulation sim computational art',
    games: 'game gaming',
    ventures: 'venture company companies business startup',
    applications: 'app application',
    writing: 'book author novel wrote written publishing',
    photography: 'photo photograph picture',
    research: 'research interest',
  };
  // names people use that aren't in a project's title
  const ALIASES = {
    'aco': 'Ant Colony Optimization',
    'ant farm': 'Ant Colony Optimization',
    'atom': 'Hydrogen — Orbital Explorer',
    'colour wave': 'Color Wave Patterns',
  };
  // a project answers to its title, the part before a dash, the title with
  // its capitals split (NeutralHQ → neutral hq) or its spaces closed
  // (rastertide), and any aliases
  function projectNames(title) {
    const full = norm(title);
    const names = [
      full,
      norm(title.split(/\s[—–-]\s/)[0]),
      norm(title.replace(/([a-z])([A-Z])/g, '$1 $2')),
      ' ' + full.replace(/ /g, '') + ' ',
      ...Object.keys(ALIASES).filter(alias => ALIASES[alias] === title).map(norm),
    ];
    return [...new Set(names)].filter(name => name.trim().length > 2);
  }

  let known = null;
  function knowledge() {
    if (known) return known;
    const sections = typeof PORTFOLIO_SECTIONS === 'undefined' ? [] : PORTFOLIO_SECTIONS;
    const groups = sections.map((section, si) => {
      const first = norm(section.title).trim().split(' ')[0];
      const words = norm(section.title + ' ' + (SECTION_WORDS[first] || '')).trim().split(' ')
        .filter(w => w.length > 2 && w !== 'and').map(stem);
      return { section, si, words: new Set(words), projects: [] };
    });
    const projects = [], tags = new Map();
    for (const group of groups) {
      group.section.items.forEach((item, pi) => {
        const p = {
          item, group, pi, title: item.title, names: projectNames(item.title),
          head: norm([item.title, item.cat, ...item.tech].join(' ')),   // what it is
          body: norm(item.desc),                                         // what it mentions
        };
        group.projects.push(p);
        projects.push(p);
        for (const tag of item.tech) tags.set(norm(tag), tag);
      });
    }
    known = { groups, projects, tags };
    return known;
  }

  // does a normalized text contain this word? Long words match the start of
  // a word ('simulat' finds 'simulation'), short ones only whole or plural,
  // so 'java' doesn't find 'javascript'
  function contains(text, word) {
    const s = stem(word);
    if (word.length > 4) return text.includes(' ' + word) || text.includes(' ' + s);
    return [word, s, word + 's'].some(form => text.includes(' ' + form + ' '));
  }
  const inSection = (group, word) => group.words.has(word) || group.words.has(stem(word));
  // how well a word fits a project: title, category or tech (3), its section
  // (2), its description (1), not at all (0)
  function fit(p, word) {
    if (contains(p.head, word)) return 3;
    if (inSection(p.group, word)) return 2;
    return contains(p.body, word) ? 1 : 0;
  }
  // projects that fit every word (or, with every = false, any), best first;
  // the sort is stable, so equals keep the catalogue's order
  function find(words, every = true) {
    const hits = score => score.filter(Boolean).length;
    const total = score => score.reduce((sum, n) => sum + n, 0);
    return known.projects
      .map(p => ({ p, score: words.map(w => fit(p, w)) }))
      .filter(r => (every ? hits(r.score) === words.length : hits(r.score) > 0))
      .sort((a, b) => hits(b.score) - hits(a.score) || total(b.score) - total(a.score))
      .map(r => r.p);
  }

  // the catalogue speaks in David's voice; Byte talks about him
  const aboutDavid = text => text
    .replace(/\bI (lead|build|run|make|write)\b/g, (m, v) => `David ${v}s`)
    .replace(/\b[Mm]y\b/g, 'David’s');
  // a project's first sentence, cut at a dash or colon when it runs long
  function summary(desc) {
    let s = (desc.match(/^.*?[.!?](\s|$)/) || [desc])[0].trim();
    const cut = s.search(/ — |: /);
    if (s.length > 140 && cut > 40) s = s.slice(0, cut) + '.';
    return aboutDavid(s);
  }

  /* ---------------------------------------------------------------- *
   * Answers
   * ---------------------------------------------------------------- */
  const HELLO = wordSet('hi hey hello yo hiya heya howdy sup hola greetings there byte good morning afternoon evening what s up');
  const THANKS = wordSet('thanks thank thx ty you u so much very cool nice great awesome perfect neat ok okay got it wow lol haha byte one');
  const DAVID = wordSet('david dudas s');
  const OVERVIEW = wordSet('projects project work works portfolio everything all list section sections category categories made built catalogue catalog');
  const STOP = wordSet('a an the and or but of in on at for to with by from into about as is are was were be been am do does did has have had ' +
    'can could would should will i me my you your he his him she her it its we our they them their this that these those there here what which ' +
    'who whom whose where when why how any some all each every more most other else such no not only just also very too so than then s t d m ll ' +
    're ve please show tell give find get see look looking want need like know let lets thing things stuff something one ones ' +
    'project projects work works made make makes built build builds use uses used using david dudas byte portfolio everything list ' +
    'section sections category categories discipline disciplines catalogue catalog');
  const JOKES = [
    'Why do programmers prefer dark mode? Because light attracts bugs. 🐛',
    'I’d tell you a UDP joke, but you might not get it.',
    'There are 10 kinds of people: those who understand binary and those who don’t.',
    'A robot walks into a bar. “What’ll it be?” “Something to loosen my bolts.” 🔩',
  ];

  function respond(raw) {
    const k = knowledge();
    const q = norm(raw);
    const words = q.trim().split(' ').filter(w => /[a-z0-9]/.test(w));
    const has = (...phrases) => phrases.some(p => q.includes(' ' + p + ' '));
    const only = set => words.length > 0 && words.every(w => set.has(w));

    if (!words.length) return help();
    if (only(HELLO)) return say('Hey there! 👋 Ask me about a project, a section like games, or a technology like Rust.');
    if (has('who are you', 'what are you', 'your name', 'are you ai', 'are you an ai', 'are you a bot', 'are you a robot', 'are you real',
      'are you human', 'is this ai', 'is this an ai', 'chatbot', 'llm', 'about you', 'about yourself', 'who is byte', 'what is byte',
      'who made you')) {
      return say('I’m Byte, a tiny scripted robot. I usually live in David’s 3D cabin. I’m not a real AI: I match keywords against his project list. 🤖');
    }
    if (only(THANKS)) return say(pick(['Anytime! 🤖', 'Happy to help!', 'Beep boop, you’re welcome!']));
    if (has('joke', 'jokes', 'funny', 'laugh', 'pun')) return say(pick(JOKES));
    if (has('help', 'what can you do', 'what can i ask', 'what do you know', 'how does this work')) return help();
    if (has('contact', 'email', 'e mail', 'mail', 'hire', 'reach', 'get in touch', 'linkedin', 'github', 'message him', 'talk to him')) return contact();
    if (only(DAVID) || has('who is david', 'who s david', 'who is he', 'about david', 'about him', 'what does he do', 'what does david do',
      'bio', 'background', 'phd', 'university', 'mississippi', 'school', 'education', 'student', 'resume', 'cv', 'who made this', 'who built this')) {
      return about();
    }
    if (has('cabin', 'world', 'tour', 'walkthrough', 'walk through', 'first person', 'where do you live')) return world();
    if (has('surprise', 'random', 'pick one', 'bored', 'lucky', 'something cool')) return surprise();
    if (has('this page', 'this site', 'selected', 'featured', 'highlights')) return thisPage();
    if (has('best', 'favorite', 'favourite', 'recommend', 'where should i start', 'where do i start')) return favourites();

    // a project by name
    const named = k.projects.filter(p => p.names.some(name => q.includes(name)));
    if (named.length === 1) return describe(named[0]);
    if (named.length) return list(named, raw.trim());

    const terms = words.filter(w => !STOP.has(w));
    if (!terms.length) return words.some(w => OVERVIEW.has(w)) ? overview() : help();
    // a section: every word names it ('games', 'computational art')
    const group = k.groups.find(g => terms.every(w => inSection(g, w)));
    if (group) return showSection(group);
    // anything else: projects whose title, tech or description mention it.
    // 'written in rust' finds nothing in Writing, so try again without the
    // section words; then settle for projects that fit some of the words
    let used = terms, found = find(terms);
    const specific = terms.filter(w => !k.groups.some(g => inSection(g, w)));
    if (!found.length && specific.length && specific.length < terms.length) found = find(used = specific);
    if (!found.length) { used = null; found = find(terms, false); }
    if (found.length) return results(found, used || terms, !!used, raw.trim());
    fallback();
  }

  const projectButton = p => ({ label: p.title, run: () => ask(p.title, () => describe(p)) });
  const sectionButton = g => ({ label: g.section.title, run: () => ask(g.section.title, () => showSection(g)) });

  function describe(p, lead = '', extra = []) {
    say(summary(p.item.desc), projectActions(p).concat(extra), { lead, title: p.title, kicker: p.item.cat });
  }
  function projectActions(p) {
    const actions = [], card = cardFor(p);
    if (card) actions.push({ label: 'Show me', run: () => showCard(p) });
    if (p.item.link) actions.push({ label: 'Open', href: p.item.link });
    if (!card && !onCatalogue) actions.push({ label: 'View in portfolio', href: sectionHref(p.group) });
    if (actions.length) actions[0].primary = true;
    return actions;
  }
  function list(found, query) {
    const shown = found.slice(0, 8);
    say(`${found.length} projects match “${query}”${found.length > shown.length ? '. The first few:' : ':'}`, shown.map(projectButton));
  }
  // `exact`: every word in `terms` was found; otherwise these only fit some
  function results(found, terms, exact, asked) {
    const tag = known.tags.get(norm(terms.join(' ')));   // 'three js' → 'Three.js'
    const quoted = `“${tag || asked}”`;
    if (found.length === 1) {
      const p = found[0];
      const inTitle = exact && terms.every(w => contains(norm(p.title), w));   // no need to say why
      return describe(p, inTitle ? '' : `${exact ? 'One match' : 'Closest match'} for ${quoted}:`);
    }
    const shown = found.slice(0, 8);
    const actions = shown.map(projectButton);
    // the page's search matches inside words, so short words find more there
    if (onCatalogue && exact && terms.every(w => w.length > 3)) {
      const term = tag || terms.join(' ');
      actions.unshift({ label: 'Search the page', primary: true, run: () => searchPage(term) });
    }
    const more = found.length > shown.length ? '. The first few:' : ':';
    say(`${exact ? found.length + ' matches' : 'Closest matches'} for ${quoted}${more}`, actions);
  }
  function showSection(g) {
    const n = g.projects.length;
    if (n === 1) return describe(g.projects[0], `${g.section.title} has one project:`);
    const actions = g.projects.map(projectButton);
    actions.unshift(onCatalogue
      ? { label: 'Filter the page', primary: true, run: () => filterPage(g) }
      : { label: 'View in portfolio', primary: true, href: sectionHref(g) });
    say(`${g.section.title}: ${n} projects.`, actions);
  }
  function overview() {
    const { groups, projects } = knowledge();
    const actions = groups.map(sectionButton);
    if (!onCatalogue) actions.unshift({ label: 'Open the portfolio', primary: true, href: 'portfolio.html' });
    else if (pageFiltered()) actions.unshift({ label: 'Show all projects', primary: true, run: showEverything });
    say(`David’s portfolio has ${projects.length} projects in ${groups.length} sections:`, actions);
  }
  function thisPage() {
    if (!onHome) return overview();
    const selected = $('featured-projects'), index = $('discipline-index');
    const n = selected.querySelectorAll('.bento-card').length;
    say(`This page has ${n} selected projects and an index of every section. The full list is on the portfolio page.`, [
      { label: 'Jump to selected projects', primary: true, run: () => pointAt(selected.closest('section')) },
      index && { label: 'Jump to the index', run: () => pointAt(index.closest('section')) },
      { label: 'Open the portfolio', href: 'portfolio.html' },
    ].filter(Boolean));
  }
  function favourites() {
    const selected = $('featured-projects');
    say('I don’t rank David’s work, but he picked a few projects for the homepage.', [
      selected ? { label: 'Jump to selected projects', primary: true, run: () => pointAt(selected.closest('section')) }
        : { label: 'See his picks', primary: true, href: 'index.html#selected-title' },
      { label: 'Surprise me', run: () => ask('Surprise me', surprise) },
    ]);
  }
  function contact() {
    say(`You can email David at ${EMAIL}. His code lives on GitHub.`, [
      { label: 'Email David', primary: true, href: 'mailto:' + EMAIL },
      { label: 'GitHub', href: GITHUB },
    ]);
  }
  function about() {
    say('David Dudas is a software architect, creator and Computer Science PhD student at Mississippi State. He builds software, games and computational tools.', [
      onCatalogue ? { label: 'Browse his projects', primary: true, run: () => ask('All sections', overview) }
        : { label: 'See his work', primary: true, href: 'portfolio.html' },
      { label: 'Contact David', run: () => ask('Contact David', contact) },
    ]);
  }
  function world() {
    say('The 3D world is a cabin on a cliff by the ocean, and it’s where I live. Every glowing “i” in it is one of David’s projects. I give tours there! 🏡', [
      { label: 'Enter the 3D world', primary: true, href: 'world.html' },
    ]);
  }
  let lastSurprise = null;
  function surprise() {
    const p = lastSurprise = pick(knowledge().projects.filter(p => !p.item.muted && p !== lastSurprise));
    describe(p, 'How about this one?', [{ label: 'Another one', run: () => ask('Another one', surprise) }]);
  }
  function help() {
    say('I can find David’s projects by name, section or technology, tell you about him, or how to reach him. Try “games”, “Rust”, “Hokku” or “surprise me”.');
  }
  function fallback() {
    say('Hmm, I’m a simple robot and don’t know that one. 🤖 Try a project name, a section like “games”, a technology like “Rust”, or “contact”.', [
      { label: 'Surprise me', run: () => ask('Surprise me', surprise) },
      { label: 'All sections', run: () => ask('All sections', overview) },
    ]);
  }

  /* ---------------------------------------------------------------- *
   * Pointing at things on the page
   * ---------------------------------------------------------------- */
  // the catalogue (portfolio.html) renders sections and cards in data order
  const catalogueSection = g => document.querySelectorAll('#project-sections > .cat-section')[g.si] || null;
  // the homepage's index links each section to the catalogue, filtered (portfolio.html#games)
  function sectionHref(g) {
    const link = document.querySelectorAll('#discipline-index a')[g.si];
    return link ? link.getAttribute('href') : 'portfolio.html';
  }
  // a card's title, without the screen-reader note inside its link
  function cardTitle(card) {
    const title = card.querySelector('h3 a') || card.querySelector('h3');
    return title && title.firstChild ? title.firstChild.textContent.trim() : '';
  }
  // the project's card on this page: the catalogue's, or a selected project on the homepage
  function cardFor(p) {
    const section = catalogueSection(p.group);
    if (section) return section.querySelector(`.p-card[data-project="${p.pi}"]`);
    return [...document.querySelectorAll('#featured-projects .bento-card')].find(card => cardTitle(card) === p.title) || null;
  }

  // the sticky header (and the catalogue's tool bar) cover the top of the page
  const coveredTop = () => [...document.querySelectorAll('.site-header, .pf-tools')].reduce((h, bar) => h + bar.offsetHeight, 0);
  function scrollToEl(target, centre) {
    const top = coveredTop(), r = target.getBoundingClientRect();
    const gap = centre ? Math.max(16, (innerHeight - top - r.height) / 2) : 16;
    window.scrollTo({ top: scrollY + r.top - top - gap, behavior: reduced ? 'auto' : 'smooth' });
  }
  // after changing the page: a note in the chat, the change in view, and on
  // phones the sheet out of the way
  function pointAt(target, note) {
    if (note) say(note);
    if (target) scrollToEl(target);
    if (isSheet()) closePanel();
  }

  let spotTimer = 0;
  function showCard(p) {
    const card = cardFor(p);
    if (!card) return;
    if (card.closest('[hidden]')) showAllProjects();   // filtered out of the catalogue
    const link = card.querySelector('h3 a');
    if (!link) card.tabIndex = -1;
    closePanel(link || card);   // the card might be under the chat; focus goes to it
    scrollToEl(card, true);
    document.querySelectorAll('.guide-spot').forEach(c => c.classList.remove('guide-spot'));
    void card.offsetWidth;      // restart the glow
    card.classList.add('guide-spot');
    clearTimeout(spotTimer);
    spotTimer = setTimeout(() => card.classList.remove('guide-spot'), 3000);
  }

  // the catalogue's filters belong to portfolio-ui.js: Byte uses its controls
  const resultsTop = () => $('result-count');
  function setCategory(id) {
    const chip = document.querySelector(`#category-nav [data-category="${id}"]`);
    if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
  }
  function setSearch(text) {
    const field = $('project-search');
    if (!field || field.value === text) return;
    field.value = text;
    field.dispatchEvent(new Event('input'));
  }
  function pageFiltered() {
    const all = document.querySelector('#category-nav [data-category="all"]'), field = $('project-search');
    return (!!all && all.getAttribute('aria-pressed') !== 'true') || (!!field && !!field.value);
  }
  function showAllProjects() {
    setSearch('');
    setCategory('all');
  }
  function showEverything() {
    showAllProjects();
    pointAt(resultsTop(), 'The page shows every project again.');
  }
  function filterPage(g) {
    const section = catalogueSection(g);
    if (!section) return;
    setSearch('');
    setCategory(section.dataset.category);
    pointAt(resultsTop(), `The page shows ${g.section.title} now.`);
  }
  function searchPage(term) {
    setCategory('all');
    setSearch(term);
    pointAt(resultsTop(), `The page shows what matches “${term}” now.`);
  }
})();
