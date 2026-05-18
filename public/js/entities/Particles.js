/**
 * ParticleSystem - Visual Effects Manager
 * 
 * Handles all particle effects:
 * - Score celebration (confetti/sparks)
 * - Ball bounce dust
 * - Swish effect
 * - Crowd reaction
 * - Three-pointer fireworks
 */

class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this._pools = {};
    this._activeEffects = [];
    
    this._initPools();
  }

  _initPools() {
    // Pre-create particle geometries for performance
    this._sparkMat = new THREE.MeshBasicMaterial({
      color: 0xFF8800,
      transparent: true
    });
    
    this._confettiColors = [
      0xFF6600, 0xFFD700, 0xFF3366, 0x00CCFF, 0x00FF88, 0xFFFFFF
    ];
  }

  /**
   * Score celebration effect
   */
  celebrateScore(position, isThreePointer = false) {
    const count = isThreePointer ? 60 : 30;
    const particles = [];
    
    for (let i = 0; i < count; i++) {
      const color = this._confettiColors[Math.floor(Math.random() * this._confettiColors.length)];
      const size = 0.05 + Math.random() * 0.1;
      
      const geo = new THREE.BoxGeometry(size, size * 2, size * 0.1);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      
      mesh.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + Math.random() * 0.5,
        position.z + (Math.random() - 0.5) * 0.5
      );
      
      const speed = 3 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;
      const upAngle = Math.PI * 0.3 + Math.random() * Math.PI * 0.4;
      
      const particle = {
        mesh,
        velocity: {
          x: Math.cos(angle) * Math.sin(upAngle) * speed,
          y: Math.cos(upAngle) * speed + 2,
          z: Math.sin(angle) * Math.sin(upAngle) * speed
        },
        rotation: {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: (Math.random() - 0.5) * 10
        },
        life: 1.0,
        maxLife: 1.5 + Math.random() * 0.5,
        gravity: -9.8
      };
      
      this.scene.add(mesh);
      particles.push(particle);
    }
    
    this._activeEffects.push({
      type: 'celebration',
      particles,
      time: 0
    });
    
    // Three-pointer special effect
    if (isThreePointer) {
      this._createFirework(position);
    }
  }

  /**
   * Ball bounce dust effect
   */
  bounceDust(position, speed) {
    if (speed < 2) return;
    
    const count = Math.floor(speed * 1.5);
    const particles = [];
    
    for (let i = 0; i < count; i++) {
      const size = 0.03 + Math.random() * 0.05;
      const geo = new THREE.SphereGeometry(size, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xCCAA88,
        transparent: true,
        opacity: 0.6
      });
      const mesh = new THREE.Mesh(geo, mat);
      
      mesh.position.set(
        position.x + (Math.random() - 0.5) * 0.2,
        position.y + 0.05,
        position.z + (Math.random() - 0.5) * 0.2
      );
      
      const angle = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 2;
      
      particles.push({
        mesh,
        velocity: {
          x: Math.cos(angle) * spd,
          y: 0.5 + Math.random() * 1,
          z: Math.sin(angle) * spd
        },
        rotation: { x: 0, y: 0, z: 0 },
        life: 1.0,
        maxLife: 0.4 + Math.random() * 0.3,
        gravity: -15
      });
      
      this.scene.add(mesh);
    }
    
    this._activeEffects.push({ type: 'dust', particles, time: 0 });
  }

  /**
   * Swish visual effect (ball through net)
   */
  swishEffect(position) {
    const count = 15;
    const particles = [];
    
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.03, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.9
      });
      const mesh = new THREE.Mesh(geo, mat);
      
      const angle = (i / count) * Math.PI * 2;
      const radius = 0.2 + Math.random() * 0.1;
      
      mesh.position.set(
        position.x + Math.cos(angle) * radius,
        position.y,
        position.z + Math.sin(angle) * radius
      );
      
      particles.push({
        mesh,
        velocity: {
          x: Math.cos(angle) * 2,
          y: -1 - Math.random(),
          z: Math.sin(angle) * 2
        },
        rotation: { x: 0, y: 0, z: 0 },
        life: 1.0,
        maxLife: 0.5,
        gravity: -5
      });
      
      this.scene.add(mesh);
    }
    
    this._activeEffects.push({ type: 'swish', particles, time: 0 });
  }

  /**
   * Rim hit sparks
   */
  rimSparks(position) {
    const count = 8;
    const particles = [];
    
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.02, 4, 4);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xFF6600,
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      
      particles.push({
        mesh,
        velocity: {
          x: Math.cos(angle) * speed,
          y: 1 + Math.random() * 3,
          z: Math.sin(angle) * speed
        },
        rotation: { x: 0, y: 0, z: 0 },
        life: 1.0,
        maxLife: 0.3 + Math.random() * 0.2,
        gravity: -20
      });
      
      this.scene.add(mesh);
    }
    
    this._activeEffects.push({ type: 'sparks', particles, time: 0 });
  }

  _createFirework(position) {
    // Burst of colored particles for 3-pointer
    const count = 40;
    const particles = [];
    
    for (let i = 0; i < count; i++) {
      const color = this._confettiColors[i % this._confettiColors.length];
      const geo = new THREE.SphereGeometry(0.06, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      
      mesh.position.set(
        position.x + (Math.random() - 0.5) * 0.3,
        position.y + 0.5,
        position.z + (Math.random() - 0.5) * 0.3
      );
      
      const angle = (i / count) * Math.PI * 2;
      const elevation = Math.random() * Math.PI;
      const speed = 4 + Math.random() * 6;
      
      particles.push({
        mesh,
        velocity: {
          x: Math.cos(angle) * Math.sin(elevation) * speed,
          y: Math.cos(elevation) * speed + 3,
          z: Math.sin(angle) * Math.sin(elevation) * speed
        },
        rotation: {
          x: (Math.random() - 0.5) * 15,
          y: (Math.random() - 0.5) * 15,
          z: (Math.random() - 0.5) * 15
        },
        life: 1.0,
        maxLife: 1.0 + Math.random() * 0.5,
        gravity: -12
      });
      
      this.scene.add(mesh);
    }
    
    this._activeEffects.push({ type: 'firework', particles, time: 0 });
  }

  /**
   * Update all active particle effects
   */
  update(dt) {
    for (let i = this._activeEffects.length - 1; i >= 0; i--) {
      const effect = this._activeEffects[i];
      effect.time += dt;
      
      let allDead = true;
      
      for (const particle of effect.particles) {
        if (particle.life <= 0) continue;
        
        allDead = false;
        
        // Update physics
        particle.velocity.y += particle.gravity * dt;
        particle.mesh.position.x += particle.velocity.x * dt;
        particle.mesh.position.y += particle.velocity.y * dt;
        particle.mesh.position.z += particle.velocity.z * dt;
        
        // Rotation
        particle.mesh.rotation.x += particle.rotation.x * dt;
        particle.mesh.rotation.y += particle.rotation.y * dt;
        particle.mesh.rotation.z += particle.rotation.z * dt;
        
        // Fade out
        particle.life -= dt / particle.maxLife;
        particle.mesh.material.opacity = Math.max(0, particle.life);
        
        // Scale down
        const scale = Math.max(0.01, particle.life);
        particle.mesh.scale.setScalar(scale);
        
        // Floor bounce
        if (particle.mesh.position.y < 0.05) {
          particle.mesh.position.y = 0.05;
          particle.velocity.y *= -0.3;
          particle.velocity.x *= 0.8;
          particle.velocity.z *= 0.8;
        }
        
        if (particle.life <= 0) {
          this.scene.remove(particle.mesh);
          particle.mesh.geometry.dispose();
          particle.mesh.material.dispose();
        }
      }
      
      if (allDead) {
        this._activeEffects.splice(i, 1);
      }
    }
  }

  /**
   * Clear all effects
   */
  clear() {
    this._activeEffects.forEach(effect => {
      effect.particles.forEach(p => {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      });
    });
    this._activeEffects = [];
  }
}
