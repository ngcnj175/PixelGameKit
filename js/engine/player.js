/**
 * PixelGameKit - プレイヤー
 */

class Player {
    constructor(tileX, tileY) {
        this.x = tileX;
        this.y = tileY;
        this.vx = 0;
        this.vy = 0;
        this.width = 0.8;
        this.height = 0.8;
        this.onGround = false;
        this.facingRight = true;

        // 移動パラメータ
        this.moveSpeed = 0.15;
        this.jumpPower = -10;
        this.maxSpeed = 0.3;
    }

    update(engine) {
        // 入力処理
        this.handleInput();

        // 重力
        this.vy += engine.GRAVITY;

        // 移動
        this.x += this.vx;
        this.y += this.vy;

        // 速度制限
        this.vy = Math.min(this.vy, 15);

        // 当たり判定
        this.handleCollision(engine);

        // 摩擦
        this.vx *= 0.8;
    }

    handleInput() {
        if (GameController.isPressed('left')) {
            this.vx -= this.moveSpeed;
            this.facingRight = false;
        }
        if (GameController.isPressed('right')) {
            this.vx += this.moveSpeed;
            this.facingRight = true;
        }
        if (GameController.isPressed('a') && this.onGround) {
            this.vy = this.jumpPower;
            this.onGround = false;
        }

        // 速度制限
        this.vx = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.vx));
    }

    handleCollision(engine) {
        this.onGround = false;

        // X方向の衝突
        const leftTile = Math.floor(this.x);
        const rightTile = Math.floor(this.x + this.width);
        const topTile = Math.floor(this.y);
        const bottomTile = Math.floor(this.y + this.height);

        // 左右の壁チェック
        for (let ty = topTile; ty <= bottomTile; ty++) {
            if (engine.getCollision(leftTile, ty) === 1) {
                this.x = leftTile + 1;
                this.vx = 0;
            }
            if (engine.getCollision(rightTile, ty) === 1) {
                this.x = rightTile - this.width;
                this.vx = 0;
            }
        }

        // 更新後の位置で再計算
        const newTopTile = Math.floor(this.y);
        const newBottomTile = Math.floor(this.y + this.height);

        // 上の衝突
        for (let tx = Math.floor(this.x); tx <= Math.floor(this.x + this.width); tx++) {
            if (engine.getCollision(tx, newTopTile) === 1) {
                this.y = newTopTile + 1;
                this.vy = 0;
            }
        }

        // 下の衝突（床）
        for (let tx = Math.floor(this.x); tx <= Math.floor(this.x + this.width); tx++) {
            const collision = engine.getCollision(tx, newBottomTile);
            if (collision === 1 || collision === 2) {
                this.y = newBottomTile - this.height;
                this.vy = 0;
                this.onGround = true;
            }
        }
    }

    collidesWith(other) {
        return this.x < other.x + other.width &&
            this.x + this.width > other.x &&
            this.y < other.y + other.height &&
            this.y + this.height > other.y;
    }

    render(ctx, tileSize) {
        ctx.fillStyle = '#4cc9f0';
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
