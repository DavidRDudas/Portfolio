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

  function destination(project) {
    if (!project.link) return "";
    if (project.link.includes("store.steampowered.com/")) return "View on Steam";
    if (project.link.includes("amazon.com/")) return "Read the book";
    if (project.link.startsWith("./")) return "Try the interactive demo";
    try { return new URL(project.link).hostname.replace(/^www\./, ""); }
    catch { return "Visit project"; }
  }
  function projectLink(project, content, className = "", label = "") {
    const attrs = label ? ` aria-label="${esc(label)}"` : "";
    return `<a class="${className}" href="${esc(project.link)}" target="_blank" rel="noopener noreferrer"${attrs}>${content}</a>`;
  }

  const featured = document.getElementById("featured-projects");
  if (featured) {
    const picks = [
      ["Hokku", "Systems & enterprise", "A real-time ticketing platform, engineered for performance and reliability."],
      ["Raster Tide", "Creative tools", "Turn images and video into animated ASCII art, right in your browser."],
      ["Painted Crowns", "Games", "An indie game bringing art, music, design, and complex AI together."]
    ];
    const projects = sections.flatMap(section => section.items);
    featured.innerHTML = picks.map(([title, category, summary], i) => {
      const project = projects.find(item => item.title === title);
      if (!project) return "";
      return `<article class="featured-card">
        ${projectLink(project, `<img src="images/${esc(project.img)}" alt="" loading="lazy" decoding="async"><span class="image-arrow" aria-hidden="true">↗</span>`, "featured-image", `Explore ${project.title}`)}
        <div class="featured-meta"><span>${esc(category)}</span><span>0${i+1}</span></div>
        <h3>${projectLink(project, esc(project.title))}</h3>
        <p>${esc(summary)}</p>
      </article>`;
    }).join("");
  }

  const container = document.getElementById("project-sections");
  if (!container) return;

  const search = document.getElementById("project-search");
  const clear = document.getElementById("clear-search");
  const nav = document.getElementById("category-nav");
  const count = document.getElementById("result-count");
  const empty = document.getElementById("empty-state");
  const toggleAll = document.getElementById("toggle-sections");
  let activeCategory = "all";
  let query = "";
  const expanded = new Set([0]);

  function projectHTML(project, sectionIndex, projectIndex) {
    const descriptionId = `description-${sectionIndex}-${projectIndex}`;
    const hasMore = project.desc.length > 240;
    const image = `<img src="images/${esc(project.img)}" alt="" loading="lazy" decoding="async">`;
    const thumbnail = project.link
      ? projectLink(project, image, "project-media", `Explore ${project.title}`)
      : `<div class="project-media">${image}</div>`;
    return `<article class="project-row${project.muted ? " muted" : ""}" data-project="${projectIndex}">
      ${thumbnail}
      <div class="project-copy">
        ${project.muted ? '<p class="archived-note">From the archive</p>' : ""}
        <p class="project-kicker">${esc(project.cat)}</p>
        <div class="project-title"><h3>${project.link ? projectLink(project, esc(project.title)) : esc(project.title)}</h3>${project.link ? '<span class="project-arrow" aria-hidden="true">↗</span>' : ""}</div>
        <p id="${descriptionId}" class="project-desc${hasMore ? " is-clamped" : ""}">${esc(project.desc)}</p>
        ${hasMore ? `<button class="description-toggle" type="button" aria-expanded="false" aria-controls="${descriptionId}" aria-label="Read more about ${esc(project.title)}">Read more +</button>` : ""}
        <div class="tags">${project.tech.map(tag => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
        ${project.link ? projectLink(project, `${esc(destination(project))} <span aria-hidden="true">↗</span>`, "project-destination") : ""}
      </div>
    </article>`;
  }

  nav.innerHTML = `<button class="category-button" type="button" data-category="all" aria-pressed="true" aria-controls="project-sections"><span>All work</span><span>${total}</span></button>` +
    sections.map((section, i) => `<button class="category-button" type="button" data-category="${categories[i][0]}" aria-pressed="false" aria-controls="project-sections"><span>${esc(categories[i][1])}</span><span>${section.items.length}</span></button>`).join("");

  container.innerHTML = sections.map((section, i) => `
    <section class="catalogue-section" id="sec-${i+1}" data-category="${categories[i][0]}">
      <details${i === 0 ? " open" : ""}>
        <summary class="category-summary">
          <span class="category-number" aria-hidden="true">${String(i+1).padStart(2,"0")}</span>
          <span class="category-copy"><span class="category-title" role="heading" aria-level="2">${esc(section.title)}</span> <small class="category-count">${section.items.length} ${section.items.length === 1 ? "project" : "projects"}</small><span class="category-blurb">${esc(section.blurb)}</span></span>
          <span class="disclosure-icon" aria-hidden="true"></span>
        </summary>
        <div class="project-list">${section.items.map((project,j) => projectHTML(project,i,j)).join("")}</div>
      </details>
    </section>
  `).join("");

  const sectionElements = [...container.querySelectorAll(".catalogue-section")];
  const normalize = value => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const searchText = sections.map(section => section.items.map(project =>
    normalize([project.title, project.cat, project.desc, section.title, ...project.tech].join(" "))
  ));

  function updateToggle() {
    const visible = sectionElements.filter(section => !section.hidden);
    const allOpen = visible.length > 0 && visible.every(section => section.querySelector("details").open);
    toggleAll.innerHTML = allOpen ? 'Collapse all <span aria-hidden="true">−</span>' : 'Expand all <span aria-hidden="true">+</span>';
    toggleAll.hidden = visible.length === 0;
  }

  function applyFilters() {
    const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const filtered = activeCategory !== "all" || terms.length > 0;
    let matches = 0;
    sectionElements.forEach((section, i) => {
      let inSection = 0;
      const categoryMatches = activeCategory === "all" || section.dataset.category === activeCategory;
      section.querySelectorAll(".project-row").forEach((project, j) => {
        const show = categoryMatches && terms.every(term => searchText[i][j].includes(term));
        project.hidden = !show;
        if (show) inSection++;
      });
      matches += inSection;
      section.hidden = inSection === 0;
      section.querySelector(".category-count").textContent = `${inSection} ${inSection === 1 ? "project" : "projects"}`;
      section.querySelector("details").open = filtered ? inSection > 0 : expanded.has(i);
    });
    nav.querySelectorAll("button").forEach(button =>
      button.setAttribute("aria-pressed", String(button.dataset.category === activeCategory))
    );
    count.textContent = filtered
      ? `${matches} of ${total} projects${query.trim() ? ' matching “' + query.trim() + '”' : ""}`
      : `${total} projects across ${sections.length} disciplines`;
    clear.hidden = !query;
    empty.hidden = matches > 0;
    updateToggle();
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
  document.getElementById("reset-filters").addEventListener("click", () => {
    query = search.value = "";
    activeCategory = "all";
    saveCategoryHash();
    applyFilters();
    search.focus();
  });

  sectionElements.forEach((section, i) => {
    section.querySelector("details").addEventListener("toggle", event => {
      if (activeCategory === "all" && !query.trim()) {
        event.target.open ? expanded.add(i) : expanded.delete(i);
      }
      updateToggle();
    });
  });
  toggleAll.addEventListener("click", () => {
    const visible = sectionElements.filter(section => !section.hidden);
    const open = !visible.every(section => section.querySelector("details").open);
    visible.forEach(section => {
      section.querySelector("details").open = open;
      if (activeCategory === "all" && !query.trim()) {
        const i = sectionElements.indexOf(section);
        open ? expanded.add(i) : expanded.delete(i);
      }
    });
    updateToggle();
  });
  container.addEventListener("click", event => {
    const button = event.target.closest(".description-toggle");
    if (!button) return;
    const isExpanded = button.getAttribute("aria-expanded") === "true";
    document.getElementById(button.getAttribute("aria-controls")).classList.toggle("is-clamped", isExpanded);
    button.setAttribute("aria-expanded", String(!isExpanded));
    button.textContent = isExpanded ? "Read more +" : "Show less −";
    const title = button.closest(".project-row").querySelector("h3").textContent;
    button.setAttribute("aria-label", `${isExpanded ? "Read more" : "Show less"} about ${title}`);
  });

  // Print the complete collection, then restore the reader's current view.
  let printState = [];
  window.addEventListener("beforeprint", () => {
    printState = sectionElements.map(section => ({
      hidden:section.hidden,
      open:section.querySelector("details").open,
      projects:[...section.querySelectorAll(".project-row")].map(project => project.hidden)
    }));
    sectionElements.forEach(section => {
      section.hidden = false;
      section.querySelector("details").open = true;
      section.querySelectorAll(".project-row").forEach(project => { project.hidden = false; });
    });
  });
  window.addEventListener("afterprint", () => {
    printState.forEach((state, i) => {
      const section = sectionElements[i];
      section.hidden = state.hidden;
      section.querySelector("details").open = state.open;
      section.querySelectorAll(".project-row").forEach((project, j) => { project.hidden = state.projects[j]; });
    });
    updateToggle();
  });
  window.addEventListener("hashchange", readHash);
  readHash();
})();
