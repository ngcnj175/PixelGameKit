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

        // 当たり判定サイズ（スプライトサイズに応じて変更）
        // 32x32スプライトは1.6x1.6、16x16は0.8x0.8
        const idleSpriteIdx = template?.sprites?.idle?.frames?.[0];
        const sprite = App.projectData?.sprites?.[idleSpriteIdx];
        const spriteSize = sprite?.size || 1;
        this.width = spriteSize === 2 ? 1.6 : 0.8;
        this.height = spriteSize === 2 ? 1.6 : 0.8;

        this.behavior = behavior;
        this.facingRight = false; // 敵はデフォルトで左向き（プレイヤーと向き合う）
        this.onGround = false;
        this.moveSpeed = 0.05;

        this.template = template;
        this.templateIdx = templateIdx;
        this.animFrame = 0;
        this.animTimer = 0;

        // 物理パラメータ（config値を反映）
        const speedConfig = template?.config?.speed ?? 5;
        this.moveSpeed = 0.03 + (speedConfig / 10) * 0.05; // 敵は少し遅め
        this.gravity = 0.02;
        this.maxFallSpeed = 0.4;

        this.lives = template?.config?.life || 1;
        this.isDying = false;
        this.deathTimer = 0;
        this.damageFlashTimer = 0; // ダメージ時の白点滅

        // 空中モード
        this.isAerial = template?.config?.isAerial || false;

        // 状態
        this.state = 'idle';
        this.isAttacking = false;
        this.attackTimer = 0;

        // 追いかけ状態
        this.isChasing = false;
        this.detectionRange = 6; // 検知距離（6タイル）

        // 空中上下移動用
        this.floatDirection = 1; // 1=下, -1=上
        this.floatTimer = 0;
        this.diveTimer = 0; // うろぴょん空中版用
        this.isDiving = false;
        this.isReturning = false;

        // とっしん用状態
        this.rushPhase = 'idle'; // 'idle', 'back', 'rush', 'return'
        this.rushStartX = tileX;
        this.rushStartY = tileY;

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
            // 死亡点滅フェーズ
            if (this.deathFlashPhase) {
                if (this.damageFlashTimer > 0) {
                    this.damageFlashTimer--;
                    return false; // まだ点滅中
                }
                // 点滅終了→落下開始
                this.deathFlashPhase = false;
                this.vy = -0.3;
                this.vx = this.deathFromRight ? -0.1 : 0.1;
                this.onGround = false;
            }
            // 落下演出
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

        // ダメージ点滅タイマー
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer--;
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
                // ジャンプで移動（歩かない、4タイル範囲）
                const jpMaxRange = 4;
                const jpDistX = this.x - this.originX;

                // 範囲制限
                if (this.facingRight && jpDistX >= jpMaxRange) {
                    this.facingRight = false;
                } else if (!this.facingRight && jpDistX <= -jpMaxRange) {
                    this.facingRight = true;
                }

                // ジャンプ中のみ移動、接地時は静止
                if (this.onGround) {
                    this.vx = 0;
                    if (Math.random() < 0.02) {
                        this.vy = -0.3;
                        this.vx = this.facingRight ? this.moveSpeed * 2 : -this.moveSpeed * 2;
                        this.onGround = false;
                    }
                }
                break;
            case 'chase':
                // 追いかけてくる（定期的にジャンプ）
                this.chaseWithReturn(engine);
                if (this.isChasing && this.onGround && Math.random() < 0.02) {
                    this.vy = -0.3;
                    this.onGround = false;
                }
                break;
            case 'rush':
                // とっしん（地上）
                this.rushGround(engine);
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
                // 空中で左右移動（4タイル） + 定期落下（6タイル、4倍速） + 元に戻る（通常速度）
                const horzMaxRange = 4;
                const diveMaxRange = 6;
                const normalSpeed = this.moveSpeed;
                const diveSpeed = this.moveSpeed * 4;

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
                    // 落下フェーズ（6タイルまで or 床、4倍速）
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
            case 'rush':
                // とっしん（空中）
                this.rushAerial(engine);
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

    // とっしん（地上）
    rushGround(engine) {
        const backSpeed = this.moveSpeed * 0.5; // ゆっくり後退
        const rushSpeed = this.moveSpeed * 4;   // 4倍の速さ
        const rushMaxDist = 4;                  // 4タイル

        // プレイヤー方向を見る
        if (engine.player && this.rushPhase === 'idle') {
            this.facingRight = engine.player.x > this.x;
        }

        switch (this.rushPhase) {
            case 'idle':
                // 開始：後退フェーズへ
                this.rushStartX = this.x;
                this.rushPhase = 'back';
                break;
            case 'back':
                // 1タイル分ゆっくり後退
                const backDir = this.facingRight ? -1 : 1;
                const backDist = Math.abs(this.x - this.rushStartX);
                if (backDist < 1) {
                    this.vx = backDir * backSpeed;
                } else {
                    this.vx = 0;
                    this.rushStartX = this.x;
                    this.rushPhase = 'rush';
                }
                break;
            case 'rush':
                // 前方へ突進
                const rushDir = this.facingRight ? 1 : -1;
                const rushDist = Math.abs(this.x - this.rushStartX);
                const wallCheck = this.facingRight ? Math.floor(this.x + this.width + 0.1) : Math.floor(this.x - 0.1);
                if (rushDist < rushMaxDist && engine.getCollision(wallCheck, Math.floor(this.y + this.height / 2)) !== 1) {
                    this.vx = rushDir * rushSpeed;
                } else {
                    this.vx = 0;
                    this.rushPhase = 'return';
                }
                break;
            case 'return':
                // 元の位置へ戻る（後ずさり：向きは変えない）
                const dxReturn = this.originX - this.x;
                if (Math.abs(dxReturn) > 0.2) {
                    // 向きを変えずに戻る（後ずさり）
                    this.vx = dxReturn > 0 ? this.moveSpeed : -this.moveSpeed;
                } else {
                    this.x = this.originX;
                    this.vx = 0;
                    this.rushPhase = 'idle';
                }
                break;
        }
    }

    // とっしん（空中）
    rushAerial(engine) {
        const backSpeed = this.moveSpeed * 0.5;
        const rushSpeed = this.moveSpeed * 4;
        const rushMaxDist = 4;

        // プレイヤー方向を見る
        if (engine.player && this.rushPhase === 'idle') {
            this.facingRight = engine.player.x > this.x;
        }

        switch (this.rushPhase) {
            case 'idle':
                this.rushStartX = this.x;
                this.rushPhase = 'back';
                this.vy = 0;
                break;
            case 'back':
                const backDir = this.facingRight ? -1 : 1;
                const backDist = Math.abs(this.x - this.rushStartX);
                if (backDist < 1) {
                    this.vx = backDir * backSpeed;
                    this.vy = 0;
                } else {
                    this.vx = 0;
                    this.rushStartX = this.x;
                    this.rushPhase = 'rush';
                }
                break;
            case 'rush':
                const rushDir = this.facingRight ? 1 : -1;
                const rushDist = Math.abs(this.x - this.rushStartX);
                const wallCheck = this.facingRight ? Math.floor(this.x + this.width + 0.1) : Math.floor(this.x - 0.1);
                if (rushDist < rushMaxDist && engine.getCollision(wallCheck, Math.floor(this.y + this.height / 2)) !== 1) {
                    this.vx = rushDir * rushSpeed;
                    this.vy = 0;
                } else {
                    this.vx = 0;
                    this.rushPhase = 'return';
                }
                break;
            case 'return':
                // 元の位置へ戻る（後ずさり：向きは変えない）
                const dxReturn = this.originX - this.x;
                const dyReturn = this.originY - this.y;
                if (Math.abs(dxReturn) > 0.2) {
                    // 向きを変えずに戻る（後ずさり）
                    this.vx = dxReturn > 0 ? this.moveSpeed : -this.moveSpeed;
                } else {
                    this.vx = 0;
                }
                if (Math.abs(dyReturn) > 0.2) {
                    this.vy = dyReturn > 0 ? this.moveSpeed : -this.moveSpeed;
                } else {
                    this.vy = 0;
                }
                if (Math.abs(dxReturn) < 0.2 && Math.abs(dyReturn) < 0.2) {
                    this.x = this.originX;
                    this.y = this.originY;
                    this.rushPhase = 'idle';
                }
                break;
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

        const shotType = this.template?.config?.shotType || 'straight';
        const direction = this.facingRight ? 1 : -1;
        const baseSpeed = 0.15;
        const startX = this.x + (this.facingRight ? this.width : -0.2);
        const startY = this.y + this.height / 2 - 0.25;

        if (shotType === 'spread') {
            // 拡散: 4方向発射
            const isPlus = (engine.enemySpreadCounter || 0) % 2 === 0;
            engine.enemySpreadCounter = (engine.enemySpreadCounter || 0) + 1;
            const angles = isPlus ? [0, 90, 180, 270] : [45, 135, 225, 315];
            angles.forEach(angle => {
                const rad = angle * Math.PI / 180;
                engine.projectiles.push({
                    x: startX, y: startY,
                    vx: Math.cos(rad) * baseSpeed,
                    vy: Math.sin(rad) * baseSpeed,
                    width: 0.5, height: 0.5,
                    spriteIdx: shotSprite,
                    templateIdx: this.templateIdx,
                    animationSlot: 'shot',
                    owner: 'enemy',
                    maxRange: this.shotMaxRange,
                    startX: startX, startY: startY,
                    facingRight: this.facingRight,
                    shotType: shotType,
                    bounceCount: 0
                });
            });
        } else if (shotType === 'drop') {
            // 鳥のフン: 真下に落ちる
            engine.projectiles.push({
                x: this.x + this.width / 2 - 0.25, y: this.y + this.height,
                vx: 0, vy: baseSpeed,
                width: 0.5, height: 0.5,
                spriteIdx: shotSprite,
                templateIdx: this.templateIdx,
                animationSlot: 'shot',
                owner: 'enemy',
                maxRange: this.shotMaxRange,
                startX: this.x, startY: this.y,
                facingRight: this.facingRight,
                shotType: shotType,
                bounceCount: 0
            });
        } else if (shotType === 'melee') {
            // 近接: 目の前に1タイル表示
            engine.projectiles.push({
                x: this.x + (this.facingRight ? 1 : -1),
                y: this.y,
                vx: 0, vy: 0,
                width: 1, height: 1,
                spriteIdx: shotSprite,
                templateIdx: this.templateIdx,
                animationSlot: 'shot',
                owner: 'enemy',
                maxRange: 999,
                startX: this.x, startY: this.y,
                facingRight: this.facingRight,
                shotType: shotType,
                duration: 15,
                bounceCount: 0
            });
        } else if (shotType === 'pinball') {
            // ピンポン: 斜め45度発射
            const angle = this.facingRight ? -45 : -135;
            const rad = angle * Math.PI / 180;
            engine.projectiles.push({
                x: startX, y: startY,
                vx: Math.cos(rad) * baseSpeed,
                vy: Math.sin(rad) * baseSpeed,
                width: 0.5, height: 0.5,
                spriteIdx: shotSprite,
                templateIdx: this.templateIdx,
                animationSlot: 'shot',
                owner: 'enemy',
                maxRange: this.shotMaxRange,
                startX: startX, startY: startY,
                facingRight: this.facingRight,
                shotType: shotType,
                bounceCount: 0
            });
        } else {
            // その他: 通常発射
            engine.projectiles.push({
                x: startX, y: startY,
                vx: baseSpeed * direction,
                vy: shotType === 'arc' ? -0.1 : 0,
                width: 0.5, height: 0.5,
                spriteIdx: shotSprite,
                templateIdx: this.templateIdx,
                animationSlot: 'shot',
                owner: 'enemy',
                maxRange: this.shotMaxRange,
                startX: startX, startY: startY,
                facingRight: this.facingRight,
                shotType: shotType,
                returning: false,
                bounceCount: 0
            });
        }
    }

    takeDamage(fromRight) {
        this.lives--;
        this.damageFlashTimer = 10; // 白点滅（10フレーム）
        if (this.lives <= 0) {
            this.die(fromRight);
        }
    }

    die(fromRight) {
        this.isDying = true;
        this.frozen = false; // 死亡時は休眠解除（描画されるように）
        this.damageFlashTimer = 10; // 死亡時も白点滅
        this.deathFlashPhase = true; // 点滅中は落下しない
        this.deathFromRight = fromRight;
        // ドロップアイテム用に死亡時の位置を記録
        this.deathX = this.x;
        this.deathY = this.y;
        this.vy = 0;
        this.vx = 0;
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

            // 32x32スプライトの描画オフセット調整
            // 衝突判定は高さ1.6（底面はY+1.6）
            // 描画は高さ2.0（底面はY+オフセット+2.0）
            // 底面を合わせるため: オフセット = 1.6 - 2.0 = -0.4
            const yOffset = spriteSize === 2 ? -0.4 * tileSize : 0;
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
                        // ダメージ点滅中は白色
                        if (this.damageFlashTimer > 0 && this.damageFlashTimer % 2 === 0) {
                            ctx.fillStyle = '#FFFFFF';
                        } else {
                            ctx.fillStyle = palette[colorIndex];
                        }
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
