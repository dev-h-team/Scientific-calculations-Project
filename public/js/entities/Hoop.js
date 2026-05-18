/**
 * Hoop - NBA Basketball Hoop Assembly
 * 
 * Complete hoop assembly:
 * - Backboard (tempered glass appearance)
 * - Rim (orange metal ring)
 * - Net (animated string simulation)
 * - Support pole and arm
 * - Collision data for physics
 * 
 * NBA Regulation:
 * - Hoop height: 3.05m (10 feet)
 * - Rim diameter: 45.72cm (18 inches)
 * - Backboard: 183cm x 107cm
 */

class Hoop {
  constructor(scene, position, rotation) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = rotation || 0;
    scene.add(this.group);
    
    // NBA dimensions (scaled by 3.0 to match world units)
    const SCALE = 3.0;
    this.hoopHeight = 3.05 * SCALE;
    this.rimRadius = 0.2286 * SCALE;     // 9 inches -> ~0.68 wu
    this.rimTubeRadius = 0.01 * SCALE;
    this.backboardW = 1.83 * SCALE;
    this.backboardH = 1.07 * SCALE;
    this.backboardThickness = 0.05 * SCALE;
    
    // Physics collision data
    this.collisionData = {
      hoopCenter: null,
      hoopRadius: this.rimRadius,
      rimPoints: [],
      backboard: null
    };
    
    // Net simulation
    this._netSegments = [];
    this._netTime = 0;
    this._netAnimating = false;
    
