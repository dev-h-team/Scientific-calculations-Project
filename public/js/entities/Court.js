/**
 * Court - NBA Professional Basketball Court
 * 
 * Builds a highly detailed NBA-regulation basketball court:
 * - Hardwood floor with realistic wood grain texture
 * - All court markings (3-point line, free throw, paint, center)
 * - Bleachers/stands with crowd silhouettes
 * - Arena walls and ceiling with light fixtures
 * - Court logos
 * - Realistic materials (PBR)
 * - Dynamic environment elements
 */

class Court {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    
    // Court dimensions (NBA regulation, scaled - ENLARGED)
    this.length = 56.0;  // Z axis (Doubled)
    this.width = 30.0;   // X axis (Doubled)
    
    this._build();
  }

  _build() {
    try {
      window.gameLogger.info('Building court components...');
      this._buildFloor();
      this._buildCourtLines();
      this._buildWalls();
      this._buildCeiling();
      this._buildStands();
      this._buildScoreboard();
      this._buildEnvironmentDetails();
      this._buildCenterLogo();
      this._buildBaselineMarkers();
      this._buildLightFixtures();
      window.gameLogger.info('Court components built successfully');
    } catch (e) {
      window.gameLogger.error('Failed to build court:', e);
      throw e;
    }
  }

  _buildFloor() {
    // Main court floor - hardwood appearance
    const floorGeo = new THREE.BoxGeometry(this.width, 0.12, this.length);
    const woodTexture = this._createWoodTexture();
    
    const floorMat = new THREE.MeshStandardMaterial({
      map: woodTexture,
      roughness: 0.25,
      metalness: 0.05,
      envMapIntensity: 0.4
    });
    
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.position.y = -0.06;
    this.floor.receiveShadow = true;
    this.group.add(this.floor);
    
    // Subtle floor gloss layer
    const reflGeo = new THREE.PlaneGeometry(this.width, this.length);
    const reflMat = new THREE.MeshStandardMaterial({
      color: 0xCC8844,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.12
    });
    const refl = new THREE.Mesh(reflGeo, reflMat);
    refl.rotation.x = -Math.PI / 2;
    refl.position.y = 0.001;
    this.group.add(refl);
    
    // Out-of-bounds floor extension
    const oobMat = new THREE.MeshStandardMaterial({
      color: 0x2A1A0A,
      roughness: 0.9,
      metalness: 0.0
    });
    
    // Side extensions
    const sideGeo = new THREE.BoxGeometry(4, 0.12, this.length + 8);
    [-this.width / 2 - 2, this.width / 2 + 2].forEach(x => {
      const side = new THREE.Mesh(sideGeo, oobMat);
      side.position.set(x, -0.06, 0);
      side.receiveShadow = true;
      this.group.add(side);
    });
    
    // End extensions
    const endGeo = new THREE.BoxGeometry(this.width + 8, 0.12, 4);
    [-this.length / 2 - 2, this.length / 2 + 2].forEach(z => {
      const end = new THREE.Mesh(endGeo, oobMat);
      end.position.set(0, -0.06, z);
      end.receiveShadow = true;
      this.group.add(end);
    });
  }

  _createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    
    // Base wood color - warm maple
    ctx.fillStyle = '#C8843A';
    ctx.fillRect(0, 0, 1024, 1024);
    
    // Wood plank pattern
    const plankWidth = 1024 / 12;
    for (let i = 0; i < 12; i++) {
      const x = i * plankWidth;
      const shade = 0.9 + Math.random() * 0.2;
      const r = Math.floor(200 * shade);
      const g = Math.floor(130 * shade);
      const b = Math.floor(58 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, plankWidth - 1, 1024);
      
      // Plank gap
      ctx.fillStyle = 'rgba(60, 30, 5, 0.7)';
      ctx.fillRect(x + plankWidth - 1, 0, 1.5, 1024);
    }
    
    // Wood grain lines
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 1024;
      const y1 = Math.random() * 1024;
      const y2 = y1 + 50 + Math.random() * 200;
      const alpha = 0.05 + Math.random() * 0.1;
      
      ctx.strokeStyle = `rgba(80, 40, 5, ${alpha})`;
      ctx.lineWidth = 0.5 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.bezierCurveTo(
        x + (Math.random() - 0.5) * 10, y1 + (y2 - y1) * 0.33,
        x + (Math.random() - 0.5) * 10, y1 + (y2 - y1) * 0.66,
        x + (Math.random() - 0.5) * 5, y2
      );
      ctx.stroke();
    }
    
    // Horizontal grain
    for (let j = 0; j < 400; j++) {
      const y = Math.random() * 1024;
      ctx.strokeStyle = `rgba(${80 + Math.random() * 40}, ${40 + Math.random() * 20}, 5, 0.06)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        256, y + Math.random() * 3 - 1.5,
        768, y + Math.random() * 3 - 1.5,
        1024, y + Math.random() * 2 - 1
      );
      ctx.stroke();
    }
    
    // Varnish highlight
    const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
    gradient.addColorStop(0, 'rgba(255, 220, 150, 0.06)');
    gradient.addColorStop(0.5, 'rgba(255, 200, 100, 0.03)');
    gradient.addColorStop(1, 'rgba(200, 150, 80, 0.05)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1024, 1024);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 6);
    return texture;
  }

  _buildCourtLines() {
    const lineGroup = new THREE.Group();
    lineGroup.position.y = 0.002;
    this.group.add(lineGroup);
    
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const lineThickness = 0.05;
    
    const addLine = (x, z, w, h, mat) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, mat || lineMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0, z);
      lineGroup.add(mesh);
      return mesh;
    };
    
    const addArc = (cx, cz, radius, startAngle, endAngle, color = 0xFFFFFF, segments = 64) => {
      const points = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = startAngle + t * (endAngle - startAngle);
        points.push(new THREE.Vector3(
          cx + Math.cos(angle) * radius,
          0,
          cz + Math.sin(angle) * radius
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
      lineGroup.add(line);
    };
    
    const halfW = this.width / 2;
    const halfL = this.length / 2;
    
    // ---- Outer boundary ----
    addLine(0, -halfL, this.width, lineThickness);
    addLine(0, halfL, this.width, lineThickness);
    addLine(-halfW, 0, lineThickness, this.length);
    addLine(halfW, 0, lineThickness, this.length);
    
    // ---- Center line ----
    addLine(0, 0, this.width, lineThickness);
    
    // ---- Center circle ----
    addArc(0, 0, 1.83, 0, Math.PI * 2);
    
    // ---- Three-point lines (both ends) ----
    this._buildThreePointLine(lineGroup, -halfL + 6.7, 1);
    this._buildThreePointLine(lineGroup, halfL - 6.7, -1);
    
    // ---- Paint areas (both ends) ----
    this._buildPaintArea(lineGroup, -halfL, 1, addLine);
    this._buildPaintArea(lineGroup, halfL, -1, addLine);
    
    // ---- Free throw circles ----
    addArc(-halfL + 5.79, 0, 1.83, 0, Math.PI * 2);
    addArc(halfL - 5.79, 0, 1.83, 0, Math.PI * 2);
    
    // ---- Restricted area arcs ----
    addArc(-halfL + 1.575, 0, 1.22, Math.PI, Math.PI * 2, 0xCC2200);
    addArc(halfL - 1.575, 0, 1.22, 0, Math.PI, 0xCC2200);
    
    // ---- Lane markings ----
    this._buildLaneMarkings(lineGroup, -halfL, 1, addLine);
    this._buildLaneMarkings(lineGroup, halfL, -1, addLine);
  }

  _buildThreePointLine(group, centerZ, dir) {
    const cornerX = 6.7;
    const arcRadius = 7.24;
    const straightLength = 0.9;
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    
    // Straight side lines
    const addStraight = (x) => {
      const geo = new THREE.PlaneGeometry(0.05, straightLength);
      const mesh = new THREE.Mesh(geo, lineMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0, centerZ + dir * straightLength / 2);
      group.add(mesh);
    };
    addStraight(-cornerX);
    addStraight(cornerX);
    
    // Arc
    const points = [];
    const startAngle = dir > 0 ? -Math.PI * 0.72 : Math.PI * 0.28;
    const endAngle = dir > 0 ? -Math.PI * 0.28 : Math.PI * 0.72;
    
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const angle = startAngle + t * (endAngle - startAngle);
      points.push(new THREE.Vector3(
        Math.sin(angle) * arcRadius,
        0,
        centerZ + Math.cos(angle) * arcRadius * dir
      ));
    }
    
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
    group.add(line);
  }

  _buildPaintArea(group, endZ, dir, addLine) {
    const paintW = 4.9;
    const paintD = 5.79;
    
    // Paint fill (colored)
    const paintGeo = new THREE.PlaneGeometry(paintW, paintD);
    const paintMesh = new THREE.Mesh(paintGeo, new THREE.MeshBasicMaterial({
      color: 0x8B2020,
      transparent: true,
      opacity: 0.45
    }));
    paintMesh.rotation.x = -Math.PI / 2;
    paintMesh.position.set(0, 0, endZ + dir * paintD / 2);
    group.add(paintMesh);
    
    // Paint outline
    const halfPW = paintW / 2;
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    
    const addPaintLine = (x, z, w, h) => {
      const geo = new THREE.PlaneGeometry(w, h);
      const mesh = new THREE.Mesh(geo, lineMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0, z);
      group.add(mesh);
    };
    
    addPaintLine(-halfPW, endZ + dir * paintD / 2, 0.05, paintD);
    addPaintLine(halfPW, endZ + dir * paintD / 2, 0.05, paintD);
    addPaintLine(0, endZ + dir * paintD, paintW, 0.05);
  }

  _buildLaneMarkings(group, endZ, dir, addLine) {
    // Hash marks on the lane
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const halfPW = 4.9 / 2;
    const markPositions = [1.0, 1.8, 2.8, 3.6];
    
    markPositions.forEach(d => {
      const z = endZ + dir * d;
      [-halfPW - 0.2, halfPW + 0.2].forEach(x => {
        const geo = new THREE.PlaneGeometry(0.4, 0.05);
        const mesh = new THREE.Mesh(geo, lineMat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, 0, z);
        group.add(mesh);
      });
    });
  }

  _buildWalls() {
    // Arena walls with team colors
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x121225,
      roughness: 0.9,
      metalness: 0.05
    });
    
    const halfW = this.width / 2 + 4;
    const halfL = this.length / 2 + 4;
    const wallH = 9;
    const wallY = wallH / 2;
    
    // Side walls
    const sideGeo = new THREE.BoxGeometry(0.4, wallH, this.length + 8);
    const leftWall = new THREE.Mesh(sideGeo, wallMat);
    leftWall.position.set(-halfW, wallY, 0);
    leftWall.receiveShadow = true;
    this.group.add(leftWall);
    
    const rightWall = new THREE.Mesh(sideGeo, wallMat);
    rightWall.position.set(halfW, wallY, 0);
    rightWall.receiveShadow = true;
    this.group.add(rightWall);
    
    // End walls
    const endGeo = new THREE.BoxGeometry(this.width + 8, wallH, 0.4);
    const frontWall = new THREE.Mesh(endGeo, wallMat);
    frontWall.position.set(0, wallY, -halfL);
    frontWall.receiveShadow = true;
    this.group.add(frontWall);
    
    const backWall = new THREE.Mesh(endGeo, wallMat);
    backWall.position.set(0, wallY, halfL);
    backWall.receiveShadow = true;
    this.group.add(backWall);
    
    // Wall accent strips (orange/team color)
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xFF6600,
      roughness: 0.5,
      metalness: 0.3,
      emissive: 0xFF4400,
      emissiveIntensity: 0.2
    });
    
    const stripGeo = new THREE.BoxGeometry(0.45, 0.3, this.length + 8);
    [-halfW, halfW].forEach(x => {
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(x, 1.5, 0);
      this.group.add(strip);
    });
  }

  _buildCeiling() {
    // Arena ceiling
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x0A0A18,
      roughness: 1.0,
      metalness: 0.0
    });
    
    const ceilGeo = new THREE.BoxGeometry(this.width + 8, 0.5, this.length + 8);
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.position.y = 18;
    this.group.add(ceiling);
    
    // Ceiling grid structure
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      roughness: 0.6,
      metalness: 0.5
    });
    
    // Ceiling beams
    for (let i = -2; i <= 2; i++) {
      const beamGeo = new THREE.BoxGeometry(0.2, 0.3, this.length + 8);
      const beam = new THREE.Mesh(beamGeo, gridMat);
      beam.position.set(i * 3, 17.7, 0);
      this.group.add(beam);
    }
  }

  _buildStands() {
    const halfW = this.width / 2;
    const halfL = this.length / 2;
    
    const rowDepth = 2.0;    // How deep each seating step is
    const rowHeight = 1.0;   // How tall each seating step is
    const numRows = 6;       // Number of rows

    const stepMat = new THREE.MeshStandardMaterial({ 
      color: 0x222235, 
      roughness: 0.8 
    });
    
    // Side stands
    for (let row = 0; row < numRows; row++) {
      const stepH = (row + 1) * rowHeight;
      const stepY = stepH / 2;
      const stepGeo = new THREE.BoxGeometry(rowDepth, stepH, this.length + 8);
      
      const xDistance = halfW + 1.5 + row * rowDepth;
      
      // Left and right side
      [-xDistance, xDistance].forEach(x => {
        const step = new THREE.Mesh(stepGeo, stepMat);
        step.position.set(x, stepY, 0);
        step.receiveShadow = true;
        this.group.add(step);
        // Add crowd on this side step
        this._addCrowdRow(x, stepH, 0, this.length + 6, x > 0 ? -1 : 1, true);
      });
    }

    // End stands
    for (let row = 0; row < numRows - 1; row++) {
      const stepH = (row + 1) * rowHeight;
      const stepY = stepH / 2;
      const stepGeo = new THREE.BoxGeometry(this.width + 2.0, stepH, rowDepth);
      
      const zDistance = halfL + 2.0 + row * rowDepth;
      
      // Near and far ends
      [-zDistance, zDistance].forEach(z => {
        const step = new THREE.Mesh(stepGeo, stepMat);
        step.position.set(0, stepY, z);
        step.receiveShadow = true;
        this.group.add(step);
        // Add crowd on this end step
        this._addCrowdRow(0, stepH, z, this.width, z > 0 ? -1 : 1, false);
      });
    }
  }

  _addCrowdRow(x, y, z, length, facingDir, isSide) {
    const crowdMatColors = [0x445577, 0x773344, 0x336644, 0x666666, 0x887722, 0x225588];
    const spacing = 1.2;
    const count = Math.floor(length / spacing);
    const startOffset = -length / 2 + spacing / 2;

    for (let i = 0; i < count; i++) {
        // Skip some seats for realism
        if (Math.random() > 0.8) continue;
        
        const cMat = new THREE.MeshLambertMaterial({
            color: crowdMatColors[Math.floor(Math.random() * crowdMatColors.length)],
        });

        const offset = startOffset + i * spacing;
        const posX = isSide ? x : x + offset;
        const posZ = isSide ? z + offset : z;
      
        // Body (Seated person)
        const bodyGeo = new THREE.BoxGeometry(0.7, 0.9, 0.7);
        const body = new THREE.Mesh(bodyGeo, cMat);
        body.position.set(posX, y + 0.45, posZ);
        if(!isSide) { body.scale.set(1.2, 1, 0.8); } else { body.scale.set(0.8, 1, 1.2); }
        this.group.add(body);
      
        // Head
        const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
        const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(posX, y + 0.45 + 0.55, posZ);
        this.group.add(head);
    }
  }

  _buildScoreboard() {
    // Main scoreboard hanging from ceiling
    const boardGeo = new THREE.BoxGeometry(4, 1.5, 0.2);
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.5,
      metalness: 0.5
    });
    
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 10, 0);
    this.group.add(board);
    
    // Scoreboard display
    const displayGeo = new THREE.PlaneGeometry(3.8, 1.3);
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = 512;
    displayCanvas.height = 192;
    const ctx = displayCanvas.getContext('2d');
    
    ctx.fillStyle = '#000011';
    ctx.fillRect(0, 0, 512, 192);
    
    ctx.fillStyle = '#FF6600';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('BASKETBALL 3D PRO', 256, 60);
    
    ctx.fillStyle = '#FFDD00';
    ctx.font = 'bold 36px Arial';
    ctx.fillText('HOME  0 — 0  AWAY', 256, 120);
    
    ctx.fillStyle = '#AAAAAA';
    ctx.font = '24px Arial';
    ctx.fillText('Q1  02:00', 256, 165);
    
    const displayTex = new THREE.CanvasTexture(displayCanvas);
    const displayMat = new THREE.MeshBasicMaterial({ map: displayTex });
    const display = new THREE.Mesh(displayGeo, displayMat);
    display.position.set(0, 10, 0.11);
    this.group.add(display);
    
    // Scoreboard support cables
    const cableMat = new THREE.LineBasicMaterial({ color: 0x555566 });
    [[-1.8, 0], [1.8, 0], [0, -1.8], [0, 1.8]].forEach(([x, z]) => {
      const points = [
        new THREE.Vector3(x, 10.75, z),
        new THREE.Vector3(x * 0.5, 12, z * 0.5)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const cable = new THREE.Line(geo, cableMat);
      this.group.add(cable);
    });
  }

  _buildEnvironmentDetails() {
    // Shot clock displays on backboard supports
    const clockMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.5,
      emissive: 0xFF3300,
      emissiveIntensity: 0.3
    });
    
    [-this.length / 2 + 1, this.length / 2 - 1].forEach(z => {
      const clockGeo = new THREE.BoxGeometry(0.6, 0.3, 0.1);
      const clock = new THREE.Mesh(clockGeo, clockMat);
      clock.position.set(0, 5, z);
      this.group.add(clock);
    });
  }

  _buildCenterLogo() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 512, 512);
    
    // Outer ring
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(256, 256, 240, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner ring
    ctx.strokeStyle = 'rgba(255, 102, 0, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(256, 256, 200, 0, Math.PI * 2);
    ctx.stroke();
    
    // Basketball seams
    ctx.strokeStyle = 'rgba(255, 102, 0, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(256, 256, 160, 0, Math.PI * 2);
    ctx.stroke();
    
    // Center fill
    ctx.fillStyle = 'rgba(200, 100, 30, 0.15)';
    ctx.beginPath();
    ctx.arc(256, 256, 240, 0, Math.PI * 2);
    ctx.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    const logoGeo = new THREE.CircleGeometry(1.83, 64);
    const logoMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.85
    });
    
    const logo = new THREE.Mesh(logoGeo, logoMat);
    logo.rotation.x = -Math.PI / 2;
    logo.position.y = 0.003;
    this.group.add(logo);
  }

  _buildBaselineMarkers() {
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xFF6600 });
    
    [-this.length / 2, this.length / 2].forEach(z => {
      const geo = new THREE.PlaneGeometry(this.width, 0.1);
      const mesh = new THREE.Mesh(geo, markerMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.004, z);
      this.group.add(mesh);
    });
  }

  _buildLightFixtures() {
    const fixtureMat = new THREE.MeshStandardMaterial({
      color: 0x888899,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xFFEECC,
      emissiveIntensity: 0.6
    });
    
    const fixturePositions = [
      [-5, 11.5, -4], [5, 11.5, -4],
      [-5, 11.5, 4], [5, 11.5, 4],
      [-10, 10.5, 0], [10, 10.5, 0],
      [0, 11.5, -7], [0, 11.5, 7]
    ];
    
    fixturePositions.forEach(([x, y, z]) => {
      // Fixture housing
      const geo = new THREE.CylinderGeometry(0.35, 0.55, 0.5, 8);
      const fixture = new THREE.Mesh(geo, fixtureMat);
      fixture.position.set(x, y, z);
      this.group.add(fixture);
      
      // Light bulb glow
      const glowGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xFFEECC,
        transparent: true,
        opacity: 0.9
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(x, y - 0.3, z);
      this.group.add(glow);
    });
  }

  update(time) {
    // Subtle floor shine animation could go here
  }

  dispose() {
    this.group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
  }
}
