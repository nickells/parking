// Steering HUD module (ES module)

export class SteeringHUD {
  constructor(ctx, textures, wheelRatio = 15) {
    this.ctx = ctx;
    this.textures = textures;
    this.wheelRatio = wheelRatio;
  }

  draw(canvasWidth, canvasHeight, steerAngle) {
    const margin = 4;
    const hudWidth = 70;
    const hudHeight = 20;
    const imgSize = 128;
    const cx = canvasWidth / 2;
    const cy = canvasHeight - margin - imgSize / 2;

    const wheelAngle = steerAngle * (this.wheelRatio || 1);
    const wheelImg = this.textures.wheel;

    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(wheelAngle);
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
      this.ctx.strokeStyle = "#4ade80";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(-hudWidth / 2 + 6, 0);
      this.ctx.lineTo(hudWidth / 2 - 6, 0);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }
}
