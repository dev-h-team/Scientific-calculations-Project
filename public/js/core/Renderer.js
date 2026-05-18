/**
 * Renderer - Professional Three.js Renderer Setup
 * 
 * Configures high-quality rendering with:
 * - WebGL2 renderer with anti-aliasing
 * - Shadow mapping (PCF Soft)
 * - Tone mapping (ACES Filmic)
 * - Responsive resize handling
 * - Dynamic arena lighting
 */

class Renderer {
  constructor(container) {
    this.container = container;
    this._setupRenderer();
    this._setupScene();
    this._setupLights();
    this._setupFog();
    this._handleResize();
  }

  _setupRenderer() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false
      });

      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      
      // Shadow configuration
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // Tone mapping for realistic lighting
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.4;
      
      // Color space
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      
      if (this.container) {
        this.container.appendChild(this.renderer.domElement);
      } else {
        window.gameLogger.error('Renderer container is null!');
      }
      window.gameLogger.info('WebGL Renderer setup complete');
    } catch (e) {
      window.gameLogger.error('Failed to setup WebGL Renderer:', e);
      throw e;
    }
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080810);
  }

  _setupLights() {
    // Ambient light - increased for better general visibility
    this.ambientLight = new THREE.AmbientLight(0x223355, 0.95); 
    this.scene.add(this.ambientLight);

    // Main arena spotlights (6 overhead lights like NBA arena)
    const spotPositions = [
      { x: -5, y: 13, z: -4 },
      { x:  5, y: 13, z: -4 },
      { x: -5, y: 13, z:  4 },
      { x:  5, y: 13, z:  4 },
      { x: -10, y: 11, z: 0 },
      { x:  10, y: 11, z: 0 }
    ];

    this.arenaSpots = [];
    spotPositions.forEach((pos, i) => {
      const spot = new THREE.SpotLight(0xFFEECC, 3.2); // Intense spotlight glow
      spot.position.set(pos.x, pos.y, pos.z);
      spot.target.position.set(0, 0, 0);
      spot.angle = Math.PI / 5;
      spot.penumbra = 0.5;
      spot.decay = 1.2;
      spot.distance = 40;
      
      // First 4 cast shadows
      if (i < 4) {
        spot.castShadow = true;
        spot.shadow.mapSize.width = 1024;
        spot.shadow.mapSize.height = 1024;
        spot.shadow.camera.near = 0.5;
        spot.shadow.camera.far = 40;
        spot.shadow.bias = -0.0003;
      }
      
      this.scene.add(spot);
      this.scene.add(spot.target);
      this.arenaSpots.push(spot);
    });

    // Hoop accent lights for both baskets (left/right fill per hoop)
    this.hoopLight1 = new THREE.PointLight(0xFFEECC, 3.0, 18);
    this.hoopLight1.position.set(-1.4, 5.2, -12.4);
    this.scene.add(this.hoopLight1);

    this.hoopLight2 = new THREE.PointLight(0xFFEECC, 3.0, 18);
    this.hoopLight2.position.set(1.4, 5.2, -12.4);
    this.scene.add(this.hoopLight2);

    this.hoopLight3 = new THREE.PointLight(0xFFEECC, 3.0, 18);
    this.hoopLight3.position.set(-1.4, 5.2, 12.4);
    this.scene.add(this.hoopLight3);

    this.hoopLight4 = new THREE.PointLight(0xFFEECC, 3.0, 18);
    this.hoopLight4.position.set(1.4, 5.2, 12.4);
    this.scene.add(this.hoopLight4);


    // Rim glow light (activated on score)
    this.rimGlow = new THREE.PointLight(0xFF6600, 0.001, 6);
    this.rimGlow.position.set(0, 3.2, -12.4);
    this.scene.add(this.rimGlow);

    // Court floor bounce light (warm illumination upwards)
    this.floorLight = new THREE.HemisphereLight(0x4a5a6a, 0x332211, 0.6);
    this.scene.add(this.floorLight);

    // Rim score flash light
    this.scoreFlash = new THREE.PointLight(0xFFDD00, 0.001, 10);
    this.scoreFlash.position.set(0, 5, 0);
    this.scene.add(this.scoreFlash);
  }

  _setupFog() {
    // Atmospheric fog for depth
    this.scene.fog = new THREE.FogExp2(0x080810, 0.015);
  }

  _handleResize() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      if (this._onResize) this._onResize(w, h);
    });
  }

  onResize(callback) {
    this._onResize = callback;
  }

  render(scene, camera) {
    this.renderer.render(scene || this.scene, camera);
  }

  /**
   * Flash rim light on score
   */
  flashRimLight(hoopPosition, duration = 0.6) {
    this.rimGlow.position.copy(hoopPosition);
    this.rimGlow.intensity = 4;
    this.scoreFlash.position.copy(hoopPosition);
    this.scoreFlash.intensity = 3;
    
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const t = elapsed / duration;
      if (t < 1) {
        const ease = 1 - t * t;
        this.rimGlow.intensity = Math.max(0.001, 4 * ease);
        this.scoreFlash.intensity = Math.max(0.001, 3 * ease);
        requestAnimationFrame(animate);
      } else {
        this.rimGlow.intensity = 0.001;
        this.scoreFlash.intensity = 0.001;
      }
    };
    animate();
  }

  /**
   * Animate arena lights (subtle flicker for atmosphere)
   */
  updateLights(time) {
    const flicker = 1 + Math.sin(time * 0.7) * 0.015 + Math.sin(time * 2.3) * 0.008;
    this.arenaSpots.forEach((spot, i) => {
      spot.intensity = 3.2 * flicker * (1 + Math.sin(time * 0.3 + i) * 0.02);
    });
    
    // Hoop lights subtle pulse
    const hoopPulse = 1 + Math.sin(time * 1.5) * 0.08;
    this.hoopLight1.intensity = 3.0 * hoopPulse;
    this.hoopLight2.intensity = 3.0 * hoopPulse;
    this.hoopLight3.intensity = 3.0 * hoopPulse;
    this.hoopLight4.intensity = 3.0 * hoopPulse;
  }

  dispose() {
    this.renderer.dispose();
  }
}
