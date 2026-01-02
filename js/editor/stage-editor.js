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
        this.initAddTileButton();
        this.initConfigPanel();
        this.initSpriteSelectPopup();
        this.initTemplateList();
        this.initCanvasEvents();
        this.resize();
    },

    refresh() {
        // キャンバスを再取得（DOM更新対応）
        this.canvas = document.getElementById('stage-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }

        this.initTemplateList();
        this.initCanvasEvents(); // イベントリスナー再設定
        this.resize();
        this.render();
    },

    // ========== ツールバー ==========
    initTools() {
        // ステージ画面専用のツールボタンを選択
        document.querySelectorAll('#stage-tools .paint-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                // 特殊ツール（undo, copy, paste等）はスキップ
                if (['undo', 'copy', 'paste', 'flip-v', 'flip-h'].includes(tool)) {
                    return;
                }

                this.currentTool = tool;
                document.querySelectorAll('#stage-tools .paint-tool-btn').forEach(b => {
                    // 描画ツールのみアクティブ切替
                    if (['pen', 'eraser', 'fill', 'eyedropper'].includes(b.dataset.tool)) {
                        b.classList.toggle('active', b === btn);
                    }
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

    // ========== タイル追加ボタン ==========
    initAddTileButton() {
        const addBtn = document.getElementById('add-tile-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.addNewTile());
        }
    },

    addNewTile() {
        // 新規タイル作成（デフォルト: 素材）
        this.editingTemplate = this.createDefaultTemplate('material');
        this.editingIndex = -1;
        this.openConfigPanel();
    },

    createDefaultTemplate(type) {
        const spriteKeys = this.getSpriteKeysForType(type);
        const sprites = {};
        spriteKeys.forEach(key => {
            sprites[key] = { frames: [], speed: 5, loop: true };
        });

        return {
            type: type,
            sprites: sprites,
            config: this.getDefaultConfig(type)
        };
    },

    getSpriteKeysForType(type) {
        switch (type) {
            case 'player':
            case 'enemy':
                return ['idle', 'walk', 'jump', 'attack', 'shot'];
            case 'material':
            case 'item':
                return ['main'];
            default:
                return ['main'];
        }
    },

    getDefaultConfig(type) {
        switch (type) {
            case 'player':
                return { life: 3, speed: 5, jumpPower: 10, wJump: false, shotMaxRange: 1 };
            case 'enemy':
                return { life: 1, speed: 3, jumpPower: 5, shotMaxRange: 1, move: 'idle' };
            case 'material':
                return { collision: true, life: -1 };
            case 'item':
                return { itemType: 'star' };
            default:
                return {};
        }
    },

    // ========== 設定パネル ==========
    initConfigPanel() {
        const closeBtn = document.getElementById('config-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeConfigPanel());
        }

        const saveBtn = document.getElementById('config-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveTemplate());
        }

        const typeSelect = document.getElementById('tile-type-select');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => this.onTypeChange(e.target.value));
        }
    },

    onTypeChange(newType) {
        if (!this.editingTemplate) return;

        if (this.editingTemplate.type !== newType) {
            // 属性変更時はリセット確認
            if (confirm('スプライト設定がリセットされます。よろしいですか？')) {
                this.editingTemplate = this.createDefaultTemplate(newType);
                this.renderConfigContent();
            } else {
                // キャンセル時は元に戻す
                document.getElementById('tile-type-select').value = this.editingTemplate.type;
            }
        }
    },

    openConfigPanel() {
        const panel = document.getElementById('tile-config-panel');
        if (panel && this.editingTemplate) {
            panel.classList.remove('hidden');
            this.isConfigOpen = true;

            // 属性セレクトを設定
            const typeSelect = document.getElementById('tile-type-select');
            if (typeSelect) {
                typeSelect.value = this.editingTemplate.type;
            }

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
        const spriteSection = document.getElementById('sprite-config-section');
        const paramSection = document.getElementById('param-config-section');
        if (!spriteSection || !paramSection || !this.editingTemplate) return;

        const type = this.editingTemplate.type;
        const spriteKeys = this.getSpriteKeysForType(type);

        // スプライト設定セクション
        let spriteHtml = '';
        spriteKeys.forEach(key => {
            spriteHtml += this.renderSpriteRow(key);
        });
        spriteSection.innerHTML = spriteHtml;

        // パラメータ設定セクション
        paramSection.innerHTML = this.renderParamSection(type);

        this.initConfigEvents();
    },

    renderSpriteRow(slot) {
        const spriteData = this.editingTemplate.sprites[slot] || { frames: [], speed: 5, loop: true };
        const frameCount = spriteData.frames?.length || 0;
        const displayCount = frameCount > 0 ? frameCount : '-';
        const firstFrame = spriteData.frames?.[0];

        // スロット表示名
        const labels = {
            idle: 'IDLE', walk: 'WALK', jump: 'JUMP',
            attack: 'ATTACK', shot: 'SHOT', main: 'MAIN'
        };

        return `
            <div class="sprite-row" data-slot="${slot}">
                <span class="sprite-row-label">${labels[slot] || slot.toUpperCase()}:</span>
                <div class="sprite-slot" data-slot="${slot}">
                    ${firstFrame !== undefined ? `<canvas width="16" height="16" data-sprite="${firstFrame}"></canvas>` : ''}
                </div>
                <span class="sprite-count">${displayCount}</span>
                <input type="range" class="sprite-speed" min="1" max="20" value="${spriteData.speed || 5}" data-slot="${slot}">
                <label class="sprite-loop-label">
                    <input type="checkbox" ${spriteData.loop !== false ? 'checked' : ''} data-slot="${slot}">
                    LOOP
                </label>
            </div>
        `;
    },

    renderParamSection(type) {
        const config = this.editingTemplate.config || {};
        let html = '';

        if (type === 'player' || type === 'enemy') {
            html += this.renderSlider('LIFE', 'life', config.life ?? 3, 1, 10);
            html += this.renderSlider('SPEED', 'speed', config.speed ?? 5, 1, 10);
            html += this.renderSliderWithCheck('JUMP POWER', 'jumpPower', config.jumpPower ?? 10, 1, 20, 'W JUMP', 'wJump', config.wJump);
            html += this.renderSlider('ShotMaxRange', 'shotMaxRange', config.shotMaxRange ?? 1, 1, 16);

            if (type === 'enemy') {
                html += `
                    <div class="param-row">
                        <span class="param-label">MOVE:</span>
                        <select class="param-select" data-key="move">
                            <option value="idle" ${config.move === 'idle' ? 'selected' : ''}>IDLE</option>
                            <option value="patrol" ${config.move === 'patrol' ? 'selected' : ''}>PATROL</option>
                            <option value="jump" ${config.move === 'jump' ? 'selected' : ''}>JUMP</option>
                            <option value="chase" ${config.move === 'chase' ? 'selected' : ''}>CHASE</option>
                        </select>
                    </div>
                `;
            }
        } else if (type === 'material') {
            html += `
                <div class="param-row">
                    <label class="param-check-label">
                        <input type="checkbox" data-key="collision" ${config.collision !== false ? 'checked' : ''}>
                        Collision
                    </label>
                </div>
            `;
            html += this.renderSlider('LIFE', 'life', config.life ?? -1, -1, 10);
        } else if (type === 'item') {
            html += `
                <div class="param-row">
                    <span class="param-label">Type:</span>
                    <select class="param-select" data-key="itemType">
                        <option value="star" ${config.itemType === 'star' ? 'selected' : ''}>STAR</option>
                        <option value="lifeup" ${config.itemType === 'lifeup' ? 'selected' : ''}>LifeUp</option>
                        <option value="weapon" ${config.itemType === 'weapon' ? 'selected' : ''}>WeaponGet</option>
                        <option value="event" ${config.itemType === 'event' ? 'selected' : ''}>EventFlag</option>
                    </select>
                </div>
            `;
        }

        return html;
    },

    renderSlider(label, key, value, min, max) {
        const displayVal = value === -1 ? '∞' : value;
        return `
            <div class="param-row">
                <span class="param-label">${label}:</span>
                <span class="param-value" data-key="${key}">${displayVal}</span>
                <input type="range" class="param-slider" min="${min}" max="${max}" value="${value}" data-key="${key}">
            </div>
        `;
    },

    renderSliderWithCheck(label, sliderKey, sliderValue, min, max, checkLabel, checkKey, checkValue) {
        return `
            <div class="param-row">
                <span class="param-label">${label}:</span>
                <span class="param-value" data-key="${sliderKey}">${sliderValue}</span>
                <input type="range" class="param-slider" min="${min}" max="${max}" value="${sliderValue}" data-key="${sliderKey}">
                <label class="param-check-label">
                    <input type="checkbox" data-key="${checkKey}" ${checkValue ? 'checked' : ''}>
                    ${checkLabel}
                </label>
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
        // スプライトスロットのクリックイベント
        document.querySelectorAll('.sprite-slot').forEach(slotEl => {
            slotEl.addEventListener('click', () => {
                const slot = slotEl.dataset.slot;
                if (slot) {
                    this.openSpriteSelectPopup(slot);
                }
            });
        });

        // スプライト速度スライダー
        document.querySelectorAll('.sprite-speed').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const slot = slider.dataset.slot;
                if (slot && this.editingTemplate?.sprites?.[slot]) {
                    this.editingTemplate.sprites[slot].speed = parseInt(e.target.value);
                }
            });
        });

        // スプライトLOOPチェック
        document.querySelectorAll('.sprite-loop-label input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const slot = cb.dataset.slot;
                if (slot && this.editingTemplate?.sprites?.[slot]) {
                    this.editingTemplate.sprites[slot].loop = cb.checked;
                }
            });
        });

        // パラメータスライダー
        document.querySelectorAll('.param-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const key = slider.dataset.key;
                const value = parseInt(e.target.value);
                if (key && this.editingTemplate?.config) {
                    this.editingTemplate.config[key] = value;
                    // 値表示を更新
                    const valueEl = document.querySelector(`.param-value[data-key="${key}"]`);
                    if (valueEl) {
                        valueEl.textContent = value === -1 ? '∞' : value;
                    }
                }
            });
        });

        // パラメータチェックボックス
        document.querySelectorAll('.param-check-label input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const key = cb.dataset.key;
                if (key && this.editingTemplate?.config) {
                    this.editingTemplate.config[key] = cb.checked;
                }
            });
        });

        // パラメータセレクト
        document.querySelectorAll('.param-select').forEach(select => {
            select.addEventListener('change', () => {
                const key = select.dataset.key;
                if (key && this.editingTemplate?.config) {
                    this.editingTemplate.config[key] = select.value;
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
    },

    // ========== スプライト選択ポップアップ ==========
    initSpriteSelectPopup() {
        const cancelBtn = document.getElementById('sprite-select-cancel');
        const doneBtn = document.getElementById('sprite-select-done');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeSpriteSelectPopup());
        }

        if (doneBtn) {
            doneBtn.addEventListener('click', () => this.confirmSpriteSelection());
        }
    },

    currentSelectingSlot: null,
    selectedSpriteOrder: [],

    openSpriteSelectPopup(slot) {
        const popup = document.getElementById('sprite-select-popup');
        const list = document.getElementById('sprite-select-list');
        if (!popup || !list) return;

        this.currentSelectingSlot = slot;
        this.selectedSpriteOrder = [...(this.editingTemplate?.sprites?.[slot]?.frames || [])];

        // スプライト一覧を横スクロール形式で表示
        list.innerHTML = '';
        App.projectData.sprites.forEach((sprite, index) => {
            const item = document.createElement('div');
            item.className = 'sprite-select-item';
            const orderIndex = this.selectedSpriteOrder.indexOf(index);
            if (orderIndex >= 0) {
                item.classList.add('selected');
                const orderNum = document.createElement('span');
                orderNum.className = 'sprite-select-order';
                orderNum.textContent = orderIndex + 1;
                item.appendChild(orderNum);
            }

            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            this.renderSpriteToMiniCanvas(sprite, canvas);
            item.appendChild(canvas);

            item.addEventListener('click', () => this.toggleSpriteSelection(index, item));
            list.appendChild(item);
        });

        popup.classList.remove('hidden');
    },

    toggleSpriteSelection(spriteIndex, itemEl) {
        const orderIndex = this.selectedSpriteOrder.indexOf(spriteIndex);
        if (orderIndex >= 0) {
            // 選択解除
            this.selectedSpriteOrder.splice(orderIndex, 1);
            itemEl.classList.remove('selected');
            const orderNum = itemEl.querySelector('.sprite-select-order');
            if (orderNum) orderNum.remove();
        } else {
            // 選択追加
            this.selectedSpriteOrder.push(spriteIndex);
            itemEl.classList.add('selected');
            const orderNum = document.createElement('span');
            orderNum.className = 'sprite-select-order';
            orderNum.textContent = this.selectedSpriteOrder.length;
            itemEl.appendChild(orderNum);
        }

        // 順番表示を更新
        this.updateSpriteSelectionOrder();
    },

    updateSpriteSelectionOrder() {
        const list = document.getElementById('sprite-select-list');
        if (!list) return;

        list.querySelectorAll('.sprite-select-item').forEach(item => {
            const canvas = item.querySelector('canvas');
            if (!canvas) return;
            // canvasからsprite indexを取得する方法がないため、順番だけ更新
        });
    },

    closeSpriteSelectPopup() {
        const popup = document.getElementById('sprite-select-popup');
        if (popup) {
            popup.classList.add('hidden');
        }
        this.currentSelectingSlot = null;
        this.selectedSpriteOrder = [];
    },

    confirmSpriteSelection() {
        if (this.currentSelectingSlot && this.editingTemplate) {
            if (!this.editingTemplate.sprites[this.currentSelectingSlot]) {
                this.editingTemplate.sprites[this.currentSelectingSlot] = { frames: [], speed: 5, loop: true };
            }
            this.editingTemplate.sprites[this.currentSelectingSlot].frames = [...this.selectedSpriteOrder];
            this.renderConfigContent();
        }
        this.closeSpriteSelectPopup();
    },

    // ========== タイル保存 ==========
    saveTemplate() {
        if (!this.editingTemplate) return;

        // IDLEまたはメインスプライトが必須
        const idleFrames = this.editingTemplate.sprites?.idle?.frames || [];
        const mainFrames = this.editingTemplate.sprites?.main?.frames || [];
        const hasMainSprite = idleFrames.length > 0 || mainFrames.length > 0;

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
            const spriteIdx = template.sprites?.idle?.frames?.[0] ?? template.sprites?.main?.frames?.[0];
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

            // シングルタップで選択のみ
            div.addEventListener('click', () => {
                this.selectedTemplate = index;
                this.initTemplateList();
            });

            // ダブルタップで設定表示
            div.addEventListener('dblclick', () => {
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

        // イベントからクライアント座標を取得（undefined対策）
        const clientX = e.clientX ?? e.touches?.[0]?.clientX;
        const clientY = e.clientY ?? e.touches?.[0]?.clientY;
        if (clientX === undefined || clientY === undefined) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((clientX - rect.left) / this.tileSize);
        const y = Math.floor((clientY - rect.top) / this.tileSize);

        // 座標がNaNの場合は処理しない
        if (isNaN(x) || isNaN(y)) return;

        const stage = App.projectData.stage;
        if (x < 0 || x >= stage.width || y < 0 || y >= stage.height) return;

        const layer = stage.layers[this.currentLayer];

        switch (this.currentTool) {
            case 'pen':
                if (this.selectedTemplate !== null) {
                    const template = this.templates[this.selectedTemplate];
                    const spriteIdx = template?.sprites?.idle?.frames?.[0] ?? template?.sprites?.main?.frames?.[0];
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
                    const spriteIdx = template?.sprites?.idle?.frames?.[0] ?? template?.sprites?.main?.frames?.[0];
                    if (spriteIdx !== undefined) {
                        this.floodFill(x, y, layer[y][x], spriteIdx);
                    }
                }
                break;
            case 'eyedropper':
                const tileId = layer[y][x];
                if (tileId >= 0) {
                    const idx = this.templates.findIndex(t =>
                        (t.sprites?.idle?.frames?.[0] === tileId) || (t.sprites?.main?.frames?.[0] === tileId)
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
