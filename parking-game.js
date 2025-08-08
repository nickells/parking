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
      maxSpeed: 3,
      acceleration: 0.2,
      friction: 0.1,
      steerAngle: 0,
      maxSteerAngle: Math.PI / 6,
      wheelbase: 70,
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
      },
      {
        x: this.centerX + 120,
        y: this.centerY,
        width: 90,
        height: 45,
        angle: 0,
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
    this.curbWidth = 400;
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

    // Debug
    this.debug = false;
    this.lastCollision = null;

    // Turning arc draws from front center near the arrow

    // Set initial player car position, speed, and steer
    this.setInitialCarPosition();

    // Initialize UI and layout
    this.initUI();
    this.recomputeParkingLayout();

    this.setupEventListeners();
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

  updateCar() {
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
        this.car.speed + this.car.acceleration,
        this.car.maxSpeed
      );
    } else if (this.keys.down) {
      this.car.lastDirection = -1;
      this.car.speed = Math.max(
        this.car.speed - this.car.acceleration,
        -this.car.maxSpeed
      );
    } else {
      // Apply friction
      if (this.car.speed > 0) {
        this.car.speed = Math.max(0, this.car.speed - this.car.friction);
      } else if (this.car.speed < 0) {
        this.car.speed = Math.min(0, this.car.speed + this.car.friction);
      }
    }

    // Handle steering (allow some steering when stationary)
    if (this.keys.left) {
      this.car.steerAngle = Math.max(
        this.car.steerAngle - 0.02,
        -this.car.maxSteerAngle
      );
    } else if (this.keys.right) {
      this.car.steerAngle = Math.min(
        this.car.steerAngle + 0.02,
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
      const angularVelocity = this.car.speed / turnRadius;

      if (this.car.steerAngle > 0) {
        this.car.angle += angularVelocity;
      } else {
        this.car.angle -= angularVelocity;
      }
    }

    // Store previous position for collision rollback
    const prevX = this.car.x;
    const prevY = this.car.y;

    // Update position
    this.car.x += Math.cos(this.car.angle) * this.car.speed;
    this.car.y += Math.sin(this.car.angle) * this.car.speed;

    // Check collisions
    if (this.checkCollisions()) {
      // Rollback position if collision detected
      this.car.x = prevX;
      this.car.y = prevY;
      this.car.speed = 0;
      this.car.collided = true;
    } else {
      this.car.collided = false;
    }

    // Keep car within canvas bounds
    this.car.x = Math.max(45, Math.min(this.canvas.width - 45, this.car.x));
    this.car.y = Math.max(45, Math.min(this.canvas.height - 45, this.car.y));
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
    const cx = this.car.x;
    const cy = this.car.y;
    const angle = this.car.angle;
    const halfW = this.car.width / 2;
    const halfH = this.car.height / 2;
    const dx = px - cx;
    const dy = py - cy;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Rotate point into car's local space (inverse rotation)
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
  }

  getTurningRadius() {
    if (Math.abs(this.car.steerAngle) < 0.01) return null;
    return this.car.wheelbase / Math.tan(Math.abs(this.car.steerAngle));
  }

  checkCollisions() {
    // Check collision with parked cars
    for (let parkedCar of this.parkedCars) {
      if (
        this.rectangleCollision(
          this.car.x,
          this.car.y,
          this.car.width,
          this.car.height,
          this.car.angle,
          parkedCar.x,
          parkedCar.y,
          parkedCar.width,
          parkedCar.height,
          parkedCar.angle
        )
      ) {
        this.lastCollision = { type: "car", with: parkedCar };
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
    if (
      this.rectangleCollision(
        this.car.x,
        this.car.y,
        this.car.width,
        this.car.height,
        this.car.angle,
        curb.x,
        curb.y,
        curb.width,
        curb.height,
        curb.angle
      )
    ) {
      this.lastCollision = { type: "curb", with: curb };
      return true;
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
    // Use only two unique axes per rectangle (edges 0 and 1)
    // to avoid duplicates due to the loop above
    return [axes[0], axes[1]];
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
    if (!radius || Math.abs(this.car.steerAngle) < 0.01) return;

    // Anchor near the arrow at the front center of the car
    const halfW = this.car.width / 2;
    const anchorOffset = halfW - 8; // small inset from the bumper where arrow tip sits
    const anchorX = this.car.x + Math.cos(this.car.angle) * anchorOffset;
    const anchorY = this.car.y + Math.sin(this.car.angle) * anchorOffset;

    // Calculate arc center using perpendicular from the anchor point
    const perpAngle =
      this.car.angle + (this.car.steerAngle > 0 ? Math.PI / 2 : -Math.PI / 2);
    const centerX = anchorX + Math.cos(perpAngle) * radius;
    const centerY = anchorY + Math.sin(perpAngle) * radius;

    // Draw arc
    this.ctx.strokeStyle = "#4ade80";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();

    const startAngle =
      this.car.angle + (this.car.steerAngle > 0 ? -Math.PI / 2 : Math.PI / 2);
    const arcLength = Math.PI / 3;

    const ccw =
      (this.car.steerAngle > 0 && this.car.lastDirection < 0) ||
      (this.car.steerAngle < 0 && this.car.lastDirection > 0);

    this.ctx.arc(
      centerX,
      centerY,
      radius,
      startAngle,
      startAngle + (ccw ? arcLength : -arcLength),
      ccw
    );
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }

  drawParkingArea() {
    // Parking space outline
    this.ctx.strokeStyle = "#ffd700";
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([10, 5]);
    this.ctx.strokeRect(
      this.parkingSpace.x - this.parkingSpace.width / 2,
      this.parkingSpace.y - this.parkingSpace.height / 2,
      this.parkingSpace.width,
      this.parkingSpace.height
    );
    this.ctx.setLineDash([]);

    // Parked cars
    this.parkedCars.forEach((car) => {
      this.drawCar(car.x, car.y, car.angle, "#888", false);
    });

    // Curb centered horizontally relative to canvas, positioned below center
    this.ctx.fillStyle = "#666";
    const curbLeft = this.centerX - this.curbWidth / 2;
    const curbTop = this.centerY + this.curbOffsetY;
    this.ctx.fillRect(curbLeft, curbTop, this.curbWidth, this.curbHeight);
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

    // Draw parking area
    this.drawParkingArea();

    // Draw turning arc
    this.drawTurningArc();

    // Draw player car
    this.drawCar(this.car.x, this.car.y, this.car.angle);

    // Check parking success
    this.checkParking();

    // If in win linger, show a subtle overlay countdown effect
    if (this.winResetAtMs !== null) {
      this.ctx.fillStyle = "rgba(76, 222, 128, 0.25)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw speed indicator
    this.ctx.fillStyle = this.car.collided ? "#ff4444" : "#fff";
    this.ctx.font = "16px Arial";
    this.ctx.textAlign = "left";
    this.ctx.fillText(`Speed: ${Math.abs(this.car.speed).toFixed(1)}`, 10, 30);
    this.ctx.fillText(
      `Steering: ${((this.car.steerAngle * 180) / Math.PI).toFixed(0)}°`,
      10,
      50
    );

    if (this.car.collided) {
      this.ctx.fillStyle = "#ff4444";
      this.ctx.fillText("COLLISION!", 10, 70);
    }

    // Debug overlays
    if (this.debug) {
      // Draw car rectangle
      const carPts = this.getRectangleCorners(
        this.car.x,
        this.car.y,
        this.car.width,
        this.car.height,
        this.car.angle
      );
      this.drawPoly(carPts, "#00e5ff");

      // Draw parked cars
      for (const pc of this.parkedCars) {
        const pcPts = this.getRectangleCorners(
          pc.x,
          pc.y,
          pc.width,
          pc.height,
          pc.angle
        );
        this.drawPoly(pcPts, "#ffcc00");
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

  gameLoop() {
    this.updateCar();
    this.render();
    requestAnimationFrame(() => this.gameLoop());
  }
}

// Start the game when page loads
window.addEventListener("load", () => {
  new ParkingGame();
});
