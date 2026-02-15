// Initialize background effect and store globally for theme updates
window.background = new BackgroundEffect();
window.addEventListener('resize', () => window.background.resize());
window.background.animate();

// Typing animation for hero section
class TypeWriter {
    constructor(element, words, wait = 3000) {
        this.element = element;
        this.words = words;
        this.wait = wait;
        this.wordIndex = 0;
        this.txt = '';
        this.isDeleting = false;
        this.type();
    }

    type() {
        const current = this.wordIndex % this.words.length;
        const fullTxt = this.words[current];

        if (this.isDeleting) {
            this.txt = fullTxt.substring(0, this.txt.length - 1);
        } else {
            this.txt = fullTxt.substring(0, this.txt.length + 1);
        }

        this.element.textContent = this.txt;

        let typeSpeed = 100;

        if (this.isDeleting) {
            typeSpeed /= 2;
        }

        if (!this.isDeleting && this.txt === fullTxt) {
            typeSpeed = this.wait;
            this.isDeleting = true;
        } else if (this.isDeleting && this.txt === '') {
            this.isDeleting = false;
            this.wordIndex++;
            typeSpeed = 500;
        }

        setTimeout(() => this.type(), typeSpeed);
    }
}

// Stats counter animation
function animateStats() {
    const stats = document.querySelectorAll('.stat-number');

    stats.forEach(stat => {
        const target = parseInt(stat.getAttribute('data-count'));
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;

        const updateCounter = () => {
            current += step;
            if (current < target) {
                stat.textContent = Math.ceil(current);
                requestAnimationFrame(updateCounter);
            } else {
                stat.textContent = target + '+';
            }
        };

        // Use Intersection Observer to trigger animation when visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateCounter();
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });

        observer.observe(stat);
    });
}

// Project Carousel
class ProjectCarousel {
    constructor() {
        this.currentIndex = 0;
        this.container = document.querySelector('.projects-container');
        this.track = document.querySelector('.carousel-track');
        this.isTransitioning = false;
        this.setupCarousel();
        this.autoPlayInterval = null;
        this.startAutoPlay();
    }

