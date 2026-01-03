/**
 * PixelGameKit - ステージエディタ v4（詳細設定パネル対応）
 */

const StageEditor = {
    canvas: null,
    ctx: null,
    tileSize: 20,

    // 状態
    currentTool: 'pen',
    currentLayer: 'fg', // FGのみ使用（BGは単色背景）
    selectedTemplate: null,
    templates: [],

    // 設定パネル
    isConfigOpen: false,
    editingTemplate: null,
    editingIndex: -1, // -1:新規, 0以上:編集
    draggedSpriteIndex: null,

    // タイルクリック状態（ダブルタップ検出用）
    tileClickState: { index: null, timer: null, count: 0 },

    // UNDO履歴
    undoHistory: [],
    maxUndoHistory: 20,

    init() {
        this.canvas = document.getElementById('stage-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }

        this.initTools();
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
            let longPressTimer = null;

            // 長押し検出（消しゴム全削除用）
            btn.addEventListener('mousedown', () => {
                if (btn.dataset.tool === 'eraser') {
                    longPressTimer = setTimeout(() => {
                        this.clearAllTiles();
                        longPressTimer = null;
                    }, 800);
                }
            });

            btn.addEventListener('mouseup', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });

            btn.addEventListener('mouseleave', () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            });

            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;

                // UNDOツール
                if (tool === 'undo') {
                    this.undo();
                    return;
                }

                // 特殊ツール（copy, paste等）はスキップ
                if (['copy', 'paste', 'flip-v', 'flip-h'].includes(tool)) {
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

    // ========== 背景色取得 ==========
    getBackgroundColor() {
        // Pixel画面の背景色を使用（デフォルト）
        return App.projectData.stage?.backgroundColor || App.projectData.backgroundColor || '#3CBCFC';
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
            addBtn.addEventListener('click', () => this.openTypeSelectPopup());
        }
    },

    // 属性選択ポップアップを開く
    openTypeSelectPopup() {
        const popup = document.getElementById('type-select-popup');
        if (popup) {
            popup.classList.remove('hidden');
            this.initTypeSelectEvents();
        }
    },

    closeTypeSelectPopup() {
        const popup = document.getElementById('type-select-popup');
        if (popup) {
            popup.classList.add('hidden');
        }
    },

    initTypeSelectEvents() {
        // キャンセルボタン
        const cancelBtn = document.getElementById('type-select-cancel');
        if (cancelBtn) {
            cancelBtn.onclick = () => this.closeTypeSelectPopup();
        }

        // 属性選択ボタン
        document.querySelectorAll('.type-select-item').forEach(btn => {
            btn.onclick = () => {
                const type = btn.dataset.type;
                this.closeTypeSelectPopup();
                this.addNewTile(type);
            };
        });
    },

    addNewTile(type) {
        // 新規タイル作成
        this.editingTemplate = this.createDefaultTemplate(type);
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
                return ['idle', 'walk', 'jump', 'attack', 'shot', 'life'];
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
                return { life: 3, lifeCount: 3, speed: 5, jumpPower: 10, wJump: false, shotMaxRange: 1 };
            case 'enemy':
                return { life: 1, lifeCount: 1, speed: 3, jumpPower: 5, shotMaxRange: 1, move: 'idle' };
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
    },

    // 属性ラベル表示用のマッピング
    typeLabels: {
        player: 'プレイヤー',
        enemy: '敵',
        material: '素材',
        item: 'アイテム',
        goal: 'ゴール'
    },

    openConfigPanel() {
        const panel = document.getElementById('tile-config-panel');
        if (panel && this.editingTemplate) {
            panel.classList.remove('hidden');
            this.isConfigOpen = true;

            // 属性ラベルを更新
            const typeLabel = document.getElementById('tile-type-label');
            if (typeLabel) {
                typeLabel.textContent = this.typeLabels[this.editingTemplate.type] || this.editingTemplate.type;
            }

            this.renderConfigContent();

            // パネルを先頭にスクロール
            panel.scrollTop = 0;
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
            attack: 'ATTACK', shot: 'SHOT', life: 'LIFE', main: 'MAIN'
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
            html += this.renderSlider('MAX LIFE', 'life', config.life ?? 3, 1, 10);
            html += this.renderSlider('SPEED', 'speed', config.speed ?? 5, 1, 10);
            html += this.renderSliderWithCheck('JUMP POWER', 'jumpPower', config.jumpPower ?? 10, 1, 20, 'W JUMP', 'wJump', config.wJump);
            html += this.renderSlider('SHOT MAX RANGE', 'shotMaxRange', config.shotMaxRange ?? 0, 0, 16);

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
                    // アニメーションをリアルタイム更新
                    this.updateConfigAnimations();
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

        // アニメーションを初期化
        this.updateConfigAnimations();
    },

    // 設定パネル内のアニメーションを更新
    updateConfigAnimations() {
        // 既存のアニメーションタイマーをクリア
        if (this.configAnimationIntervals) {
            this.configAnimationIntervals.forEach(id => clearInterval(id));
        }
        this.configAnimationIntervals = [];

        // スプライトをキャンバスに描画（アニメーションも対応）
        document.querySelectorAll('.sprite-slot').forEach(slotEl => {
            const slot = slotEl.dataset.slot;
            const canvas = slotEl.querySelector('canvas');
            if (!canvas || !slot) return;

            const spriteData = this.editingTemplate?.sprites?.[slot];
            const frames = spriteData?.frames || [];
            const speed = spriteData?.speed || 8;

            if (frames.length === 0) return;

            // 初期フレーム描画
            const firstSprite = App.projectData.sprites[frames[0]];
            if (firstSprite) {
                this.renderSpriteToMiniCanvas(firstSprite, canvas);
            }

            // 複数フレームの場合はアニメーション
            if (frames.length > 1) {
                let frameIndex = 0;
                const animInterval = setInterval(() => {
                    // パネルが閉じられたらアニメ停止
                    if (!this.isConfigOpen) {
                        clearInterval(animInterval);
                        return;
                    }
                    frameIndex = (frameIndex + 1) % frames.length;
                    const sprite = App.projectData.sprites[frames[frameIndex]];
                    if (sprite) {
                        this.renderSpriteToMiniCanvas(sprite, canvas);
                    }
                }, 1000 / speed);
                this.configAnimationIntervals.push(animInterval);
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

        // 背景色を動的に取得
        const bgColor = App.projectData.stage?.backgroundColor || App.projectData.backgroundColor || '#3CBCFC';

        // スプライト一覧を横スクロール形式で表示
        list.innerHTML = '';
        App.projectData.sprites.forEach((sprite, index) => {
            const item = document.createElement('div');
            item.className = 'sprite-select-item';
            item.style.backgroundColor = bgColor; // 動的背景色
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
            this.renderSpriteToMiniCanvas(sprite, canvas, bgColor);
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
            const frames = template.sprites?.idle?.frames || template.sprites?.main?.frames || [];
            const speed = template.sprites?.idle?.speed || template.sprites?.main?.speed || 8;

            if (frames.length > 0) {
                const miniCanvas = document.createElement('canvas');
                miniCanvas.width = 16;
                miniCanvas.height = 16;

                // 初期フレーム描画
                const firstSprite = App.projectData.sprites[frames[0]];
                if (firstSprite) {
                    this.renderSpriteToMiniCanvas(firstSprite, miniCanvas);
                }

                // 複数フレームの場合はアニメーション
                if (frames.length > 1) {
                    let frameIndex = 0;
                    const animInterval = setInterval(() => {
                        // 画面がステージでなくなったらアニメ停止
                        if (App.currentScreen !== 'stage') {
                            clearInterval(animInterval);
                            return;
                        }
                        frameIndex = (frameIndex + 1) % frames.length;
                        const sprite = App.projectData.sprites[frames[frameIndex]];
                        if (sprite) {
                            this.renderSpriteToMiniCanvas(sprite, miniCanvas);
                        }
                    }, 1000 / speed);
                }

                div.appendChild(miniCanvas);
            }

            // 種別バッジ
            const badge = document.createElement('span');
            badge.className = 'type-badge';
            badge.textContent = typeIcons[template.type] || '?';
            div.appendChild(badge);

            // タップ/クリック処理（シングル：即座に選択、ダブル：設定表示）
            const handleTap = () => {
                const state = this.tileClickState;

                // 同じタイルへの2回目のクリック（ダブルタップ）
                if (state.index === index && state.count === 1) {
                    clearTimeout(state.timer);
                    state.count = 0;
                    state.index = null;

                    // ダブルタップ：設定表示
                    this.editingTemplate = { ...template, sprites: { ...template.sprites } };
                    this.editingIndex = index;
                    this.openConfigPanel();
                } else {
                    // 最初のクリック：即座に選択
                    clearTimeout(state.timer);
                    state.index = index;
                    state.count = 1;

                    // 即座に選択を反映（遅延なし）
                    this.selectedTemplate = index;
                    this.initTemplateList();

                    // ダブルタップ用タイマー（選択後もダブルタップを受け付ける）
                    state.timer = setTimeout(() => {
                        state.count = 0;
                        state.index = null;
                    }, 300);
                }
            };

            div.addEventListener('click', handleTap);

            // 長押しで削除
            let longPressTimer = null;
            div.addEventListener('touchstart', () => {
                longPressTimer = setTimeout(() => {
                    if (confirm('このタイルを削除しますか？')) {
                        // キャンバスから該当タイルをクリア
                        this.clearTileFromCanvas(index);

                        // テンプレートを削除
                        App.projectData.templates.splice(index, 1);

                        // 削除後のインデックス調整（キャンバス上の参照を更新）
                        this.updateCanvasTileIndices(index);

                        if (this.selectedTemplate === index) {
                            this.selectedTemplate = null;
                            this.closeConfigPanel();
                        } else if (this.selectedTemplate > index) {
                            this.selectedTemplate--;
                        }
                        this.initTemplateList();
                        this.render();
                    }
                }, 800);
            }, { passive: true });

            div.addEventListener('touchend', () => clearTimeout(longPressTimer));
            div.addEventListener('touchmove', () => clearTimeout(longPressTimer));

            container.appendChild(div);
        });
    },

    // キャンバスから指定インデックスのタイルをすべてクリア
    clearTileFromCanvas(templateIndex) {
        const stage = App.projectData.stage;
        if (!stage || !stage.layers) return;

        const layer = stage.layers.fg;
        if (!layer) return;

        // タイルの最初のスプライトインデックスを取得
        const template = App.projectData.templates[templateIndex];
        if (!template) return;

        const spriteIdx = template.sprites?.idle?.frames?.[0] ?? template.sprites?.main?.frames?.[0];
        if (spriteIdx === undefined) return;

        // キャンバス上の該当タイルを-1に置換
        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                if (layer[y][x] === spriteIdx) {
                    layer[y][x] = -1;
                }
            }
        }
    },

    // テンプレート削除後のインデックス調整
    // 削除されたインデックスより大きいスプライト参照を持つタイルは調整不要
    // （タイル配置はスプライトインデックスを使用しているため）
    updateCanvasTileIndices(deletedIndex) {
        // 注意: 現在の実装ではタイル配置時にスプライトインデックスを使用しているため
        // テンプレートインデックスの調整は不要
        // 将来的にテンプレートインデックスを使用する場合はここで調整
    },

    // ========== キャンバス ==========
    initCanvasEvents() {
        if (!this.canvas) return;

        // 重複リスナー防止
        if (this.canvasEventsInitialized) return;
        this.canvasEventsInitialized = true;

        let isDrawing = false;

        const handleStart = (e) => {
            this.saveToHistory();
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

        // 背景色（Pixel画面の背景色を使用）
        this.ctx.fillStyle = this.getBackgroundColor();
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // FGレイヤーのみ描画
        this.renderLayer('fg', 1);

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

    renderSpriteToMiniCanvas(sprite, canvas, bgColor = '#3CBCFC') {
        const ctx = canvas.getContext('2d');
        const palette = App.nesPalette;

        // 背景色を描画（動的に設定可能）
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, 16, 16);

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
    },

    // ========== UNDO機能 ==========
    saveToHistory() {
        // デバウンス（100ms以内の連続呼び出しを無視）
        const now = Date.now();
        if (this.lastSaveTime && now - this.lastSaveTime < 100) {
            return;
        }
        this.lastSaveTime = now;

        const stage = App.projectData.stage;
        // FGレイヤーの現在の状態をディープコピー
        const snapshot = stage.layers.fg.map(row => [...row]);

        this.undoHistory.push(snapshot);

        // 履歴が多すぎる場合は古いものを削除
        if (this.undoHistory.length > this.maxUndoHistory) {
            this.undoHistory.shift();
        }
    },

    undo() {
        if (this.undoHistory.length === 0) {
            console.log('No undo history');
            return;
        }

        const snapshot = this.undoHistory.pop();
        const stage = App.projectData.stage;

        // スナップショットを復元
        stage.layers.fg = snapshot;

        this.render();
        console.log('Undo applied');
    },

    clearAllTiles() {
        if (!confirm('すべてのタイルを削除しますか？')) {
            return;
        }

        this.saveToHistory();

        const stage = App.projectData.stage;
        for (let y = 0; y < stage.height; y++) {
            for (let x = 0; x < stage.width; x++) {
                stage.layers.fg[y][x] = -1;
            }
        }

        this.render();
        console.log('All tiles cleared');
    }
};
