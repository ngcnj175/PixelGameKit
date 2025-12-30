/**
 * PixelGameKit - 敵
 */

class Enemy {
    constructor(tileX, tileY, behavior = 'patrol') {
        this.x = tileX;
        this.y = tileY;
        this.vx = 0;
        this.vy = 0;
        this.width = 0.8;
        this.height = 0.8;
        this.behavior = behavior;
        this.facingRight = true;
        this.moveSpeed = 0.08;
    }

    update(engine) {
        switch (this.behavior) {
            case 'static':
                // 動かない
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

        // 重力
        this.vy += engine.GRAVITY;

        // 移動
        this.x += this.vx;
        this.y += this.vy;

        // 速度制限
        this.vy = Math.min(this.vy, 15);

        // 当たり判定
        this.handleCollision(engine);
    }

    patrol(engine) {
        this.vx = this.facingRight ? this.moveSpeed : -this.moveSpeed;

        // 壁にぶつかったら反転
        const nextX = this.x + (this.facingRight ? this.width + 0.1 : -0.1);
        const tileY = Math.floor(this.y + this.height);

        if (engine.getCollision(Math.floor(nextX), Math.floor(this.y)) === 1) {
            this.facingRight = !this.facingRight;
        }

        // 床がなくなったら反転
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

        // ランダムにジャンプ
        if (this.onGround && Math.random() < 0.02) {
            this.vy = -8;
            this.onGround = false;
        }
    }

    handleCollision(engine) {
        this.onGround = false;

        // X方向
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

        // Y方向（床）
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

    render(ctx, tileSize) {
        ctx.fillStyle = '#e94560';
        ctx.fillRect(
            this.x * tileSize,
            this.y * tileSize,
            this.width * tileSize,
            this.height * tileSize
        );

        // 目
        ctx.fillStyle = '#fff';
        const eyeX = this.facingRight ? 0.5 : 0.2;
        ctx.fillRect(
            (this.x + eyeX) * tileSize,
            (this.y + 0.2) * tileSize,
            0.15 * tileSize,
            0.15 * tileSize
        );
    }
}
