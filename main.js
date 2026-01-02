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
        }, 500);
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
    const navLinks = document.querySelector('.nav-links');

    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            menuBtn.classList.toggle('active');
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

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Init theme toggle first
    initThemeToggle();

    // Init typing effect
    const typedElement = document.querySelector('.typed-text');
    if (typedElement) {
        new TypeWriter(typedElement, [
            'Creative Technologist',
            'Photographer',
            'Author',
            'Game Developer',
            'Full-Stack Engineer',
            'Algorithm Enthusiast'
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
});