    setupCarousel() {
        // Create project items
        projects.forEach((project, index) => {
            const isExternal = project.demoLink &&
                !project.demoLink.startsWith('./') &&
                !project.demoLink.startsWith('/');

            // Determine the status tag
            let statusTag = '';
            if (!project.demoLink) {
                if (project.title === 'Prism' || project.title === 'Hokku') {
                    statusTag = '<span class="status-tag in-development">In Development</span>';
                } else {
                    statusTag = '<span class="status-tag private">Private Work</span>';
                }
            } else if (isExternal) {
                statusTag = '<span class="external-tag">External Site</span>';
            }

            const html = `
                <article class="project-item ${index === 0 ? 'active' : ''}">
                    <div class="project-image">
                        ${statusTag}
                        <img src="${project.image}" alt="${project.title}" 
                             onerror="this.src='https://via.placeholder.com/600x400?text=${encodeURIComponent(project.title)}'">
                    </div>
                    <div class="project-content">
                        <span class="project-category">${project.category}</span>
                        <div class="project-title-row">
                            <h2 class="project-title">${project.title}</h2>
                            ${project.details ? `
                                <button class="info-button" onclick="showProjectDetails('${project.title.replace(/'/g, "\\'")}')" aria-label="More info about ${project.title}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="16" x2="12" y2="12"></line>
                                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                        <p class="project-description">${project.description}</p>
                        <div class="project-tech-stack">
                            ${project.techStack.map(tech => `
                                <span class="tech-tag">${tech}</span>
                            `).join('')}
                        </div>
                        <div class="project-links">
                            ${project.demoLink ? `
                                <a href="${project.demoLink}" class="project-link primary" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                        <polyline points="15 3 21 3 21 9"></polyline>
                                        <line x1="10" y1="14" x2="21" y2="3"></line>
                                    </svg>
                                    Live Demo
                                </a>
                            ` : ''}
                            ${project.githubLink ? `
                                <a href="${project.githubLink}" class="project-link secondary" target="_blank" rel="noopener noreferrer">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                                    </svg>
                                    View Code
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </article>
            `;
            this.track.insertAdjacentHTML('beforeend', html);
        });

        // Create indicators
        const indicators = document.querySelector('.carousel-indicators');
        indicators.innerHTML = '';
        projects.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = 'carousel-dot ' + (index === 0 ? 'active' : '');
            dot.addEventListener('click', () => {
                if (!this.isTransitioning) {
                    const direction = index > this.currentIndex ? 'right' : 'left';
                    this.goToSlide(index, direction);
                    this.stopAutoPlay();
                }
            });
            indicators.appendChild(dot);
        });

        // Setup navigation buttons
        const prevBtn = this.container.querySelector('.prev');
        const nextBtn = this.container.querySelector('.next');

        prevBtn.addEventListener('click', () => {
            if (!this.isTransitioning) {
                this.prevSlide();
                this.stopAutoPlay();
            }
        });

        nextBtn.addEventListener('click', () => {
            if (!this.isTransitioning) {
                this.nextSlide();
                this.stopAutoPlay();
            }
        });

        // Pause on hover
        this.container.addEventListener('mouseenter', () => this.stopAutoPlay());
        this.container.addEventListener('mouseleave', () => this.startAutoPlay());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                this.prevSlide();
                this.stopAutoPlay();
            } else if (e.key === 'ArrowRight') {
                this.nextSlide();
                this.stopAutoPlay();
            }
        });

        // Touch/swipe support
        let touchStartX = 0;
        let touchEndX = 0;

        this.track.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.track.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        }, { passive: true });

        const handleSwipe = () => {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0) {
                    this.nextSlide();
                } else {
                    this.prevSlide();
                }
                this.stopAutoPlay();
            }
        };

        this.handleSwipe = handleSwipe;
    }

    goToSlide(index, direction = 'right') {
        if (this.isTransitioning || this.currentIndex === index) return;

        this.isTransitioning = true;

        const items = this.track.querySelectorAll('.project-item');
        const dots = document.querySelectorAll('.carousel-dot');
        const currentItem = items[this.currentIndex];
        const nextItem = items[index];

        // Add transition classes
        currentItem.classList.add(direction === 'right' ? 'slide-left' : 'slide-right');
        nextItem.classList.add(direction === 'right' ? 'slide-right' : 'slide-left');

        currentItem.classList.remove('active');
        dots[this.currentIndex].classList.remove('active');

        // Trigger reflow
        nextItem.offsetWidth;

        this.currentIndex = index;
        nextItem.classList.add('active');
        nextItem.classList.remove(direction === 'right' ? 'slide-right' : 'slide-left');
        dots[this.currentIndex].classList.add('active');

        setTimeout(() => {
            currentItem.classList.remove('slide-left', 'slide-right');
            this.isTransitioning = false;
        }, 250);
    }

    nextSlide() {
        const next = (this.currentIndex + 1) % projects.length;
        this.goToSlide(next, 'right');
    }

    prevSlide() {
        const prev = (this.currentIndex - 1 + projects.length) % projects.length;
        this.goToSlide(prev, 'left');
    }

    startAutoPlay() {
        if (!this.autoPlayInterval) {
            this.autoPlayInterval = setInterval(() => {
                if (!this.isTransitioning) {
                    this.nextSlide();
                }
            }, 5000);
        }
    }

    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }
}

// Smooth scroll for navigation links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Navbar scroll effect
function initNavbarScroll() {
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// Mobile menu toggle
function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navRight = document.querySelector('.nav-right');

    if (menuBtn && navRight) {
        menuBtn.addEventListener('click', () => {
            navRight.classList.toggle('active');
            menuBtn.classList.toggle('active');
        });

        // Close menu when clicking a link
        navRight.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navRight.classList.remove('active');
                menuBtn.classList.remove('active');
            });
        });
    }
}

// Theme toggle functionality
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    const html = document.documentElement;

    // Check for saved theme preference or default to system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        html.setAttribute('data-theme', savedTheme);
    } else if (!systemPrefersDark) {
        html.setAttribute('data-theme', 'light');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';

            html.setAttribute('data-theme', newTheme === 'dark' ? '' : newTheme);
            localStorage.setItem('theme', newTheme);

            // Update background colors for canvas
            if (window.background) {
                window.background.updateTheme(newTheme);
            }
        });
    }
}

