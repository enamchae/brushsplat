
export type Point = {
    x: number,
    y: number,
};

export class Stroke {
    p0: Point;
    p1: Point;
    p2: Point;
    radius: number;
    color: { r: number, g: number, b: number };
    alpha: number;

    constructor(options: {
        p0: Point,
        p1: Point,
        p2: Point,
        radius: number,
        color: {r: number, g: number, b: number},
        alpha: number;
    }) {
        this.p0 = options.p0;
        this.p1 = options.p1;
        this.p2 = options.p2;
        this.radius = options.radius;
        this.color = options.color;
        this.alpha = options.alpha;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = this.radius;
        ctx.strokeStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
        ctx.beginPath();
        ctx.moveTo(this.p0.x, this.p0.y);
        ctx.quadraticCurveTo(this.p1.x, this.p1.y, this.p2.x, this.p2.y);
        ctx.stroke();
        ctx.restore();
    }
}