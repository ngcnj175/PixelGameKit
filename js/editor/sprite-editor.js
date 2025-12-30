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
    drawMode: 'draw', // 'draw' or 'erase'
    lastPixel: { x: -1, y: -1 },
    clipboard: null,

    SPRITE_SIZE: 16,
    pixelSize: 20, // This will be calculated on resize

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
        // 固定サイズ（16x16 スプライト）
        // CSSで320pxに設定されている
        this.pixelSize = 320 / this.SPRITE_SIZE; // 20
        this.canvas.width = 320;
        this.canvas.height = 320;

        this.render();
    },

    initColorPalette() {
        const container = document.getElementById('color-palette');
        if (!container) return;

        container.innerHTML = '';

        // パレット：システムパレットの最初の16色（ファミコンスタイル）
        const palette = App.nesPalette.slice(0, 16);

        palette.forEach((color, index) => {
            const div = document.createElement('div');
            div.className = 'palette-color' + (index === this.selectedColor ? ' selected' : '');
            div.style.backgroundColor = color;

            // クリックで選択
            div.addEventListener('click', () => {
                this.selectColor(index);
                // 1色目（背景色）が変わった場合は再描画（現状はパレット固定なので色は変わらないが、選択の意味合い）
            });

            // 長押しで色変更ダイアログ（今回は実装省略、将来用）

            container.appendChild(div);
        });
    },

    selectColor(index) {
        this.selectedColor = index;
        document.querySelectorAll('.palette-color').forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });
        // 0番を選択した場合は背景色が変わるわけではないが、描画色は0番になる
    },

    initTools() {
        document.querySelectorAll('.paint-tool-btn').forEach(btn => {
            // イベントリスナーの重複登録防止
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

            newBtn.addEventListener('touchstart', (e) => {
                // e.preventDefault(); 
                startPress();
            }, { passive: true });
            newBtn.addEventListener('touchend', cancelPress);

            newBtn.addEventListener('click', () => {
                const tool = newBtn.dataset.tool;

                switch (tool) {
                    case 'copy':
                        this.copySprite();
                        break;
                    case 'paste':
                        this.pasteSprite();
                        break;
                    case 'flip-v':
                        this.flipVertical();
                        break;
                    case 'flip-h':
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

    initSpriteGallery() {
        const container = document.getElementById('sprite-list');
        if (!container) return;

        container.innerHTML = '';

        App.projectData.sprites.forEach((sprite, index) => {
            const div = document.createElement('div');
            div.className = 'sprite-item' + (index === this.currentSprite ? ' selected' : '');

            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = 16;
            miniCanvas.height = 16;
            this.renderSpriteToMiniCanvas(sprite, miniCanvas);
            div.appendChild(miniCanvas);

            // 長押し検知（複製・削除）
            let longPressTimer;

            const startLongPress = () => {
                longPressTimer = setTimeout(() => {
                    this.showSpriteOptions(index);
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

            div.addEventListener('click', () => {
                this.currentSprite = index;
                this.initSpriteGallery(); // 再描画して選択状態更新
                this.render();
            });

            container.appendChild(div);
        });

        const addBtn = document.getElementById('add-sprite-btn');
        if (addBtn) {
            const newAddBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newAddBtn, addBtn);
            newAddBtn.addEventListener('click', () => {
                this.addNewSprite();
            });
        }
    },

    showSpriteOptions(index) {
        if (confirm('このスプライトを複製しますか？\n(キャンセルで削除)')) {
            // 複製
            this.duplicateSprite(index);
        } else {
            // 削除確認
            if (confirm('本当に削除しますか？')) {
                this.deleteSprite(index);
            }
        }
    },

    render() {
        if (!this.ctx) return;
        const sprite = App.projectData.sprites[this.currentSprite];
        const palette = App.nesPalette;

        // 背景色（パレット0番）でクリア
        const bgColor = palette[0];
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // スプライト描画
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const colorIndex = sprite.data[y][x];
                // index -1 は透明（背景色が見える）。
                // index 0 以上ならその色で塗る。
                // ただし index 0 は背景色と同じなので、塗っても塗らなくても見た目は同じ。
                // グリッド線が背景画像にあるので、透明部分はグリッドが見え、塗りつぶすと消える効果があるか？
                // CSS background-image は canvas要素自体の背景。
                // clearRect すると透明になりCSS背景が見える。fillRect するとCSS背景は隠れる。
                // したがって、背景色(palette[0])で塗りつぶすとグリッドが見えなくなる恐れがある。
                // グリッドを見せるには、canvas自体をクリア(透明)にして、
                // palette[0]の部分も「透明」として扱うか、「グリッドの上に塗る」か。
                // ユーザー要望: "Grid lines ... Added thin gray guide lines".
                // ファミコンでは0番は背景色だが、エディタ上ではグリッドが見えるのが望ましい。
                // なので、-1の場合は clearRect (透明) にし、0番の場合は 色を塗る？
                // しかしユーザーは "Canvas background color references the first color" と言っている。
                // つまりキャンバスの下地がその色。
                // CSS背景でグリッドを出しているなら、canvasを透明にすればグリッドが見える。
                // 背景色(palette[0]) で塗りつぶすとグリッドは消える。
                // 解決策：0番の色も半透明にするわけにはいかない。
                // 0番の色を塗るが、グリッドを Canvas の上にオーバーレイとして表示するか、
                // あるいは「グリッド」は書かない（CSS背景のみ）で、-1 (透明) の部分だけグリッドが見える仕様にする。
                // 通常のエディタはここが透明。0番を塗ると不透明。
                // なので、-1の箇所だけ clearRect する（initで全クリアしてるなら不要）。
                // ここでは「背景色を表示」したいので、
                // 1. 全体をpalette[0]で塗る。グリッド消える。
                // 2. または、CSS背景色を palette[0] に設定し、Canvasは透明にする。
                // これが良い。

                // 修正プラン：
                // Canvas要素のCSS background-color を palette[0] に設定。
                // Canvasの描画は、colorIndex >= 0 のピクセルを描画。
                // colorIndex === -1 は描画しない（透明のまま）。

                if (colorIndex >= 0) {
                    this.ctx.fillStyle = palette[colorIndex];
                    this.ctx.fillRect(x * this.pixelSize, y * this.pixelSize, this.pixelSize, this.pixelSize);
                }
            }
        }

        // CSS背景色を更新
        this.canvas.style.backgroundColor = bgColor;
        // 注意: style.css で background-image (grid) が設定されている。
        // background-color と background-image は共存できる。
    },

    renderSpriteToMiniCanvas(sprite, canvas) {
        const ctx = canvas.getContext('2d');
        const palette = App.nesPalette;

        // 背景（パレット0）
        canvas.style.backgroundColor = palette[0];
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
        this.initSpriteGallery();
        this.render();
    },

    deleteSprite(index) {
        if (App.projectData.sprites.length <= 1) {
            alert('これ以上削除できません');
            return;
        }
        App.projectData.sprites.splice(index, 1);
        // ID振り直し（簡易的）
        App.projectData.sprites.forEach((s, i) => s.id = i);

        this.currentSprite = Math.max(0, index - 1);
        this.initSpriteGallery();
        this.render();
    },

    duplicateSprite(index) {
        const sprite = App.projectData.sprites[index];
        const newData = JSON.parse(JSON.stringify(sprite.data));
        const newId = App.projectData.sprites.length;
        App.projectData.sprites.push({
            id: newId,
            name: sprite.name + '_copy',
            data: newData
        });
        this.currentSprite = newId;
        this.initSpriteGallery();
        this.render();
    },

    initCanvasEvents() {
        if (!this.canvas) return;
        // 既存リスナー削除のためにClone
        const newCanvas = this.canvas.cloneNode(true);
        if (this.canvas.parentNode) this.canvas.parentNode.replaceChild(newCanvas, this.canvas);
        this.canvas = newCanvas;
        this.ctx = this.canvas.getContext('2d');

        this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
        // mousemoveはwindowで受けると範囲外ドラッグも取れるが、今回はcanvas内
        this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
        document.addEventListener('mouseup', () => this.onPointerUp()); // ドキュメントでアップ検知

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
        // 座標計算
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        const x = Math.floor(px / this.pixelSize);
        const y = Math.floor(py / this.pixelSize);
        return { x, y };
    },

    onPointerDown(e) {
        if (App.currentScreen !== 'paint') return;

        this.isDrawing = true;
        const pixel = this.getPixelFromEvent(e);

        // 範囲外チェック
        if (pixel.x < 0 || pixel.x >= 16 || pixel.y < 0 || pixel.y >= 16) {
            // this.isDrawing = false; // ドラッグ開始できなくする？
            // 外から入ってくることも考慮するなら描画フラグは立てておく
            return;
        }

        const sprite = App.projectData.sprites[this.currentSprite];
        const currentVal = sprite.data[pixel.y][pixel.x];

        // ペンの挙動決定（スマートペン）
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
            // ギャラリーのサムネイル更新
            this.initSpriteGallery();
        }
    },

    processPixel(x, y) {
        if (x < 0 || x >= this.SPRITE_SIZE || y < 0 || y >= this.SPRITE_SIZE) return;

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
        }

        this.render();
    },

    floodFill(x, y, targetColor, newColor) {
        if (targetColor === newColor) return;

        const sprite = App.projectData.sprites[this.currentSprite];
        const rows = 16;
        const cols = 16;

        const q = [[x, y]];
        // 無限ループ防止
        let iterations = 0;

        while (q.length && iterations < 1000) {
            iterations++;
            const [cx, cy] = q.pop();

            if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
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
        if (!confirm('現在のスプライトをクリアしますか？')) return;
        const sprite = App.projectData.sprites[this.currentSprite];
        // 全て-1に
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
        alert('スプライトをコピーしました');
    },

    pasteSprite() {
        if (!this.clipboard) {
            alert('クリップボードが空です');
            return;
        }
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