    this._build();
    this._buildCollisionData();
  }

  _build() {
    this._buildPole();
    this._buildArm();
    this._buildBackboard();
    this._buildRim();
    this._buildNet();
  }

  _buildPole() {
    // Main support pole
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 4.5, 12);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x888899,
      roughness: 0.3,
      metalness: 0.9
    });
    
    this.pole = new THREE.Mesh(poleGeo, poleMat);
    this.pole.position.set(0, 2.25, 0);
    this.pole.castShadow = true;
    this.group.add(this.pole);
    
    // Pole base
    const baseGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.15, 16);
    const base = new THREE.Mesh(baseGeo, poleMat);
    base.position.set(0, 0.075, 0);
    this.group.add(base);
    
    // Padding on pole (safety)
    const padGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 12);
    const padMat = new THREE.MeshStandardMaterial({
      color: 0xFF6600,
      roughness: 0.9
    });
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 1.0, 0);
    this.group.add(pad);
  }

  _buildArm() {
    // Horizontal arm connecting pole to backboard
    // Increased length to 1.25 to ensure it penetrates the backboard slightly
    const armLength = 1.25;
    const armGeo = new THREE.BoxGeometry(0.08, 0.08, armLength);
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x888899,
      roughness: 0.3,
      metalness: 0.9
    });
    
    this.arm = new THREE.Mesh(armGeo, armMat);
    // Positioned so it starts at the pole (0) and reaches the backboard (~1.22)
    this.arm.position.set(0, this.hoopHeight + 0.3, armLength / 2);
    this.arm.castShadow = true;
    this.group.add(this.arm);
    
    // Diagonal support brace
    const braceGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8);
    const brace = new THREE.Mesh(braceGeo, armMat);
    brace.position.set(0, this.hoopHeight - 0.3, 0.4);
    brace.rotation.x = Math.PI / 4;
    this.group.add(brace);
  }

  _buildBackboard() {
    // Main backboard (glass appearance)
    const boardGeo = new THREE.BoxGeometry(
      this.backboardW, 
      this.backboardH, 
      this.backboardThickness
    );
    
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0xCCDDFF,
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
      envMapIntensity: 1.5
    });
    
    this.backboard = new THREE.Mesh(boardGeo, boardMat);
    this.backboard.position.set(0, this.hoopHeight + 0.3, 1.22);
    this.backboard.castShadow = false;
    this.backboard.receiveShadow = true;
    this.group.add(this.backboard);
    
    // Backboard frame
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.3,
      metalness: 0.5
    });
    
    // Frame borders
    const frameThick = 0.04;
    const frames = [
      // Top
      [this.backboardW, frameThick, this.backboardThickness + 0.01, 0, this.backboardH / 2, 0],
      // Bottom
      [this.backboardW, frameThick, this.backboardThickness + 0.01, 0, -this.backboardH / 2, 0],
      // Left
      [frameThick, this.backboardH, this.backboardThickness + 0.01, -this.backboardW / 2, 0, 0],
      // Right
      [frameThick, this.backboardH, this.backboardThickness + 0.01, this.backboardW / 2, 0, 0]
    ];
    
    frames.forEach(([w, h, d, x, y, z]) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, frameMat);
      mesh.position.set(
        this.backboard.position.x + x,
        this.backboard.position.y + y,
        this.backboard.position.z + z
      );
      this.group.add(mesh);
    });
    
    // Shooting box (inner rectangle on backboard)
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0xFF6600,
      transparent: true,
      opacity: 0.8
    });
    
    const boxW = 0.59, boxH = 0.45;
    const boxFrameThick = 0.03;
    
    const boxFrames = [
      [boxW, boxFrameThick, 0, boxH / 2],
      [boxW, boxFrameThick, 0, -boxH / 2],
      [boxFrameThick, boxH, -boxW / 2, 0],
      [boxFrameThick, boxH, boxW / 2, 0]
    ];
    
    boxFrames.forEach(([w, h, x, y]) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, boxMat);
      mesh.position.set(
        this.backboard.position.x + x,
        this.backboard.position.y + y - 0.15,
        this.backboard.position.z + this.backboardThickness / 2 + 0.001
      );
      this.group.add(mesh);
    });
  }

  _buildRim() {
    // Main rim ring
    const rimGeo = new THREE.TorusGeometry(
      this.rimRadius, 
      this.rimTubeRadius, 
      16, 
      64
    );
    
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xFF6600,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0xFF4400,
      emissiveIntensity: 0.1
    });
    
    this.rim = new THREE.Mesh(rimGeo, rimMat);
    this.rim.position.set(0, this.hoopHeight, 1.575);
    this.rim.rotation.x = Math.PI / 2;
    this.rim.castShadow = true;
    this.group.add(this.rim);
    
    // Rim support brackets
    // Increased length to 0.4 to ensure solid connection between rim (1.575) and backboard (1.22)
    const bracketLen = 0.4;
    const bracketGeo = new THREE.BoxGeometry(0.04, 0.04, bracketLen);
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0xFF6600,
      roughness: 0.4,
      metalness: 0.7
    });
    
    // Two brackets connecting rim to backboard
    // Centered between rim (1.575) and backboard (1.22)
    const bracketZ = (1.575 + 1.22) / 2;
    [-0.15, 0.15].forEach(x => {
      const bracket = new THREE.Mesh(bracketGeo, bracketMat);
      bracket.position.set(x, this.hoopHeight, bracketZ);
      this.group.add(bracket);
    });
  }

  _buildNet() {
    // Realistic net using line segments
    const netGroup = new THREE.Group();
    const rimCenter = new THREE.Vector3(0, this.hoopHeight, 1.575);
    
    const numStrands = 16;
    const netDepth = 0.45;
    const netBottomRadius = this.rimRadius * 0.4;
    
    const netMat = new THREE.LineBasicMaterial({
      color: 0xFFFFFF,
      transparent: true,
      opacity: 0.85,
      linewidth: 1
    });
    
    this._netStrands = [];
    
    // Vertical strands
    for (let i = 0; i < numStrands; i++) {
      const angle = (i / numStrands) * Math.PI * 2;
      const topX = Math.cos(angle) * this.rimRadius;
      const topZ = Math.sin(angle) * this.rimRadius;
      
      const points = [];
      const segments = 8;
      
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        // Net hangs with slight curve
        const radius = this.rimRadius * (1 - t) + netBottomRadius * t;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = -t * netDepth - Math.sin(t * Math.PI) * 0.05;
        
        points.push(new THREE.Vector3(
          rimCenter.x + x,
          rimCenter.y + y,
          rimCenter.z + z
        ));
      }
      
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const strand = new THREE.Line(geo, netMat);
      netGroup.add(strand);
      this._netStrands.push({ geo, points, angle });
    }
    
    // Horizontal rings
    const numRings = 5;
    for (let r = 1; r <= numRings; r++) {
      const t = r / (numRings + 1);
      const ringRadius = this.rimRadius * (1 - t) + netBottomRadius * t;
      const ringY = -t * netDepth;
      
      const ringPoints = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        ringPoints.push(new THREE.Vector3(
          rimCenter.x + Math.cos(angle) * ringRadius,
          rimCenter.y + ringY,
          rimCenter.z + Math.sin(angle) * ringRadius
        ));
      }
      
      const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints);
      const ring = new THREE.Line(ringGeo, netMat);
      netGroup.add(ring);
    }
    
    this.group.add(netGroup);
    this.netGroup = netGroup;
  }

  _buildCollisionData() {
    // Set up collision geometry in world space
    // Hoop center
    const worldPos = new THREE.Vector3();
    this.rim.getWorldPosition(worldPos);
    
    this.collisionData.hoopCenter = {
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z
    };
    
    // Rim collision points (16 points around the rim)
    const numPoints = 16;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      this.collisionData.rimPoints.push({
        x: worldPos.x + Math.cos(angle) * this.rimRadius,
        y: worldPos.y,
        z: worldPos.z + Math.sin(angle) * this.rimRadius
      });
    }
    
    // Backboard AABB
    const boardPos = new THREE.Vector3();
    this.backboard.getWorldPosition(boardPos);
    
    this.collisionData.backboard = {
      min: {
        x: boardPos.x - this.backboardW / 2,
        y: boardPos.y - this.backboardH / 2,
        z: boardPos.z - this.backboardThickness / 2
      },
      max: {
        x: boardPos.x + this.backboardW / 2,
        y: boardPos.y + this.backboardH / 2,
        z: boardPos.z + this.backboardThickness / 2
      }
    };
  }

  /**
   * Animate net when ball scores
   */
  animateNet(duration = 0.8) {
    this._netAnimating = true;
    this._netTime = 0;
    this._netDuration = duration;
  }

  update(dt, time) {
    if (this._netAnimating) {
      this._netTime += dt;
      const t = this._netTime / this._netDuration;
      
      if (t >= 1) {
        this._netAnimating = false;
        this._resetNet();
      } else {
        this._animateNetFrame(t);
      }
    }
    
    // Subtle rim glow pulse
    if (this.rim && this.rim.material) {
      this.rim.material.emissiveIntensity = 0.1 + Math.sin(time * 2) * 0.05;
    }
  }

  _animateNetFrame(t) {
    if (!this._netStrands) return;
    
    const wave = Math.sin(t * Math.PI * 3) * (1 - t) * 0.08;
    
    this._netStrands.forEach((strand, i) => {
      const phaseOffset = (i / this._netStrands.length) * Math.PI * 2;
      const points = strand.points.map((p, j) => {
        const segT = j / (strand.points.length - 1);
        const displacement = wave * Math.sin(segT * Math.PI) * Math.cos(phaseOffset);
        return new THREE.Vector3(
          p.x + Math.cos(strand.angle) * displacement,
          p.y - Math.abs(displacement) * 0.3,
          p.z + Math.sin(strand.angle) * displacement
        );
      });
      
      strand.geo.setFromPoints(points);
    });
  }

  _resetNet() {
    if (!this._netStrands) return;
    this._netStrands.forEach(strand => {
      strand.geo.setFromPoints(strand.points);
    });
  }

  /**
   * Flash rim on collision
   */
  flashRim() {
    if (!this.rim) return;
    this.rim.material.emissiveIntensity = 1.0;
    setTimeout(() => {
      if (this.rim) this.rim.material.emissiveIntensity = 0.1;
    }, 150);
  }

  getHoopWorldPosition() {
    const pos = new THREE.Vector3();
    this.rim.getWorldPosition(pos);
    return pos;
  }

  dispose() {
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
