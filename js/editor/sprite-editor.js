/**
 * PixelGameKit - スプライトエディタ（新UI対応）
 */

const SpriteEditor = {
    canvas: null,
    ctx: null,
    currentSprite: 0,
    selectedColor: 0,
    currentTool: 'pen',
    isDrawing: false,
    drawMode: 'draw',
    lastPixel: { x: -1, y: -1 },
    clipboard: null,

    // Undo履歴
    history: [],
    maxHistory: 20,

    SPRITE_SIZE: 16,
    pixelSize: 20,

    init() {
        this.canvas = document.getElementById('paint-canvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');

        this.initColorPalette();
        this.initTools();
        this.initSpriteGallery();
        this.initCanvasEvents();
    },

    refresh() {
        this.initColorPalette();
        this.initSpriteGallery();
        this.resize();
        this.render();
    },

    resize() {
        this.pixelSize = 320 / this.SPRITE_SIZE;
        this.canvas.width = 320;
        this.canvas.height = 320;
        this.render();
    },

    // ========== Undo機能 ==========
    saveHistory() {
        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        // 現在の状態をディープコピーしてスタックに追加
        const snapshot = JSON.parse(JSON.stringify(sprite.data));
        this.history.push({
            spriteIndex: this.currentSprite,
            data: snapshot
        });

        // 最大履歴数を超えたら古いものを削除
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    },

    undo() {
        if (this.history.length === 0) {
            return;
        }

        const lastState = this.history.pop();
        const sprite = App.projectData.sprites[lastState.spriteIndex];

        if (sprite) {
            sprite.data = lastState.data;
            this.currentSprite = lastState.spriteIndex;
            this.render();
            this.initSpriteGallery();
        }
    },

    // ========== カラーパレット ==========
    initColorPalette() {
        const container = document.getElementById('color-list');
        if (!container) return;

        container.innerHTML = '';

        const palette = App.nesPalette;

        palette.forEach((color, index) => {
            const div = document.createElement('div');
            div.className = 'palette-color' + (index === this.selectedColor ? ' selected' : '');
            div.style.backgroundColor = color;

            // 長押しで削除
            let longPressTimer;
            let isLongPress = false;

            const startLongPress = () => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.deleteColor(index);
                }, 600);
            };

            const cancelLongPress = () => {
                clearTimeout(longPressTimer);
            };

            div.addEventListener('mousedown', startLongPress);
            div.addEventListener('mouseup', cancelLongPress);
            div.addEventListener('mouseleave', cancelLongPress);
            div.addEventListener('touchstart', startLongPress, { passive: true });
            div.addEventListener('touchend', cancelLongPress);

            // ダブルタップで編集、シングルタップで選択
            let lastTapTime = 0;

            div.addEventListener('click', () => {
                if (isLongPress) return;
                const now = Date.now();
                if (now - lastTapTime < 300) {
                    // ダブルタップ → 編集
                    this.editColor(index);
                    lastTapTime = 0;
                } else {
                    // シングルタップ → 選択
                    this.selectColor(index);
                    lastTapTime = now;
                }
            });

            container.appendChild(div);
        });

        // 追加ボタンのイベント設定
        const addBtn = document.getElementById('add-color-btn');
        if (addBtn) {
            addBtn.onclick = () => {
                App.nesPalette.push('#000000');
                this.initColorPalette();
            };
        }
    },

    // 色を削除（確認あり）
    deleteColor(index) {
        if (App.nesPalette.length <= 1) {
            alert('最低1色は必要です');
            return;
        }
        if (!confirm('この色を削除しますか？')) {
            return;
        }
        App.nesPalette.splice(index, 1);
        if (this.selectedColor >= App.nesPalette.length) {
            this.selectedColor = App.nesPalette.length - 1;
        }
        this.initColorPalette();
    },

    editColor(index) {
        const currentColor = App.nesPalette[index];

        // モーダルオーバーレイを作成
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';

        // モーダルコンテンツ
        const modal = document.createElement('div');
        modal.style.cssText = 'background:white;padding:20px;border-radius:8px;text-align:center;';

        const input = document.createElement('input');
        input.type = 'color';
        input.value = currentColor;
        input.style.cssText = 'width:120px;height:120px;border:none;cursor:pointer;padding:0;';

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'margin-top:15px;display:flex;gap:10px;justify-content:center;';

        const okBtn = document.createElement('button');
        okBtn.textContent = '決定';
        okBtn.style.cssText = 'padding:12px 35px;border:none;background:#4a4a4a;color:white;border-radius:4px;cursor:pointer;font-size:14px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.style.cssText = 'padding:12px 20px;border:1px solid #ccc;background:white;border-radius:4px;cursor:pointer;font-size:14px;';

        btnContainer.appendChild(okBtn);
        btnContainer.appendChild(cancelBtn);
        modal.appendChild(input);
        modal.appendChild(btnContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeModal = () => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        };

        okBtn.addEventListener('click', () => {
            const newColor = input.value;
            App.nesPalette[index] = newColor;
            this.initColorPalette();
            this.render();
            this.initSpriteGallery();
            closeModal();
        });

        cancelBtn.addEventListener('click', closeModal);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        });
    },

    selectColor(index) {
        this.selectedColor = index;
        document.querySelectorAll('.palette-color').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
    },

    // ========== ツール ==========
    initTools() {
        document.querySelectorAll('.paint-tool-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            if (btn.parentNode) btn.parentNode.replaceChild(newBtn, btn);

            // 消しゴム長押し検知用
            let pressTimer;
            const startPress = () => {
                if (newBtn.dataset.tool === 'eraser') {
                    pressTimer = setTimeout(() => this.clearSprite(), 800);
                }
            };
            const cancelPress = () => {
                clearTimeout(pressTimer);
            };

            newBtn.addEventListener('mousedown', startPress);
            newBtn.addEventListener('mouseup', cancelPress);
            newBtn.addEventListener('mouseleave', cancelPress);
            newBtn.addEventListener('touchstart', startPress, { passive: true });
            newBtn.addEventListener('touchend', cancelPress);

            newBtn.addEventListener('click', () => {
                const tool = newBtn.dataset.tool;

                switch (tool) {
                    case 'undo':
                        this.undo();
                        break;
                    case 'copy':
                        this.copySprite();
                        break;
                    case 'paste':
                        this.pasteSprite();
                        break;
                    case 'flip-v':
                        this.saveHistory();
                        this.flipVertical();
                        break;
                    case 'flip-h':
                        this.saveHistory();
                        this.flipHorizontal();
                        break;
                    default:
                        this.currentTool = tool;
                        document.querySelectorAll('.paint-tool-btn').forEach(b => {
                            b.classList.toggle('active', b.dataset.tool === tool);
                        });
                        break;
                }
            });
        });
    },

    // ========== スプライトギャラリー（ドラッグ並替え対応） ==========
    initSpriteGallery() {
        const container = document.getElementById('sprite-list');
        if (!container) return;

        container.innerHTML = '';

        App.projectData.sprites.forEach((sprite, index) => {
            const div = document.createElement('div');
            div.className = 'sprite-item' + (index === this.currentSprite ? ' selected' : '');
            div.draggable = true;
            div.dataset.index = index;

            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 16;
            miniCanvas.height = 16;
            this.renderSpriteToMiniCanvas(sprite, miniCanvas);
            div.appendChild(miniCanvas);

            // 長押しで削除
            let longPressTimer;
            let isLongPress = false;

            const startLongPress = () => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.deleteSprite(index);
                }, 800);
            };

            const cancelLongPress = () => {
                clearTimeout(longPressTimer);
            };

            div.addEventListener('mousedown', startLongPress);
            div.addEventListener('mouseup', cancelLongPress);
            div.addEventListener('mouseleave', cancelLongPress);
            div.addEventListener('touchstart', startLongPress, { passive: true });
            div.addEventListener('touchend', cancelLongPress);

            // クリック（長押しでなければ選択）
            div.addEventListener('click', (e) => {
                if (!isLongPress) {
                    this.currentSprite = index;
                    this.history = []; // スプライト変更時は履歴クリア
                    this.initSpriteGallery();
                    this.render();
                }
            });

            // ドラッグ並べ替え
            div.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index);
                div.classList.add('dragging');
            });

            div.addEventListener('dragend', () => {
                div.classList.remove('dragging');
            });

            div.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            div.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                const toIndex = index;

                if (fromIndex !== toIndex) {
                    this.reorderSprites(fromIndex, toIndex);
                }
            });

            container.appendChild(div);
        });

        // 追加ボタン
        const addBtn = document.getElementById('add-sprite-btn');
        if (addBtn) {
            const newAddBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newAddBtn, addBtn);
            newAddBtn.addEventListener('click', () => {
                this.addNewSprite();
            });
        }
    },

    reorderSprites(fromIndex, toIndex) {
        const sprites = App.projectData.sprites;
        const [moved] = sprites.splice(fromIndex, 1);
        sprites.splice(toIndex, 0, moved);

        // ID振り直し
        sprites.forEach((s, i) => s.id = i);

        // 選択中のスプライトを追跡
        if (this.currentSprite === fromIndex) {
            this.currentSprite = toIndex;
        } else if (fromIndex < this.currentSprite && toIndex >= this.currentSprite) {
            this.currentSprite--;
        } else if (fromIndex > this.currentSprite && toIndex <= this.currentSprite) {
            this.currentSprite++;
        }

        this.initSpriteGallery();
        this.render();
    },

    // ========== 描画 ==========
    render() {
        if (!this.ctx) return;
        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        const palette = App.nesPalette;
        // 背景色: 薄グレー
        const bgColor = '#e8e8e8';

        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
                }
            }
        }

        // グリッド線（白）
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) {
            // 縦線
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.pixelSize, 0);
            this.ctx.lineTo(i * this.pixelSize, this.canvas.height);
            this.ctx.stroke();
            // 横線
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.pixelSize);
            this.ctx.lineTo(this.canvas.width, i * this.pixelSize);
            this.ctx.stroke();
        }

        this.canvas.style.backgroundColor = bgColor;
    },

    renderSpriteToMiniCanvas(sprite, canvas) {
        const ctx = canvas.getContext('2d');
        const palette = App.nesPalette;

        // 背景色: 薄グレー
        canvas.style.backgroundColor = '#e8e8e8';
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

    addNewSprite() {
        const id = App.projectData.sprites.length;
        App.projectData.sprites.push({
            id: id,
            name: 'sprite_' + id,
            data: App.create2DArray(16, 16, -1)
        });
        this.currentSprite = id;
        this.history = [];
        this.initSpriteGallery();
        this.render();
    },

    deleteSprite(index) {
        if (App.projectData.sprites.length <= 1) {
            alert('これ以上削除できません');
            return;
        }

        if (!confirm('このスプライトを削除しますか？')) {
            return;
        }

        App.projectData.sprites.splice(index, 1);
        App.projectData.sprites.forEach((s, i) => s.id = i);

        this.currentSprite = Math.max(0, index - 1);
        this.history = [];
        this.initSpriteGallery();
        this.render();
    },

    // ========== キャンバスイベント ==========
    initCanvasEvents() {
        if (!this.canvas) return;

        const newCanvas = this.canvas.cloneNode(true);
        if (this.canvas.parentNode) this.canvas.parentNode.replaceChild(newCanvas, this.canvas);
        this.canvas = newCanvas;
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
        document.addEventListener('mouseup', () => this.onPointerUp());

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onPointerDown(e.touches[0]);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.onPointerMove(e.touches[0]);
        }, { passive: false });

        document.addEventListener('touchend', () => this.onPointerUp());
    },

    getPixelFromEvent(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.pixelSize);
        const y = Math.floor((e.clientY - rect.top) / this.pixelSize);
        return { x, y };
    },

    onPointerDown(e) {
        if (App.currentScreen !== 'paint') return;

        this.isDrawing = true;
        const pixel = this.getPixelFromEvent(e);

        if (pixel.x < 0 || pixel.x >= 16 || pixel.y < 0 || pixel.y >= 16) {
            return;
        }

        // 描画開始時に履歴を保存
        this.saveHistory();

        const sprite = App.projectData.sprites[this.currentSprite];
        const currentVal = sprite.data[pixel.y][pixel.x];

        if (this.currentTool === 'pen') {
            if (currentVal === this.selectedColor) {
                this.drawMode = 'erase';
            } else {
                this.drawMode = 'draw';
            }
        } else {
            this.drawMode = 'draw';
        }

        this.processPixel(pixel.x, pixel.y);
    },

    onPointerMove(e) {
        if (!this.isDrawing || App.currentScreen !== 'paint') return;

        const pixel = this.getPixelFromEvent(e);
        if (pixel.x !== this.lastPixel.x || pixel.y !== this.lastPixel.y) {
            this.processPixel(pixel.x, pixel.y);
        }
    },

    onPointerUp() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.lastPixel = { x: -1, y: -1 };
            this.initSpriteGallery();
        }
    },

    processPixel(x, y) {
        if (x < 0 || x >= 16 || y < 0 || y >= 16) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        if (!sprite) return;

        this.lastPixel = { x, y };

        switch (this.currentTool) {
            case 'pen':
                if (this.drawMode === 'erase') {
                    sprite.data[y][x] = -1;
                } else {
                    sprite.data[y][x] = this.selectedColor;
                }
                break;
            case 'eraser':
                sprite.data[y][x] = -1;
                break;
            case 'fill':
                this.floodFill(x, y, sprite.data[y][x], this.selectedColor);
                break;
            case 'eyedropper':
                const pickedColor = sprite.data[y][x];
                if (pickedColor >= 0) {
                    this.selectColor(pickedColor);
                }
                break;
        }

        this.render();
    },

    floodFill(x, y, targetColor, newColor) {
        if (targetColor === newColor) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        const q = [[x, y]];
        let iterations = 0;

        while (q.length && iterations < 1000) {
            iterations++;
            const [cx, cy] = q.pop();

            if (cx >= 0 && cx < 16 && cy >= 0 && cy < 16) {
                if (sprite.data[cy][cx] === targetColor) {
                    sprite.data[cy][cx] = newColor;
                    q.push([cx + 1, cy]);
                    q.push([cx - 1, cy]);
                    q.push([cx, cy + 1]);
                    q.push([cx, cy - 1]);
                }
            }
        }
    },

    clearSprite() {
        if (!confirm('スプライトをクリアしますか？')) return;

        this.saveHistory();
        const sprite = App.projectData.sprites[this.currentSprite];
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                sprite.data[y][x] = -1;
            }
        }
        this.render();
        this.initSpriteGallery();
    },

    copySprite() {
        const sprite = App.projectData.sprites[this.currentSprite];
        this.clipboard = JSON.parse(JSON.stringify(sprite.data));
        alert('コピーしました');
    },

    pasteSprite() {
        if (!this.clipboard) {
            alert('クリップボードが空です');
            return;
        }
        this.saveHistory();
        const sprite = App.projectData.sprites[this.currentSprite];
        sprite.data = JSON.parse(JSON.stringify(this.clipboard));
        this.render();
        this.initSpriteGallery();
    },

    flipVertical() {
        const sprite = App.projectData.sprites[this.currentSprite];
        sprite.data.reverse();
        this.render();
        this.initSpriteGallery();
    },

    flipHorizontal() {
        const sprite = App.projectData.sprites[this.currentSprite];
        sprite.data.forEach(row => row.reverse());
        this.render();
        this.initSpriteGallery();
    }
};
