# 🏀 Basketball 3D Pro

> A highly professional, commercial-quality 3D basketball game built with **Node.js** and **Three.js**, featuring a fully custom physics engine built from scratch — no external physics libraries.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Physics Engine](#physics-engine)
4. [Installation](#installation)
5. [Running the Game](#running-the-game)
6. [Game Controls](#game-controls)
7. [Project Architecture](#project-architecture)
8. [Technical Details](#technical-details)
9. [Dependencies](#dependencies)

---

## Overview

**Basketball 3D Pro** is a browser-based 3D basketball game that runs through a Node.js/Express server. It combines a custom physics engine, a professional arena presentation, camera modes, score tracking, shot clock logic, and a playable practice/match loop.

The project was built as a demonstration of advanced Three.js capabilities combined with a completely custom physics engine, implementing all physics calculations manually without any external physics libraries.

---

## Features

### 🎮 Gameplay
- **Full basketball game** with quarters, game clock, shot clock, and scoring system
- **Free Practice mode** for unlimited shooting practice
- **AI opponent** in match mode for pressure and scoring cadence
- **2-point and 3-point shots** based on distance from the hoop
- **Shot power meter** with a sweet-spot zone for optimal shots
- **Trajectory preview** showing predicted ball path before shooting
- **Shot clock** (24 seconds) with urgent warning animation

### 🏟️ Visual Quality
- **NBA-regulation court** with hardwood floor texture, all court markings (3-point line, paint area, free throw line, center circle, restricted area)
- **Realistic arena** with bleachers, crowd silhouettes, ceiling, walls, and scoreboard
- **6 overhead arena spotlights** with soft shadows and subtle flicker animation
- **Dynamic rim glow** that flashes on collision and scoring
- **Procedural basketball texture** with realistic orange color, seam lines, and pebble surface
- **Normal mapping** for surface detail on the ball
- **Motion trail** during ball flight
- **Shadow blobs** under ball and player
- **ACES Filmic tone mapping** for cinematic color grading
- **Atmospheric fog** for depth

### 🧑‍🤝‍🧑 Player Character
- **Detailed humanoid mesh** with torso, head, arms, forearms, hands, legs, calves, shoes
- **Headband and jersey number** (23)
- **Smooth animations**: idle breathing, running, dribbling, shooting with jump
- **Smooth acceleration/deceleration** movement system

### 🎯 Physics (100% Custom)
- **Gravity system** with configurable scale
- **Projectile motion** using ballistic equations from the physics report
- **Air resistance** with a quadratic drag model based on the basketball cross-section
- **Magnus effect** from backspin/topspin influencing the trajectory
- **Sphere-plane collision** with restitution and friction
- **Sphere-box collision** for backboard interactions
- **Sphere-sphere collision** for rim interactions
- **Energy loss on bounce** tuned through custom restitution values
- **Rolling resistance** and rest detection
- **Spin-floor coupling** on bounce

### 🎵 Audio
- **Procedural audio synthesis** using Web Audio API (no audio files needed)
- Ball bounce, rim hit, backboard hit, swish, crowd cheer, buzzer, shot charge sounds
- Volume control and mute toggle

### 🖥️ UI/UX
- **Professional scoreboard** with team names, scores, quarter, and game clock
- **Shot power meter** with color-coded zones
- **Mini stats panel** (shots, made, shooting percentage)
- **Animated notifications** for scores, 3-pointers, period changes
- **Pause menu** with resume, restart, and main menu options
- **Game over screen** with final stats
- **Camera modes**: First-person, Follow, Broadcast, Free, Ball
- **Shot cinematic** camera for dramatic shots

---

## Physics Engine

The custom physics engine (`PhysicsEngine.js`) implements:

### Core Equations

**Projectile Motion** (from the physics report):
```
v₀ = √(g·x² / (2·cos²θ·(x·tanθ - Δy)))
```
Where:
- `g` = 9.81 m/s² × world scale
- `x` = horizontal distance to hoop
- `θ` = launch angle (46°–52° based on distance)
- `Δy` = height difference

**Optimal Launch Angle**:
- Close range (<5m): 52°
- Mid range: 50°
- Long range (>15m): 46°
- Free throw: 51° (as per report)

**Magnus Effect** (backspin):
```
F_magnus = k × (ω × v)
```
Backspin improves accuracy by creating slight upward force, as documented in the physics report.

**Coefficient of Restitution**:
- Floor: 0.72 (NBA regulation ball bounces to 72-76% of drop height)
- Backboard: 0.65
- Rim: 0.55

**Air Resistance**:
```
F_drag = 0.5 × ρ × Cd × A × v²
```
Where `ρ = 1.225 kg/m³`, `Cd = 0.47` (sphere), `A = π × r²`

### Integration Method
Uses a **fixed timestep accumulator** (1/120s) with **semi-implicit Euler integration** for stability, with up to 6 substeps per frame.

---

## Installation

### Prerequisites
- **Node.js** v16.0.0 or higher
- **npm** (comes with Node.js)

### Steps

```bash
# 1. Clone or extract the project
cd basketball3d

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

---

## Running the Game

After running `npm start`, open your browser and navigate to:

```
http://localhost:3000
```

The game will load automatically. Click **PLAY GAME** to start a full match or **FREE PRACTICE** for unlimited shooting.

### Development Mode
```bash
npm run dev
```

---

## Game Controls

| Key / Input | Action |
|-------------|--------|
| `W` / `↑` | Move Forward |
| `S` / `↓` | Move Backward |
| `A` / `←` | Move Left |
| `D` / `→` | Move Right |
| `Shift` | Sprint |
| `Hold Left Mouse Button` | Charge Shot Power |
| `Release Left Mouse Button` | Shoot Ball |
| `Mouse Move` | Aim Direction (camera look when pointer is locked) |
| `R` | Reset Ball to Player |
| `C` | Cycle Camera Mode |
| `M` | Toggle Mute |
| `Escape` | Pause / Menu |

### Shot Tips
- The **green zone** on the power meter is the sweet spot for optimal shots
- Hold longer for more power (needed for 3-pointers from distance)
- The **trajectory preview** dots show where the ball will go
- **Backspin** is automatically applied to improve accuracy
- The game requests **pointer lock** when you start Play or Practice, so mouse movement rotates the camera smoothly

---

## Project Architecture

```
basketball3d/
├── server.js                    # Express server entry point
├── package.json                 # Project manifest
├── README.md                    # This file
└── public/
    ├── index.html               # Main HTML shell
    ├── css/
    │   └── style.css            # Complete game stylesheet
    └── js/
        ├── utils/
        │   └── MathUtils.js     # Math helpers, physics constants
        ├── physics/
        │   ├── PhysicsEngine.js # Core physics engine (gravity, integration, collisions)
        │   ├── BallPhysics.js   # Ball-specific physics (shots, bounces, spin)
        │   └── CollisionSystem.js # Collision detection & response system
        ├── core/
        │   ├── Renderer.js      # Three.js renderer, lighting, shadows
        │   ├── Camera.js        # Multi-mode camera controller
        │   ├── InputManager.js  # Keyboard, mouse, touch input
        │   ├── AudioManager.js  # Procedural Web Audio synthesis
        │   ├── GameState.js     # Game state machine, timers, scoring
        │   └── Game.js          # Main game loop & orchestrator
        ├── entities/
        │   ├── Court.js         # NBA court with all markings & arena
        │   ├── Hoop.js          # Backboard, rim, net assembly
        │   ├── Ball.js          # Basketball mesh, trail, trajectory preview
        │   ├── Player.js        # Humanoid player with animations
        │   └── Particles.js     # Particle effects system
        └── ui/
            ├── HUD.js           # Heads-up display manager
            └── Notifications.js # Score/event notification system
```

### Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `PhysicsEngine` | Core physics: gravity, fixed timestep integration, sphere-plane/box/sphere collision |
| `BallPhysics` | Shot velocity calculation, backspin, floor bounce, trajectory preview |
| `CollisionSystem` | Per-frame collision checks, scoring detection, event emission |
| `Renderer` | WebGL2 renderer, ACES tone mapping, arena lighting, shadow maps |
| `CameraController` | First-person/Follow/Broadcast/Free/Ball camera modes, shake, cinematics |
| `InputManager` | Keyboard/mouse/touch state, shot charge timing |
| `AudioManager` | Web Audio API procedural synthesis |
| `GameState` | State machine, period timer, shot clock, stats tracking |
| `Court` | NBA court geometry, wood texture, markings, arena environment |
| `Hoop` | Backboard, rim (torus), net (line segments), collision data |
| `Ball` | Basketball mesh, procedural texture, normal map, trail, shadow |
| `Player` | Humanoid mesh, movement physics, animation state machine |
| `ParticleSystem` | Confetti, sparks, dust, fireworks, swish rings |

---

## Technical Details

### Rendering Pipeline
- **WebGL2** renderer with anti-aliasing
- **PCF Soft Shadow Maps** (1024×1024) on 4 spotlights
- **ACES Filmic Tone Mapping** (exposure 1.4)
- **sRGB color space** output
- Pixel ratio capped at 2× for performance
- Exponential fog for depth

### Physics Pipeline (per frame)
1. Accumulate delta time
2. Run fixed-timestep substeps (up to 6 × 1/120s)
3. For each substep: apply gravity, air drag, Magnus force, integrate position
4. Floor collision check
5. Boundary check
6. Backboard collision (sphere-box)
7. Rim collision (sphere-sphere, 16 contact points)
8. Scoring detection (downward velocity + horizontal proximity + vertical crossing)

### Performance Optimizations
- Shared geometry instances where possible
- Shadow maps only on 4 of 6 spotlights
- Particle pool with automatic cleanup
- Fixed physics timestep prevents spiral of death
- Pixel ratio capped at 2×

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.18.2 | HTTP server for static file serving |
| `three.js` | r128 (CDN) | 3D rendering engine |

> **Note**: Three.js is loaded from CDN (`cdnjs.cloudflare.com`) for simplicity. No build step required.

---

## Physics Report Reference

This project implements the physics principles described in the academic report:

| Concept | Implementation |
|---------|---------------|
| Projectile motion equations | `PhysicsEngine.calcShotVelocity()` |
| Distance-based launch angle (about 46°–54°) | `BallPhysics.applyShot()` |
| Free throw angle (51°) | `BallPhysics.applyFreeThrow()` |
| Power-scaled launch velocity | `BallPhysics.applyShot()` |
| Floor bounce coefficient | `RESTITUTION_FLOOR = 0.72` |
| Backspin effect | `PhysicsEngine._calcMagnusForce()` |
| Air resistance | `PhysicsEngine._integrateBody()` |
| Newton's laws | All force/impulse calculations |
| Conservation of momentum | `sphereSphereCollision()` impulse formula |

---

*Built with ❤️ using Three.js and a custom physics engine. No external physics libraries were used.*
