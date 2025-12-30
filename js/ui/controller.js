/**
 * PixelGameKit - ゲームコントローラー（新UI対応）
 */

const GameController = {
    buttons: {
        up: false,
        down: false,
        left: false,
        right: false,
        a: false,
        b: false
    },

    init() {
        this.initDpad();
        this.initActionButtons();
        this.initKeyboard();
    },

    initDpad() {
        const directions = ['up', 'down', 'left', 'right'];

        directions.forEach(dir => {
            const btn = document.getElementById('btn-' + dir);
            if (!btn) return;

            // マウス
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.press(dir);
            });
            btn.addEventListener('mouseup', () => this.release(dir));
            btn.addEventListener('mouseleave', () => this.release(dir));

            // タッチ
            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.press(dir);
            }, { passive: false });

            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.release(dir);
            }, { passive: false });

            btn.addEventListener('touchcancel', () => this.release(dir));
        });
    },

    initActionButtons() {
        ['a', 'b'].forEach(btn => {
            const el = document.getElementById('btn-' + btn);
            if (!el) return;

            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.press(btn);
            });
            el.addEventListener('mouseup', () => this.release(btn));
            el.addEventListener('mouseleave', () => this.release(btn));

            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.press(btn);
            }, { passive: false });

            el.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.release(btn);
            }, { passive: false });

            el.addEventListener('touchcancel', () => this.release(btn));
        });
    },

    initKeyboard() {
        const keyMap = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right',
            'KeyZ': 'a',
            'KeyX': 'b',
            'Space': 'a'
        };

        document.addEventListener('keydown', (e) => {
            const btn = keyMap[e.code];
            if (btn && App.currentScreen === 'play') {
                e.preventDefault();
                this.press(btn);
            }
        });

        document.addEventListener('keyup', (e) => {
            const btn = keyMap[e.code];
            if (btn) {
                e.preventDefault();
                this.release(btn);
            }
        });
    },

    press(button) {
        this.buttons[button] = true;
    },

    release(button) {
        this.buttons[button] = false;
    },

    isPressed(button) {
        return this.buttons[button];
    },

    releaseAll() {
        Object.keys(this.buttons).forEach(key => {
            this.buttons[key] = false;
        });
    }
};