// Custom magnetic cursor
function initCustomCursor() {
    const dot = document.getElementById('cursorDot');
    const ring = document.getElementById('cursorRing');
    if (!dot || !ring) return;

    // Check for touch device — skip cursor
    if ('ontouchstart' in window) return;

    let mouseX = 0, mouseY = 0;
    let ringX = 0, ringY = 0;
    document.body.style.cursor = 'none';

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        dot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    });

    // Smooth ring follow with lerp — snappy but still trails
    function animateRing() {
        ringX += (mouseX - ringX) * 0.22;
        ringY += (mouseY - ringY) * 0.22;
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
        requestAnimationFrame(animateRing);
    }
    animateRing();

    // Hover detection on interactive elements
    const interactives = 'a, button, .project-link, .tech-tag, .carousel-button, .carousel-dot, .theme-toggle, .btn, .contact-link, .info-button';
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest(interactives)) {
            dot.classList.add('hover');
            ring.classList.add('hover');
        }
    });
    document.addEventListener('mouseout', (e) => {
        if (e.target.closest(interactives)) {
            dot.classList.remove('hover');
            ring.classList.remove('hover');
        }
    });

    // Click feedback
    document.addEventListener('mousedown', () => {
        dot.classList.add('clicking');
        ring.classList.add('clicking');
    });
    document.addEventListener('mouseup', () => {
        dot.classList.remove('clicking');
        ring.classList.remove('clicking');
    });

    // Hide cursor on all interactive elements
    document.querySelectorAll(interactives).forEach(el => {
        el.style.cursor = 'none';
    });
    // Also handle dynamically-created elements
    const observer = new MutationObserver(() => {
        document.querySelectorAll(interactives).forEach(el => {
            el.style.cursor = 'none';
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// Scroll progress bar
function initScrollProgress() {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;

    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        bar.style.width = progress + '%';
    }, { passive: true });
}

// Scroll-triggered section reveals
function initScrollReveals() {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    reveals.forEach(el => observer.observe(el));
}

// 3D tilt effect on project cards
function initCardTilt() {
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.project-item.active');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Only apply if mouse is near the card
            if (x < -50 || x > rect.width + 50 || y < -50 || y > rect.height + 50) {
                card.style.transform = '';
                return;
            }

            const rotateX = ((y - centerY) / centerY) * -4;
            const rotateY = ((x - centerX) / centerX) * 4;

            card.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

            // Update light position for shine effect
            const percentX = ((x / rect.width) * 100);
            const percentY = ((y / rect.height) * 100);
            card.style.setProperty('--mouse-x', percentX + '%');
            card.style.setProperty('--mouse-y', percentY + '%');
        });
    });

    // Reset on mouse leave
    document.addEventListener('mouseleave', () => {
        document.querySelectorAll('.project-item').forEach(card => {
            card.style.transform = '';
        });
    });
}

// Loading screen
function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) return;

    setTimeout(() => {
        loader.classList.add('loader-exit');
        // Remove from DOM after transition
        setTimeout(() => {
            loader.remove();
        }, 700);
    }, 1400);
}

// Split text animation — wraps each letter in a span with staggered delay
function initSplitText() {
    const lines = document.querySelectorAll('.title-line');
    let globalDelay = 0;

    lines.forEach(line => {
        // Skip lines that contain the typed-text (it has its own animation)
        if (line.querySelector('.typed-text')) return;

        // Collect all text nodes using TreeWalker
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        let letterIndex = 0;
        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            if (!text.trim()) return;

            // Skip text inside .highlight — it uses background-clip: text
            // which breaks when split into individual spans
            if (textNode.parentNode.closest('.highlight')) {
                const highlightEl = textNode.parentNode.closest('.highlight');
                if (!highlightEl.dataset.revealed) {
                    highlightEl.dataset.revealed = '1';
                    const delay = (1.5 + globalDelay + letterIndex * 0.03).toFixed(3);
                    // Combine reveal + gradient animations so neither overrides
                    highlightEl.style.opacity = '0';
                    highlightEl.style.transform = 'translateY(30px) rotateX(-40deg)';
                    highlightEl.style.display = 'inline-block';
                    highlightEl.style.animation = `letterReveal 0.5s cubic-bezier(0.16,1,0.3,1) ${delay}s forwards, gradientShift 4s ease-in-out infinite`;
                    letterIndex += text.length;
                }
                return;
            }

            const fragment = document.createDocumentFragment();
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (char === ' ') {
                    const sp = document.createElement('span');
                    sp.className = 'split-space';
                    fragment.appendChild(sp);
                } else {
                    const span = document.createElement('span');
                    span.className = 'split-letter';
                    span.textContent = char;
                    const delay = (1.5 + globalDelay + letterIndex * 0.03).toFixed(3);
                    span.style.animationDelay = delay + 's';
                    fragment.appendChild(span);
                    letterIndex++;
                }
            }
            textNode.parentNode.replaceChild(fragment, textNode);
        });

        globalDelay += letterIndex * 0.03 + 0.1;
    });
}

// Magnetic buttons — buttons pull toward cursor
function initMagneticButtons() {
    const buttons = document.querySelectorAll('.btn');
    const magnetDistance = 150;

    buttons.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < magnetDistance) {
                const pull = (1 - dist / magnetDistance) * 0.3;
                btn.style.transform = `translate(${dx * pull}px, ${dy * pull}px)`;
                btn.classList.add('magnetic-active');
            }
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';
            btn.classList.remove('magnetic-active');
        });
    });
}

