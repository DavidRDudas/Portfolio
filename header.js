// Site header for the project pages that live on this site (ACO, Dream
// Weaver, Hydrogen, …): the same wordmark and navigation as the homepage and
// portfolio. Styles come from ../project.css, which each page links in its
// <head>; a page can opt out with <body data-site-header="off">.

function loadHeader() {
    if (document.body.dataset.siteHeader === 'off' || document.querySelector('.dd-header')) return;

    // pages link the stylesheet themselves; this only covers one that
    // doesn't, so the header is never unstyled
    if (!document.querySelector('link[href*="project.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '../project.css';
        document.head.appendChild(link);
    }

    // project pages sit one folder down: the name goes to the homepage.
    // Entities, not literal characters, so the arrows survive a page that
    // doesn't declare UTF-8.
    const headerHTML = `
        <header class="dd-header">
            <div class="dd-header-inner">
                <a class="dd-wordmark" href="../index.html" aria-label="David Dudas &#8212; home"><span class="dd-monogram" aria-hidden="true">dd</span><span class="dd-wordmark-name">David Dudas</span></a>
                <nav class="dd-nav" aria-label="Main navigation">
                    <a href="../portfolio.html">Portfolio</a>
                    <a href="../world.html">3D World <span aria-hidden="true">&#8599;</span></a>
                    <a class="dd-nav-contact" href="mailto:daviddudas@outlook.com">Contact <span aria-hidden="true">&#8599;</span></a>
                </nav>
            </div>
        </header>
    `;
    document.body.insertAdjacentHTML('afterbegin', headerHTML);
    document.body.classList.add('dd-has-header');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadHeader);
else loadHeader();
