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

    const headerHTML = `
        <nav class="header-nav subpage-nav">
            <a href="../index.html" class="logo">
                <div class="logo-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                        <polyline points="2 17 12 22 22 17"></polyline>
                        <polyline points="2 12 12 17 22 12"></polyline>
                    </svg>
                </div>
                <span>David Dudas</span>
            </a>
            <a href="../index.html" class="back-link">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Back to Portfolio
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
                background: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
                border-radius: 12px;
                color: white;
            }

            .subpage-nav .logo:hover .logo-icon {
                transform: rotate(-10deg) scale(1.05);
            }

            .subpage-nav .back-link {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: #94a3b8;
                text-decoration: none;
                font-weight: 500;
                padding: 0.5rem 1rem;
                border-radius: 9999px;
                transition: all 0.3s ease;
            }

            .subpage-nav .back-link:hover {
                color: #f8fafc;
                background: rgba(255, 255, 255, 0.05);
            }

            :root {
                --primary-color: #6366f1;
                --secondary-color: #06b6d4;
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