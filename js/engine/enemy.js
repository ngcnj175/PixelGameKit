/**
 * PixelGameKit - 敵（動きの種類拡張版）
 */

class Enemy {
    constructor(tileX, tileY, template = null, behavior = 'idle', templateIdx = undefined) {
        this.x = tileX;
        this.y = tileY;
        this.originX = tileX; // 元の位置（追いかけて戻る用）
        this.originY = tileY;
        this.vx = 0;
        this.vy = 0;
        this.width = 0.8;
        this.height = 0.8;
        this.behavior = behavior;
        this.facingRight = true;
        this.onGround = false;
        this.moveSpeed = 0.05;

        this.template = template;
        this.templateIdx = templateIdx;
        this.animFrame = 0;
        this.animTimer = 0;

        this.gravity = 0.02;
        this.maxFallSpeed = 0.4;

        this.lives = template?.config?.life || 1;
        this.isDying = false;
        this.deathTimer = 0;

        // 空中モード
        this.isAerial = template?.config?.isAerial || false;

        // 状態
        this.state = 'idle';
        this.isAttacking = false;
        this.attackTimer = 0;

        // 追いかけ状態
        this.isChasing = false;
        this.detectionRange = 8; // 検知距離

        // 空中上下移動用
        this.floatDirection = 1; // 1=下, -1=上
        this.floatTimer = 0;
        this.diveTimer = 0; // うろぴょん空中版用
        this.isDiving = false;
        this.isReturning = false;

        // SHOT設定
        this.shotMaxRange = template?.config?.shotMaxRange || 0;
        this.shotCooldown = 0;
        this.shotInterval = 120;
    }

    update(engine) {
        if (this.frozen) {
            return false;
        }

        if (this.isDying) {
            this.vy += this.gravity;
            this.y += this.vy;
            this.deathTimer++;
            return this.deathTimer > 120;
        }

        if (this.shotCooldown > 0) {
            this.shotCooldown--;
        }

        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }

        // 空中か地上かで分岐
        if (this.isAerial) {
            this.updateAerial(engine);
        } else {
            this.updateGround(engine);
        }

        // SHOT攻撃
        if (this.shotMaxRange > 0 && this.shotCooldown <= 0) {
            this.shoot(engine);
        }

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

    // ========== 地上モード ==========
    updateGround(engine) {
        switch (this.behavior) {
            case 'idle':
                this.vx = 0;
                break;
            case 'patrol':
                this.patrol(engine);
                break;
            case 'jump':
                // その場ジャンプ
                this.vx = 0;
                if (this.onGround && Math.random() < 0.02) {
                    this.vy = -0.3;
                    this.onGround = false;
                }
                break;
            case 'jumpPatrol':
                // 移動しながらジャンプ
                this.patrol(engine);
                if (this.onGround && Math.random() < 0.02) {
                    this.vy = -0.3;
                    this.onGround = false;
                }
                break;
            case 'chase':
                this.chaseWithReturn(engine);
                break;
            default:
                this.vx = 0;
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
    }

    // ========== 空中モード ==========
    updateAerial(engine) {
        switch (this.behavior) {
            case 'idle':
                // 空中で動かない
                this.vx = 0;
                this.vy = 0;
                break;
            case 'patrol':
                // 空中で左右移動
                this.patrol(engine);
                this.vy = 0; // 重力なし
                break;
            case 'jump':
                // 空中で上下移動（8タイル範囲制限、床/天井の衝突）
                this.vx = 0;
                const vertMaxRange = 8;
                const distY = this.y - this.originY;

                if (this.floatDirection > 0 && distY >= vertMaxRange) {
                    this.floatDirection = -1;
                } else if (this.floatDirection < 0 && distY <= -vertMaxRange) {
                    this.floatDirection = 1;
                }

                // 床/天井判定
                const checkYJump = this.floatDirection > 0
                    ? Math.floor(this.y + this.height + 0.1)
                    : Math.floor(this.y - 0.1);
                if (engine.getCollision(Math.floor(this.x + this.width / 2), checkYJump) === 1) {
                    this.floatDirection *= -1;
                }

                this.vy = this.floatDirection * this.moveSpeed;
                break;
            case 'jumpPatrol':
                // 空中で左右移動（8タイル） + 定期落下（4タイル、2倍速） + 元に戻る（通常速度）
                const horzMaxRange = 8;
                const diveMaxRange = 4;
                const normalSpeed = this.moveSpeed;
                const diveSpeed = this.moveSpeed * 4; // 2倍速（より速く見えるように4倍）

                if (!this.isDiving && !this.isReturning) {
                    // 通常時は左右移動
                    const distX = this.x - this.originX;
                    if (this.facingRight && distX >= horzMaxRange) {
                        this.facingRight = false;
                    } else if (!this.facingRight && distX <= -horzMaxRange) {
                        this.facingRight = true;
                    }

                    // 壁判定
                    const checkXJP = this.facingRight ? Math.floor(this.x + this.width + 0.1) : Math.floor(this.x - 0.1);
                    if (engine.getCollision(checkXJP, Math.floor(this.y + this.height / 2)) === 1) {
                        this.facingRight = !this.facingRight;
                    }

                    this.vx = this.facingRight ? normalSpeed : -normalSpeed;
                    this.vy = 0;
                    this.diveTimer++;

                    // 2秒ごとに落下開始
                    if (this.diveTimer >= 120) {
                        this.isDiving = true;
                        this.diveTimer = 0;
                    }
                } else if (this.isDiving) {
                    // 落下フェーズ（4タイルまで or 床、2倍速）
                    this.vx = 0;
                    const diveDistY = this.y - this.originY;
                    const floorCheck = Math.floor(this.y + this.height + 0.1);
                    if (diveDistY < diveMaxRange && engine.getCollision(Math.floor(this.x + this.width / 2), floorCheck) !== 1) {
                        this.vy = diveSpeed;
                    } else {
                        this.isDiving = false;
                        this.isReturning = true;
                    }
                } else if (this.isReturning) {
                    // 元に戻るフェーズ（通常速度）
                    this.vx = 0;
                    const dyReturn = this.originY - this.y;
                    if (Math.abs(dyReturn) > 0.2) {
                        this.vy = dyReturn > 0 ? normalSpeed : -normalSpeed;
                    } else {
                        this.y = this.originY;
                        this.vy = 0;
                        this.isReturning = false;
                    }
                }
                break;
            case 'chase':
                // 空中で追いかける
                this.aerialChaseWithReturn(engine);
                break;
            default:
                this.vx = 0;
                this.vy = 0;
        }

        // 空中モードは重力なし、移動のみ
        this.x += this.vx;
        this.y += this.vy;
    }

    patrol(engine) {
        const maxRange = 8; // 移動範囲制限（タイル）

        // 範囲チェック（originから8タイル以上離れたら折り返す）
        const distFromOrigin = this.x - this.originX;
        if (this.facingRight && distFromOrigin >= maxRange) {
            this.facingRight = false;
        } else if (!this.facingRight && distFromOrigin <= -maxRange) {
            this.facingRight = true;
        }

        const checkX = this.facingRight ? Math.floor(this.x + this.width + 0.1) : Math.floor(this.x - 0.1);
        const footY = Math.floor(this.y + this.height + 0.1);

        // 空中モードでない場合のみ崖判定
        if (!this.isAerial && this.onGround) {
            if (engine.getCollision(checkX, footY) === 0) {
                this.facingRight = !this.facingRight;
            }
        }

        // 壁判定
        const wallY = Math.floor(this.y + this.height / 2);
        if (engine.getCollision(checkX, wallY) === 1) {
            this.facingRight = !this.facingRight;
        }

        this.vx = this.facingRight ? this.moveSpeed : -this.moveSpeed;
    }

    chaseWithReturn(engine) {
        if (!engine.player) {
            this.returnToOrigin();
            return;
        }

        const dx = engine.player.x - this.x;
        const dy = engine.player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.detectionRange) {
            // プレイヤー発見
            this.isChasing = true;
            if (Math.abs(dx) > 0.5) {
                this.vx = dx > 0 ? this.moveSpeed : -this.moveSpeed;
                this.facingRight = dx > 0;
            } else {
                this.vx = 0;
            }
        } else if (this.isChasing) {
            // 見失った → 元の位置へ戻る
            this.returnToOrigin();
        } else {
            this.vx = 0;
        }
    }

