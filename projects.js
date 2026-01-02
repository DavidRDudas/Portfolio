const projects = [
    {
        title: "Ant Colony Optimization",
        category: "Interactive Simulation",
        description: "Interactive ant colony simulation with multiple colonies and pheromone trails.",
        details: "Developed an interactive ant colony simulation featuring multiple competing colonies with distinct ant types (queens, scouts, foragers, and warriors) exhibiting emergent behavior through pheromone-based communication. Implemented complex AI decision-making systems including pathfinding, resource gathering, and combat mechanics, along with a sophisticated pheromone system using grid-based diffusion and evaporation. The simulation includes real-time colony statistics, customizable parameters, and dynamic event logging, demonstrating proficiency in object-oriented programming, optimization techniques, and interactive visualization.",
        image: "images/aco.png",
        techStack: ["JavaScript", "Emergent Behavior", "Algorithms"],
        demoLink: "./ACO/index.html",
        githubLink: null
    },
    {
        title: "Opin.Ink",
        category: "Web Platform",
        description: "Social writing platform for journaling and sharing thoughts with your community.",
        detailsTitle: "Full-Stack MEVN Website for Creative Writing",
        details: "Developed and deployed a full-stack web application called OpinInk, a secure writing platform that enables users to publish, monetize, and engage with creative content. Built with Vue.js and Express.js, the application features an intelligent content moderation system using Natural Language Processing (NLP) through the WordNet library to validate content authenticity and filter meaningless submissions. The platform combines ML-driven content validation with traditional security measures including CSRF protection, XSS prevention, and rate limiting. Key features include user authentication with email verification, secure payment processing via Stripe, and a sophisticated analytics system tracking user engagement metrics. The application implements a quarterly ranking system for content, automated scheduling with cron jobs, and uses MongoDB for efficient data management with optimized indexing.",
        image: "images/opinink.png",
        techStack: ["Vue.js", "Express.js", "MongoDB", "NLP", "Stripe"],
        demoLink: "https://opin.ink",
        githubLink: null
    },
    {
        title: "Resource Management Software",
        category: "Enterprise Software",
        description: "Resource management software for tracking and optimizing resource allocation.",
        detailsTitle: null,
        details: "Developed a comprehensive web-based Resource Management System using vanilla JavaScript, HTML, and CSS, designed to streamline project staffing and employee scheduling. The application features an interactive calendar interface that visualizes employee assignments and PTO across projects, with customizable display options for continuous or discrete time blocks and color encoding by Employee or Project. Implemented robust functionality including employee management, project tracking, and market organization, along with advanced search and filtering capabilities. The system includes conflict detection for scheduling, data persistence using localStorage, and a backup/restore feature for data management with JSON. Key features include dynamic employee availability tracking, color-coded project assignments, and a responsive interface that allows managers to efficiently allocate resources and monitor project staffing across multiple markets.",
        image: "images/rmp.png",
        techStack: ["JavaScript", "Node.js", "Database"],
        demoLink: "https://watermarg.in",
        githubLink: null
    },
    {
        title: "Dream Weaver",
        category: "Creative Technology",
        description: "Dynamic art generation through text interpretation and pattern synthesis.",
        details: "Engineered an innovative text-to-art generator using JavaScript and SVG, transforming textual descriptions into multi-layered abstract visualizations. The system features 10 distinct procedural generation layers including flow fields, Voronoi tessellation, geometric patterns, and particle systems. Implemented advanced SVG manipulation techniques, procedural shape generation algorithms, and asynchronous layer composition with progress tracking. The application demonstrates expertise in generative art, computational geometry, and complex UI state management while maintaining smooth performance during real-time art generation.",
        image: "images/dreamweaver.png",
        techStack: ["JavaScript", "AI", "Generative Art"],
        demoLink: "./DreamWeaver/index.html",
        githubLink: null
    },
    {
        title: "Particle Physics Simulator",
        category: "Interactive Simulation",
        description: "Interactive particle system with various physics simulations.",
        details: "Engineered an advanced particle physics simulation engine featuring multiple simulation modes including gravitational systems, electric fields, gas molecules, and celestial bodies. Implemented sophisticated physics calculations for particle interactions, collision detection using spatial partitioning, and realistic visual effects. The system includes an interactive UI with real-time parameter adjustment, performance optimization through spatial grid algorithms, and dynamic visualization of physical phenomena. Demonstrated expertise in physics engine development, optimization techniques, and complex UI state management while maintaining smooth performance with hundreds of particles.",
        image: "images/particlephysics.png",
        techStack: ["JavaScript", "Physics"],
        demoLink: "./ParticleApplication/index.html",
        githubLink: null
    },
    {
        title: "Color Wave Patterns",
        category: "Creative Technology",
        description: "Dynamic color pattern generation with interactive wave mechanics.",
        details: "Developed an interactive color wave visualization system featuring dynamic particle systems with emergent behaviors including flocking, orbital mechanics, and fluid dynamics. Implemented advanced visual effects such as particle trails, glow effects, and dynamic connections, along with multiple pattern generation algorithms (spiral, mandala, grid). The system includes real-time parameter adjustment, spatial partitioning for performance optimization, and preset configurations. Demonstrated expertise in particle physics simulation, WebGL optimization, and complex UI state management while maintaining smooth performance with thousands of particles.",
        image: "images/colorwave.png",
        techStack: ["JavaScript", "Mathematics"],
        demoLink: "./ColorSimulator/index.html",
        githubLink: null
    },
    {
        title: "Code Constellation",
        category: "Creative Technology",
        description: "Dynamic space pattern generation from JavaScript code.",
        details: "Developed an innovative code visualization tool that transforms JavaScript source code into an interactive cosmic simulation using HTML5 Canvas. The system analyzes code structure to generate a physics-based galaxy where functions become stars with gravitational fields, variables become orbiting planets, and code complexity creates dynamic nebulae. Implemented advanced features including gravitational physics simulation, particle systems, dynamic lighting effects, and real-time code analysis. Demonstrates expertise in abstract syntax tree parsing, physics engine development, and creative data visualization while maintaining smooth animation performance.",
        image: "images/codeuniverse.png",
        techStack: ["JavaScript", "Generative Art", "Code Analysis"],
        demoLink: "./CodeConstellation/index.html",
        githubLink: null
    },
    {
        title: "Photography Portfolio",
        category: "Portfolio",
        description: "Personal photography portfolio.",
        details: null,
        image: "images/photography.png",
        techStack: ["Web Design", "Photography"],
        demoLink: "https://dudas.photography",
        githubLink: null
    },
    {
        title: "Civil & Environmental Engineering",
        category: "Business Website",
        description: "Engineering site for civil and environmental engineering company.",
        details: null,
        image: "images/dudasengineering.png",
        techStack: ["Web Design", "Business", "Engineering"],
        demoLink: "https://dudasengineering.com",
        githubLink: null
    },
    {
        title: "Charlie & Pip",
        category: "Literature",
        description: "A heartwarming children's book available on Amazon.",
        details: null,
        image: "images/charlieandpip.png",
        techStack: ["Writing", "Publishing", "Children's Book"],
        demoLink: "https://www.amazon.com/Charlie-Pip-David-R-Dudas/dp/B0DJM8YJVT/ref=tmm_hrd_swatch_0?_encoding=UTF8&qid=&sr=",
        githubLink: null
    },
    {
        title: "Cognitive Blindspot",
        category: "Literature",
        description: "An exploration of how consciousness emerges from knowing. Available on Amazon.",
        details: null,
        image: "images/cognitiveblindspot.png",
        techStack: ["Writing", "Publishing", "Philosophy"],
        demoLink: "https://www.amazon.com/Cognitive-Blindspot-Consciousness-Emerges-Knowing-ebook/dp/B0FYQT5LSX",
        githubLink: null
    },
    {
        title: "NeutralHQ",
        category: "Web Platform",
        description: "A website for a startup reviewing legal neutrals using no frontend frameworks.",
        detailsTitle: "Backend-Only Platform with Minimal Frontend",
        details: "Developed a full-stack Neutral Review Platform using MongoDB, Express.js, and Node.js (MEN stack), featuring server-side rendering with EJS templates. Implemented comprehensive functionality including secure user authentication with Passport.js, Stripe payment processing for subscription features, and a robust review/rating system with moderation capabilities. Integrated multiple third-party services including Cloudinary for file management and SendGrid for email communications. Focused on security best practices by implementing Helmet for CSP, CORS configuration, and MongoDB sanitization. Designed efficient database schemas and relationships using Mongoose, while maintaining clean code architecture through MVC pattern and custom middleware for error handling.",
        image: "images/neutralhq.png",
        techStack: ["JavaScript", "HTML", "CSS"],
        demoLink: "https://hidden-refuge-77075.herokuapp.com/",
        githubLink: null
    },
    {
        title: "Game Development Site",
        category: "Game Development",
        description: "Game development site for my indie game studio.",
        details: null,
        image: "images/limitshift.png",
        techStack: ["Game Development", "Web Design"],
        demoLink: "https://www.limitshift.com",
        githubLink: null
    },
    {
        title: "Naive Cryptography",
        category: "Educational",
        description: "A naive cryptography project.",
        details: "Developed a web-based cryptographic visualization tool that transforms text through a novel visual grid-based encryption system. The application features an interactive encryption pattern designer with real-time complexity analysis, customizable grid parameters, and a dual-pane encode/decode interface. Implemented advanced features including pattern strength calculation, visual state preservation, theme switching, and comprehensive error handling.",
        image: "images/naivecryptography.png",
        techStack: ["JavaScript", "Cryptography"],
        demoLink: "./NaiveCryptography/index.html",
        githubLink: null
    },
    {
        title: "Prism",
        category: "Game Development",
        description: "Indie video game in development, launching on PlayStation, Xbox, and PC.",
        detailsTitle: "Indie Video Game – In Development",
        details: "Leading all aspects of game creation, including art, music, game design, and technical architecture. Utilizing A* pathfinding algorithms for dynamic navigation, implementing complex AI decision-making systems, and designing a custom random-generation algorithm capable of spawning up to 220 unique characters in a novel and scalable grid-based positioning algorithm. Integrating novel approaches to enhance gameplay experience, optimizing for efficiency and scalability in challenging scenarios. Targeting release on PlayStation Network, Xbox, and PC platforms.",
        image: "images/prism.png",
        techStack: ["Unity", "C#", "Game Design", "AI", "Console Development"],
        demoLink: null,
        githubLink: null
    },

    {
        title: "CompressLite",
        category: "iOS Development",
        description: "iOS app for intelligent image compression and storage management.",
        detailsTitle: "iOS Photo Compression Application",
        details: "Developed an iOS application designed to help users efficiently manage their photo storage through intelligent image compression. Features three compression modes (Standard, Aggressive, and Extreme), batch processing capabilities, and a user-friendly interface with side-by-side image comparisons. Includes detailed compression statistics, automatic screenshot compression, and intelligent tracking of previously processed images to avoid duplicates. Original photos are safely stored in the Recently Deleted album for 30 days, providing detailed feedback on storage space saved while maintaining acceptable image quality.",
        image: "images/compresslite.png",
        techStack: ["Swift", "iOS", "UIKit", "Image Processing"],
        demoLink: null,
        githubLink: null
    },
    {
        title: "Hokku",
        category: "Enterprise Software",
        description: "High-performance, ultra-low latency ticketing platform for high-volume operations.",
        detailsTitle: "Enterprise Ticketing Platform",
        details: "Architected and developed a high-performance ticketing platform designed for ultra-low latency and high-volume operations. The system handles enterprise-scale event processing with optimized data pipelines, real-time updates, and robust reliability patterns. Built with a focus on scalability, efficiency, and maintainability for mission-critical business operations.",
        image: "images/hokku.png",
        techStack: ["Enterprise Architecture", "High Performance", "Real-time Systems"],
        demoLink: null,
        githubLink: null
    },
    {
        title: "Indie Game Development",
        category: "Game Development",
        description: "Collection of unpublished games including shooters, puzzlers, and arcade titles.",
        detailsTitle: "Multiple Unpublished Game Projects",
        details: "Developed numerous complete game projects across multiple genres. Highlights include: An enhanced Tetris clone inspired by Tetris Effect with ghost piece previews, progressive difficulty scaling, and dynamic audio-visual experiences. A horizontal-scrolling space shooter featuring homing missiles, drone companions, upgradeable weapons, and infinite wave generation with time manipulation abilities. A complete FPS with intelligent enemy AI, dynamic pathfinding, wave-based combat, and a modular weapon framework with inventory management. Each project demonstrates expertise in game physics, AI systems, procedural generation, and performance optimization.",
        image: "images/indiegames.png",
        techStack: ["Unity", "C#", "Game Design", "AI", "Physics"],
        demoLink: null,
        githubLink: null
    }
];

