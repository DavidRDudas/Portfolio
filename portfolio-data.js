// Shared by index.html and portfolio.html only.
const PORTFOLIO_SECTIONS = [
  {
    title: "Systems & Enterprise",
    blurb: "Production platforms engineered for performance, reliability, and scale.",
    items: [
      { title:"Hokku", cat:"Enterprise · Real-time Systems", img:"hokku.png",
        desc:"High-performance, ultra-low-latency ticketing platform for high-volume enterprise operations — optimized data pipelines, real-time updates, and reliability patterns engineered for mission-critical workloads.",
        tech:["Enterprise Architecture","High Performance","Real-time Systems"], link:"https://hokku.app" },
      { title:"NeutralHQ", cat:"Web Platform · MEN Stack", img:"neutralhq.png",
        desc:"Backend-heavy review platform for legal neutrals: MongoDB + Express + Node with EJS server-side rendering, Passport.js auth, Stripe subscriptions, a moderated review/rating system, Cloudinary uploads, SendGrid email, Helmet/CSP/CORS hardening, and a custom MVC architecture.",
        tech:["MongoDB","Express.js","Node.js","EJS","Stripe","Passport.js"], link:"https://hidden-refuge-77075.herokuapp.com/" },
      { title:"Opin.Ink", cat:"Web Platform", img:"opinink.png",
        desc:"Full-stack writing platform for journaling and sharing thoughts — NLP-powered content moderation via WordNet, Stripe payments, email verification, and a quarterly content-ranking system.",
        tech:["Vue.js","Express","MongoDB","NLP","Stripe"], link:"https://opin.ink" },
      { title:"Resource Management Software", cat:"Enterprise Software", img:"rmp.png",
        desc:"Web-based resource management with an interactive calendar, employee/PTO tracking, color-coded project assignments, conflict detection, and JSON backup/restore.",
        tech:["JavaScript","Node.js","Database"], link:"https://watermarg.in" },
    ]
  },
  {
    title: "Languages & Compilers",
    blurb: "Language design and compiler engineering — rethinking how code is identified, changed, and trusted.",
    items: [
      { title:"rigid", cat:"Programming Language · Rust", img:"rigidlang.png",
        desc:"A text-first, content-addressed language kernel: every definition is identified by the SHA-256 of its canonical form — local names erased, references replaced by the hashes of what they reference. The compiler keeps an exact dependency graph as a byproduct of compiling, so a rename can't silently change meaning, “what breaks if I touch this” is a query, tests re-run only when a dependency actually changed, and structured errors carry typed fixes a repair loop applies mechanically. Rust kernel with a spec, tutorial, in-browser WASM playground, workshop-paper draft, and a pre-registered study across five real Python codebases.",
        tech:["Rust","Compilers","Language Design","Content Addressing","WASM"], link:"https://rigid.sh" },
    ]
  },
  {
    title: "Simulations & Computational Art",
    blurb: "Interactive engines exploring physics, emergence, and the structure of code.",
    eq: "\\[ \\frac{d\\mathbf{x}_i}{dt} \\;=\\; \\sum_{j\\neq i} \\mathbf{f}_{ij}(\\mathbf{x}_i,\\mathbf{x}_j) \\]",
    items: [
      { title:"Particle Physics Simulator", cat:"Interactive Simulation", img:"particlephysics.png",
        desc:"Interactive 2D physics sandbox across four regimes — free particles, solar systems, electric fields and gas kinetics. Broad-phase spatial hashing, fixed-timestep integration so the physics stays framerate-independent, and live kinetic-energy and momentum readouts that make integrator drift visible. Pause and single-step to inspect a collision frame by frame.",
        tech:["JavaScript","Canvas","Physics Simulation","Spatial Hashing"], link:"./ParticleApplication/index.html" },
      { title:"Ant Colony Optimization", cat:"Interactive 3D Simulation", img:"aco.png",
        desc:"Real-time 3D ecosystem of competing ant colonies — queens, scouts, foragers and warriors driven by glowing pheromone fields, predators and territorial battles. Orbit the world, focus any nest, and tune every parameter live.",
        tech:["Three.js","WebGL","Emergent Behavior"], link:"./ACO/index.html" },
      { title:"Hydrogen — Orbital Explorer", cat:"Computational Physics", img:"hydrogen.png",
        desc:"Exact solutions of the Schrödinger equation for hydrogen, sampled into a granular cloud of up to a million grains. Because |ψ|² factorises, sampling needs no rejection — two 1D inverse-CDF lookups and a free azimuth. Superpose two eigenstates and the cross term beats at (E₂−E₁)/ℏ, sloshing the cloud: the oscillating dipole that radiates the photon. Every quantity is checked against its closed form in the page.",
        tech:["WebGL2","Quantum Mechanics","GLSL","Numerical Methods"], link:"./HydrogenAtom/index.html" },
      { title:"Code Constellation", cat:"Creative Technology", img:"codeuniverse.png",
        desc:"A static analyser that renders itself as a night sky. Star size is lines of code, colour is cyclomatic complexity, coronas mark heavily-depended-on functions, planets are variables in scope, and comet trails flow from caller to callee. Recursion gets a ring, mutual recursion a binary system, dead code a black hole. Click any star to focus its call graph.",
        tech:["JavaScript","Static Analysis","Canvas","Force-Directed Layout"], link:"./CodeConstellation/index.html" },
      { title:"Color Wave Patterns", cat:"Creative Technology", img:"colorwave.png",
        desc:"Real-time particle field with ten generative layouts \u2014 phyllotaxis, hexagonal packing, two-source interference fringes, de Jong strange attractors, Lissajous curves \u2014 driven by harmonic wave functions with flocking, trails and connection meshes at several thousand particles.",
        tech:["JavaScript","Canvas","Generative Art","Simulation"], link:"./ColorSimulator/index.html" },
      { title:"Dream Weaver", cat:"Creative Technology", img:"dreamweaver.png",
        desc:"Text-to-art generator in pure SVG. A keyword lexicon reads your words for warmth, energy and light to pick the palette and steer ten procedural layers — flow fields, Voronoi cells, fractal detail and screened light rays. Seeded, so the same text always weaves the same piece.",
        tech:["JavaScript","SVG","Generative Art"], link:"./DreamWeaver/index.html" },
      { title:"Naive Cryptography", cat:"Educational", img:"naivecryptography.png",
        desc:"Two visual encryption schemes side by side with a broken one, kept as the exhibit. A drawn pattern key feeding PBKDF2 and AES-256-GCM, 2-of-2 XOR shares rendered as PNGs, and a faithful Naor–Shamir visual secret sharing demo you can print on transparencies and stack by hand.",
        tech:["JavaScript","Cryptography","Web Crypto API"], link:"./NaiveCryptography/index.html" },
    ]
  },
  {
    title: "Games",
    blurb: "Original titles spanning design, art, music, AI, and engine work.",
    items: [
      { title:"Painted Crowns", cat:"Indie Game · In Development", img:"prism.png",
        desc:"An indie game I lead on art, music, design, and tech. A* pathfinding, complex AI decision-making, and a custom random-generation algorithm spawning up to 220 unique characters in a novel grid-based positioning system. Coming to PlayStation, Xbox, and PC.",
        tech:["Unity","C#","Game Design","AI","Console Dev"], link:"https://store.steampowered.com/app/5192590/Painted_Crowns/" },
      { title:"Klast", cat:"Twin-Stick Arcade Shooter", img:"klast.png",
        desc:"A high-intensity neon twin-stick arcade shooter — three campaigns across rescue missions (Klast), arena warfare (Vector), and fully spherical planetary battles (Asteroid), with customizable ships, challenge modes, bosses, endless progression, rankings, and AI demonstration pilots.",
        tech:["Game Development","Game Design","Procedural Generation","AI"], link:"https://store.steampowered.com/app/5068020/KLAST/" },
      { title:"Indie Game Development", cat:"Game Development · Multiple Titles", img:"indiegames.png",
        desc:"A collection of complete game projects across genres — an enhanced Tetris with progressive scaling, a horizontal-scrolling space shooter with homing missiles and time manipulation, and a full FPS with intelligent enemy AI and modular weapons.",
        tech:["Unity","C#","AI","Procedural Generation"], link:null },
      { title:"Ursavus", cat:"Video Game Studio", img:"ursavus.png",
        desc:"My video game studio — home to game projects in development.",
        tech:["Game Development","Software","Company"], link:"https://ursavus.com" },
      { title:"LimitShift", cat:"Game Studio · Now Ursavus", img:"limitshift.png",
        desc:"My former indie game studio — rebranded to Ursavus.",
        tech:["Game Development","Web Design"], link:"https://limitshift.com", muted:true },
    ]
  },
  {
    title: "Ventures",
    blurb: "Companies and studios I build and run.",
    items: [
      { title:"Dudas Engineering", cat:"Civil & Environmental Engineering", img:"dudasengineering.png",
        desc:"Business platform for a civil and environmental engineering firm.",
        tech:["Web Design","Business"], link:"https://dudasengineering.com" },
    ]
  },
  {
    title: "Applications",
    blurb: "Shipped consumer software.",
    items: [
      { title:"Raster Tide", cat:"Creative Web App", img:"rastertide.jpg",
        desc:"Browser-based studio that turns images and video into animated ASCII art. Tune the grid, character set, motion, direction, palette, exposure, and contrast, then export PNG, text, or WEBM — with media processed locally on-device.",
        tech:["React","TypeScript","Canvas","Browser APIs","Vite"], link:"https://rastertide.com" },
      { title:"CompressLite", cat:"iOS App", img:"compresslite.png",
        desc:"iOS app for intelligent image compression and storage management — three modes (Standard, Aggressive, Extreme), batch processing, side-by-side comparisons, and safe undo via Recently Deleted.",
        tech:["Swift","iOS","UIKit","Image Processing"], link:"https://compresslite.app" },
    ]
  },
  {
    title: "Writing",
    blurb: "Published books across fable, philosophy, and children's literature.",
    items: [
      { title:"The Wheel", cat:"Satire · Fable", img:"thewheel.png",
        desc:"A Kafkaesque fable about compliance, manufactured purpose, and the animals who keep running. Available on Amazon.",
        tech:["Writing","Publishing","Satire"], link:"https://www.amazon.com/dp/B0GWYSGDX9" },
      { title:"Cognitive Blindspot", cat:"Philosophy · Consciousness", img:"cognitiveblindspot.png",
        desc:"An exploration of how consciousness emerges from knowing. Available on Amazon.",
        tech:["Writing","Publishing","Philosophy"], link:"https://www.amazon.com/Cognitive-Blindspot-Consciousness-Emerges-Knowing-ebook/dp/B0FYQT5LSX" },
      { title:"Charlie & Pip", cat:"Children's Book", img:"charlieandpip.png",
        desc:"A heartwarming, published children's book. Available on Amazon.",
        tech:["Writing","Publishing"], link:"https://www.amazon.com/Charlie-Pip-David-R-Dudas/dp/B0DJM8YJVT" },
    ]
  },
  {
    title: "Photography",
    blurb: "Personal visual work.",
    items: [
      { title:"Photography", cat:"Personal Portfolio", img:"photography.png",
        desc:"Personal photography portfolio.",
        tech:["Photography","Web Design"], link:"https://dudas.photography" },
    ]
  },
  {
    title: "Research Interests",
    blurb: "Areas I actively explore — independent and ongoing.",
    eq: "\\[ \\mathcal{L}(\\theta) \\;=\\; -\\,\\mathbb{E}_{x\\sim\\mathcal{D}}\\big[\\log p_\\theta(x)\\big] \\]",
    items: [
      { title:"Research & Exploration", cat:"Independent · Ongoing", img:"cbt.png",
        desc:"Ongoing independent explorations across AI and deep learning, computer graphics, sim-to-real transfer, and robotics — alongside theoretical physics and the theoretical computer science underneath. Ideas in progress (some incorrect) rather than finished, published results.",
        tech:["AI","Deep Learning","Graphics","Sim-to-Real","Robotics","Physics","Theory"], link:null },
    ]
  },
];
