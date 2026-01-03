/**
 * PixelGameKit - プレイヤー（カメラ対応）
 */

class Player {
    constructor(tileX, tileY, template = null) {
        this.startX = tileX;
        this.startY = tileY;
        this.x = tileX;
        this.y = tileY;
        this.vx = 0;
        this.vy = 0;
        this.width = 0.8;
        this.height = 0.8;
        this.onGround = false;
        this.facingRight = true;

        // テンプレート情報（スプライト描画用）
        this.template = template;
        this.animFrame = 0;
        this.animTimer = 0;

        // 物理パラメータ
        this.moveSpeed = 0.1;
        this.jumpPower = -0.35;
        this.gravity = 0.02;
        this.maxFallSpeed = 0.4;

        // ダメージシステム（テンプレートからライフ数を取得）
        const templateLives = template?.config?.life || 3;
        this.lives = templateLives;
        this.maxLives = templateLives;
        this.invincible = false;
        this.invincibleTimer = 0;
        this.invincibleDuration = 120; // 2秒（60fps * 2）
        this.isDead = false;
        this.deathParticles = [];
    }

    update(engine) {
        // 死亡中はパーティクルのみ更新
        if (this.isDead) {
            this.updateDeathParticles();
            return;
        }

        // 無敵時間の更新
        if (this.invincible) {
            this.invincibleTimer--;
            if (this.invincibleTimer <= 0) {
                this.invincible = false;
            }
        }

        this.handleInput();

        // 重力
        this.vy += this.gravity;
        if (this.vy > this.maxFallSpeed) {
            this.vy = this.maxFallSpeed;
        }

        // X方向の移動と衝突
        this.x += this.vx;
        this.handleHorizontalCollision(engine);

        // Y方向の移動と衝突
        this.y += this.vy;
        this.handleVerticalCollision(engine);

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
        this.vx = 0;

        if (GameController.isPressed('left')) {
            this.vx = -this.moveSpeed;
            this.facingRight = false;
        }
        if (GameController.isPressed('right')) {
            this.vx = this.moveSpeed;
            this.facingRight = true;
        }
        if (GameController.isPressed('a') && this.onGround) {
            this.vy = this.jumpPower;
            this.onGround = false;
        }
    }

    takeDamage(fromRight) {
        if (this.invincible || this.isDead) return;

        this.lives--;

        if (this.lives <= 0) {
            // 死亡
            this.die();
        } else {
            // ダメージを受ける
            this.invincible = true;
            this.invincibleTimer = this.invincibleDuration;

            // ノックバック（2倍）
            this.vy = -0.4;
            this.vx = fromRight ? -0.3 : 0.3;
        }
    }

    die() {
        this.isDead = true;
        this.createDeathParticles();
    }

    createDeathParticles() {
        this.deathParticles = [];

        // テンプレートのスプライトを取得
        const frames = this.template?.sprites?.idle?.frames || [];
        const spriteIdx = frames[0];
        const sprite = App.projectData.sprites[spriteIdx];

        if (!sprite) return;

        const palette = App.nesPalette;

        // 4x4ブロック単位でパーティクルに変換
        for (let py = 0; py < 16; py += 4) {
            for (let px = 0; px < 16; px += 4) {
                // 4x4ブロックの最初の有効な色を使用
                let color = null;
                for (let dy = 0; dy < 4 && !color; dy++) {
                    for (let dx = 0; dx < 4 && !color; dx++) {
                        const ci = sprite.data[py + dy]?.[px + dx];
                        if (ci >= 0) color = palette[ci];
                    }
                }
                if (color) {
                    this.deathParticles.push({
                        x: this.x + px / 16,
                        y: this.y + py / 16,
                        vx: (Math.random() - 0.5) * 0.1, // 遅い速度
                        vy: -Math.random() * 0.15 - 0.05, // 遅い速度
                        color: color,
                        size: 4, // 4x4サイズ
                        life: 90 + Math.random() * 30
                    });
                }
            }
        }
    }

    updateDeathParticles() {
        this.deathParticles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.01; // 重力
            p.life--;
        });

        this.deathParticles = this.deathParticles.filter(p => p.life > 0);
    }

    handleHorizontalCollision(engine) {
        const left = Math.floor(this.x);
        const right = Math.floor(this.x + this.width);
        const top = Math.floor(this.y);
        const bottom = Math.floor(this.y + this.height - 0.01);

        for (let ty = top; ty <= bottom; ty++) {
            if (engine.getCollision(left, ty) === 1) {
                this.x = left + 1;
                this.vx = 0;
            }
            if (engine.getCollision(right, ty) === 1) {
                this.x = right - this.width;
                this.vx = 0;
            }
        }
    }

    handleVerticalCollision(engine) {
        this.onGround = false;

        const left = Math.floor(this.x);
        const right = Math.floor(this.x + this.width - 0.01);
        const top = Math.floor(this.y);
        const bottom = Math.floor(this.y + this.height);

        for (let tx = left; tx <= right; tx++) {
            if (this.vy < 0 && engine.getCollision(tx, top) === 1) {
                this.y = top + 1;
                this.vy = 0;
            }
            if (this.vy >= 0 && engine.getCollision(tx, bottom) === 1) {
                this.y = bottom - this.height;
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
        // 死亡中はパーティクルを描画
        if (this.isDead) {
            this.renderDeathParticles(ctx, tileSize, camera);
            return;
        }

        if (!this.template) return;

        // 無敵中は点滅（4フレームごと）
        if (this.invincible && Math.floor(this.invincibleTimer / 4) % 2 === 0) {
            return; // 描画しない（点滅）
        }

        const screenX = (this.x - camera.x) * tileSize;
        const screenY = (this.y - camera.y) * tileSize;

        const frames = this.template?.sprites?.idle?.frames || [];
        const spriteIdx = frames[this.animFrame] ?? frames[0];
        const sprite = App.projectData.sprites[spriteIdx];

        if (sprite) {
            const palette = App.nesPalette;
            const pixelSize = tileSize / 16;

            // 無敵中は半透明
            if (this.invincible) {
                ctx.globalAlpha = 0.5;
            }

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

            ctx.globalAlpha = 1.0;
        }
    }

    renderDeathParticles(ctx, tileSize, camera) {
        const pixelSize = tileSize / 16;

        this.deathParticles.forEach(p => {
            const screenX = (p.x - camera.x) * tileSize;
            const screenY = (p.y - camera.y) * tileSize;
            const size = (p.size || 1) * pixelSize;

            ctx.fillStyle = p.color;
            ctx.fillRect(screenX, screenY, size, size);
        });
    }
}