// Parallax depth on scroll — hero elements move at different speeds
function initParallax() {
    const heroTitle = document.querySelector('.hero-title');
    const heroDesc = document.querySelector('.hero-description');
    const heroStats = document.querySelector('.hero-stats');
    const heroCta = document.querySelector('.hero-cta');
    const heroBadge = document.querySelector('.hero-badge');

    if (!heroTitle) return;

    const scrollIndicator = document.querySelector('.scroll-indicator');
    const backToTop = document.getElementById('backToTop');

    // Back to top click handler
    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        const vh = window.innerHeight;

        // Fade out scroll indicator quickly
        if (scrollIndicator) {
            scrollIndicator.style.opacity = Math.max(0, 1 - scrollY / (vh * 0.3));
        }

        // Show/hide back to top button
        if (backToTop) {
            if (scrollY > vh * 0.5) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        }

        // Only apply parallax in the hero section viewport
        if (scrollY > vh * 1.2) return;

        const factor = scrollY / vh;

        if (heroBadge) heroBadge.style.transform = `translateY(${factor * -20}px)`;
        heroTitle.style.transform = `translateY(${factor * -40}px)`;
        if (heroDesc) heroDesc.style.transform = `translateY(${factor * -25}px)`;
        if (heroStats) heroStats.style.transform = `translateY(${factor * -15}px)`;
        if (heroCta) heroCta.style.transform = `translateY(${factor * -10}px)`;
    }, { passive: true });
}

// Film grain — animated noise overlay
function initFilmGrain() {
    const canvas = document.getElementById('filmGrain');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    function resize() {
        // Use lower resolution for performance
        canvas.width = window.innerWidth / 4;
        canvas.height = window.innerHeight / 4;
    }
    resize();
    window.addEventListener('resize', resize);

    function renderGrain() {
        const w = canvas.width;
        const h = canvas.height;
        const imageData = ctx.createImageData(w, h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const v = (Math.random() * 255) | 0;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 25; // very low alpha
        }

        ctx.putImageData(imageData, 0, 0);
        setTimeout(() => requestAnimationFrame(renderGrain), 80); // ~12fps
    }

    renderGrain();
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Init loader immediately
    initLoader();

    // Init theme toggle first
    initThemeToggle();

    // Init split text (before typing starts, but after loader starts)
    initSplitText();

    // Init typing effect
    const typedElement = document.querySelector('.typed-text');
    if (typedElement) {
        new TypeWriter(typedElement, [
            'Creative Technologist',
            'Photographer',
            'Author',
            'Physics Enthusiast',
            'Game Developer',
            'Math Enthusiast',
            'Full-Stack Engineer',
            'Algorithm Designer',
            'Computational Researcher'
        ], 2000);
    }

    // Init stats animation
    animateStats();

    // Init carousel
    new ProjectCarousel();

    // Init smooth scroll
    initSmoothScroll();

    // Init navbar scroll effect
    initNavbarScroll();

    // Init mobile menu
    initMobileMenu();

    // Round 1 enhancements
    initCustomCursor();
    initScrollProgress();
    initScrollReveals();
    initCardTilt();

    // Round 2 enhancements
    initMagneticButtons();
    initParallax();
    initFilmGrain();
    initAsciiCube();
});

