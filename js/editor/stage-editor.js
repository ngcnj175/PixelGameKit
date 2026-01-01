/**
 * PixelGameKit - ステージエディタ v4（詳細設定パネル対応）
 */

const StageEditor = {
    canvas: null,
    ctx: null,
    tileSize: 20,

    // 状態
    currentTool: 'pen',
    currentLayer: 'bg',
    selectedTemplate: null,
    templates: [],

    // 設定パネル
    isConfigOpen: false,
    editingTemplate: null,
    editingIndex: -1, // -1:新規, 0以上:編集
    draggedSpriteIndex: null,

    init() {
        this.canvas = document.getElementById('stage-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }

        this.initTools();
        this.initLayerToggle();
        this.initConfigPanel();
        this.initTemplateList();
        this.initCanvasEvents();
        this.initTypeSelectPopup();
        this.resize();
    },

    refresh() {
        this.initTemplateList();
        this.resize();
        this.render();
    },

    // ========== ツールバー ==========
    initTools() {
        document.querySelectorAll('.stage-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                if (tool === 'undo') return;

                this.currentTool = tool;
                document.querySelectorAll('.stage-tool-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
            });
        });
    },

    // ========== レイヤー切替（BG/FGテキスト） ==========
    initLayerToggle() {
        document.querySelectorAll('#layer-toggle .layer-label').forEach(label => {
            label.addEventListener('click', () => {
                this.currentLayer = label.dataset.layer;
                document.querySelectorAll('#layer-toggle .layer-label').forEach(l => {
                    l.classList.toggle('active', l === label);
                });
                this.render();
            });
        });
    },

    // ========== スプライトギャラリー（ドラッグ元） ==========
    initSpriteGallery() {
        const container = document.getElementById('stage-sprite-list');
        if (!container) return;

        container.innerHTML = '';

        App.projectData.sprites.forEach((sprite, index) => {
            const div = document.createElement('div');
            div.className = 'stage-sprite-item';
            div.draggable = true;

            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 16;
            miniCanvas.height = 16;
            this.renderSpriteToMiniCanvas(sprite, miniCanvas);
            div.style.backgroundImage = `url(${miniCanvas.toDataURL()})`;
            div.style.backgroundSize = 'cover';

            div.addEventListener('dragstart', (e) => {
                this.draggedSpriteIndex = index;
                div.classList.add('dragging');
                e.dataTransfer.setData('text/plain', index.toString());
            });

            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
            });

            container.appendChild(div);
        });
    },

    // ========== 属性選択ポップアップ ==========
    initTypeSelectPopup() {
        const popup = document.getElementById('type-select-popup');
        const addBtn = document.getElementById('add-tile-btn');
        const cancelBtn = popup?.querySelector('.popup-cancel');

        if (addBtn) {
            addBtn.addEventListener('click', () => {
                popup?.classList.remove('hidden');
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                popup?.classList.add('hidden');
            });
        }

        document.querySelectorAll('.type-select-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                popup?.classList.add('hidden');
                this.createNewTemplate(type);
            });
        });

        popup?.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.classList.add('hidden');
            }
        });
    },

    createNewTemplate(type) {
        this.editingTemplate = {
            type: type,
            sprites: {}, // { idle: [idx], walk: [idx, idx], ... }
            life: type === 'player' ? 3 : (type === 'enemy' ? 1 : -1),
            shotRange: 1,
            sounds: {}
        };
        this.editingIndex = -1;
        this.openConfigPanel();
    },

    // ========== 設定パネル ==========
    initConfigPanel() {
        const closeBtn = document.getElementById('config-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeConfigPanel());
        }
    },

    openConfigPanel() {
        const panel = document.getElementById('tile-config-panel');
        const title = document.getElementById('config-panel-title');

        if (panel && this.editingTemplate) {
            panel.classList.remove('hidden');
            this.isConfigOpen = true;

            const typeNames = {
                player: 'プレイヤー設定',
                enemy: '敵設定',
                material: '素材設定',
                item: 'アイテム設定',
                goal: 'ゴール設定'
            };
            title.textContent = typeNames[this.editingTemplate.type] || 'タイル設定';

            this.renderConfigContent();
        }
    },

    closeConfigPanel() {
        const panel = document.getElementById('tile-config-panel');
        if (panel) {
            panel.classList.add('hidden');
            this.isConfigOpen = false;
            this.editingTemplate = null;
            this.editingIndex = -1;
        }
    },

    renderConfigContent() {
        const container = document.getElementById('config-panel-content');
        if (!container || !this.editingTemplate) return;

        const type = this.editingTemplate.type;
        let html = '';

        if (type === 'player') {
            html = this.renderPlayerConfig();
        } else if (type === 'enemy') {
            html = this.renderEnemyConfig();
        } else if (type === 'material') {
            html = this.renderMaterialConfig();
        } else if (type === 'item') {
            html = this.renderItemConfig();
        } else if (type === 'goal') {
            html = this.renderGoalConfig();
        }

        html += `<button class="config-save-btn" id="config-save-btn">登録</button>`;

        container.innerHTML = html;
        this.initConfigEvents();
    },

    renderPlayerConfig() {
        return `
            <div class="config-section">
                <div class="config-section-title">スプライト登録</div>
                ${this.renderSpriteRow('IDLE', 'idle')}
                ${this.renderSpriteRow('WALK', 'walk')}
                ${this.renderSpriteRow('JUMP', 'jump')}
                ${this.renderSpriteRow('ATTACK', 'attack')}
                ${this.renderSpriteRow('LIFE', 'life')}
                ${this.renderSpriteRow('SHOT', 'shot')}
            </div>
            <div class="config-section">
                <div class="config-section-title">ライフ設定</div>
                ${this.renderNumSetting('ライフ数', 'life', this.editingTemplate.life, 1, 10, true)}
            </div>
            <div class="config-section">
                <div class="config-section-title">SHOT飛距離</div>
                ${this.renderNumSetting('飛距離', 'shotRange', this.editingTemplate.shotRange, 1, 16)}
            </div>
            <div class="config-section">
                <div class="config-section-title">効果音</div>
                ${this.renderSoundRow('ジャンプ', 'jump')}
                ${this.renderSoundRow('攻撃', 'attack')}
                ${this.renderSoundRow('ダメージ', 'damage')}
                ${this.renderSoundRow('デス', 'death')}
            </div>
        `;
    },

    renderEnemyConfig() {
        return `
            <div class="config-section">
                <div class="config-section-title">スプライト登録</div>
                ${this.renderSpriteRow('IDLE', 'idle')}
                ${this.renderSpriteRow('WALK', 'walk')}
                ${this.renderSpriteRow('JUMP', 'jump')}
                ${this.renderSpriteRow('ATTACK', 'attack')}
            </div>
            <div class="config-section">
                <div class="config-section-title">設定</div>
                ${this.renderNumSetting('ライフ数', 'life', this.editingTemplate.life, 1, 10, true)}
            </div>
            <div class="config-section">
                <div class="config-section-title">効果音</div>
                ${this.renderSoundRow('ジャンプ', 'jump')}
                ${this.renderSoundRow('攻撃', 'attack')}
                ${this.renderSoundRow('ダメージ', 'damage')}
                ${this.renderSoundRow('デス', 'death')}
            </div>
        `;
    },

    renderMaterialConfig() {
        return `
            <div class="config-section">
                <div class="config-section-title">スプライト登録</div>
                ${this.renderSpriteRow('メイン', 'main')}
            </div>
            <div class="config-section">
                <div class="config-section-title">設定</div>
                <div class="num-setting">
                    <span class="num-setting-label active">当たり判定</span>
                    <label><input type="checkbox" id="config-collision" checked> ON</label>
                </div>
            </div>
        `;
    },

    renderItemConfig() {
        return `
            <div class="config-section">
                <div class="config-section-title">スプライト登録</div>
                ${this.renderSpriteRow('メイン', 'main')}
            </div>
            <div class="config-section">
                <div class="config-section-title">効果</div>
                <div class="num-setting">
                    <select id="config-effect">
                        <option value="lifeup">ライフアップ</option>
                        <option value="invincible">無敵</option>
                        <option value="weapon">武器取得</option>
                    </select>
                </div>
            </div>
        `;
    },

    renderGoalConfig() {
        return `
            <div class="config-section">
                <div class="config-section-title">スプライト登録</div>
                ${this.renderSpriteRow('メイン', 'main')}
            </div>
        `;
    },

    renderSpriteRow(label, slot) {
        const sprites = this.editingTemplate.sprites[slot] || [];
        const hasSprite = sprites.length > 0;

        return `
            <div class="sprite-reg-row">
                <span class="sprite-reg-label ${hasSprite ? 'active' : ''}">${label}</span>
                <div class="sprite-reg-slots" data-slot="${slot}">
                    ${sprites.map((idx, i) => `
                        <div class="sprite-slot has-sprite" data-index="${i}">
                            <canvas width="16" height="16" data-sprite="${idx}"></canvas>
                        </div>
                    `).join('')}
                    <div class="sprite-slot" data-index="${sprites.length}"></div>
                </div>
                <button class="sprite-add-btn" data-slot="${slot}">+</button>
            </div>
        `;
    },

    renderNumSetting(label, key, value, min, max, hasInfinite = false) {
        const isInfinite = value === -1;
        const displayValue = isInfinite ? '∞' : value;

        return `
            <div class="num-setting" data-key="${key}" data-min="${min}" data-max="${max}" data-infinite="${hasInfinite}">
                <span class="num-setting-label active">${label}</span>
                <div class="num-control">
                    <button class="num-btn" data-action="dec">-</button>
                    <span class="num-value" data-value="${value}">${displayValue}</span>
                    <button class="num-btn" data-action="inc">+</button>
                </div>
            </div>
        `;
    },

    renderSoundRow(label, slot) {
        return `
            <div class="sound-reg-row">
                <span class="sound-reg-label">${label}</span>
                <div class="sound-slot" data-slot="${slot}">♪</div>
            </div>
        `;
    },

    initConfigEvents() {
        // スプライトスロットにドロップ対応
        document.querySelectorAll('.sprite-slot').forEach(slot => {
            slot.addEventListener('dragover', (e) => e.preventDefault());
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                const spriteIndex = parseInt(e.dataTransfer.getData('text/plain'));
                if (!isNaN(spriteIndex)) {
                    const slotsContainer = slot.closest('.sprite-reg-slots');
                    const slotKey = slotsContainer?.dataset.slot;
                    const slotIndex = parseInt(slot.dataset.index);

                    if (slotKey && this.editingTemplate) {
                        if (!this.editingTemplate.sprites[slotKey]) {
                            this.editingTemplate.sprites[slotKey] = [];
                        }
                        this.editingTemplate.sprites[slotKey][slotIndex] = spriteIndex;
                        this.renderConfigContent();
                    }
                }
            });
        });

        // スプライトをキャンバスに描画
        document.querySelectorAll('.sprite-slot canvas').forEach(canvas => {
            const spriteIdx = parseInt(canvas.dataset.sprite);
            if (!isNaN(spriteIdx) && App.projectData.sprites[spriteIdx]) {
                this.renderSpriteToMiniCanvas(App.projectData.sprites[spriteIdx], canvas);
            }
        });

        // 追加ボタン
        document.querySelectorAll('.sprite-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const slotKey = btn.dataset.slot;
                if (slotKey && this.editingTemplate) {
                    if (!this.editingTemplate.sprites[slotKey]) {
                        this.editingTemplate.sprites[slotKey] = [];
                    }
                    // 空スロットを追加
                    this.renderConfigContent();
                }
            });
        });

        // 数値設定
        document.querySelectorAll('.num-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const container = btn.closest('.num-setting');
                const key = container.dataset.key;
                const min = parseInt(container.dataset.min);
                const max = parseInt(container.dataset.max);
                const hasInfinite = container.dataset.infinite === 'true';
                const valueSpan = container.querySelector('.num-value');
                let value = parseInt(valueSpan.dataset.value);

                if (btn.dataset.action === 'inc') {
                    if (value === -1) value = 1;
                    else if (value >= max && hasInfinite) value = -1;
                    else if (value < max) value++;
                } else {
                    if (value === -1) value = max;
                    else if (value <= min && hasInfinite) value = -1;
                    else if (value > min) value--;
                }

                valueSpan.dataset.value = value;
                valueSpan.textContent = value === -1 ? '∞' : value;

                if (this.editingTemplate) {
                    this.editingTemplate[key] = value;
                }
            });
        });

        // 登録ボタン
        const saveBtn = document.getElementById('config-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveTemplate());
        }
    },

    saveTemplate() {
        if (!this.editingTemplate) return;

        // IDLEまたはメインスプライトが必須
        const hasMainSprite =
            (this.editingTemplate.sprites.idle && this.editingTemplate.sprites.idle.length > 0) ||
            (this.editingTemplate.sprites.main && this.editingTemplate.sprites.main.length > 0);

        if (!hasMainSprite) {
            alert('スプライトを登録してください');
            return;
        }

        if (!App.projectData.templates) {
            App.projectData.templates = [];
        }

        if (this.editingIndex >= 0) {
            App.projectData.templates[this.editingIndex] = this.editingTemplate;
        } else {
            App.projectData.templates.push(this.editingTemplate);
            this.selectedTemplate = App.projectData.templates.length - 1;
        }

        this.closeConfigPanel();
        this.initTemplateList();
    },

    // ========== タイルテンプレート一覧 ==========
    initTemplateList() {
        const container = document.getElementById('tile-list');
        if (!container) return;

        container.innerHTML = '';

        if (!App.projectData.templates) {
            App.projectData.templates = [];
        }
        this.templates = App.projectData.templates;

        const typeIcons = {
            player: '🎮',
            enemy: '👾',
            material: '🧱',
            item: '⭐',
            goal: '🚩'
        };

        this.templates.forEach((template, index) => {
            const div = document.createElement('div');
            div.className = 'tile-item' + (this.selectedTemplate === index ? ' selected' : '');

            // サムネイル（IDLEまたはメイン）
            const spriteIdx = template.sprites.idle?.[0] ?? template.sprites.main?.[0];
            if (spriteIdx !== undefined && App.projectData.sprites[spriteIdx]) {
                const miniCanvas = document.createElement('canvas');
                miniCanvas.width = 16;
                miniCanvas.height = 16;
                this.renderSpriteToMiniCanvas(App.projectData.sprites[spriteIdx], miniCanvas);
                div.appendChild(miniCanvas);
            }

            // 種別バッジ
            const badge = document.createElement('span');
            badge.className = 'type-badge';
            badge.textContent = typeIcons[template.type] || '?';
            div.appendChild(badge);

            // タップで選択＆設定表示
            div.addEventListener('click', () => {
                this.selectedTemplate = index;
                this.editingTemplate = { ...template, sprites: { ...template.sprites } };
                this.editingIndex = index;
                this.initTemplateList();
                this.openConfigPanel();
            });

            // 長押しで削除
            let longPressTimer = null;
            div.addEventListener('touchstart', () => {
                longPressTimer = setTimeout(() => {
                    if (confirm('このタイルを削除しますか？')) {
                        App.projectData.templates.splice(index, 1);
                        if (this.selectedTemplate === index) {
                            this.selectedTemplate = null;
                            this.closeConfigPanel();
                        }
                        this.initTemplateList();
                    }
                }, 800);
            }, { passive: true });

            div.addEventListener('touchend', () => clearTimeout(longPressTimer));
            div.addEventListener('touchmove', () => clearTimeout(longPressTimer));

            container.appendChild(div);
        });
    },

    // ========== キャンバス ==========
    initCanvasEvents() {
        if (!this.canvas) return;

        let isDrawing = false;

        const handleStart = (e) => {
            isDrawing = true;
            this.processPixel(e);
        };

        const handleMove = (e) => {
            if (isDrawing) this.processPixel(e);
        };

        const handleEnd = () => {
            isDrawing = false;
        };

        this.canvas.addEventListener('mousedown', handleStart);
        this.canvas.addEventListener('mousemove', handleMove);
        this.canvas.addEventListener('mouseup', handleEnd);
        this.canvas.addEventListener('mouseleave', handleEnd);

        this.canvas.addEventListener('touchstart', (e) => handleStart(e.touches[0]), { passive: true });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            handleMove(e.touches[0]);
        }, { passive: false });
        this.canvas.addEventListener('touchend', handleEnd);
    },

    processPixel(e) {
        if (App.currentScreen !== 'stage') return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);

        const stage = App.projectData.stage;
        if (x < 0 || x >= stage.width || y < 0 || y >= stage.height) return;

        const layer = stage.layers[this.currentLayer];

        switch (this.currentTool) {
            case 'pen':
                if (this.selectedTemplate !== null) {
                    const template = this.templates[this.selectedTemplate];
                    const spriteIdx = template?.sprites.idle?.[0] ?? template?.sprites.main?.[0];
                    if (spriteIdx !== undefined) {
                        layer[y][x] = spriteIdx;
                    }
                }
                break;
            case 'eraser':
                layer[y][x] = -1;
                break;
            case 'fill':
                if (this.selectedTemplate !== null) {
                    const template = this.templates[this.selectedTemplate];
                    const spriteIdx = template?.sprites.idle?.[0] ?? template?.sprites.main?.[0];
                    if (spriteIdx !== undefined) {
                        this.floodFill(x, y, layer[y][x], spriteIdx);
                    }
                }
                break;
            case 'eyedropper':
                const tileId = layer[y][x];
                if (tileId >= 0) {
                    const idx = this.templates.findIndex(t =>
                        (t.sprites.idle?.[0] === tileId) || (t.sprites.main?.[0] === tileId)
                    );
                    if (idx >= 0) {
                        this.selectedTemplate = idx;
                        this.initTemplateList();
                    }
                }
                break;
        }

        this.render();
    },

    floodFill(startX, startY, targetValue, newValue) {
        if (targetValue === newValue) return;

        const stage = App.projectData.stage;
        const layer = stage.layers[this.currentLayer];
        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            if (x < 0 || x >= stage.width || y < 0 || y >= stage.height) continue;
            if (layer[y][x] !== targetValue) continue;

            layer[y][x] = newValue;
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    },

    resize() {
        const container = document.getElementById('stage-canvas-area');
        if (!container || !this.canvas) return;

        const stage = App.projectData.stage;
        const maxSize = 320;

        this.tileSize = Math.floor(maxSize / Math.max(stage.width, stage.height));

        this.canvas.width = this.tileSize * stage.width;
        this.canvas.height = this.tileSize * stage.height;
        this.canvas.style.width = this.canvas.width + 'px';
        this.canvas.style.height = this.canvas.height + 'px';

        this.render();
    },

    render() {
        if (!this.canvas || !this.ctx) return;
        if (App.currentScreen !== 'stage') return;

        const stage = App.projectData.stage;

        this.ctx.fillStyle = '#e8e8e8';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.renderLayer('bg', this.currentLayer === 'fg' ? 0.4 : 1);
        this.renderLayer('fg', this.currentLayer === 'bg' ? 0.4 : 1);

        this.renderGrid();
    },

    renderLayer(layerName, alpha) {
        const stage = App.projectData.stage;
        const layer = stage.layers[layerName];
        const sprites = App.projectData.sprites;
        const palette = App.nesPalette;

        this.ctx.globalAlpha = alpha;

        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                const tileId = layer[y][x];
                if (tileId >= 0 && tileId < sprites.length) {
                    this.renderSprite(sprites[tileId], x, y, palette);
                }
            }
        }

        this.ctx.globalAlpha = 1;
    },

    renderSprite(sprite, tileX, tileY, palette) {
        const pixelSize = this.tileSize / 16;

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(
                        tileX * this.tileSize + x * pixelSize,
                        tileY * this.tileSize + y * pixelSize,
                        pixelSize + 0.5,
                        pixelSize + 0.5
                    );
                }
            }
        }
    },

    renderSpriteToMiniCanvas(sprite, canvas) {
        const ctx = canvas.getContext('2d');
        const palette = App.nesPalette;

        ctx.clearRect(0, 0, 16, 16);

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    ctx.fillStyle = palette[colorIndex];
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
    },

    renderGrid() {
        const stage = App.projectData.stage;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 1;

        for (let x = 0; x <= stage.width; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.tileSize, 0);
            this.ctx.lineTo(x * this.tileSize, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y <= stage.height; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.tileSize);
            this.ctx.lineTo(this.canvas.width, y * this.tileSize);
            this.ctx.stroke();
        }
    }
};
