// Header enhancements for project subpages
// This script is used by project pages (ACO, DreamWeaver, etc.) to add navigation back to main portfolio

function loadHeader() {
    // Only load header if we're on a subpage (not index.html)
    const isSubpage = window.location.pathname.includes('/ACO/') ||
        window.location.pathname.includes('/DreamWeaver/') ||
        window.location.pathname.includes('/ParticleApplication/') ||
        window.location.pathname.includes('/ColorSimulator/') ||
        window.location.pathname.includes('/CodeConstellation/') ||
        window.location.pathname.includes('/NaiveCryptography/');

    // Don't inject header on main page - it already has one
    if (!isSubpage) {
        return;
    }

    // The 3D room is the site root now (index.html at the top level), so
    // both nav links point one folder up from any project subpage to reach
    // the room.
    const headerHTML = `
        <nav class="header-nav subpage-nav">
            <a href="../index.html" class="logo">
                <div class="logo-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <!-- back mountain -->
                        <path d="M14 8l5 12H9l5-12z" fill="currentColor" fill-opacity="0.45"/>
                        <!-- front mountain (overlaps the back one) -->
                        <path d="M8 11l6 9H2l6-9z" fill="currentColor"/>
                        <!-- snowcap on the back peak -->
                        <path d="M12.6 11.4l1.4-3.4 1.4 3.4-1.4-0.6z" fill="#ffffff" opacity="0.95"/>
                    </svg>
                </div>
                <span>David Dudas</span>
            </a>
            <a href="../index.html" class="back-link">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Back to Room
            </a>
        </nav>
    `;

    document.body.insertAdjacentHTML('afterbegin', headerHTML);

    // Add styles for subpage header
    if (!document.querySelector('style[data-header-styles]')) {
        const styles = `
            body {
                padding-top: 90px;
            }

            .subpage-nav {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: rgba(3, 7, 18, 0.9);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                padding: 1rem 2rem;
                z-index: 9999;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .subpage-nav .logo {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                font-size: 1.25rem;
                font-weight: 700;
                color: #f8fafc;
                text-decoration: none;
                transition: all 0.3s ease;
            }

            .subpage-nav .logo-icon {
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #4a2a16 0%, #2a1a0d 100%);
                border: 1px solid rgba(255, 184, 122, 0.45);
                border-radius: 12px;
                color: #ffb87a;
                box-shadow: 0 0 16px rgba(255, 184, 122, 0.25), inset 0 0 10px rgba(255, 184, 122, 0.08);
                transition: all 0.3s ease;
            }

            .subpage-nav .logo:hover .logo-icon {
                transform: rotate(-6deg) scale(1.06);
                color: #ffd9a8;
                border-color: rgba(255, 184, 122, 0.7);
                box-shadow: 0 0 22px rgba(255, 184, 122, 0.4), inset 0 0 12px rgba(255, 184, 122, 0.15);
            }

            .subpage-nav .back-link {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: #ffd9a8;
                text-decoration: none;
                font-weight: 600;
                font-size: 0.9rem;
                letter-spacing: 0.06em;
                padding: 0.5rem 1rem;
                border: 1px solid rgba(255, 200, 140, 0.18);
                border-radius: 9999px;
                transition: all 0.18s ease;
            }

            .subpage-nav .back-link:hover {
                color: #fff;
                background: rgba(255, 184, 122, 0.12);
                border-color: rgba(255, 184, 122, 0.5);
            }

            :root {
                --primary-color: #ffb87a;
                --secondary-color: #ffd9a8;
                --text-color: #f8fafc;
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-header-styles', '');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
    }
}

document.addEventListener('DOMContentLoaded', loadHeader);