// ASCII Rotating Cube — Cognition-style wireframe cube
function initAsciiCube() {
    const el = document.getElementById('asciiCube');
    if (!el) return;

    const W = 56;
    const H = 28;
    const CHARS = ' .·:;+*#%@';  // luminance ramp
    const EDGE_CHARS = '░▒▓█';

    // 4D Tesseract vertices (16 vertices of a hypercube)
    const verts4D = [];
    for (let i = 0; i < 16; i++) {
        verts4D.push([
            (i & 1) ? 1 : -1,
            (i & 2) ? 1 : -1,
            (i & 4) ? 1 : -1,
            (i & 8) ? 1 : -1
        ]);
    }

    // Edges: connect vertices that differ in exactly one coordinate
    const edges = [];
    for (let i = 0; i < 16; i++) {
        for (let j = i + 1; j < 16; j++) {
            let diff = 0;
            for (let k = 0; k < 4; k++) {
                if (verts4D[i][k] !== verts4D[j][k]) diff++;
            }
            if (diff === 1) edges.push([i, j]);
        }
    }

    let aXY = 0, aXZ = 0, aXW = 0, aYZ = 0;
    let animId = null;
    let isVisible = false;
    let time = 0;

    function rotate4D(v) {
        let [x, y, z, w] = v;

        // Rotate in XW plane
        let c = Math.cos(aXW), s = Math.sin(aXW);
        [x, w] = [x * c - w * s, x * s + w * c];

        // Rotate in YZ plane
        c = Math.cos(aYZ); s = Math.sin(aYZ);
        [y, z] = [y * c - z * s, y * s + z * c];

        // Rotate in XZ plane
        c = Math.cos(aXZ); s = Math.sin(aXZ);
        [x, z] = [x * c - z * s, x * s + z * c];

        // Rotate in XY plane
        c = Math.cos(aXY); s = Math.sin(aXY);
        [x, y] = [x * c - y * s, x * s + y * c];

        return [x, y, z, w];
    }

    function project(v4) {
        const [x, y, z, w] = rotate4D(v4);

        // 4D → 3D stereographic-ish projection
        const pw = 2.5 / (2.5 + w);
        const x3 = x * pw, y3 = y * pw, z3 = z * pw;

        // 3D → 2D perspective
        const p3 = 4 / (4 + z3);
        const sx = W / 2 + x3 * 5.5 * p3;
        const sy = H / 2 - y3 * 3 * p3;
        const depth = z3 + w * 0.5; // combined depth

        return { sx, sy, depth };
    }

    function drawLine(grid, zbuf, p0, p1) {
        const steps = Math.max(
            Math.abs(Math.round(p1.sx) - Math.round(p0.sx)),
            Math.abs(Math.round(p1.sy) - Math.round(p0.sy))
        ) || 1;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.round(p0.sx + (p1.sx - p0.sx) * t);
            const y = Math.round(p0.sy + (p1.sy - p0.sy) * t);
            const depth = p0.depth + (p1.depth - p0.depth) * t;

            if (x >= 0 && x < W && y >= 0 && y < H) {
                // Depth-based character
                const brightness = Math.max(0, Math.min(1, (depth + 3) / 6));
                const charIdx = Math.floor(brightness * (EDGE_CHARS.length - 1));
                if (depth < zbuf[y][x] || zbuf[y][x] === 999) {
                    grid[y][x] = EDGE_CHARS[charIdx];
                    zbuf[y][x] = depth;
                }
            }
        }
    }

    function render() {
        const grid = [];
        const zbuf = [];
        for (let r = 0; r < H; r++) {
            grid[r] = [];
            zbuf[r] = [];
            for (let c = 0; c < W; c++) {
                grid[r][c] = ' ';
                zbuf[r][c] = 999;
            }
        }

        // Project all vertices
        const projected = verts4D.map(v => project(v));

        // Draw edges with depth-based shading
        for (const [a, b] of edges) {
            drawLine(grid, zbuf, projected[a], projected[b]);
        }

        // Draw orbiting particles around the tesseract
        for (let i = 0; i < 6; i++) {
            const angle = time * 0.02 + i * Math.PI / 3;
            const r = 1.8;
            const particle = project([
                r * Math.cos(angle),
                r * Math.sin(angle * 0.7),
                r * Math.sin(angle),
                r * Math.cos(angle * 0.5)
            ]);
            const px = Math.round(particle.sx);
            const py = Math.round(particle.sy);
            if (px >= 0 && px < W && py >= 0 && py < H) {
                grid[py][px] = '✦';
                // Small glow around particle
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const gx = px + dx, gy = py + dy;
                        if (gx >= 0 && gx < W && gy >= 0 && gy < H && grid[gy][gx] === ' ') {
                            grid[gy][gx] = '·';
                        }
                    }
                }
            }
        }

        // Draw vertices last (on top)
        for (const p of projected) {
            const x = Math.round(p.sx), y = Math.round(p.sy);
            if (x >= 0 && x < W && y >= 0 && y < H) {
                grid[y][x] = p.depth < 0 ? '◈' : '◇';
            }
        }

        el.textContent = grid.map(row => row.join('')).join('\n');

        // Smooth multi-axis rotation at different speeds
        aXY += 0.008;
        aXZ += 0.012;
        aXW += 0.006;
        aYZ += 0.01;
        time++;

        if (isVisible) {
            animId = requestAnimationFrame(render);
        }
    }

    // Only animate when visible
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            isVisible = entry.isIntersecting;
            if (isVisible && !animId) {
                animId = requestAnimationFrame(render);
            } else if (!isVisible && animId) {
                cancelAnimationFrame(animId);
                animId = null;
            }
        });
    }, { threshold: 0.1 });

    observer.observe(el);
}
