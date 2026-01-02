/**
 * PixelGameKit - プレイヤー（カメラ対応）
 */

class Player {
    constructor(tileX, tileY, template = null) {
        // タイル中央に配置（衝突判定を避けるため）
        this.x = tileX + 0.05;
        this.y = tileY;
        this.vx = 0;
        this.vy = 0;
        this.width = 0.9;
        this.height = 0.9;
        this.onGround = false;
        this.facingRight = true;

        // テンプレート情報（スプライト描画用）
        this.template = template;
        this.animFrame = 0;
        this.animTimer = 0;

        // マリオ風物理パラメータ
        this.accel = 0.08;       // 加速度
        this.friction = 0.85;    // 摩擦（地上）
        this.airFriction = 0.95; // 空中摩擦
        this.maxSpeed = 0.25;    // 最大速度
        this.jumpPower = -0.45;  // ジャンプ力
        this.gravity = 0.025;    // 重力
        this.maxFallSpeed = 0.5; // 最大落下速度
    }

    update(engine) {
        this.handleInput();

        // 重力
        this.vy += this.gravity;
        this.vy = Math.min(this.vy, this.maxFallSpeed);

        // 位置更新
        this.x += this.vx;
        this.y += this.vy;

        // 衝突判定
        this.handleCollision(engine);

        // 摩擦
        if (this.onGround) {
            this.vx *= this.friction;
        } else {
            this.vx *= this.airFriction;
        }

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

    handleInput() {
        const left = GameController.isPressed('left');
        const right = GameController.isPressed('right');
        const a = GameController.isPressed('a');

        if (left) {
            this.vx -= this.accel;
            this.facingRight = false;
        }
        if (right) {
            this.vx += this.accel;
            this.facingRight = true;
        }
        if (a && this.onGround) {
            this.vy = this.jumpPower;
            this.onGround = false;
        }

        // 最大速度制限
        this.vx = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, this.vx));
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
            }
            if (engine.getCollision(rightTile, ty) === 1) {
                this.x = rightTile - this.width;
                this.vx = 0;
            }
        }

        const newTopTile = Math.floor(this.y);
        const newBottomTile = Math.floor(this.y + this.height);

        for (let tx = Math.floor(this.x); tx <= Math.floor(this.x + this.width); tx++) {
            if (engine.getCollision(tx, newTopTile) === 1) {
                this.y = newTopTile + 1;
                this.vy = 0;
            }
        }

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
