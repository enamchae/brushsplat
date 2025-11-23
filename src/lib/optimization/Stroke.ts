
export type Point = {
    x: number,
    y: number,
    radius: number,
};

export class Stroke {
    p0: Point;
    p1: Point;
    p2: Point;
    color: { r: number, g: number, b: number };
    alpha: number;

    constructor(options: {
        p0: Point,
        p1: Point,
        p2: Point,
        color: {r: number, g: number, b: number},
        alpha: number;
    }) {
        this.p0 = options.p0;
        this.p1 = options.p1;
        this.p2 = options.p2;
        this.color = options.color;
        this.alpha = options.alpha;
    }

    draw(ctx: CanvasRenderingContext2D) {
        const nDivisions = 20;
        
        ctx.save();
        ctx.fillStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
        ctx.globalAlpha = this.alpha;

        const sampleQuadBezier = (t: number) => {
            const mt = 1 - t;
            const mt2 = mt * mt;
            const t2 = t * t;
            const mt_t_2 = 2 * mt * t;
            
            return {
                x: mt2 * this.p0.x + mt_t_2 * this.p1.x + t2 * this.p2.x,
                y: mt2 * this.p0.y + mt_t_2 * this.p1.y + t2 * this.p2.y,
                r: mt2 * this.p0.radius + mt_t_2 * this.p1.radius + t2 * this.p2.radius
            };
        };

        let prev = sampleQuadBezier(0);
        
        // Draw start cap
        ctx.beginPath();
        ctx.arc(prev.x, prev.y, prev.r, 0, Math.PI * 2);
        ctx.fill();

        for (let i = 1; i <= nDivisions; i++) {
            const t = i / nDivisions;
            const curr = sampleQuadBezier(t);
            
            // Calculate normal for segment
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            if (len > 0) {
                const nx = -dy / len;
                const ny = dx / len;

                ctx.beginPath();
                ctx.moveTo(prev.x + nx * prev.r, prev.y + ny * prev.r);
                ctx.lineTo(curr.x + nx * curr.r, curr.y + ny * curr.r);
                ctx.lineTo(curr.x - nx * curr.r, curr.y - ny * curr.r);
                ctx.lineTo(prev.x - nx * prev.r, prev.y - ny * prev.r);
                ctx.closePath();
                ctx.fill();

                // Draw circle at joint/end to smooth it out
                ctx.beginPath();
                ctx.arc(curr.x, curr.y, curr.r, 0, Math.PI * 2);
                ctx.fill();
            }

            prev = curr;
        }

        ctx.restore();
    }
}