// Info modal functions
function showProjectDetails(projectTitle) {
    const project = projects.find(p => p.title === projectTitle);
    if (!project || !project.details) return;

    const modal = document.getElementById('projectDetailsModal');
    const modalTitle = modal.querySelector('.modal-title');
    const modalCategory = modal.querySelector('.modal-category');
    const modalDetailsTitle = modal.querySelector('.modal-details-title');
    const modalDetails = modal.querySelector('.modal-details');
    const modalTechStack = modal.querySelector('.modal-tech-stack');

    modalTitle.textContent = project.title;
    modalCategory.textContent = project.category;

    // Set details title if available
    if (project.detailsTitle) {
        modalDetailsTitle.textContent = project.detailsTitle;
        modalDetailsTitle.style.display = 'block';
    } else {
        modalDetailsTitle.style.display = 'none';
    }

    modalDetails.textContent = project.details;
    modalTechStack.innerHTML = project.techStack.map(tech =>
        `<span class="tech-tag">${tech}</span>`
    ).join('');

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeProjectDetails() {
    const modal = document.getElementById('projectDetailsModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Close on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeProjectDetails();
    }
});

// This function is no longer used since main.js handles carousel creation
function createProjects() {
    // Legacy function - carousel is now built in main.js
}

document.addEventListener('DOMContentLoaded', createProjects);
