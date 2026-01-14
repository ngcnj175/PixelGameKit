/**
 * PixelGameKit - プレイヤー（完全版）
 */

class Player {
    constructor(tileX, tileY, template = null, templateIdx = undefined) {
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

        // テンプレート情報
        this.template = template;
        this.templateIdx = templateIdx; // アニメーション用
        this.animFrame = 0;
        this.animTimer = 0;

        // 物理パラメータ
        this.moveSpeed = 0.1;
        this.jumpPower = -0.35;
        this.gravity = 0.02;
        this.maxFallSpeed = 0.4;

        // ダメージシステム
        const templateLives = template?.config?.life || 3;
        this.lives = templateLives;
        this.maxLives = templateLives;
        this.invincible = false;
        this.invincibleTimer = 0;
        this.invincibleDuration = 120;
        this.isKnockback = false; // ノックバック中フラグ
        this.isDead = false;
        this.deathParticles = [];

        // 状態
        this.state = 'idle';
        this.isAttacking = false;
        this.attackTimer = 0;

        // スター無敵
        this.starPower = false;
        this.starTimer = 0;
        this.starDuration = 300; // 5秒

        // SHOT設定
        this.shotMaxRange = template?.config?.shotMaxRange || 0;
        this.attackCooldown = 0;

        // W JUMP（2段ジャンプ）
        this.wJumpEnabled = template?.config?.wJump || false;
        this.canDoubleJump = false;
        this.hasDoubleJumped = false;

        // SE設定（-1はOFF）
        this.seJump = template?.config?.seJump ?? 0;
        this.seAttack = template?.config?.seAttack ?? 1;
        this.seDamage = template?.config?.seDamage ?? 2;
        this.seItemGet = template?.config?.seItemGet ?? 3;
        this.seEnemyDefeat = template?.config?.seEnemyDefeat ?? 4;

        // 喜びジャンプ（クリア演出用）
        this.joyJumpActive = false;
        this.joyJumpStartY = 0;
    }

    // SE再生ヘルパー（設定がOFFの場合は鳴らさない）
    playSE(seKey) {
        if (typeof NesAudio === 'undefined') return;

        const sounds = App.projectData?.sounds || [];
        let seIndex = -1;

        switch (seKey) {
            case 'jump': seIndex = this.seJump; break;
            case 'attack': seIndex = this.seAttack; break;
            case 'damage': seIndex = this.seDamage; break;
            case 'itemGet': seIndex = this.seItemGet; break;
            case 'enemyDefeat': seIndex = this.seEnemyDefeat; break;
        }

        if (seIndex >= 0 && seIndex < sounds.length) {
            const se = sounds[seIndex];
            NesAudio.playSE(se.type);
        }
    }

    update(engine) {
        if (this.isDead) {
            // 敵と同じ落下演出
            if (this.isDying) {
                this.deathTimer++;
                this.vy += 0.02; // 敵と同じ重力
                this.y += this.vy;
                this.x += this.vx; // 横方向の動きも
            }
            return;
        }

        // 無敵時間更新
        if (this.invincible) {
            this.invincibleTimer--;
            if (this.invincibleTimer <= 0) {
                this.invincible = false;
                // 無敵終了時にvxをリセット（ノックバック停止）
                if (!this.starPower) {
                    this.vx = 0;
                }
            }
        }

        // スター無敵更新
        if (this.starPower) {
            this.starTimer--;
            if (this.starTimer <= 0) {
                this.starPower = false;
                // ステージBGMに戻す
                if (typeof GameEngine !== 'undefined') {
                    GameEngine.playBgm('stage');
                }
            }
        }

        // 攻撃クールダウン
        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        }

