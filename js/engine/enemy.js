/**
 * PixelGameKit - 敵（完全版）
 */

class Enemy {
    constructor(tileX, tileY, template = null, behavior = 'idle', templateIdx = undefined) {
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

        this.template = template;
        this.templateIdx = templateIdx; // アニメーション用
        this.animFrame = 0;
        this.animTimer = 0;

        this.gravity = 0.02;
        this.maxFallSpeed = 0.4;

        this.lives = template?.config?.life || 1;
        this.isDying = false;
        this.deathTimer = 0;

        // 状態
        this.state = 'idle';
        this.isAttacking = false;
        this.attackTimer = 0;

        // SHOT設定
        this.shotMaxRange = template?.config?.shotMaxRange || 0;
        this.shotCooldown = 0;
        this.shotInterval = 120; // 2秒ごとに発射
    }

    update(engine) {
        // ボス演出中は動かない
        if (this.frozen) {
            return false;
        }

        if (this.isDying) {
            this.vy += this.gravity;
            this.y += this.vy;
            this.deathTimer++;
            return this.deathTimer > 120;
        }

        // 攻撃クールダウン
        if (this.shotCooldown > 0) {
            this.shotCooldown--;
        }

        // 攻撃タイマー
        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
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

        // SHOT攻撃
        if (this.shotMaxRange > 0 && this.shotCooldown <= 0) {
            this.shoot(engine);
        }

        // 重力
        this.vy += this.gravity;
        if (this.vy > this.maxFallSpeed) {
            this.vy = this.maxFallSpeed;
        }

        this.x += this.vx;
        this.handleHorizontalCollision(engine);
        this.y += this.vy;
        this.handleVerticalCollision(engine);

        // 状態更新
        this.updateState();

        // アニメーション
        this.animTimer++;
        const spriteSlot = this.getSpriteSlot();
        const speed = this.template?.sprites?.[spriteSlot]?.speed || 5;
        const interval = Math.floor(60 / speed);
        if (this.animTimer >= interval) {
            this.animTimer = 0;
            const frames = this.template?.sprites?.[spriteSlot]?.frames || [];
            if (frames.length > 0) {
                this.animFrame = (this.animFrame + 1) % frames.length;
            }
        }

        return false;
    }

    updateState() {
        if (this.isAttacking) {
            this.state = 'attack';
        } else if (!this.onGround) {
            this.state = 'jump';
        } else if (this.vx !== 0) {
            this.state = 'walk';
        } else {
            this.state = 'idle';
        }
    }

    getSpriteSlot() {
        switch (this.state) {
            case 'attack':
                return this.template?.sprites?.attack?.frames?.length > 0 ? 'attack' : 'idle';
            case 'jump':
                return this.template?.sprites?.jump?.frames?.length > 0 ? 'jump' : 'idle';
            case 'walk':
                return this.template?.sprites?.walk?.frames?.length > 0 ? 'walk' : 'idle';
            default:
                return 'idle';
        }
    }

    shoot(engine) {
        const shotSprite = this.template?.sprites?.shot?.frames?.[0];
        if (shotSprite === undefined) return;

        this.isAttacking = true;
        this.attackTimer = 15;
        this.shotCooldown = this.shotInterval;
        this.animFrame = 0;

        const direction = this.facingRight ? 1 : -1;
        engine.projectiles.push({
            x: this.x + (this.facingRight ? this.width : -0.2),
            y: this.y + this.height / 2 - 0.25,
            vx: 0.1 * direction,
            vy: 0,
            width: 0.5,
            height: 0.5,
            spriteIdx: shotSprite,
            templateIdx: this.templateIdx, // アニメーション用
            animationSlot: 'shot', // 使用するスロットを指定
            owner: 'enemy',
            maxRange: this.shotMaxRange,
            startX: this.x,
            facingRight: this.facingRight
        });
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
        const checkX = this.facingRight ? Math.floor(this.x + this.width + 0.1) : Math.floor(this.x - 0.1);
        const footY = Math.floor(this.y + this.height + 0.1);

        // 接地している場合のみ崖判定を行う（ジャンプ中の高速振動防止）
        if (this.onGround) {
            if (engine.getCollision(checkX, footY) === 0) {
                this.facingRight = !this.facingRight;
            }
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

        const spriteSlot = this.getSpriteSlot();
        const frames = this.template?.sprites?.[spriteSlot]?.frames || this.template?.sprites?.idle?.frames || [];
        const spriteIdx = frames[this.animFrame] ?? frames[0];
        const sprite = App.projectData.sprites[spriteIdx];

        if (sprite) {
            const palette = App.nesPalette;
            // スプライトサイズを判定
            const spriteSize = sprite.size || 1;
            const dimension = spriteSize === 2 ? 32 : 16;
            const tileCount = spriteSize === 2 ? 2 : 1;
            const renderSize = tileSize * tileCount;
            const pixelSize = renderSize / dimension;

            // 32x32スプライトは足元を基準に描画（1タイル分上にオフセット）
            const yOffset = spriteSize === 2 ? -tileSize : 0;
            const adjustedScreenY = screenY + yOffset;

            if (this.isDying) {
                ctx.save();
                ctx.translate(screenX + renderSize / 2, adjustedScreenY + renderSize / 2);
                ctx.scale(1, -1);
                ctx.translate(-(screenX + renderSize / 2), -(adjustedScreenY + renderSize / 2));
            }

            const flipX = !this.facingRight;

            for (let y = 0; y < dimension; y++) {
                for (let x = 0; x < dimension; x++) {
                    const colorIndex = sprite.data[y]?.[x];
                    if (colorIndex >= 0) {
                        ctx.fillStyle = palette[colorIndex];
                        const drawX = flipX ? screenX + (dimension - 1 - x) * pixelSize : screenX + x * pixelSize;
                        ctx.fillRect(drawX, adjustedScreenY + y * pixelSize, pixelSize + 0.5, pixelSize + 0.5);
                    }
                }
            }

            if (this.isDying) {
                ctx.restore();
            }
        }
    }
}