    aerialChaseWithReturn(engine) {
        if (!engine.player) {
            this.returnToOriginAerial();
            return;
        }

        const dx = engine.player.x - this.x;
        const dy = engine.player.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.detectionRange) {
            this.isChasing = true;
            // 重力なしで接近
            if (Math.abs(dx) > 0.3) {
                this.vx = dx > 0 ? this.moveSpeed : -this.moveSpeed;
                this.facingRight = dx > 0;
            } else {
                this.vx = 0;
            }
            if (Math.abs(dy) > 0.3) {
                this.vy = dy > 0 ? this.moveSpeed : -this.moveSpeed;
            } else {
                this.vy = 0;
            }
        } else if (this.isChasing) {
            this.returnToOriginAerial();
        } else {
            this.vx = 0;
            this.vy = 0;
        }
    }

    returnToOrigin() {
        const dx = this.originX - this.x;
        if (Math.abs(dx) > 0.2) {
            this.vx = dx > 0 ? this.moveSpeed : -this.moveSpeed;
            this.facingRight = dx > 0;
        } else {
            this.vx = 0;
            this.x = this.originX;
            this.isChasing = false;
        }
    }

    returnToOriginAerial() {
        const dx = this.originX - this.x;
        const dy = this.originY - this.y;
        if (Math.abs(dx) > 0.2) {
            this.vx = dx > 0 ? this.moveSpeed : -this.moveSpeed;
            this.facingRight = dx > 0;
        } else {
            this.vx = 0;
        }
        if (Math.abs(dy) > 0.2) {
            this.vy = dy > 0 ? this.moveSpeed : -this.moveSpeed;
        } else {
            this.vy = 0;
        }
        if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) {
            this.x = this.originX;
            this.y = this.originY;
            this.isChasing = false;
        }
    }

    updateState() {
        if (this.isAttacking) {
            this.state = 'attack';
        } else if (!this.onGround && !this.isAerial) {
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
            vx: 0.15 * direction,
            vy: 0,
            width: 0.5,
            height: 0.5,
            spriteIdx: shotSprite,
            templateIdx: this.templateIdx,
            animationSlot: 'shot',
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
            const spriteSize = sprite.size || 1;
            const dimension = spriteSize === 2 ? 32 : 16;
            const tileCount = spriteSize === 2 ? 2 : 1;
            const renderSize = tileSize * tileCount;
            const pixelSize = renderSize / dimension;

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