        // 攻撃中タイマー
        if (this.isAttacking) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }

        this.handleInput(engine);

        // 重力
        this.vy += this.gravity;
        if (this.vy > this.maxFallSpeed) {
            this.vy = this.maxFallSpeed;
        }

        // 移動と衝突
        this.x += this.vx;
        this.handleHorizontalCollision(engine);
        this.y += this.vy;
        this.handleVerticalCollision(engine);

        // 画面外落下で即死（パーティクルなし）
        const stageHeight = App.projectData.stage?.height || 16;
        if (this.y > stageHeight + 1) {
            this.isDead = true;
            this.deathParticles = []; // パーティクルなし
            return;
        }

        // 状態決定
        this.updateState();

        // アニメーション
        this.updateAnimation();
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

    updateAnimation() {
        this.animTimer++;
        const spriteSlot = this.getSpriteSlot();
        const speed = this.template?.sprites?.[spriteSlot]?.speed || 5;
        // スプライトエディターと同等のタイミング（speed = 秒間フレーム数）
        const interval = Math.floor(60 / speed);
        if (this.animTimer >= interval) {
            this.animTimer = 0;
            const frames = this.template?.sprites?.[spriteSlot]?.frames || [];
            if (frames.length > 0) {
                this.animFrame = (this.animFrame + 1) % frames.length;
            }
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

    handleInput(engine) {
        // ノックバック中のみ操作をスキップ（着地後は即操作可能）
        if (this.isKnockback) {
            return;
        }

        this.vx = 0;

        if (GameController.isPressed('left')) {
            this.vx = -this.moveSpeed;
            this.facingRight = false;
        }
        if (GameController.isPressed('right')) {
            this.vx = this.moveSpeed;
            this.facingRight = true;
        }

        // ジャンプ処理
        if (GameController.isPressed('a')) {
            if (this.onGround) {
                // 通常ジャンプ
                this.vy = this.jumpPower;
                this.onGround = false;
                this.hasDoubleJumped = false;
                this.canDoubleJump = this.wJumpEnabled;
                // SE再生
                this.playSE('jump');
            } else if (this.wJumpEnabled && this.canDoubleJump && !this.hasDoubleJumped && !this._jumpKeyWasPressed) {
                // 2段ジャンプ
                this.vy = this.jumpPower;
                this.hasDoubleJumped = true;
                this.canDoubleJump = false;
                // SE再生
                this.playSE('jump');
            }
        }
        this._jumpKeyWasPressed = GameController.isPressed('a');

        // Bキー攻撃
        if (GameController.isPressed('b') && this.shotMaxRange > 0 && this.attackCooldown <= 0) {
            this.attack(engine);
        }
    }

    attack(engine) {
        this.isAttacking = true;
        this.attackTimer = 15;
        this.attackCooldown = 30;
        this.animFrame = 0;

        // SE再生
        this.playSE('attack');

        // SHOTプロジェクタイル発射
        const shotSprite = this.template?.sprites?.shot?.frames?.[0];
        if (shotSprite !== undefined) {
            const direction = this.facingRight ? 1 : -1;
            engine.projectiles.push({
                x: this.x + (this.facingRight ? this.width : -0.2),
                y: this.y + this.height / 2 - 0.25,
                vx: 0.15 * direction,
                vy: 0,
                width: 0.5,
                height: 0.5,
                spriteIdx: shotSprite,
                templateIdx: this.templateIdx, // アニメーション用
                animationSlot: 'shot', // 使用するスロットを指定
                owner: 'player',
                maxRange: this.shotMaxRange,
                startX: this.x,
                facingRight: this.facingRight
            });
        }
    }

    takeDamage(fromRight) {
        if (this.invincible || this.isDead || this.starPower) return;

        this.lives--;

        // SE再生
        this.playSE('damage');

        if (this.lives <= 0) {
            this.die();
        } else {
            this.invincible = true;
            this.invincibleTimer = this.invincibleDuration;
            this.isKnockback = true; // ノックバック開始
            this.vy = -0.25; // 強く
            // 向いている方向の逆に飛ばされる
            this.vx = this.facingRight ? -0.12 : 0.12; // 強く
            this.onGround = false;
        }
    }

    collectItem(itemType) {
        switch (itemType) {
            case 'star':
                this.starPower = true;
                this.starTimer = this.starDuration;
                this.invincible = true;
                this.invincibleTimer = this.starDuration;
                // 無敵BGM再生
                if (typeof GameEngine !== 'undefined') {
                    GameEngine.playBgm('invincible');
                }
                // SE再生
                this.playSE('itemGet');
                break;
            case 'lifeup':
                if (this.lives < this.maxLives) {
                    this.lives++;
                }
                // SE再生
                this.playSE('itemGet');
                break;
            case 'clear':
                // クリアアイテム取得
                this.playSE('itemGet');
                // クリア条件がitemの場合、カウントして全取得でクリア
                if (App.projectData.stage.clearCondition === 'item') {
                    if (typeof GameEngine !== 'undefined') {
                        GameEngine.collectedClearItems++;
                        // 全てのクリアアイテムを取得したらクリア
                        if (GameEngine.collectedClearItems >= GameEngine.totalClearItems) {
                            GameEngine.triggerClear();
                        }
                    }
                }
                break;
        }
    }

    die() {
        this.isDead = true;
        this.isDying = true;
        this.deathTimer = 0;
        // 敵と同じ落下死亡演出
        this.vy = -0.3; // 敵と同じ
        this.vx = this.facingRight ? -0.1 : 0.1; // 向きの逆方向
        this.deathParticles = []; // パーティクルは使わない

        // ゲームオーバー待機開始（gameLoopで処理される）
        if (typeof GameEngine !== 'undefined' && !GameEngine.gameOverPending) {
            GameEngine.gameOverPending = true;
            GameEngine.gameOverWaitTimer = 60; // 約1秒待機
        }
    }

    createDeathParticles() {
        this.deathParticles = [];
        const frames = this.template?.sprites?.idle?.frames || [];
        const spriteIdx = frames[0];
        const sprite = App.projectData.sprites[spriteIdx];
        if (!sprite) return;

        const palette = App.nesPalette;
        for (let py = 0; py < 16; py += 4) {
            for (let px = 0; px < 16; px += 4) {
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
                        vx: (Math.random() - 0.5) * 0.1,
                        vy: -Math.random() * 0.15 - 0.05,
                        color: color,
                        size: 4,
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
            p.vy += 0.01;
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
                // 着地でノックバック終了
                if (this.isKnockback) {
                    this.isKnockback = false;
                    this.vx = 0;
                }
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
        // 死亡中も落下するスプライトを表示
        if (this.isDead && this.isDying) {
            // 落下演出中はスプライトを表示
            const screenX = (this.x - camera.x) * tileSize;
            const screenY = (this.y - camera.y) * tileSize;
            const frames = this.template?.sprites?.idle?.frames || [];
            const spriteIdx = frames[0];
            const sprite = App.projectData.sprites[spriteIdx];
            if (sprite) {
                const palette = App.nesPalette;
                // スプライトサイズを判定
                const spriteSize = sprite.size || 1;
                const dimension = spriteSize === 2 ? 32 : 16;
                const tileCount = spriteSize === 2 ? 2 : 1;
                const renderSize = tileSize * tileCount;
                const pixelSize = renderSize / dimension;
                const flipX = !this.facingRight;

                for (let y = 0; y < dimension; y++) {
                    for (let x = 0; x < dimension; x++) {
                        const colorIndex = sprite.data[y]?.[x];
                        if (colorIndex >= 0) {
                            ctx.fillStyle = palette[colorIndex];
                            const drawX = flipX ? screenX + (dimension - 1 - x) * pixelSize : screenX + x * pixelSize;
                            ctx.fillRect(drawX, screenY + y * pixelSize, pixelSize + 0.5, pixelSize + 0.5);
                        }
                    }
                }
            }
            return;
        } else if (this.isDead) {
            this.renderDeathParticles(ctx, tileSize, camera);
            return;
        }

        if (!this.template) return;

        // 無敵中は点滅
        if (this.invincible && !this.starPower && Math.floor(this.invincibleTimer / 4) % 2 === 0) {
            return;
        }

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

            // スターパワー中は虹色
            if (this.starPower) {
                ctx.globalAlpha = 0.8;
            } else if (this.invincible) {
                ctx.globalAlpha = 0.5;
            }

            // 左向きの場合は反転描画
            const flipX = !this.facingRight;

            for (let y = 0; y < dimension; y++) {
                for (let x = 0; x < dimension; x++) {
                    const colorIndex = sprite.data[y]?.[x];
                    if (colorIndex >= 0) {
                        let color = palette[colorIndex];
                        // スターパワー中はファミコン風パレットサイクリング
                        if (this.starPower) {
                            // 4色パターンを1フレームごとに切り替え（高速、明るい色）
                            const starColors = ['#FF6B6B', '#FFFF6B', '#6BFF6B', '#6BFFFF'];
                            const colorPhase = Math.floor(this.starTimer) % 4;
                            color = starColors[colorPhase];
                        }
                        ctx.fillStyle = color;
                        const drawX = flipX ? screenX + (dimension - 1 - x) * pixelSize : screenX + x * pixelSize;
                        ctx.fillRect(drawX, screenY + y * pixelSize, pixelSize + 0.5, pixelSize + 0.5);
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

    // 喜びジャンプ開始（クリア演出用）
    startJoyJump() {
        this.joyJumpActive = true;
        this.joyJumpStartY = this.y;
        this.vy = this.jumpPower * 0.6; // 低めのジャンプ
        this.facingRight = true; // 正面向き（右向き）
        this.vx = 0; // 移動停止
        this.state = 'jump';
    }

    // 喜びジャンプ更新（重力のみ、衝突なし）
    updateJoyJump() {
        if (!this.joyJumpActive) return;

        // 重力
        this.vy += this.gravity;
        if (this.vy > this.maxFallSpeed) {
            this.vy = this.maxFallSpeed;
        }

        this.y += this.vy;

        // 開始位置まで落ちたら再ジャンプ（ループ）
        if (this.y >= this.joyJumpStartY && this.vy > 0) {
            this.y = this.joyJumpStartY;
            this.vy = this.jumpPower * 0.6;
        }

        // アニメーション
        this.animTimer++;
        const interval = 6;
        if (this.animTimer >= interval) {
            this.animTimer = 0;
            const frames = this.template?.sprites?.jump?.frames || this.template?.sprites?.idle?.frames || [];
            if (frames.length > 0) {
                this.animFrame = (this.animFrame + 1) % frames.length;
            }
        }
    }
}
