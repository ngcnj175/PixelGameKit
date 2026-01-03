/**
 * PixelGameKit - 敵（カメラ対応）
 */

class Enemy {
    constructor(tileX, tileY, template = null, behavior = 'idle') {
        this.x = tileX;
        this.y = tileY;
        this.vx = 0;
        this.vy = 0;
        this.width = 0.8;
        this.height = 0.8;
        this.behavior = behavior;
        this.facingRight = true;
        this.onGround = false;
        this.moveSpeed = 0.05;

        // テンプレート情報（スプライト描画用）
        this.template = template;
        this.animFrame = 0;
        this.animTimer = 0;

        // 重力
        this.gravity = 0.02;
        this.maxFallSpeed = 0.4;

        // ライフ（テンプレートから取得）
        this.lives = template?.config?.life || 1;

        // 死亡状態
        this.isDying = false;
        this.deathTimer = 0;
    }

    update(engine) {
        // 死亡中は落下のみ
        if (this.isDying) {
            this.vy += this.gravity;
            this.y += this.vy;
            this.deathTimer++;
            return this.deathTimer > 120; // 2秒後に消滅
        }

        // 行動パターン
        switch (this.behavior) {
            case 'idle':
                this.vx = 0;
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
            default:
                this.vx = 0;
        }

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

        return false; // 消滅しない
    }

    takeDamage(fromRight) {
        this.lives--;
        if (this.lives <= 0) {
            this.die(fromRight);
        }
    }

    die(fromRight) {
        this.isDying = true;
        this.vy = -0.3;
        this.vx = fromRight ? -0.1 : 0.1;
        this.onGround = false;
    }

    patrol(engine) {
        // 崖落下防止：前方の足元にタイルがなければ反転
        const checkX = this.facingRight ? Math.floor(this.x + this.width + 0.1) : Math.floor(this.x - 0.1);
        const footY = Math.floor(this.y + this.height + 0.1);

        if (engine.getCollision(checkX, footY) === 0) {
            this.facingRight = !this.facingRight;
        }

        this.vx = this.facingRight ? this.moveSpeed : -this.moveSpeed;
    }

    chase(engine) {
        if (!engine.player) {
            this.vx = 0;
            return;
        }

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

    handleHorizontalCollision(engine) {
        if (this.isDying) return;

        const left = Math.floor(this.x);
        const right = Math.floor(this.x + this.width);
        const top = Math.floor(this.y);
        const bottom = Math.floor(this.y + this.height - 0.01);

        for (let ty = top; ty <= bottom; ty++) {
            if (engine.getCollision(left, ty) === 1) {
                this.x = left + 1;
                this.vx = 0;
                this.facingRight = true;
            }
            if (engine.getCollision(right, ty) === 1) {
                this.x = right - this.width;
                this.vx = 0;
                this.facingRight = false;
            }
        }
    }

    handleVerticalCollision(engine) {
        if (this.isDying) return;

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

    render(ctx, tileSize, camera) {
        if (!this.template) return;

        const screenX = (this.x - camera.x) * tileSize;
        const screenY = (this.y - camera.y) * tileSize;

        const frames = this.template?.sprites?.idle?.frames || [];
        const spriteIdx = frames[this.animFrame] ?? frames[0];
        const sprite = App.projectData.sprites[spriteIdx];

        if (sprite) {
            const palette = App.nesPalette;
            const pixelSize = tileSize / 16;

            // 死亡アニメーション中は上下反転
            if (this.isDying) {
                ctx.save();
                ctx.translate(screenX + tileSize / 2, screenY + tileSize / 2);
                ctx.scale(1, -1);
                ctx.translate(-(screenX + tileSize / 2), -(screenY + tileSize / 2));
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

            if (this.isDying) {
                ctx.restore();
            }
        }
    }
}
