/**
 * PixelGameKit - 敵（カメラ対応）
 */

class Enemy {
    constructor(tileX, tileY, template = null, behavior = 'idle') {
        this.x = tileX;
        this.y = tileY;
        this.vx = 0;
        this.vy = 0;
        this.width = 0.9;
        this.height = 0.9;
        this.behavior = behavior;
        this.facingRight = true;
        this.onGround = false;
        this.moveSpeed = 0.05;

        // テンプレート情報（スプライト描画用）
        this.template = template;
        this.animFrame = 0;
        this.animTimer = 0;

        // 重力
        this.gravity = 0.025;
        this.maxFallSpeed = 0.5;
    }

    update(engine) {
        switch (this.behavior) {
            case 'idle':
                break;
            case 'patrol':
                this.patrol(engine);
                break;
            case 'chase':
                this.chase(engine);
                break;
            case 'jump':
                this.jumpPatrol(engine);
                break;
        }

        this.vy += this.gravity;
        this.vy = Math.min(this.vy, this.maxFallSpeed);

        this.x += this.vx;
        this.y += this.vy;

        this.handleCollision(engine);

        // アニメーション更新
        this.animTimer++;
        const speed = this.template?.sprites?.idle?.speed || 10;
        if (this.animTimer >= speed) {
            this.animTimer = 0;
            const frames = this.template?.sprites?.idle?.frames || [];
            if (frames.length > 0) {
                this.animFrame = (this.animFrame + 1) % frames.length;
            }
        }
    }

    patrol(engine) {
        this.vx = this.facingRight ? this.moveSpeed : -this.moveSpeed;

        const nextX = this.x + (this.facingRight ? this.width + 0.1 : -0.1);
        const tileY = Math.floor(this.y + this.height);

        if (engine.getCollision(Math.floor(nextX), Math.floor(this.y)) === 1) {
            this.facingRight = !this.facingRight;
        }

        if (engine.getCollision(Math.floor(nextX), tileY) === 0) {
            this.facingRight = !this.facingRight;
        }
    }

    chase(engine) {
        if (!engine.player) return;

        const dx = engine.player.x - this.x;

        if (Math.abs(dx) > 0.5) {
            this.vx = dx > 0 ? this.moveSpeed : -this.moveSpeed;
            this.facingRight = dx > 0;
        } else {
            this.vx = 0;
        }
    }

    jumpPatrol(engine) {
        this.patrol(engine);

        if (this.onGround && Math.random() < 0.02) {
            this.vy = -0.3;
            this.onGround = false;
        }
    }

    handleCollision(engine) {
        this.onGround = false;

        const leftTile = Math.floor(this.x);
        const rightTile = Math.floor(this.x + this.width);
        const topTile = Math.floor(this.y);
        const bottomTile = Math.floor(this.y + this.height);

        for (let ty = topTile; ty <= bottomTile; ty++) {
            if (engine.getCollision(leftTile, ty) === 1) {
                this.x = leftTile + 1;
                this.vx = 0;
                this.facingRight = true;
            }
            if (engine.getCollision(rightTile, ty) === 1) {
                this.x = rightTile - this.width;
                this.vx = 0;
                this.facingRight = false;
            }
        }

        const newBottomTile = Math.floor(this.y + this.height);
        for (let tx = Math.floor(this.x); tx <= Math.floor(this.x + this.width); tx++) {
            const collision = engine.getCollision(tx, newBottomTile);
            if (collision === 1 || collision === 2) {
                this.y = newBottomTile - this.height;
                this.vy = 0;
                this.onGround = true;
            }
        }
    }

    render(ctx, tileSize, camera) {
        // テンプレートがない場合は描画しない
        if (!this.template) return;

        const screenX = (this.x - camera.x) * tileSize;
        const screenY = (this.y - camera.y) * tileSize;

        // テンプレートのスプライトを取得
        const frames = this.template?.sprites?.idle?.frames || [];
        const spriteIdx = frames[this.animFrame] ?? frames[0];
        const sprite = App.projectData.sprites[spriteIdx];

        if (sprite) {
            // スプライトを描画
            const palette = App.nesPalette;
            const pixelSize = tileSize / 16;

            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const colorIndex = sprite.data[y][x];
                    if (colorIndex >= 0) {
                        ctx.fillStyle = palette[colorIndex];
                        ctx.fillRect(
                            screenX + x * pixelSize,
                            screenY + y * pixelSize,
                            pixelSize + 0.5,
                            pixelSize + 0.5
                        );
                    }
                }
            }
        }
    }
}
