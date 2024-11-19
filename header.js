function loadHeader(){const n=`\n        <nav class="header-nav">\n            <a href="${window.location.pathname.split("/").length>2?"../index.html":"./index.html"}" class="logo">\n                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">\n                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>\n                </svg>\n                Algorithmist\n            </a>\n        </nav>\n    `;if(document.body.insertAdjacentHTML("afterbegin",n),!document.querySelector("style[data-header-styles]")){const n="\n            body {\n                padding-top: 90px;\n            }\n\n            .header-nav {\n                position: fixed;\n                top: 20px;\n                left: 50%;\n                transform: translateX(-50%);\n                background: rgba(0, 8, 20, 0.95);\n                backdrop-filter: blur(10px);\n                padding: 1rem 2rem;\n                z-index: 9999;\n                display: flex;\n                justify-content: center;\n                align-items: center;\n                box-shadow: 0 2px 20px rgba(0, 0, 0, 0.2);\n                height: 40px;\n                width: auto;\n                min-width: 500px;\n                max-width: 90%;\n                border-radius: 12px;\n            }\n\n            .logo {\n                font-size: 1.5rem;\n                font-weight: bold;\n                color: var(--primary-color, #00ff87);\n                text-decoration: none;\n                display: flex;\n                align-items: center;\n                gap: 0.5rem;\n                margin: 0 auto;\n            }\n\n            .logo:hover {\n                color: var(--secondary-color, #00b8ff);\n            }\n\n            /* Fallback CSS variables if not defined elsewhere */\n            :root {\n                --primary-color: #00ff87;\n                --secondary-color: #00b8ff;\n                --text-color: #ffffff;\n            }\n        ",e=document.createElement("style");e.setAttribute("data-header-styles",""),e.textContent=n,document.head.appendChild(e)}}document.addEventListener("DOMContentLoaded",loadHeader);