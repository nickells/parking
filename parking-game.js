class ParkingGame {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    // Canvas center reference for layout
    this.centerX = this.canvas.width / 2;
    this.centerY = this.canvas.height / 2;

    // Car properties
    this.car = {
      x: 100,
      y: 300,
      width: 90,
      height: 45,
      angle: 0,
      speed: 0,
      maxSpeed: 360, // pixels per second
      acceleration: 100, // pixels per second^2
      friction: 300, // pixels per second^2
      steerAngle: 0,
      maxSteerAngle: Math.PI / 6,
      wheelbase: 70,
      steerChangeRate: 0.8, // radians per second
      // Shrink collision box to account for rounded sprite corners
      collisionInsetX: 8,
      collisionInsetY: 6,
      collided: false,
      lastDirection: 1, // 1 for forward, -1 for reverse
    };

    // Controls
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
    };

    // Parking spaces and obstacles
    this.parkedCars = [
      {
        x: this.centerX - 120,
        y: this.centerY,
        width: 90,
        height: 45,
        angle: 0,
        collisionInsetX: 8,
        collisionInsetY: 6,
      },
      {
        x: this.centerX + 120,
        y: this.centerY,
        width: 90,
        height: 45,
        angle: 0,
        collisionInsetX: 8,
        collisionInsetY: 6,
      },
    ];

    this.parkingSpace = {
      x: this.centerX,
      y: this.centerY,
      width: 150,
      height: 60,
    };

    // Layout and game state
    this.gapBetweenCars = 200; // default gap
    this.minGap = 60;
    this.gapStep = 20;
    this.winCount = 0;
    this.winLatched = false;
    this.curbWidth = this.canvas.width;
    this.curbHeight = 30;
    this.curbOffsetY = 160; // distance below parking space center
    this.laneGapFromCurb = 10; // vertical gap above curb for parked cars/space

    // Drag state for resetting the player car by dragging
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;

    // Win/reset timing state
    this.winResetDelayMs = 1200;
    this.winResetAtMs = null;

    // Collision flash state
    this.collisionFlashDurationMs = 120;
    this.collisionFlashUntilMs = 0;

    // Bounce-back after collision
    this.collisionBounceSpeed = 220; // px/s initial impulse
    this.collisionBounceDurationMs = 140; // duration of impulse
    this.collisionBounceUntilMs = 0; // timestamp when impulse ends
    this.collisionBounceDir = { x: 0, y: 0 }; // unit vector away from collision
    this.collisionMTV = null; // minimal translation vector from last collision

    // Debug
    this.debug = false;
    this.lastCollision = null;

    // Turning arc draws from front center near the arrow
    // Guide fade radius (controls visible extent of turning guides)
    this.turningGuideFadeRadius = 220;
    // Visual steering wheel: real wheel rotates more than tire angle; multiplier maps tire steer to wheel rotation
    this.steeringWheelRatio = 15; // ~30° tire angle → ~450° wheel rotation

    // Set initial player car position, speed, and steer
    this.setInitialCarPosition();

    // Initialize UI and layout
    this.initUI();
    this.recomputeParkingLayout();

    // Textures
    this.textures = {
      asphalt: null, // pattern
      tiles: null, // legacy; not used after switching to exact-height sidewalk
      sidewalkImg: null, // raw image for curb tiling
      grass: null, // pattern for grass area
      blueCar: null, // image for player
      orangeCar: null, // image for parked cars
      wheel: null, // image for steering HUD
    };
    this.loadTextures();

    // Sprite orientation offset (source cars face down; game faces right)
    this.spriteAngleOffset = -Math.PI / 2;

    this.setupEventListeners();
    this.lastFrameAtMs = null;
    this.gameLoop();
  }

  initUI() {
    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.top = "10px";
    panel.style.left = "10px";
    panel.style.zIndex = "1000";
    panel.style.background = "rgba(255,255,255,0.9)";
    panel.style.border = "1px solid #ddd";
    panel.style.borderRadius = "8px";
    panel.style.padding = "8px 12px";
    panel.style.font = "14px Arial, sans-serif";
    panel.style.color = "#222";

    const label = document.createElement("label");
    label.textContent = `Gap: ${Math.round(this.gapBetweenCars)} px`;
    label.style.display = "block";
    label.style.marginBottom = "6px";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "60";
    slider.max = "360";
    slider.step = "10";
    slider.value = String(Math.round(this.gapBetweenCars));
    slider.style.width = "220px";
    slider.addEventListener("input", () => {
      this.gapBetweenCars = Number(slider.value);
      label.textContent = `Gap: ${Math.round(this.gapBetweenCars)} px`;
      this.recomputeParkingLayout();
    });

    panel.appendChild(label);
    panel.appendChild(slider);
    document.body.appendChild(panel);

    // Keep refs for programmatic updates
    this.gapLabel = label;
    this.gapSlider = slider;
  }

  recomputeParkingLayout() {
    // Keep parking area centered horizontally and placed just above curb
    const curbTop = this.centerY + this.curbOffsetY;
    const laneY = curbTop - this.laneGapFromCurb - this.parkingSpace.height / 2;
    this.parkingSpace.x = this.centerX;
    this.parkingSpace.y = laneY;
    const centerX = this.parkingSpace.x;
    const carWidth = this.parkedCars[0].width;
    const offset = (this.gapBetweenCars + carWidth) / 2;
    this.parkedCars[0].x = centerX - offset;
    this.parkedCars[1].x = centerX + offset;
    // Align NPC cars along the same lane as the parking space
    const npcCenterY = laneY; // car rectangles are centered at y
    this.parkedCars[0].y = npcCenterY;
    this.parkedCars[1].y = npcCenterY;
    // Make the parking box span the inner gap
    this.parkingSpace.width = this.gapBetweenCars;

    // Update UI display if present
    if (this.gapLabel)
      this.gapLabel.textContent = `Gap: ${Math.round(this.gapBetweenCars)} px`;
    if (this.gapSlider)
      this.gapSlider.value = String(Math.round(this.gapBetweenCars));
  }

  loadTextures() {
    // Helper to load an image and optionally convert to a pattern
    const loadImg = (src, onload) => {
      const img = new Image();
      img.src = src;
      img.onload = () => onload && onload(img);
      img.onerror = () => {};
      return img;
    };

    // Use root .webp assets the project provides
    const asphaltImg = loadImg("road.webp", (img) => {
      this.textures.asphalt = this.ctx.createPattern(img, "repeat");
    });
    this.textures.sidewalkImg = loadImg("sidewalk.webp");
    const grassImg = loadImg("grass.webp", (img) => {
      this.textures.grass = this.ctx.createPattern(img, "repeat");
    });

    this.textures.blueCar = loadImg("blue-car.webp");
    this.textures.orangeCar = loadImg("orange-car.webp");
    this.textures.wheel = loadImg("wheel.webp");
  }

  setInitialCarPosition() {
    const curbTop = this.centerY + this.curbOffsetY;
    const laneYInit = curbTop - this.laneGapFromCurb - this.car.height - 50;
    this.car.x =
      this.centerX - (this.gapBetweenCars / 2 + this.car.width) - 100;
    this.car.y = laneYInit;
    this.car.speed = 0;
    this.car.steerAngle = 0;
    this.car.lastDirection = 1;
    this.car.angle = 0;
  }

  setupEventListeners() {
    document.addEventListener("keydown", (e) => {
      switch (e.code) {
        case "ArrowUp":
          this.keys.up = true;
          e.preventDefault();
          break;
        case "ArrowDown":
          this.keys.down = true;
          e.preventDefault();
          break;
        case "ArrowLeft":
          this.keys.left = true;
          e.preventDefault();
          break;
        case "ArrowRight":
          this.keys.right = true;
          e.preventDefault();
          break;
        case "KeyD":
          this.debug = !this.debug;
          break;
      }
    });

    document.addEventListener("keyup", (e) => {
      switch (e.code) {
        case "ArrowUp":
          this.keys.up = false;
          break;
        case "ArrowDown":
          this.keys.down = false;
          break;
        case "ArrowLeft":
          this.keys.left = false;
          break;
        case "ArrowRight":
          this.keys.right = false;
          break;
      }
    });

    // Mouse drag handlers on canvas for repositioning the player car
    this.canvas.addEventListener("mousedown", (e) => {
      const { x, y } = this.getMousePos(e);
      if (this.isPointerOnCar(x, y)) {
        this.isDragging = true;
        this.dragOffsetX = this.car.x - x;
        this.dragOffsetY = this.car.y - y;
        this.car.speed = 0;
      }
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      const { x, y } = this.getMousePos(e);
      this.car.x = x + this.dragOffsetX;
      this.car.y = y + this.dragOffsetY;
      // Clamp within bounds while dragging
      this.car.x = Math.max(45, Math.min(this.canvas.width - 45, this.car.x));
      this.car.y = Math.max(45, Math.min(this.canvas.height - 45, this.car.y));
      this.car.collided = false;
    });

    const endDrag = () => {
      this.isDragging = false;
    };
    this.canvas.addEventListener("mouseup", endDrag);
    this.canvas.addEventListener("mouseleave", endDrag);
  }

  updateCar(dtSeconds) {
    // If we're in the win linger state, freeze car and wait for reset
    if (this.winResetAtMs !== null) {
      // Stop movement during the linger
      this.car.speed = 0;
      return;
    }
    // While dragging, pause physics and collision checks
    if (this.isDragging) {
      this.car.speed = 0;
      // Keep within bounds in case it changed outside of mousemove
      this.car.x = Math.max(45, Math.min(this.canvas.width - 45, this.car.x));
      this.car.y = Math.max(45, Math.min(this.canvas.height - 45, this.car.y));
      this.car.collided = false;
      return;
    }
    // Handle acceleration
    if (this.keys.up) {
      this.car.lastDirection = 1;
      this.car.speed = Math.min(
        this.car.speed + this.car.acceleration * dtSeconds,
        this.car.maxSpeed
      );
    } else if (this.keys.down) {
      this.car.lastDirection = -1;
      this.car.speed = Math.max(
        this.car.speed - this.car.acceleration * dtSeconds,
        -this.car.maxSpeed
      );
    } else {
      // Apply friction
      if (this.car.speed > 0) {
        this.car.speed = Math.max(
          0,
          this.car.speed - this.car.friction * dtSeconds
        );
      } else if (this.car.speed < 0) {
        this.car.speed = Math.min(
          0,
          this.car.speed + this.car.friction * dtSeconds
        );
      }
    }

    // Handle steering (allow some steering when stationary)
    if (this.keys.left) {
      this.car.steerAngle = Math.max(
        this.car.steerAngle - this.car.steerChangeRate * dtSeconds,
        -this.car.maxSteerAngle
      );
    } else if (this.keys.right) {
      this.car.steerAngle = Math.min(
        this.car.steerAngle + this.car.steerChangeRate * dtSeconds,
        this.car.maxSteerAngle
      );
    } else {
      // Keep current steer angle when not steering
    }

    // Calculate turning radius and update car angle (only when moving)
    if (
      Math.abs(this.car.speed) > 0.05 &&
      Math.abs(this.car.steerAngle) > 0.01
    ) {
      const turnRadius =
        this.car.wheelbase / Math.tan(Math.abs(this.car.steerAngle));
      const angularVelocity = this.car.speed / turnRadius; // radians per second

      if (this.car.steerAngle > 0) {
        this.car.angle += angularVelocity * dtSeconds;
      } else {
        this.car.angle -= angularVelocity * dtSeconds;
      }
    }

    // Store previous position for collision rollback
    const prevX = this.car.x;
    const prevY = this.car.y;

    // Update position
    this.car.x += Math.cos(this.car.angle) * this.car.speed * dtSeconds;
    this.car.y += Math.sin(this.car.angle) * this.car.speed * dtSeconds;

    // Check collisions
    if (this.checkCollisions()) {
      // Rollback position if collision detected
      this.car.x = prevX;
      this.car.y = prevY;
      this.car.speed = 0;
      this.car.collided = true;
      this.collisionFlashUntilMs = Date.now() + this.collisionFlashDurationMs;
      // Setup bounce impulse
      const now = Date.now();
      const mtv = this.collisionMTV;
      if (mtv) {
        const len = Math.hypot(mtv.x, mtv.y) || 1;
        // Push away from the collision (opposite the MTV direction)
        this.collisionBounceDir = { x: -mtv.x / len, y: -mtv.y / len };
      } else {
        this.collisionBounceDir = {
          x: -Math.cos(this.car.angle),
          y: -Math.sin(this.car.angle),
        };
      }
      this.collisionBounceUntilMs = now + this.collisionBounceDurationMs;
    } else {
      this.car.collided = false;
    }

    // Horizontal wrap and vertical clamp
    const halfW = this.car.width / 2;
    if (this.car.x < -halfW) {
      this.car.x = this.canvas.width + halfW;
    } else if (this.car.x > this.canvas.width + halfW) {
      this.car.x = -halfW;
    }
    this.car.y = Math.max(45, Math.min(this.canvas.height - 45, this.car.y));

    // Apply bounce-back impulse if active (ease-out)
    const now = Date.now();
    if (now < this.collisionBounceUntilMs) {
      const remaining = this.collisionBounceUntilMs - now;
      const t = Math.max(
        0,
        Math.min(1, remaining / this.collisionBounceDurationMs)
      );
      const scale = t * t; // quadratic ease-out
      const v = this.collisionBounceSpeed * scale * dtSeconds;
      this.car.x += this.collisionBounceDir.x * v;
      this.car.y += this.collisionBounceDir.y * v;
      // Keep within bounds after impulse
      const halfW2 = this.car.width / 2;
      if (this.car.x < -halfW2) this.car.x = this.canvas.width + halfW2;
      if (this.car.x > this.canvas.width + halfW2) this.car.x = -halfW2;
      this.car.y = Math.max(45, Math.min(this.canvas.height - 45, this.car.y));
    }
  }

  getMousePos(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  isPointerOnCar(px, py) {
    const poly = this.getChamferedRectPolygon(
      this.car.x,
      this.car.y,
      this.car.width,
      this.car.height,
      this.car.angle,
      this.car.collisionInsetX || 0,
      this.car.collisionInsetY || 0
    );
    return this.pointInPolygon(px, py, poly);
  }

  getTurningRadius() {
    if (Math.abs(this.car.steerAngle) < 0.01) return null;
    return this.car.wheelbase / Math.tan(Math.abs(this.car.steerAngle));
  }

  checkCollisions() {
    // Check collision with parked cars using polygons
    const playerPoly = this.getChamferedRectPolygon(
      this.car.x,
      this.car.y,
      this.car.width,
      this.car.height,
      this.car.angle,
      this.car.collisionInsetX || 0,
      this.car.collisionInsetY || 0
    );
    for (let parkedCar of this.parkedCars) {
      const npcPoly = this.getChamferedRectPolygon(
        parkedCar.x,
        parkedCar.y,
        parkedCar.width,
        parkedCar.height,
        parkedCar.angle,
        parkedCar.collisionInsetX || 0,
        parkedCar.collisionInsetY || 0
      );
      const result = this.polygonCollisionMTV(playerPoly, npcPoly);
      if (result.collides) {
        this.lastCollision = { type: "car", with: parkedCar };
        this.collisionMTV = result.mtv;
        return true;
      }
    }

    // Check collision with centered curb rectangle
    const curb = {
      x: this.centerX,
      y: this.centerY + this.curbOffsetY + this.curbHeight / 2,
      width: this.curbWidth,
      height: this.curbHeight,
      angle: 0,
    };
    const curbPoly = this.getRectangleCorners(
      curb.x,
      curb.y,
      curb.width,
      curb.height,
      curb.angle
    );
    {
      const result = this.polygonCollisionMTV(playerPoly, curbPoly);
      if (result.collides) {
        this.lastCollision = { type: "curb", with: curb };
        this.collisionMTV = result.mtv;
        return true;
      }
    }

    return false;
  }

  rectangleCollision(x1, y1, w1, h1, a1, x2, y2, w2, h2, a2) {
    // Oriented rectangle collision using Separating Axis Theorem (SAT)
    const rect1 = this.getRectangleCorners(x1, y1, w1, h1, a1);
    const rect2 = this.getRectangleCorners(x2, y2, w2, h2, a2);

    const axes = [...this.getAxes(rect1), ...this.getAxes(rect2)];

    for (const axis of axes) {
      const [min1, max1] = this.projectPointsOnAxis(rect1, axis);
      const [min2, max2] = this.projectPointsOnAxis(rect2, axis);
      if (max1 < min2 || max2 < min1) {
        return false;
      }
    }
    return true;
  }

  getRectangleCorners(cx, cy, width, height, angle) {
    const halfW = width / 2;
    const halfH = height / 2;

    const local = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return local.map((p) => ({
      x: cx + p.x * cos - p.y * sin,
      y: cy + p.x * sin + p.y * cos,
    }));
  }

  getAxes(points) {
    const axes = [];
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const edgeX = p2.x - p1.x;
      const edgeY = p2.y - p1.y;
      // Perpendicular vector
      let axisX = -edgeY;
      let axisY = edgeX;
      const length = Math.hypot(axisX, axisY) || 1;
      axisX /= length;
      axisY /= length;
      axes.push({ x: axisX, y: axisY });
    }
    return axes;
  }

  projectPointsOnAxis(points, axis) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      const projection = p.x * axis.x + p.y * axis.y;
      if (projection < min) min = projection;
      if (projection > max) max = projection;
    }
    return [min, max];
  }

  // Octagonal polygon approximating a rounded-rectangle footprint
  getChamferedRectPolygon(
    cx,
    cy,
    width,
    height,
    angle,
    insetX = 0,
    insetY = 0
  ) {
    const halfW = width / 2;
    const halfH = height / 2;
    const ix = Math.min(Math.max(insetX, 0), Math.max(0, halfW - 1));
    const iy = Math.min(Math.max(insetY, 0), Math.max(0, halfH - 1));
    const local = [
      { x: -halfW + ix, y: -halfH },
      { x: halfW - ix, y: -halfH },
      { x: halfW, y: -halfH + iy },
      { x: halfW, y: halfH - iy },
      { x: halfW - ix, y: halfH },
      { x: -halfW + ix, y: halfH },
      { x: -halfW, y: halfH - iy },
      { x: -halfW, y: -halfH + iy },
    ];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return local.map((p) => ({
      x: cx + p.x * cos - p.y * sin,
      y: cy + p.x * sin + p.y * cos,
    }));
  }

  polygonCollision(pointsA, pointsB) {
    const axes = [...this.getAxes(pointsA), ...this.getAxes(pointsB)];
    for (const axis of axes) {
      const [minA, maxA] = this.projectPointsOnAxis(pointsA, axis);
      const [minB, maxB] = this.projectPointsOnAxis(pointsB, axis);
      if (maxA < minB || maxB < minA) return false;
    }
    return true;
  }

  // Compute Minimal Translation Vector (MTV) using SAT to know push-out direction/amount
  polygonCollisionMTV(pointsA, pointsB) {
    let smallestOverlap = Infinity;
    let separatingAxis = null;
    const axes = [...this.getAxes(pointsA), ...this.getAxes(pointsB)];
    const centerA = this.getPolygonCenter(pointsA);
    const centerB = this.getPolygonCenter(pointsB);
    for (const axis of axes) {
      const [minA, maxA] = this.projectPointsOnAxis(pointsA, axis);
      const [minB, maxB] = this.projectPointsOnAxis(pointsB, axis);
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return { collides: false };
      if (overlap < smallestOverlap) {
        smallestOverlap = overlap;
        // Make axis point from A to B so MTV pushes A out of B
        const delta = { x: centerB.x - centerA.x, y: centerB.y - centerA.y };
        const sign = delta.x * axis.x + delta.y * axis.y < 0 ? -1 : 1;
        separatingAxis = { x: axis.x * sign, y: axis.y * sign };
      }
    }
    return {
      collides: true,
      mtv: separatingAxis
        ? {
            x: separatingAxis.x * smallestOverlap,
            y: separatingAxis.y * smallestOverlap,
          }
        : { x: 0, y: 0 },
    };
  }

  getPolygonCenter(points) {
    let sx = 0;
    let sy = 0;
    for (const p of points) {
      sx += p.x;
      sy += p.y;
    }
    const inv = 1 / Math.max(points.length, 1);
    return { x: sx * inv, y: sy * inv };
  }

  pointInPolygon(px, py, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x,
        yi = points[i].y;
      const xj = points[j].x,
        yj = points[j].y;
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  drawCar(x, y, angle, color = "#4a90e2", showWheels = true) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);

    // Car body
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      -this.car.width / 2,
      -this.car.height / 2,
      this.car.width,
      this.car.height
    );

    // Car outline
    this.ctx.strokeStyle = "#333";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      -this.car.width / 2,
      -this.car.height / 2,
      this.car.width,
      this.car.height
    );

    if (showWheels) {
      // Front wheels (steered)
      this.ctx.save();
      this.ctx.translate(this.car.width / 2 - 12, -15);
      this.ctx.rotate(this.car.steerAngle);
      this.ctx.fillStyle = "#222";
      this.ctx.fillRect(-9, -4, 18, 8);
      this.ctx.restore();

      this.ctx.save();
      this.ctx.translate(this.car.width / 2 - 12, 15);
      this.ctx.rotate(this.car.steerAngle);
      this.ctx.fillStyle = "#222";
      this.ctx.fillRect(-9, -4, 18, 8);
      this.ctx.restore();

      // Rear wheels (fixed)
      this.ctx.fillStyle = "#222";
      this.ctx.fillRect(-this.car.width / 2 + 3, -15 - 4, 18, 8);
      this.ctx.fillRect(-this.car.width / 2 + 3, 15 - 4, 18, 8);
    }

    // Direction indicator
    this.ctx.fillStyle = "#fff";
    this.ctx.beginPath();
    this.ctx.moveTo(this.car.width / 2 - 8, 0);
    this.ctx.lineTo(this.car.width / 2 - 20, -8);
    this.ctx.lineTo(this.car.width / 2 - 20, 8);
    this.ctx.fill();

    this.ctx.restore();
  }

  drawTurningArc() {
    const radius = this.getTurningRadius();
    if (!radius || Math.abs(this.car.steerAngle) < 0.01) {
      const halfW = this.car.width / 2;
      const anchorOffset = halfW - 8;
      const anchorX = this.car.x + Math.cos(this.car.angle) * anchorOffset;
      const anchorY = this.car.y + Math.sin(this.car.angle) * anchorOffset;

      const straightHalfLen = this.turningGuideFadeRadius; // half-length in px on each side

      // Fade based on distance from the anchor point (near car is opaque)
      const fadeR = this.turningGuideFadeRadius;
      const grad = this.ctx.createRadialGradient(
        this.car.x,
        this.car.y,
        0,
        this.car.x,
        this.car.y,
        fadeR
      );
      grad.addColorStop(0.0, "rgba(74, 222, 128, 1.0)");
      grad.addColorStop(0.6, "rgba(74, 222, 128, 0.25)");
      grad.addColorStop(1.0, "rgba(74, 222, 128, 0.0)");

      this.ctx.strokeStyle = grad;
      this.ctx.lineWidth = this.car.width / 2.4;
      this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath();
      const dx = Math.cos(this.car.angle) * straightHalfLen;
      const dy = Math.sin(this.car.angle) * straightHalfLen;
      this.ctx.moveTo(anchorX - dx, anchorY - dy);
      this.ctx.lineTo(anchorX + dx, anchorY + dy);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      return;
    }

    // Anchor near the arrow at the front center of the car
    const halfW = this.car.width / 2;
    const anchorOffset = halfW - 8; // small inset from the bumper where arrow tip sits
    const anchorX = this.car.x + Math.cos(this.car.angle) * anchorOffset;
    const anchorY = this.car.y + Math.sin(this.car.angle) * anchorOffset;

    // Calculate turning circle for the ANCHOR point, not the rear axle.
    // Bicycle model: R_rear = wheelbase / tan(delta). Any point s meters ahead of rear axle
    // travels a circle of radius R_point = sqrt(R_rear^2 + s^2).
    const sFromRearToCenter = this.car.wheelbase / 2;
    const sFromCenterToAnchor = anchorOffset;
    const sFromRearToAnchor = sFromRearToCenter + sFromCenterToAnchor;
    const anchorRadius = Math.hypot(radius, sFromRearToAnchor);

    // Arc center using perpendicular from the anchor by the anchor's radius
    const perpAngle =
      this.car.angle + (this.car.steerAngle > 0 ? Math.PI / 2 : -Math.PI / 2);
    const centerX = anchorX + Math.cos(perpAngle) * anchorRadius;
    const centerY = anchorY + Math.sin(perpAngle) * anchorRadius;

    // Draw a full circle, but fade so only the segment near the car is visible

    // Radial gradient centered at the car's front; farther pixels fade out
    const fadeR = this.turningGuideFadeRadius; // fade radius in px around the car center
    const grad = this.ctx.createRadialGradient(
      this.car.x,
      this.car.y,
      0,
      this.car.x,
      this.car.y,
      fadeR
    );
    grad.addColorStop(0.0, "rgba(74, 222, 128, 1.0)");
    grad.addColorStop(0.6, "rgba(74, 222, 128, 0.25)");
    grad.addColorStop(1.0, "rgba(74, 222, 128, 0.0)");

    this.ctx.strokeStyle = grad;
    this.ctx.lineWidth = this.car.width / 2.4;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, anchorRadius, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  drawParkingArea() {
    // Parking space outline
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 5]);
    this.ctx.strokeStyle = "#ffd700";
    this.ctx.strokeRect(
      this.parkingSpace.x - this.parkingSpace.width / 2,
      this.parkingSpace.y - this.parkingSpace.height / 2,
      this.parkingSpace.width,
      this.parkingSpace.height
    );
    this.ctx.setLineDash([]);

    // Parked cars (textured sprites if available)
    this.parkedCars.forEach((car) => {
      if (this.textures.orangeCar && this.textures.orangeCar.complete) {
        this.drawCarSprite(car.x, car.y, car.angle, this.textures.orangeCar);
      } else {
        this.drawCar(car.x, car.y, car.angle, "#888", false);
      }
    });

    // Bottom curb (below center)
    const curbLeft = this.centerX - this.curbWidth / 2;
    const bottomCurbTop = this.centerY + this.curbOffsetY;
    this.drawSidewalkStrip(
      curbLeft,
      bottomCurbTop,
      this.curbWidth,
      this.curbHeight
    );

    // Top curb (above center)
    const topCurbTop = this.centerY - this.curbOffsetY - this.curbHeight;
    this.drawSidewalkStrip(
      curbLeft,
      topCurbTop,
      this.curbWidth,
      this.curbHeight
    );
  }

  drawSidewalkStrip(left, top, width, height) {
    if (this.textures.sidewalkImg && this.textures.sidewalkImg.complete) {
      const img = this.textures.sidewalkImg;
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      const destH = height;
      const scale = destH / srcH;
      const destWPerTile = srcW * scale;
      let x = left;
      while (x < left + width) {
        const remaining = left + width - x;
        const tileW = Math.min(destWPerTile, remaining);
        const srcClipW = (tileW / destWPerTile) * srcW;
        this.ctx.drawImage(img, 0, 0, srcClipW, srcH, x, top, tileW, destH);
        x += tileW;
      }
    } else {
      this.ctx.fillStyle = "#666";
      this.ctx.fillRect(left, top, width, height);
    }
  }

  drawCarSprite(x, y, angle, image) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle + this.spriteAngleOffset);
    // Preserve aspect ratio of the sprite; many car sprites are portrait
    const srcW = image.naturalWidth || image.width || 1;
    const srcH = image.naturalHeight || image.height || 1;
    let targetW = this.car.width;
    let targetH = this.car.height;
    if (srcH > srcW) {
      const tmp = targetW;
      targetW = targetH;
      targetH = tmp;
    }
    this.ctx.drawImage(image, -targetW / 2, -targetH / 2, targetW, targetH);
    this.ctx.restore();
  }

  drawWheels(x, y, angle) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);
    // Front wheels (steered)
    this.ctx.save();
    this.ctx.translate(this.car.width / 2 - 12, -15);
    this.ctx.rotate(this.car.steerAngle);
    this.ctx.fillStyle = "#222";
    this.ctx.fillRect(-9, -4, 18, 8);
    this.ctx.restore();

    this.ctx.save();
    this.ctx.translate(this.car.width / 2 - 12, 15);
    this.ctx.rotate(this.car.steerAngle);
    this.ctx.fillStyle = "#222";
    this.ctx.fillRect(-9, -4, 18, 8);
    this.ctx.restore();

    // Rear wheels (fixed)
    this.ctx.fillStyle = "#222";
    this.ctx.fillRect(-this.car.width / 2 + 3, -15 - 4, 18, 8);
    this.ctx.fillRect(-this.car.width / 2 + 3, 15 - 4, 18, 8);
    this.ctx.restore();
  }

  drawSteeringHUD() {
    const margin = 4;
    const hudWidth = 70;
    const hudHeight = 20;
    const imgSize = 128;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height - margin - imgSize / 2;

    // Rotating wheel (texture if available, else rectangle fallback)
    const wheelAngle = this.car.steerAngle * (this.steeringWheelRatio || 1);
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(wheelAngle);
    const wheelImg = this.textures.wheel;
    if (wheelImg && wheelImg.complete) {
      this.ctx.drawImage(
        wheelImg,
        -imgSize / 2,
        -imgSize / 2,
        imgSize,
        imgSize
      );
    } else {
      this.ctx.fillStyle = "#303030";
      this.ctx.strokeStyle = "#aaa";
      this.ctx.lineWidth = 2;
      this.ctx.fillRect(-hudWidth / 2, -hudHeight / 2, hudWidth, hudHeight);
      this.ctx.strokeRect(-hudWidth / 2, -hudHeight / 2, hudWidth, hudHeight);
      // Center marker line
      this.ctx.strokeStyle = "#4ade80";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(-hudWidth / 2 + 6, 0);
      this.ctx.lineTo(hudWidth / 2 - 6, 0);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  checkParking() {
    const inSpace =
      this.car.x > this.parkingSpace.x - this.parkingSpace.width / 2 &&
      this.car.x < this.parkingSpace.x + this.parkingSpace.width / 2 &&
      this.car.y > this.parkingSpace.y - this.parkingSpace.height / 2 &&
      this.car.y < this.parkingSpace.y + this.parkingSpace.height / 2;

    const wellAligned =
      Math.abs(this.car.angle % (Math.PI * 2)) < 0.2 ||
      Math.abs((this.car.angle % (Math.PI * 2)) - Math.PI * 2) < 0.2;

    if (inSpace && wellAligned && Math.abs(this.car.speed) < 0.1) {
      this.ctx.fillStyle = "rgba(76, 222, 128, 0.3)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      this.ctx.fillStyle = "#4ade80";
      this.ctx.font = "24px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText("Perfect Parking!", this.canvas.width / 2, 50);

      // Start win delay timer once per successful park
      if (!this.winLatched) {
        this.winLatched = true;
        this.winResetAtMs = Date.now() + this.winResetDelayMs;
      }
    } else {
      // Reset latch when not in a winning state
      if (this.winResetAtMs === null) {
        this.winLatched = false;
      }
    }

    // Handle win delay timer
    if (this.winResetAtMs !== null && Date.now() >= this.winResetAtMs) {
      // Time to progress to next level
      this.winCount += 1;
      this.gapBetweenCars = Math.max(
        this.minGap,
        this.gapBetweenCars - this.gapStep
      );
      this.recomputeParkingLayout();

      // Reset player to start position and clear motion/steer
      this.setInitialCarPosition();

      // Clear win state
      this.winResetAtMs = null;
      this.winLatched = false;
    }
  }

  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Background with textures
    this.drawBackground();

    // Draw parking area
    this.drawParkingArea();

    // Draw turning arc
    this.drawTurningArc();

    // Draw player car (sprite if available, fallback to vector), then wheels on top
    if (this.textures.blueCar && this.textures.blueCar.complete) {
      this.drawCarSprite(
        this.car.x,
        this.car.y,
        this.car.angle,
        this.textures.blueCar
      );
      this.drawWheels(this.car.x, this.car.y, this.car.angle);
    } else {
      this.drawCar(this.car.x, this.car.y, this.car.angle);
    }

    // Check parking success
    this.checkParking();

    // If in win linger, show a subtle overlay countdown effect
    if (this.winResetAtMs !== null) {
      this.ctx.fillStyle = "rgba(76, 222, 128, 0.25)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    this.ctx.font = "16px Arial";
    // Level counter (based on winCount; starts at 1)
    this.ctx.fillStyle = "#fff";
    this.ctx.textAlign = "center";
    this.ctx.fillText(`Level: ${this.winCount + 1}`, this.canvas.width / 2, 24);

    // Removed explicit COLLISION text; color cues and flash overlay remain

    // Collision flash overlay
    if (Date.now() < this.collisionFlashUntilMs) {
      this.ctx.fillStyle = "rgba(255, 68, 68, 0.25)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Debug overlays
    if (this.debug) {
      // Draw player car collision polygon
      const carPoly = this.getChamferedRectPolygon(
        this.car.x,
        this.car.y,
        this.car.width,
        this.car.height,
        this.car.angle,
        this.car.collisionInsetX || 0,
        this.car.collisionInsetY || 0
      );
      this.drawPoly(carPoly, "#00e5ff");

      // Draw parked car collision polygons
      for (const pc of this.parkedCars) {
        const pcPoly = this.getChamferedRectPolygon(
          pc.x,
          pc.y,
          pc.width,
          pc.height,
          pc.angle,
          pc.collisionInsetX || 0,
          pc.collisionInsetY || 0
        );
        this.drawPoly(pcPoly, "#ffcc00");
      }

      // Draw curb rectangle
      const curbRect = {
        x: this.centerX,
        y: this.centerY + this.curbOffsetY + this.curbHeight / 2,
        width: this.curbWidth,
        height: this.curbHeight,
        angle: 0,
      };
      const curbPts = this.getRectangleCorners(
        curbRect.x,
        curbRect.y,
        curbRect.width,
        curbRect.height,
        curbRect.angle
      );
      this.drawPoly(curbPts, "#ff8888");

      // Label last collision
      this.ctx.fillStyle = "#fff";
      this.ctx.font = "12px Arial";
      this.ctx.fillText(
        `Debug: ${this.lastCollision ? this.lastCollision.type : "none"}`,
        10,
        90
      );
    }

    // Steering HUD (always on)
    this.drawSteeringHUD();
  }

  drawBackground() {
    // Road (asphalt) as base layer
    if (this.textures.asphalt) {
      this.ctx.fillStyle = this.textures.asphalt;
    } else {
      this.ctx.fillStyle = "#555";
    }
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Grass strips above top curb and below bottom curb
    const bottomCurbTop = this.centerY + this.curbOffsetY;
    const topCurbTop = this.centerY - this.curbOffsetY - this.curbHeight;
    const grassFill = this.textures.grass ? this.textures.grass : "#3a6e22";
    this.ctx.fillStyle = grassFill;
    // Top grass
    this.ctx.fillRect(0, 0, this.canvas.width, Math.max(0, topCurbTop));
    // Bottom grass
    this.ctx.fillRect(
      0,
      bottomCurbTop + this.curbHeight,
      this.canvas.width,
      Math.max(0, this.canvas.height - (bottomCurbTop + this.curbHeight))
    );
  }

  drawPoly(points, strokeStyle = "#00e5ff") {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.closePath();
    this.ctx.strokeStyle = strokeStyle;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    this.ctx.restore();
  }

  gameLoop(timestampMs) {
    if (typeof timestampMs !== "number") {
      requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

    if (this.lastFrameAtMs === null) {
      this.lastFrameAtMs = timestampMs;
    }
    let dtSeconds = (timestampMs - this.lastFrameAtMs) / 1000;
    this.lastFrameAtMs = timestampMs;
    // Clamp dt to avoid huge jumps if tab was backgrounded
    dtSeconds = Math.max(0, Math.min(dtSeconds, 0.05));

    this.updateCar(dtSeconds);
    this.render();
    requestAnimationFrame((t) => this.gameLoop(t));
  }
}

// Start the game when page loads
window.addEventListener("load", () => {
  new ParkingGame();
});
