/* The two editorial pages share a catalogue; world.html is independent. */
(() => {
  "use strict";

  const sections = PORTFOLIO_SECTIONS;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
  const categories = [
    ["systems", "Systems & enterprise"],
    ["languages", "Languages & compilers"],
    ["simulations", "Simulations & art"],
    ["games", "Games"],
    ["ventures", "Ventures"],
    ["applications", "Applications"],
    ["writing", "Writing"],
    ["photography", "Photography"],
    ["research", "Research"]
  ];
  const total = sections.reduce((sum, section) => sum + section.items.length, 0);
  const projects = sections.flatMap(section => section.items);
  const reducedMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function destination(project) {
    if (!project.link) return "";
    if (project.link.includes("store.steampowered.com/")) return "View on Steam";
    if (project.link.includes("amazon.com/")) return "Read the book";
    if (project.link.startsWith("./")) return "Try the interactive demo";
    try { return new URL(project.link).hostname.replace(/^www\./, ""); }
    catch { return "Visit project"; }
  }
  // the title link stretches over its whole card (see .p-title a::after)
  function titleLink(project) {
    if (!project.link) return esc(project.title);
    return `<a href="${esc(project.link)}" target="_blank" rel="noopener noreferrer">${esc(project.title)}` +
      `<span class="sr-only"> — ${esc(destination(project))} (opens in a new tab)</span></a>`;
  }

  /* ---------- shared: header, spotlight, reveal ---------- */
  const header = document.querySelector(".site-header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  // cards light up under the pointer
  document.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    const card = event.target.closest && event.target.closest(".p-card, .bento-card, .entry-card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - r.left}px`);
    card.style.setProperty("--my", `${event.clientY - r.top}px`);
  }, { passive: true });
  const revealer = !reducedMotion && "IntersectionObserver" in window
    ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          revealer.unobserve(entry.target);
        }
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 })
    : null;
  function reveal(root = document) {
    root.querySelectorAll("[data-reveal]:not(.is-in)").forEach(el => revealer ? revealer.observe(el) : el.classList.add("is-in"));
  }

  /* ---------- landing page: selected projects ---------- */
  const featured = document.getElementById("featured-projects");
  if (featured) {
    const picks = [
      ["Painted Crowns", "Games", "An indie game bringing art, music, design, and complex AI together.", "xl"],
      ["Hokku", "Systems & enterprise", "A real-time ticketing platform, engineered for performance and reliability.", "md"],
      ["Shatterwing", "Games", "Vertical bullet-hell shooter built in Godot.", "sm"],
      ["rigid", "Languages & compilers", "A text-first, content-addressed language kernel.", "sm"],
      ["Code Constellation", "Simulations & art", "A static analyser that renders itself as a night sky.", "sm"],
      ["Raster Tide", "Creative tools", "Turn images and video into animated ASCII art, right in your browser.", "md"],
      ["Ant Colony Optimization", "Simulations & art", "Real-time 3D ecosystem of competing ant colonies.", "xl"]
    ];
    featured.innerHTML = picks.map(([title, category, summary, size], i) => {
      const project = projects.find(item => item.title === title);
      if (!project) return "";
      return `<article class="bento-card size-${size}" data-reveal style="--reveal-delay:${(i % 3) * 0.08}s">
        <div class="bento-media"><img src="images/${esc(project.img)}" alt="" loading="lazy" decoding="async"></div>
        <div class="bento-body">
          <p class="p-kicker">${esc(category)}</p>
          <h3 class="bento-title">${titleLink(project)}</h3>
          <p class="bento-desc">${esc(summary)}</p>
        </div>
        ${project.link ? '<span class="p-arrow" aria-hidden="true">→</span>' : ""}
      </article>`;
    }).join("");
  }

  const container = document.getElementById("project-sections");
  if (!container) { reveal(); return; }

  /* ---------- portfolio catalogue ---------- */
  const search = document.getElementById("project-search");
  const searchWrap = search.closest(".search-wrap");
  const clear = document.getElementById("clear-search");
  const nav = document.getElementById("category-nav");
  const count = document.getElementById("result-count");
  const empty = document.getElementById("empty-state");
  let activeCategory = "all";
  let query = "";

  function cardHTML(project, sectionIndex, projectIndex) {
    const descriptionId = `description-${sectionIndex}-${projectIndex}`;
    return `<article class="p-card${project.muted ? " is-archived" : ""}" data-project="${projectIndex}">
      <div class="p-media">${project.muted ? '<span class="archived-badge">From the archive</span>' : ""}<img src="images/${esc(project.img)}" alt="" loading="lazy" decoding="async"></div>
      <div class="p-body">
        <p class="p-kicker">${esc(project.cat)}</p>
        <h3 class="p-title">${titleLink(project)}${project.link ? '<span class="p-arrow" aria-hidden="true">→</span>' : ""}</h3>
        <p id="${descriptionId}" class="p-desc is-clamped">${esc(project.desc)}</p>
        <button class="desc-toggle" type="button" aria-expanded="false" aria-controls="${descriptionId}" aria-label="Read more about ${esc(project.title)}" hidden>Read more +</button>
        <div class="tags">${project.tech.map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
        ${project.link ? `<span class="p-dest">${esc(destination(project))} <span aria-hidden="true">↗</span></span>` : ""}
      </div>
    </article>`;
  }

  nav.innerHTML = `<button class="chip" type="button" data-category="all" aria-pressed="true" aria-controls="project-sections">All work <span class="n">${total}</span></button>` +
    sections.map((section, i) => `<button class="chip" type="button" data-category="${categories[i][0]}" aria-pressed="false" aria-controls="project-sections">${esc(categories[i][1])} <span class="n">${section.items.length}</span></button>`).join("");

  container.innerHTML = sections.map((section, i) => `
    <section class="cat-section" id="sec-${i+1}" data-category="${categories[i][0]}" aria-labelledby="cat-title-${i}">
      <div class="cat-head">
        <span class="cat-num" aria-hidden="true">${String(i+1).padStart(2,"0")}</span>
        <h2 id="cat-title-${i}">${esc(section.title)}</h2>
        <span class="cat-count">${section.items.length} ${section.items.length === 1 ? "project" : "projects"}</span>
        <p class="cat-blurb">${esc(section.blurb)}</p>
      </div>
      <div class="card-grid">${section.items.map((project, j) => cardHTML(project, i, j)).join("")}</div>
    </section>
  `).join("");

  // drop the fade once the chip row is scrolled to its end (or fits)
  const updateChipFade = () => nav.classList.toggle("at-end", nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2);
  nav.addEventListener("scroll", updateChipFade, { passive: true });
  window.addEventListener("resize", updateChipFade);
  updateChipFade();

  const sectionElements = [...container.querySelectorAll(".cat-section")];
  const normalize = value => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const searchText = sections.map(section => section.items.map(project =>
    normalize([project.title, project.cat, project.desc, section.title, ...project.tech].join(" "))
  ));

  // "Read more" only where three lines really cut the description short
  function measureClamps() {
    container.querySelectorAll(".p-desc").forEach(desc => {
      const button = desc.nextElementSibling;
      if (button.getAttribute("aria-expanded") === "true") return;
      desc.classList.add("is-clamped");
      button.hidden = desc.scrollHeight <= desc.clientHeight + 1;
    });
  }

  function applyFilters() {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const filtered = activeCategory !== "all" || terms.length > 0;
    let matches = 0;
    sectionElements.forEach((section, i) => {
      let inSection = 0;
      const categoryMatches = activeCategory === "all" || section.dataset.category === activeCategory;
      section.querySelectorAll(".p-card").forEach((project, j) => {
        const show = categoryMatches && terms.every(term => searchText[i][j].includes(term));
        project.hidden = !show;
        if (show) inSection++;
      });
      matches += inSection;
      section.hidden = inSection === 0;
      section.querySelector(".card-grid").className = `card-grid${inSection < 3 ? " count-" + inSection : ""}`;
      section.querySelector(".cat-count").textContent = `${inSection} ${inSection === 1 ? "project" : "projects"}`;
    });
    nav.querySelectorAll("button").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.category === activeCategory))
    );
    count.textContent = filtered
      ? `${matches} of ${total} projects${query.trim() ? ' matching “' + query.trim() + '”' : ""}`
      : `${total} projects across ${sections.length} disciplines`;
    clear.hidden = !query;
    searchWrap.classList.toggle("has-query", !!query);
    empty.hidden = matches > 0;
    measureClamps();
  }

  // keep the first result in view when the filters shrink the page under you
  function showResults() {
    const top = container.getBoundingClientRect().top;
    const tools = document.querySelector(".pf-tools");
    const offset = (header ? header.offsetHeight : 0) + (tools ? tools.offsetHeight : 0);
    if (top < offset) window.scrollTo({ top: window.scrollY + top - offset - 16, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function readHash() {
    const hash = window.location.hash.slice(1);
    if (hash === "main") { applyFilters(); return; }
    const legacy = /^sec-([1-9])$/.exec(hash);
    const requested = legacy ? categories[Number(legacy[1])-1]?.[0] : hash;
    activeCategory = categories.some(([id]) => id === requested) ? requested : "all";
    applyFilters();
  }

  function saveCategoryHash() {
    const hash = activeCategory === "all" ? "" : "#" + activeCategory;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search + hash); }
    catch { /* Filtering still works in file previews that restrict history. */ }
  }

  nav.addEventListener("click", event => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    saveCategoryHash();
    applyFilters();
    showResults();
  });
  search.addEventListener("input", () => {
    query = search.value;
    applyFilters();
  });
  clear.addEventListener("click", () => {
    query = search.value = "";
    applyFilters();
    search.focus();
  });
  search.addEventListener("keydown", event => {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      clear.click();
    }
  });
  // "/" jumps to the search field from anywhere on the page
  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    event.preventDefault();
    search.focus();
  });
  document.getElementById("reset-filters").addEventListener("click", () => {
    query = search.value = "";
    activeCategory = "all";
    saveCategoryHash();
    applyFilters();
    search.focus();
  });
  container.addEventListener("click", event => {
    const button = event.target.closest(".desc-toggle");
    if (!button) return;
    const isExpanded = button.getAttribute("aria-expanded") === "true";
    document.getElementById(button.getAttribute("aria-controls")).classList.toggle("is-clamped", isExpanded);
    button.setAttribute("aria-expanded", String(!isExpanded));
    button.textContent = isExpanded ? "Read more +" : "Show less −";
    const title = button.getAttribute("aria-label").replace(/^(Read more|Show less) about /, "");
    button.setAttribute("aria-label", `${isExpanded ? "Read more" : "Show less"} about ${title}`);
  });
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measureClamps, 150);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureClamps);

  // Print the complete collection, then restore the reader's current view.
  let printState = [];
  window.addEventListener("beforeprint", () => {
    printState = sectionElements.map(section => ({
      hidden: section.hidden,
      projects: [...section.querySelectorAll(".p-card")].map(project => project.hidden)
    }));
    sectionElements.forEach(section => {
      section.hidden = false;
      section.querySelectorAll(".p-card").forEach(project => { project.hidden = false; });
    });
  });
  window.addEventListener("afterprint", () => {
    printState.forEach((state, i) => {
      const section = sectionElements[i];
      section.hidden = state.hidden;
      section.querySelectorAll(".p-card").forEach((project, j) => { project.hidden = state.projects[j]; });
    });
  });
  window.addEventListener("hashchange", readHash);
  readHash();
  reveal();
})();
