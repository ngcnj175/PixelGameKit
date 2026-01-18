/**
 * PixelGameKit - サウンドエディタ（新UI）
 */

const SoundEditor = {
    // キャンバス
    canvas: null,
    ctx: null,

    // ソング管理
    songs: [],
    currentSongIdx: 0,

    // トラック
    currentTrack: 0, // 0-3: Tr1-Tr4
    trackTypes: ['square', 'square', 'triangle', 'noise'],

    // 再生状態
    isPlaying: false,
    isPaused: false,
    isStepRecording: false,
    playInterval: null,
    activeOscillators: [null, null, null, null], // トラックごとの再生中オシレーター（同時発音1制限用）

    // ピアノロール
    cellSize: 20,
    scrollX: 0, // 横スクロール位置
    scrollY: 480, // 縦スクロール位置（C4が下端に表示: (71-36)*20=700、表示領域を考慮して調整）
    highlightPitch: -1, // ハイライト中の音階

    // 編集ツール
    currentTool: 'pencil', // pencil, eraser, copy

    // 入力位置
    currentStep: 0,

    // 音階定義（5オクターブ = C1-B5）
    noteNames: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],

    // Web Audio
    audioCtx: null,

    init() {
        this.canvas = document.getElementById('piano-roll-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // Web Audio初期化
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // ソングデータ初期化（マイグレーション含む）
        this.migrateSongData();

        this.songs = App.projectData.songs;
        if (this.songs.length === 0) {
            this.addSong();
        }

        // 新UI初期化
        this.initConsoleHeader();
        this.initChannelStrip();
        this.initTools();
        this.initPlayerPanel();
        this.initKeyboard();
        this.initPianoRoll();
        this.initSongJukebox(); // モーダル初期化

        this.resize(); // キャンバスサイズ設定
        this.updateConsoleDisplay();
        this.updateChannelStripUI();
    },

    refresh() {
        if (!App.projectData.songs) {
            App.projectData.songs = [];
        }
        this.songs = App.projectData.songs;
        if (this.songs.length === 0) {
            this.addSong();
        }
        this.resize(); // キャンバスサイズ設定
        this.updateConsoleDisplay();
        this.updateChannelStripUI();
    },

    // データ構造のマイグレーション (Vol/Pan追加)
    migrateSongData() {
        if (!App.projectData.songs) {
            App.projectData.songs = [];
            return;
        }
        App.projectData.songs.forEach(song => {
            if (!song.tracks) return;
            song.tracks.forEach(track => {
                if (typeof track.volume === 'undefined') track.volume = 0.65;
                if (typeof track.pan === 'undefined') track.pan = 0.0;
                if (typeof track.tone === 'undefined') track.tone = 0; // 音色バリエーション (0=Default)
            });
        });
    },

    // 波形キャッシュ
    waveCache: {},

    getPeriodicWave(duty) {
        if (!this.audioCtx) return null;

        const cacheKey = `pulse_${duty}`;
        if (this.waveCache[cacheKey]) return this.waveCache[cacheKey];

        const n = 4096;
        const real = new Float32Array(n);
        const imag = new Float32Array(n);
        for (let i = 1; i < n; i++) {
            imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
        }
        const wave = this.audioCtx.createPeriodicWave(real, imag);
        this.waveCache[cacheKey] = wave;
        return wave;
    },

    // iOSでconfirmダイアログ後にAudioContextが壊れる問題対策
    resetAudioContext() {
        // 古いコンテキストをクローズ
        if (this.audioCtx) {
            try {
                this.audioCtx.close();
            } catch (e) { }
        }
        // 新しいコンテキストを作成
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // アクティブオシレーターをクリア
        this.activeOscillators = [null, null, null, null];

        // ゲームエンジンのコンテキストもリセット
        if (typeof GameEngine !== 'undefined' && GameEngine.bgmAudioCtx) {
            try {
                GameEngine.bgmAudioCtx.close();
            } catch (e) { }
            GameEngine.bgmAudioCtx = null;
        }
    },

    resize() {
        if (!this.canvas) return;
        // ピアノロール: 16x16グリッド（STAGE画面と同じ設定）
        // キャンバスは常に16x16タイル（320px）固定
        const canvasSize = 320;

        // 内部解像度（stage-editor.jsと同じ）
        this.canvas.width = canvasSize;
        this.canvas.height = canvasSize;

        // CSS表示サイズはJSで設定しない
        // style.width/heightを指定するとレスポンシブ対応時に縦長/横長になるリスクがある
        // CSSの aspect-ratio: 1 に完全に任せる

        this.render();
    },

    // ========== Console Header (ソング制御盤) ==========
    initConsoleHeader() {
        // 前へ
        document.getElementById('song-prev-btn')?.addEventListener('click', () => {
            let nextIdx = this.currentSongIdx - 1;
            if (nextIdx < 0) nextIdx = this.songs.length - 1;
            this.selectSong(nextIdx);
        });

        // 次へ
        document.getElementById('song-next-btn')?.addEventListener('click', () => {
            let nextIdx = this.currentSongIdx + 1;
            if (nextIdx >= this.songs.length) nextIdx = 0;
            this.selectSong(nextIdx);
        });

        // タイトルタップ（名前変更モーダル表示）
        document.getElementById('song-title-display')?.addEventListener('click', () => {
            this.openSongNameModal();
        });

        // モーダル保存ボタン
        document.getElementById('song-name-save')?.addEventListener('click', () => {
            this.saveSongName();
        });

        // モーダルキャンセルボタン
        document.getElementById('song-name-cancel')?.addEventListener('click', () => {
            this.closeSongNameModal();
        });

        // メニュー（ジュークボックスを開く）
        document.getElementById('song-menu-btn')?.addEventListener('click', () => {
            this.openSongJukebox();
        });


        // BPM表示（上下ドラッグで調整）
        const bpmDisplay = document.getElementById('bpm-display');
        if (bpmDisplay) {
            let isDragging = false;
            let startY = 0;
            let startValue = 0;

            const onStart = (e) => {
                isDragging = true;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                startY = clientY;
                startValue = this.getCurrentSong().bpm;
                e.preventDefault();
            };

            const onMove = (e) => {
                if (!isDragging) return;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const delta = Math.round((startY - clientY) / 3); // 上に3px = +1BPM
                const song = this.getCurrentSong();
                song.bpm = Math.max(60, Math.min(240, startValue + delta));
                this.updateConsoleDisplay();
            };

            const onEnd = () => {
                isDragging = false;
            };

            bpmDisplay.addEventListener('mousedown', onStart);
            bpmDisplay.addEventListener('touchstart', onStart, { passive: false });
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchend', onEnd);

            // ダブルタップでリセット（120BPM）
            let lastTapBpm = 0;
            bpmDisplay.addEventListener('touchend', () => {
                const now = Date.now();
                if (now - lastTapBpm < 300) {
                    this.getCurrentSong().bpm = 120;
                    this.updateConsoleDisplay();
                }
                lastTapBpm = now;
            });
        }

        // BAR表示（上下ドラッグで調整）
        const barDisplay = document.getElementById('bar-display');
        if (barDisplay) {
            let isDragging = false;
            let startY = 0;
            let startValue = 0;

            const onStart = (e) => {
                isDragging = true;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                startY = clientY;
                startValue = this.getCurrentSong().bars;
                e.preventDefault();
            };

            const onMove = (e) => {
                if (!isDragging) return;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const delta = Math.round((startY - clientY) / 20); // 上に20px = +1BAR
                const song = this.getCurrentSong();
                song.bars = Math.max(1, Math.min(16, startValue + delta));
                this.updateConsoleDisplay();
                this.render();
            };

            const onEnd = () => {
                isDragging = false;
            };

            barDisplay.addEventListener('mousedown', onStart);
            barDisplay.addEventListener('touchstart', onStart, { passive: false });
            document.addEventListener('mousemove', onMove);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchend', onEnd);

            // ダブルタップでリセット（4BAR）
            let lastTapBar = 0;
            barDisplay.addEventListener('touchend', () => {
                const now = Date.now();
                if (now - lastTapBar < 300) {
                    this.getCurrentSong().bars = 4;
                    this.updateConsoleDisplay();
                    this.render();
                }
                lastTapBar = now;
            });
        }
    },

    updateConsoleDisplay() {
        const song = this.getCurrentSong();
        const titleEl = document.getElementById('song-title-display');
        const bpmEl = document.getElementById('bpm-display');
        const barEl = document.getElementById('bar-display');

        if (titleEl) titleEl.textContent = song.name;
        if (bpmEl) bpmEl.textContent = song.bpm;
        if (barEl) barEl.textContent = song.bars;
    },

    // ========== ソング名変更モーダル ==========
    openSongNameModal() {
        const song = this.getCurrentSong();
        const popup = document.getElementById('song-name-popup');
        const input = document.getElementById('song-name-input');
        if (popup && input) {
            input.value = song.name;
            popup.classList.remove('hidden');
            // iOSでのバースト防止：再生停止
            if (this.isPlaying) {
                this.wasPlayingBeforeModal = true;
                this.pause();
            } else {
                this.wasPlayingBeforeModal = false;
            }
        }
    },

    closeSongNameModal() {
        const popup = document.getElementById('song-name-popup');
        if (popup) {
            popup.classList.add('hidden');
        }
    },

    saveSongName() {
        const input = document.getElementById('song-name-input');
        if (input) {
            const newName = input.value.trim().substring(0, 16);
            if (newName) {
                const song = this.getCurrentSong();
                song.name = newName;
                this.updateConsoleDisplay();
                // ステージエディタ等の更新
                if (typeof StageEditor !== 'undefined' && StageEditor.updateBgmSelects) {
                    StageEditor.updateBgmSelects();
                }
            }
            this.closeSongNameModal();
        }
    },

    // ========== Channel Strip (フッターミキサー) ==========
    initChannelStrip() {
        const container = document.getElementById('bgm-channel-strip');
        if (!container) return;

        container.innerHTML = '';
        // 楽器名のみ表示（TR1～4は削除）
        const trackLabels = ['SQUARE1', 'SQUARE2', 'TRIANGLE', 'NOISE'];

        trackLabels.forEach((label, idx) => {
            const div = document.createElement('div');
            div.className = 'channel-strip-track' + (idx === this.currentTrack ? ' active' : '');
            div.dataset.track = idx;

            div.innerHTML = `
                <div class="track-info">
                    <span class="track-name">${label}</span>
                </div>
                <div class="track-knobs">
                    <div class="knob-wrap">
                        <div class="knob-ctrl vol-knob" data-type="vol" data-track="${idx}"></div>
                        <span class="knob-label">VOL</span>
                    </div>
                    <div class="knob-wrap">
                        <div class="knob-ctrl pan-knob" data-type="pan" data-track="${idx}"></div>
                        <span class="knob-label">PAN</span>
                    </div>
                </div>
             `;

            // トラック選択イベント（長押しで音色変更）
            let longPressTimer;
            const startLongPress = (e) => {
                longPressTimer = setTimeout(() => {
                    this.showToneSelectMenu(idx);
                }, 600);
            };
            const cancelLongPress = () => {
                clearTimeout(longPressTimer);
            };

            const trackInfo = div.querySelector('.track-info');
            trackInfo.addEventListener('mousedown', startLongPress);
            trackInfo.addEventListener('touchstart', startLongPress, { passive: true });
            trackInfo.addEventListener('mouseup', cancelLongPress);
            trackInfo.addEventListener('mouseleave', cancelLongPress);
            trackInfo.addEventListener('touchend', cancelLongPress);

            trackInfo.addEventListener('click', (e) => {
                // ノブ操作時はトラック切り替えしない
                if (e.target.classList.contains('knob-ctrl')) return;

                this.currentTrack = idx;
                this.updateChannelStripUI();
                this.render();
            });

            container.appendChild(div);
        });

        // ノブのドラッグ操作初期化
        this.initKnobInteractions();
    },

    showToneSelectMenu(trackIdx) {
        const song = this.getCurrentSong();
        const track = song.tracks[trackIdx];
        const trackType = ['square', 'square', 'triangle', 'noise'][trackIdx];

        // 既存のメニューがあれば削除
        const existing = document.getElementById('tone-select-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'tone-select-menu';
        menu.className = 'tone-select-menu';

        const title = document.createElement('div');
        title.className = 'tone-menu-title';
        title.innerText = '音色を選択';
        menu.appendChild(title);

        let options = [];
        if (trackType === 'square') {
            options = [
                { val: 0, label: 'Standard' },
                { val: 1, label: 'Standard (Short)' },
                { val: 2, label: 'Standard (FadeIn)' },
                { val: 3, label: 'Sharp' },
                { val: 4, label: 'Sharp (Short)' },
                { val: 5, label: 'Sharp (FadeIn)' },
                { val: 6, label: 'Tremolo (高速)' }
            ];
        } else if (trackType === 'triangle') {
            options = [
                { val: 0, label: 'Standard' },
                { val: 1, label: 'Soft (Sine)' },
                { val: 2, label: 'Power (Saw)' },
                { val: 3, label: 'Kick (ピッチ下降)' }
            ];
        } else if (trackType === 'noise') {
            options = [
                { val: 0, label: 'Drum' },
                { val: 1, label: 'Staccato (短く)' }
            ];
        }

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'tone-menu-btn' + (track.tone === opt.val ? ' active' : '');
            btn.innerText = opt.label;
            btn.onclick = () => {
                track.tone = opt.val;
                // UI反映（必要なら）
                menu.remove();

                // プレビュー再生
                this.previewTone(trackIdx);
            };
            menu.appendChild(btn);
        });

        // 閉じるボタン（背景クリックで閉じる機能があれば不要だが、念のため）
        const closeBtn = document.createElement('button');
        closeBtn.className = 'tone-menu-close';
        closeBtn.innerText = '閉じる';
        closeBtn.onclick = () => menu.remove();
        menu.appendChild(closeBtn);

        document.body.appendChild(menu);
    },

    previewTone(trackIdx) {
        const note = 'C';
        const octave = 4;
        this.currentTrack = trackIdx;
        // 単音再生（プレビュー）
        this.playNote(note, octave, 0.4);
    },

    updateChannelStripUI() {
        // アクティブトラック表示更新
        const tracks = document.querySelectorAll('.channel-strip-track');
        tracks.forEach((t, idx) => {
            t.classList.toggle('active', idx === this.currentTrack);
        });

        // ノブの回転更新
        const song = this.getCurrentSong();
        song.tracks.forEach((track, idx) => {
            const volKnob = document.querySelector(`.vol-knob[data-track="${idx}"]`);
            const panKnob = document.querySelector(`.pan-knob[data-track="${idx}"]`);

            if (volKnob) {
                // Vol 0.0-1.0 => -135deg to +135deg
                const deg = (track.volume * 270) - 135;
                volKnob.style.transform = `rotate(${deg}deg)`;
            }
            if (panKnob) {
                // Pan -1.0 to 1.0 => -135deg to +135deg
                const deg = track.pan * 135;
                panKnob.style.transform = `rotate(${deg}deg)`;
            }
        });
    },

    initKnobInteractions() {
        let activeKnob = null;
        let startY = 0;
        let startVal = 0;

        // ダブルタップ検出用
        let lastTapTime = {};
        const DOUBLE_TAP_DELAY = 300;

        const handleDoubleTap = (e) => {
            if (!e.target.classList.contains('knob-ctrl')) return;

            const knob = e.target;
            const trackIdx = parseInt(knob.dataset.track);
            const type = knob.dataset.type;
            const now = Date.now();
            const key = `${type}_${trackIdx}`;

            if (lastTapTime[key] && (now - lastTapTime[key]) < DOUBLE_TAP_DELAY) {
                // ダブルタップ検出 - デフォルト値にリセット
                const song = this.getCurrentSong();
                const track = song.tracks[trackIdx];

                if (type === 'vol') {
                    track.volume = 0.65; // デフォルト65%
                } else {
                    track.pan = 0.0; // デフォルト中央
                }

                this.updateChannelStripUI();
                lastTapTime[key] = 0; // リセット
            } else {
                lastTapTime[key] = now;
            }
        };

        const handleStart = (e) => {
            if (!e.target.classList.contains('knob-ctrl')) return;
            e.preventDefault();
            e.stopPropagation();

            activeKnob = e.target;
            const trackIdx = parseInt(activeKnob.dataset.track);
            const type = activeKnob.dataset.type;
            const song = this.getCurrentSong();
            const track = song.tracks[trackIdx];

            startY = e.touches ? e.touches[0].pageY : e.pageY;
            startVal = (type === 'vol') ? track.volume : track.pan;

            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleMove, { passive: false });
            window.addEventListener('touchend', handleEnd);
        };

        const handleMove = (e) => {
            if (!activeKnob) return;
            e.preventDefault(); // スクロール防止

            const currentY = e.touches ? e.touches[0].pageY : e.pageY;
            const deltaY = startY - currentY; // 上にドラッグでプラス

            const song = this.getCurrentSong();
            const trackIdx = parseInt(activeKnob.dataset.track);
            const track = song.tracks[trackIdx];
            const type = activeKnob.dataset.type;

            // 感度調整
            const Sensitivity = 0.005;

            if (type === 'vol') {
                let newVal = startVal + (deltaY * Sensitivity);
                newVal = Math.max(0.0, Math.min(1.0, newVal));
                track.volume = newVal;
            } else {
                let newVal = startVal + (deltaY * Sensitivity);
                newVal = Math.max(-1.0, Math.min(1.0, newVal));
                track.pan = newVal;
            }

            this.updateChannelStripUI();
        };

        const handleEnd = () => {
            activeKnob = null;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        };

        const container = document.getElementById('bgm-channel-strip');
        container.addEventListener('mousedown', handleStart);
        container.addEventListener('touchstart', handleStart, { passive: false });
        container.addEventListener('click', handleDoubleTap);
        container.addEventListener('touchend', (e) => {
            // タッチでのダブルタップ検出（iPhone対応）
            if (e.target.classList.contains('knob-ctrl')) {
                handleDoubleTap(e);
            }
        });
    },

    // ========== Song Jukebox (ソングリスト) ==========
    initSongJukebox() {
        const modal = document.getElementById('song-jukebox-modal');
        const closeBtn = document.getElementById('jukebox-close-btn');
        const addBtn = document.getElementById('jukebox-add-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.addSong();
                this.renderJukeboxList(); // リスト更新
                modal.classList.add('hidden'); // 閉じて編集へ
            });
        }
    },

    openSongJukebox() {
        const modal = document.getElementById('song-jukebox-modal');
        this.renderJukeboxList();
        modal.classList.remove('hidden');
    },

    renderJukeboxList() {
        const listContainer = document.getElementById('jukebox-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        this.songs.forEach((song, idx) => {
            const item = document.createElement('div');
            item.className = 'jukebox-item' + (idx === this.currentSongIdx ? ' active' : '');

            // 再生ボタン
            const playBtn = document.createElement('button');
            playBtn.className = 'jukebox-play-btn';
            playBtn.innerHTML = '▶';
            playBtn.onclick = (e) => {
                e.stopPropagation();
                this.selectSong(idx);
                this.play();
                document.querySelectorAll('.jukebox-play-btn').forEach(b => {
                    b.innerHTML = '▶'; b.classList.remove('playing');
                });
                playBtn.innerHTML = '■';
                playBtn.classList.add('playing');
            };

            // 情報エリア（ソング名のみ）
            const infoDiv = document.createElement('div');
            infoDiv.className = 'jukebox-info';
            infoDiv.innerHTML = `<div class="jukebox-title">${song.name}</div>`;

            // タップで選択
            infoDiv.onclick = () => {
                this.selectSong(idx);
                document.getElementById('song-jukebox-modal').classList.add('hidden');
            };

            // 長押しで削除
            let longPressTimer;
            const startLongPress = (e) => {
                longPressTimer = setTimeout(() => {
                    if (this.songs.length <= 1) {
                        alert('最後のソングは削除できません');
                        return;
                    }
                    if (confirm(`"${song.name}" を削除しますか？`)) {
                        this.deleteSong(idx);
                        this.renderJukeboxList();
                    }
                }, 800);
            };
            const cancelLongPress = () => {
                clearTimeout(longPressTimer);
            };
            infoDiv.addEventListener('mousedown', startLongPress);
            infoDiv.addEventListener('touchstart', startLongPress, { passive: true });
            infoDiv.addEventListener('mouseup', cancelLongPress);
            infoDiv.addEventListener('mouseleave', cancelLongPress);
            infoDiv.addEventListener('touchend', cancelLongPress);

            item.appendChild(playBtn);
            item.appendChild(infoDiv);

            listContainer.appendChild(item);
        });
    },

    showSongContextMenu(idx, event) {
        // 簡易実装：ブラウザ標準のconfirm/promptで代用
        const action = prompt('操作を選択 (delete / duplicate / rename)', 'duplicate');
        if (!action) return;

        if (action.toLowerCase() === 'delete') {
            this.deleteSong(idx);
            this.renderJukeboxList();
        } else if (action.toLowerCase() === 'duplicate') {
            this.duplicateSong(idx);
            this.renderJukeboxList();
        } else if (action.toLowerCase() === 'rename') {
            const song = this.songs[idx];
            const newName = prompt('新しい名前', song.name);
            if (newName) {
                song.name = newName;
                this.renderJukeboxList();
                this.updateConsoleDisplay();
            }
        }
    },

    duplicateSong(idx) {
        const srcSong = this.songs[idx];
        const newSong = JSON.parse(JSON.stringify(srcSong));
        newSong.id = this.songs.length;
        newSong.name = srcSong.name + '_copy';
        this.songs.push(newSong);

        // 追加したソングへ移動
        this.selectSong(this.songs.length - 1);
    },

    addSong() {
        const id = this.songs.length;
        const song = {
            id: id,
            name: `Song${id + 1}`,
            bpm: 120,
            bars: 1,
            tracks: [
                { type: 'square', notes: [], volume: 0.65, pan: 0.0, tone: 0 },
                { type: 'square', notes: [], volume: 0.65, pan: 0.0, tone: 0 },
                { type: 'triangle', notes: [], volume: 0.65, pan: 0.0, tone: 0 },
                { type: 'noise', notes: [], volume: 0.65, pan: 0.0, tone: 0 }
            ]
        };
        this.songs.push(song);
        this.currentSongIdx = id;
        this.updateConsoleDisplay();
        this.render();
    },

    selectSong(idx) {
        this.currentSongIdx = idx;
        this.scrollX = 0;
        this.currentStep = 0;
        this.updateConsoleDisplay();
        this.updateChannelStripUI();
        this.render();
    },

    getCurrentSong() {
        return this.songs[this.currentSongIdx] || this.songs[0];
    },

    // ========== 編集ツール ==========
    initTools() {
        const tools = document.querySelectorAll('.sound-tool-btn');
        tools.forEach(tool => {
            tool.addEventListener('click', () => {
                tools.forEach(t => t.classList.remove('active'));
                tool.classList.add('active');
                this.currentTool = tool.dataset.tool || 'pencil';
            });
        });
    },

    // ========== プレイヤーパネル ==========
    initPlayerPanel() {
        // DEL (UNDO) - 通常タップ: 直前のノート削除、長押し: トラック全削除
        const delBtn = document.getElementById('sound-del-btn');
        if (delBtn) {
            let longPressTimer = null;
            let isLongPress = false;

            const startLongPress = () => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.clearCurrentTrack();
                }, 800);
            };

            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            };

            delBtn.addEventListener('mousedown', startLongPress);
            delBtn.addEventListener('mouseup', cancelLongPress);
            delBtn.addEventListener('mouseleave', cancelLongPress);
            delBtn.addEventListener('touchstart', startLongPress, { passive: true });
            delBtn.addEventListener('touchend', cancelLongPress);
            delBtn.addEventListener('touchcancel', cancelLongPress);

            delBtn.addEventListener('click', () => {
                if (!isLongPress) {
                    this.deleteLastNote();
                }
            });
        }

        // PLAY/PAUSE/STOP（シングル=一時停止/再生、ダブル=停止）
        const playBtn = document.getElementById('sound-play-btn');
        if (playBtn) {
            let lastClickTime = 0;
            playBtn.addEventListener('click', (e) => {
                // 親のdiv(sound-controls)への伝播を防ぐ必要はないが念のため
                const now = Date.now();
                if (now - lastClickTime < 300) {
                    // ダブルクリック: 停止（位置リセット）
                    this.stop();
                } else if (this.isPlaying) {
                    // 再生中シングルクリック: 一時停止
                    this.pause();
                } else if (this.isPaused) {
                    // 一時停止中シングルクリック: 再開
                    this.resume();
                } else {
                    // 停止中シングルクリック: 再生
                    this.play();
                }
                lastClickTime = now;
            });
        }

        // STEP REC（ステップ録音ON/OFF）
        const stepRecBtn = document.getElementById('sound-step-rec-btn');
        if (stepRecBtn) {
            stepRecBtn.addEventListener('click', () => {
                this.isStepRecording = !this.isStepRecording;
                stepRecBtn.classList.toggle('active', this.isStepRecording);
                if (this.isStepRecording) {
                    // ステップ録音ON: 現在位置をリセット
                    this.currentStep = 0;
                    this.render();
                }
            });
        }

        // COPY（現在トラックのノートをコピー）
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyTrack());
        }

        // PASTE（コピーしたノートをペースト）
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) {
            pasteBtn.addEventListener('click', () => this.pasteTrack());
        }

        // REST（ステップを進める、休符入力）
        const restBtn = document.getElementById('sound-rest-btn');
        if (restBtn) {
            restBtn.addEventListener('click', () => {
                if (this.isStepRecording) {
                    this.currentStep++;
                    const song = this.getCurrentSong();
                    const maxSteps = song.bars * 16;
                    if (this.currentStep >= maxSteps) {
                        this.currentStep = 0;
                    }
                    this.render();
                }
            });
        }

        // TIE（直前のノートを1ステップ延長）
        const tieBtn = document.getElementById('sound-tie-btn');
        if (tieBtn) {
            tieBtn.addEventListener('click', () => {
                if (this.isStepRecording) {
                    const song = this.getCurrentSong();
                    const track = song.tracks[this.currentTrack];
                    // 直前のステップにあるノートを延長
                    const prevStep = this.currentStep - 1;
                    if (prevStep >= 0) {
                        const prevNote = track.notes.find(n => n.step + n.length - 1 === prevStep);
                        if (prevNote) {
                            prevNote.length++;
                            this.currentStep++;
                            const maxSteps = song.bars * 16;
                            if (this.currentStep >= maxSteps) {
                                this.currentStep = 0;
                            }
                            this.render();
                        }
                    }
                }
            });
        }
    },

    // ========== 鍵盤 ==========
    initKeyboard() {
        const container = document.getElementById('piano-keyboard');
        const keyboardArea = document.getElementById('keyboard-area');
        if (!container || !keyboardArea) return;
        container.innerHTML = '';

        // 6オクターブ (C1-B6)
        const octaves = [1, 2, 3, 4, 5, 6];
        let whiteKeyIndex = 0;
        const whiteKeyWidth = 40; // CSS拡大版に合わせる

        octaves.forEach(oct => {
            this.noteNames.forEach((note, idx) => {
                const isBlack = note.includes('#');
                const key = document.createElement('div');
                key.className = 'piano-key ' + (isBlack ? 'black' : 'white');
                key.dataset.note = note;
                key.dataset.octave = oct;

                if (isBlack) {
                    // 黒鍵の位置を計算 (白鍵幅40pxに対応)
                    const prevWhiteKeys = whiteKeyIndex;
                    key.style.left = (prevWhiteKeys * whiteKeyWidth - 12) + 'px';
                } else {
                    whiteKeyIndex++;
                }

                // 鍵盤押下開始
                const startHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startKeySound(note, oct);
                };

                // 鍵盤離す
                const endHandler = (e) => {
                    this.stopKeySound();
                };

                key.addEventListener('touchstart', startHandler, { passive: false });
                key.addEventListener('mousedown', startHandler);
                key.addEventListener('touchend', endHandler);
                key.addEventListener('touchcancel', endHandler);
                key.addEventListener('mouseup', endHandler);
                key.addEventListener('mouseleave', endHandler);

                container.appendChild(key);
            });
        });

        // ドラッグスクロール機能
        let isDragging = false;
        let startX = 0;
        let scrollLeft = 0;

        keyboardArea.addEventListener('mousedown', (e) => {
            // 鍵盤自体のクリックは除外
            if (e.target.classList.contains('piano-key')) return;
            isDragging = true;
            startX = e.pageX - keyboardArea.offsetLeft;
            scrollLeft = keyboardArea.scrollLeft;
            keyboardArea.style.cursor = 'grabbing';
        });

        keyboardArea.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const x = e.pageX - keyboardArea.offsetLeft;
            const walk = (x - startX) * 1.5;
            keyboardArea.scrollLeft = scrollLeft - walk;
        });

        keyboardArea.addEventListener('mouseup', () => {
            isDragging = false;
            keyboardArea.style.cursor = 'grab';
        });

        keyboardArea.addEventListener('mouseleave', () => {
            isDragging = false;
            keyboardArea.style.cursor = 'grab';
        });

        // タッチスクロール
        let touchStartX = 0;
        let touchScrollLeft = 0;

        keyboardArea.addEventListener('touchstart', (e) => {
            if (e.target.classList.contains('piano-key')) return;
            touchStartX = e.touches[0].pageX;
            touchScrollLeft = keyboardArea.scrollLeft;
        }, { passive: true });

        keyboardArea.addEventListener('touchmove', (e) => {
            if (e.target.classList.contains('piano-key')) return;
            const x = e.touches[0].pageX;
            const walk = (touchStartX - x) * 1.5;
            keyboardArea.scrollLeft = touchScrollLeft + walk;
            this.updateScrollbar();
        }, { passive: true });

        // 初期カーソル
        keyboardArea.style.cursor = 'grab';

        // rangeスライダー連動
        this.initKeyboardScrollbar();

        // 初期スクロール位置（C4が左端に表示）
        // C1からC4まで白鍵は21個（C,D,E,F,G,A,B × 3オクターブ = 21個）
        // 白鍵幅40px × 21 = 840px
        const setInitialScroll = () => {
            const targetScroll = 840;
            if (keyboardArea.scrollWidth > keyboardArea.clientWidth) {
                keyboardArea.scrollLeft = targetScroll;

                // スクロールバーも同期
                const scrollbar = document.getElementById('keyboard-scrollbar');
                if (scrollbar) {
                    const maxScroll = keyboardArea.scrollWidth - keyboardArea.clientWidth;
                    if (maxScroll > 0) {
                        scrollbar.value = (targetScroll / maxScroll) * 100;
                    }
                }
            } else {
                // まだ描画されていない場合、再試行
                requestAnimationFrame(setInitialScroll);
            }
        };
        requestAnimationFrame(setInitialScroll);
    },

    initKeyboardScrollbar() {
        const scrollbar = document.getElementById('keyboard-scrollbar');
        const keyboardArea = document.getElementById('keyboard-area');
        if (!scrollbar || !keyboardArea) return;

        // スライダー操作時
        scrollbar.addEventListener('input', () => {
            const maxScroll = keyboardArea.scrollWidth - keyboardArea.clientWidth;
            keyboardArea.scrollLeft = (scrollbar.value / 100) * maxScroll;
        });

        // 鍵盤スクロール時
        keyboardArea.addEventListener('scroll', () => {
            this.updateScrollbar();
        });
    },

    updateScrollbar() {
        const scrollbar = document.getElementById('keyboard-scrollbar');
        const keyboardArea = document.getElementById('keyboard-area');
        if (!scrollbar || !keyboardArea) return;

        const maxScroll = keyboardArea.scrollWidth - keyboardArea.clientWidth;
        if (maxScroll > 0) {
            scrollbar.value = (keyboardArea.scrollLeft / maxScroll) * 100;
        }
    },

    onKeyPress(note, octave) {
        // 音再生
        this.playNote(note, octave);

        // ピアノロールのハイライト
        const pitch = this.noteToPitch(note, octave);
        this.highlightPitch = pitch;
        this.render();
        setTimeout(() => {
            this.highlightPitch = -1;
            this.render();
        }, 200);

        // ステップ録音ON時のみノート入力
        if (this.isStepRecording) {
            this.inputNote(note, octave);
        }
    },

    // 現在再生中のオシレーターとゲイン
    currentKeyOsc: null,
    // 現在再生中のオシレーターとゲイン、パン
    currentKeyOsc: null,
    currentKeyGain: null,

    startKeySound(note, octave) {
        // 既に再生中なら停止
        this.stopKeySound();

        if (!this.audioCtx) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const trackType = this.trackTypes[this.currentTrack];
        const pitch = this.noteToPitch(note, octave);
        const tone = track.tone || 0;

        // ノイズトラックはドラム音を使用
        if (trackType === 'noise') {
            const result = this.playDrum(pitch, 0.5, track.volume, track.pan, tone);
            if (result) {
                this.currentKeyOsc = result.noise;
                this.currentKeyGain = result.gain;
            }
        } else if (trackType === 'triangle' && tone === 3) {
            // Kickトーン：ピッチ下降音を再生
            this.playKickTone(note, octave, track.volume, track.pan);
        } else if (trackType === 'square' && tone === 6) {
            // Tremoloトーン：1オクターブ上と交互に高速切替
            const freq1 = this.getFrequency(note, octave);
            const freq2 = freq1 * 2;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const panner = this.audioCtx.createStereoPanner();

            panner.pan.value = track.pan;
            gain.connect(panner);
            panner.connect(this.audioCtx.destination);

            osc.type = 'square';

            // 高速で周波数を交互に切り替える（約30Hzで交互、5秒分スケジュール）
            const tremoloRate = 30;
            const maxDuration = 5;
            const numCycles = tremoloRate * maxDuration;
            const cycleTime = 1 / tremoloRate;

            for (let i = 0; i < numCycles; i++) {
                const t = this.audioCtx.currentTime + i * cycleTime;
                osc.frequency.setValueAtTime(i % 2 === 0 ? freq1 : freq2, t);
            }

            // TremoloはSQUARE Standard系なので音量120%増
            gain.gain.value = 0.0502 * track.volume;

            osc.connect(gain);
            osc.start();

            this.currentKeyOsc = osc;
            this.currentKeyGain = gain;
        } else {
            const freq = this.getFrequency(note, octave);
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            // パンポット（定位）
            const panner = this.audioCtx.createStereoPanner();
            panner.pan.value = track.pan;

            gain.connect(panner);
            panner.connect(this.audioCtx.destination);

            let volumeScale = 1.0;

            // 波形タイプと音色
            if (trackType === 'square') {
                // tone 0-2: Standard (50%), tone 3-5: Sharp (12.5%)
                if (tone >= 3 && tone <= 5) {
                    const wave = this.getPeriodicWave(0.125);
                    if (wave) osc.setPeriodicWave(wave);
                    else osc.type = 'square';
                } else {
                    osc.type = 'square';
                }
            } else if (trackType === 'triangle') {
                if (tone === 0) {
                    osc.type = 'triangle';
                } else if (tone === 1) {
                    osc.type = 'sine';
                } else if (tone === 2) {
                    osc.type = 'sawtooth';
                    volumeScale = 0.6;
                }
            }

            osc.frequency.value = freq;
            // SQUARE全体の音量を120%増
            let baseVol = 0.3;
            if (trackType === 'square') {
                if (tone === 1) {
                    baseVol = 0.0602; // Short: 0.0502 * 1.2
                } else if (tone === 0 || tone === 2) {
                    baseVol = 0.0502; // Standard/FadeIn: 0.0418 * 1.2
                } else {
                    baseVol = 0.228; // Sharp系: 0.19 * 1.2
                }
            }
            gain.gain.value = baseVol * track.volume * volumeScale;

            osc.connect(gain);
            osc.start();

            this.currentKeyOsc = osc;
            this.currentKeyGain = gain;
        }

        // ピアノロールのハイライト
        this.highlightPitch = pitch;
        this.render();

        // ステップ録音ON時のみノート入力
        if (this.isStepRecording) {
            this.inputNote(note, octave);
        }
    },

    stopKeySound() {
        if (this.currentKeyGain) {
            // フェードアウト
            this.currentKeyGain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
        }
        if (this.currentKeyOsc) {
            this.currentKeyOsc.stop(this.audioCtx.currentTime + 0.1);
            this.currentKeyOsc = null;
            this.currentKeyGain = null;
        }

        // ハイライト解除
        this.highlightPitch = -1;
        this.render();
    },

    // Kickトーン（短くピッチ下降する音）
    playKickTone(note, octave, volume, pan, duration = 0.15) {
        if (!this.audioCtx) return;

        const freq = this.getFrequency(note, octave);
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const panner = this.audioCtx.createStereoPanner();

        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(this.audioCtx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.25, this.audioCtx.currentTime + duration);

        gain.gain.setValueAtTime(0.5 * volume, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

        osc.connect(gain);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    },

    // トレモロ（1オクターブ上と交互に高速切替）
    playTremolo(note, octave, volume, pan, duration) {
        if (!this.audioCtx) return;

        const freq1 = this.getFrequency(note, octave);
        const freq2 = freq1 * 2; // 1オクターブ上
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const panner = this.audioCtx.createStereoPanner();

        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(this.audioCtx.destination);

        osc.type = 'square';

        // 高速で周波数を交互に切り替える（約30Hzで交互）
        const tremoloRate = 30;
        const numCycles = Math.ceil(duration * tremoloRate);
        const cycleTime = 1 / tremoloRate;

        for (let i = 0; i < numCycles; i++) {
            const t = this.audioCtx.currentTime + i * cycleTime;
            osc.frequency.setValueAtTime(i % 2 === 0 ? freq1 : freq2, t);
        }

        // TremoloはSQUARE Standard系なので音量120%増
        gain.gain.setValueAtTime(0.0502 * volume, this.audioCtx.currentTime);
        const sustainTime = duration * 0.8;
        gain.gain.setValueAtTime(0.0502 * volume, this.audioCtx.currentTime + sustainTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);

        osc.connect(gain);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    },

    playNote(note, octave, duration = 0.2) {
        if (!this.audioCtx) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const trackType = this.trackTypes[this.currentTrack];
        const tone = track.tone || 0;

        // ノイズトラックはドラム音を使用
        if (trackType === 'noise') {
            const pitch = this.noteToPitch(note, octave);
            this.playDrum(pitch, duration, track.volume, track.pan, tone);
            return;
        }

        // TRIANGLE Kickトーン
        if (trackType === 'triangle' && tone === 3) {
            this.playKickTone(note, octave, track.volume, track.pan, duration);
            return;
        }

        // SQUARE Tremoloトーン
        if (trackType === 'square' && tone === 6) {
            this.playTremolo(note, octave, track.volume, track.pan, duration);
            return;
        }

        // 通常の音色
        const gain = this.audioCtx.createGain();
        const panner = this.audioCtx.createStereoPanner();
        panner.pan.value = track.pan;
        gain.connect(panner);
        panner.connect(this.audioCtx.destination);

        const freq = this.getFrequency(note, octave);
        const osc = this.audioCtx.createOscillator();
        let volumeScale = 1.0;

        // 波形タイプ
        if (trackType === 'square') {
            // tone 0-2: Standard (50%), tone 3-5: Sharp (12.5%)
            if (tone >= 3 && tone <= 5) {
                const wave = this.getPeriodicWave(0.125);
                if (wave) osc.setPeriodicWave(wave);
                else osc.type = 'square';
            } else {
                osc.type = 'square';
            }
        } else if (trackType === 'triangle') {
            if (tone === 0) osc.type = 'triangle';
            else if (tone === 1) osc.type = 'sine';
            else if (tone === 2) {
                osc.type = 'sawtooth';
                volumeScale = 0.6;
            }
        }

        osc.frequency.value = freq;

        // SQUARE全体の音量を120%増
        let baseVol = (trackType === 'square') ? 0.228 : 0.3; // Sharp系: 0.19 * 1.2
        if (trackType === 'square' && tone === 1) {
            baseVol = 0.0602; // Standard Short: 0.0502 * 1.2
        } else if (trackType === 'square' && (tone === 0 || tone === 2)) {
            baseVol = 0.0502; // Standard/FadeIn: 0.0418 * 1.2
        }
        const volume = baseVol * track.volume * volumeScale;

        // エンベロープ設定
        const isShort = (tone === 1 || tone === 4); // Standard Short or Sharp Short
        const isFadeIn = (tone === 2 || tone === 5); // Standard FadeIn or Sharp FadeIn

        if (isShort) {
            // Short: 短くスタッカート気味
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration * 0.5);
        } else if (isFadeIn) {
            // FadeIn: アタックがなく徐々に大きくなる
            gain.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(volume, this.audioCtx.currentTime + duration * 0.7);
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime + duration * 0.9);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        } else {
            // Normal: 通常のエンベロープ
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
            const sustainTime = duration * 0.8;
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime + sustainTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        }

        osc.connect(gain);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    },

    // 再生用（トラックごとに同時発音数1に制限）
    playNoteMonophonic(note, octave, duration, trackIdx) {
        if (!this.audioCtx) return;

        const song = this.getCurrentSong();
        const track = song.tracks[trackIdx];
        const trackType = this.trackTypes[trackIdx];
        const tone = track.tone || 0;

        // 前の音を停止
        if (this.activeOscillators[trackIdx]) {
            try {
                this.activeOscillators[trackIdx].osc.stop();
            } catch (e) { }
            this.activeOscillators[trackIdx] = null;
        }

        // ノイズトラックはドラム音を使用
        if (trackType === 'noise') {
            const pitch = this.noteToPitch(note, octave);
            this.playDrum(pitch, duration, track.volume, track.pan, tone);
            return;
        }

        // TRIANGLE Kickトーン
        if (trackType === 'triangle' && tone === 3) {
            this.playKickTone(note, octave, track.volume, track.pan, duration);
            return;
        }

        // SQUARE Tremoloトーン
        if (trackType === 'square' && tone === 6) {
            this.playTremolo(note, octave, track.volume, track.pan, duration);
            return;
        }

        // 通常の音色
        const gain = this.audioCtx.createGain();
        const panner = this.audioCtx.createStereoPanner();
        panner.pan.value = track.pan;
        gain.connect(panner);
        panner.connect(this.audioCtx.destination);

        const freq = this.getFrequency(note, octave);
        const osc = this.audioCtx.createOscillator();
        let volumeScale = 1.0;

        // 波形タイプ
        if (trackType === 'square') {
            // tone 0-2: Standard (50%), tone 3-5: Sharp (12.5%)
            if (tone >= 3 && tone <= 5) {
                const wave = this.getPeriodicWave(0.125);
                if (wave) osc.setPeriodicWave(wave);
                else osc.type = 'square';
            } else {
                osc.type = 'square';
            }
        } else if (trackType === 'triangle') {
            if (tone === 0) osc.type = 'triangle';
            else if (tone === 1) osc.type = 'sine';
            else if (tone === 2) {
                osc.type = 'sawtooth';
                volumeScale = 0.6;
            }
        }

        osc.frequency.value = freq;

        // SQUARE全体の音量を120%増
        let baseVol = (trackType === 'square') ? 0.228 : 0.3; // Sharp系: 0.19 * 1.2
        if (trackType === 'square' && tone === 1) {
            baseVol = 0.0602; // Standard Short: 0.0502 * 1.2
        } else if (trackType === 'square' && (tone === 0 || tone === 2)) {
            baseVol = 0.0502; // Standard/FadeIn: 0.0418 * 1.2
        }
        const volume = baseVol * track.volume * volumeScale;

        // エンベロープ設定
        const isShort = (tone === 1 || tone === 4); // Standard Short or Sharp Short
        const isFadeIn = (tone === 2 || tone === 5); // Standard FadeIn or Sharp FadeIn

        if (isShort) {
            // Short: 短くスタッカート気味
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration * 0.5);
        } else if (isFadeIn) {
            // FadeIn: アタックがなく徐々に大きくなる
            gain.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(volume, this.audioCtx.currentTime + duration * 0.7);
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime + duration * 0.9);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        } else {
            // Normal: 通常のエンベロープ
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
            gain.gain.setValueAtTime(volume, this.audioCtx.currentTime + duration - 0.05);
            gain.gain.linearRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        }

        osc.connect(gain);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration + 0.05);

        this.activeOscillators[trackIdx] = { osc, gain };

        // 停止後にクリア
        setTimeout(() => {
            if (this.activeOscillators[trackIdx] && this.activeOscillators[trackIdx].osc === osc) {
                this.activeOscillators[trackIdx] = null;
            }
        }, duration * 1000);
    },

    getFrequency(note, octave) {
        const noteIdx = this.noteNames.indexOf(note);
        // A4 = 440Hz
        const semitone = (octave - 4) * 12 + noteIdx - 9;
        return 440 * Math.pow(2, semitone / 12);
    },

    noteToPitch(note, octave) {
        // C1 = 0, B5 = 59
        const noteIdx = this.noteNames.indexOf(note);
        return (octave - 1) * 12 + noteIdx;
    },

    pitchToNote(pitch) {
        const octave = Math.floor(pitch / 12) + 1;
        const noteIdx = pitch % 12;
        return { note: this.noteNames[noteIdx], octave };
    },

    // ドラム音生成（粒立ちはっきり、低音はバスドラム的アタック）
    // tone: 0=Drum(標準), 1=Staccato(短く強いアタック)
    playDrum(pitch, duration, volume = 1.0, pan = 0.0, tone = 0) {
        if (!this.audioCtx) return null;

        const bufferSize = this.audioCtx.sampleRate * Math.max(duration, 0.05);
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // ノイズ生成
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;

        const gain = this.audioCtx.createGain();
        const filter = this.audioCtx.createBiquadFilter();

        // パンポット（定位）
        const panner = this.audioCtx.createStereoPanner();
        panner.pan.value = pan;

        // ピッチ0-71を周波数にマッピング
        const minFreq = 60;
        const maxFreq = 12000;
        const maxPitch = 71;
        const freqRatio = Math.pow(maxFreq / minFreq, pitch / maxPitch);
        const filterFreq = minFreq * freqRatio;

        // 低音（バスドラム）/ 中音（スネア）/ 高音（ハイハット）で特性を変える
        let drumVol = 0.6 * volume;
        let attackTime = 0.01;
        let decayTime = duration;

        if (pitch < 24) {
            // バスドラム: 低いローパス + 強いアタック + 短い減衰
            filter.type = 'lowpass';
            filter.frequency.value = Math.max(filterFreq, 100);
            filter.Q.value = 3;
            drumVol = 0.9 * volume;
            attackTime = 0.005;
            decayTime = tone === 1 ? duration * 0.25 : duration * 0.7;
        } else if (pitch < 48) {
            // スネア: バンドパス + 粒立ち良く
            filter.type = 'bandpass';
            filter.frequency.value = filterFreq;
            filter.Q.value = 3;
            drumVol = 0.7 * volume;
            decayTime = tone === 1 ? duration * 0.2 : duration;
        } else {
            // ハイハット: ハイパス + シャープ
            filter.type = 'highpass';
            filter.frequency.value = filterFreq;
            filter.Q.value = 6;
            drumVol = 0.5 * volume;
            decayTime = tone === 1 ? duration * 0.15 : duration;
        }

        // Staccatoはアタックを更に強く
        if (tone === 1) {
            drumVol *= 1.3;
            attackTime = 0.002;
        }

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(this.audioCtx.destination);

        // エンベロープ: 強いアタック + 明確な減衰
        gain.gain.setValueAtTime(drumVol, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(drumVol, this.audioCtx.currentTime + attackTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + decayTime);

        noise.start();
        noise.stop(this.audioCtx.currentTime + duration);

        return { noise: noise, gain: gain };
    },
    // ========== ノート入力 ==========
    inputNote(note, octave, length = 1) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const pitch = this.noteToPitch(note, octave);
        const maxSteps = song.bars * 16;

        if (this.currentStep < maxSteps) {
            track.notes.push({
                step: this.currentStep,
                pitch: pitch,
                length: length
            });
            this.currentStep++;
            this.render();
        }
    },

    inputRest() {
        const song = this.getCurrentSong();
        const maxSteps = song.bars * 16;
        if (this.currentStep < maxSteps) {
            this.currentStep++;
            this.render();
        }
    },

    inputTie() {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const maxSteps = song.bars * 16;

        if (track.notes.length > 0) {
            const lastNote = track.notes[track.notes.length - 1];
            lastNote.length++;
            // ノートを伸ばした分、currentStepも進める
            if (this.currentStep < maxSteps) {
                this.currentStep++;
            }
            this.render();
        }
    },

    deleteLastNote() {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        if (track.notes.length > 0) {
            track.notes.pop();
            if (this.currentStep > 0) this.currentStep--;
            this.render();
        }
    },

    clearCurrentTrack() {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        if (track.notes.length === 0) return;

        // iOSでconfirmダイアログ中に音が溜まる問題対策：再生停止
        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            this.stop();
        }

        if (!confirm(`Tr${this.currentTrack + 1}の全ノートを削除しますか？`)) {
            // iOSでconfirmダイアログ後にAudioContextが壊れる対策：再作成
            this.resetAudioContext();
            return;
        }

        // iOSでconfirmダイアログ後にAudioContextが壊れる対策：再作成
        this.resetAudioContext();

        track.notes = [];
        this.currentStep = 0;
        this.render();
    },

    // ========== コピー/ペースト（範囲選択方式） ==========
    // コピー/ペースト用の状態
    selectionMode: false,
    pasteMode: false,
    selectionStart: null,
    selectionEnd: null,
    noteClipboard: null,
    pasteOffset: { step: 0, pitch: 0 },

    // コピーモード開始（範囲選択）
    copyTrack() {
        this.selectionMode = true;
        this.pasteMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;

        // コピーボタンをアクティブに
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.add('active');
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.remove('active');

        this.render();
    },

    // 範囲コピー確定
    confirmRangeCopy() {
        if (!this.selectionStart || !this.selectionEnd) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];

        const step1 = Math.min(this.selectionStart.step, this.selectionEnd.step);
        const step2 = Math.max(this.selectionStart.step, this.selectionEnd.step);
        const pitch1 = Math.min(this.selectionStart.pitch, this.selectionEnd.pitch);
        const pitch2 = Math.max(this.selectionStart.pitch, this.selectionEnd.pitch);

        // 範囲内のノートをコピー（相対位置で保存）
        const copiedNotes = [];
        track.notes.forEach(note => {
            if (note.step >= step1 && note.step <= step2 &&
                note.pitch >= pitch1 && note.pitch <= pitch2) {
                copiedNotes.push({
                    relStep: note.step - step1,
                    relPitch: note.pitch - pitch1,
                    length: note.length
                });
            }
        });

        if (copiedNotes.length === 0) {
            // コピー対象なし
            this.selectionMode = false;
            this.selectionStart = null;
            this.selectionEnd = null;
            const copyBtn = document.getElementById('sound-copy-btn');
            if (copyBtn) copyBtn.classList.remove('active');
            this.render();
            return;
        }

        this.noteClipboard = {
            notes: copiedNotes,
            width: step2 - step1 + 1,
            height: pitch2 - pitch1 + 1
        };

        // 選択モード終了
        this.selectionMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.remove('active');
        this.render();
    },

    // ペーストモード開始
    pasteTrack() {
        if (!this.noteClipboard || this.noteClipboard.notes.length === 0) {
            return;
        }

        this.pasteMode = true;
        this.selectionMode = false;
        // 2ステップ右、2ピッチ下にオフセット
        this.pasteOffset = { step: 2, pitch: 2 };

        // ペーストボタンをアクティブに
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.add('active');
        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.remove('active');

        this.render();
    },

    // ペースト確定
    confirmPaste() {
        if (!this.noteClipboard) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const maxSteps = song.bars * 16;

        // ペーストデータを追加
        this.noteClipboard.notes.forEach(copyNote => {
            const newStep = this.pasteOffset.step + copyNote.relStep;
            const newPitch = this.pasteOffset.pitch + copyNote.relPitch;

            // 範囲チェック
            if (newStep >= 0 && newStep < maxSteps && newPitch >= 0 && newPitch < 72) {
                // 既存ノートとの重複チェック
                const exists = track.notes.some(n => n.step === newStep && n.pitch === newPitch);
                if (!exists) {
                    track.notes.push({
                        step: newStep,
                        pitch: newPitch,
                        length: copyNote.length
                    });
                }
            }
        });

        // ペーストモード終了
        this.pasteMode = false;
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.remove('active');
        this.render();
    },

    // コピー/ペーストのキャンセル
    cancelCopyPaste() {
        this.selectionMode = false;
        this.pasteMode = false;
        this.selectionStart = null;
        this.selectionEnd = null;

        const copyBtn = document.getElementById('sound-copy-btn');
        if (copyBtn) copyBtn.classList.remove('active');
        const pasteBtn = document.getElementById('sound-paste-btn');
        if (pasteBtn) pasteBtn.classList.remove('active');

        this.render();
    },

    // ========== ピアノロール ==========
    initPianoRoll() {
        if (!this.canvas) return;

        let isDragging = false;
        let startX = 0, startY = 0;

        // 長押し＆ドラッグ用
        let longPressTimer = null;
        let isLongPress = false;
        let draggingNote = null;
        let originalStep = 0;
        let originalPitch = 0;

        // 新規ノート入力用（ドラッグで長さ設定）
        let isCreatingNote = false;
        let creatingNote = null;
        let createStartStep = 0;

        // 2本指スクロール用
        let isTwoFingerPan = false;
        let lastTouchX = 0;
        let lastTouchY = 0;

        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            // CSSスケーリングを考慮: 表示サイズと内部解像度の比率で変換
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            return {
                x: (touch.clientX - rect.left) * scaleX,
                y: (touch.clientY - rect.top) * scaleY
            };
        };

        const getPosFromEvent = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            if (e.changedTouches) {
                return {
                    x: (e.changedTouches[0].clientX - rect.left) * scaleX,
                    y: (e.changedTouches[0].clientY - rect.top) * scaleY
                };
            }
            return getPos(e);
        };

        const getStepPitch = (pos) => {
            const scrollY = this.scrollY || 0;
            const step = Math.floor((pos.x + this.scrollX) / this.cellSize);
            // C1-B5（pitch 0-59）の60音範囲（noteToPitchと一致）
            // scrollYで縦スクロール、上が高音（B5=59）、下が低音（C1=0）
            const maxPitch = 71; // B6
            const row = Math.floor((pos.y + scrollY) / this.cellSize);
            const pitch = Math.max(0, Math.min(71, maxPitch - row));
            return { step, pitch };
        };

        // 2本指パン誤入力防止用
        let pendingInputTimer = null;
        let pendingInputData = null;

        // タッチスタート
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // 2本指パン開始 - 保留中の入力があればキャンセル
                if (pendingInputTimer) {
                    clearTimeout(pendingInputTimer);
                    pendingInputTimer = null;
                    pendingInputData = null;
                }
                // 作成中のノートがあれば削除
                if (isCreatingNote && creatingNote) {
                    const song = this.getCurrentSong();
                    const track = song.tracks[this.currentTrack];
                    const idx = track.notes.indexOf(creatingNote);
                    if (idx >= 0) {
                        track.notes.splice(idx, 1);
                        this.render();
                    }
                    isCreatingNote = false;
                    creatingNote = null;
                }
                isTwoFingerPan = true;
                lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                isDragging = false;
                e.preventDefault();
                return;
            }

            if (e.touches.length === 1) {
                e.preventDefault();
                const pos = getPos(e);
                const { step, pitch } = getStepPitch(pos);

                isDragging = true;
                startX = pos.x;
                startY = pos.y;

                // 選択モード中
                if (this.selectionMode) {
                    if (!this.selectionStart) {
                        this.selectionStart = { step, pitch };
                        this.selectionEnd = { step, pitch };
                    } else {
                        this.selectionEnd = { step, pitch };
                    }
                    this.render();
                    return;
                }

                // ペーストモード中
                if (this.pasteMode) {
                    this.pasteOffset = { step, pitch };
                    this.render();
                    return;
                }

                // ノートがあるかチェック
                const note = this.findNoteAt(step, pitch);

                if (note) {
                    // 長押し検出開始（既存ノートの移動用）
                    originalStep = note.step;
                    originalPitch = note.pitch;
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        draggingNote = note;
                    }, 300);
                } else {
                    // 空セル: 遅延してノート作成（2本指パン誤入力防止）
                    pendingInputData = { step, pitch, pos };
                    pendingInputTimer = setTimeout(() => {
                        // 選択モード/ペーストモード中はノート作成しない
                        if (this.selectionMode || this.pasteMode) {
                            pendingInputTimer = null;
                            pendingInputData = null;
                            return;
                        }
                        if (pendingInputData && !isTwoFingerPan) {
                            const newNote = { step: pendingInputData.step, pitch: pendingInputData.pitch, length: 1 };
                            const song = this.getCurrentSong();
                            song.tracks[this.currentTrack].notes.push(newNote);
                            isCreatingNote = true;
                            creatingNote = newNote;
                            createStartStep = pendingInputData.step;
                            const { note: noteName, octave } = this.pitchToNote(pendingInputData.pitch);
                            this.playNote(noteName, octave);
                            this.render();
                        }
                        pendingInputTimer = null;
                        pendingInputData = null;
                    }, 50);
                }
            }
        });

        this.canvas.addEventListener('mousedown', (e) => {
            const pos = getPos(e);
            const { step, pitch } = getStepPitch(pos);

            isDragging = true;
            startX = pos.x;
            startY = pos.y;

            // 選択モード中
            if (this.selectionMode) {
                if (!this.selectionStart) {
                    this.selectionStart = { step, pitch };
                    this.selectionEnd = { step, pitch };
                } else {
                    this.selectionEnd = { step, pitch };
                }
                this.render();
                return;
            }

            // ペーストモード中
            if (this.pasteMode) {
                this.pasteOffset = { step, pitch };
                this.render();
                return;
            }

            // ノートがあるかチェック
            const note = this.findNoteAt(step, pitch);

            if (note) {
                // 長押し検出開始（既存ノートの移動用）
                originalStep = note.step;
                originalPitch = note.pitch;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    draggingNote = note;
                }, 300);
            } else {
                // 空セル: 新規ノート作成（ドラッグで長さ設定）
                const newNote = { step, pitch, length: 1 };
                const song = this.getCurrentSong();
                song.tracks[this.currentTrack].notes.push(newNote);
                isCreatingNote = true;
                creatingNote = newNote;
                createStartStep = step;
                const { note: noteName, octave } = this.pitchToNote(pitch);
                this.playNote(noteName, octave);
                this.render();
            }
        });

        // タッチムーブ
        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && isTwoFingerPan) {
                // 2本指パンスクロール
                const currentX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const deltaX = lastTouchX - currentX;
                const deltaY = lastTouchY - currentY;

                this.scrollX = Math.max(0, this.scrollX + deltaX);
                // 72音（pitch 0-71）× 20px = 1440px の縦スクロール範囲（6オクターブ）
                const maxScrollY = 72 * this.cellSize - this.canvas.height;
                this.scrollY = Math.max(0, Math.min(maxScrollY, this.scrollY + deltaY));

                lastTouchX = currentX;
                lastTouchY = currentY;
                this.render();
                e.preventDefault();
            } else if (isDragging && e.touches.length === 1) {
                e.preventDefault();

                const pos = getPos(e);
                const moved = Math.abs(pos.x - startX) > 5 || Math.abs(pos.y - startY) > 5;

                if (moved && !isLongPress && !isCreatingNote) {
                    clearTimeout(longPressTimer);
                }

                // 選択モード中のドラッグ
                if (this.selectionMode && this.selectionStart) {
                    const { step, pitch } = getStepPitch(pos);
                    this.selectionEnd = { step, pitch };
                    this.render();
                    return;
                }

                // ペーストモード中のドラッグ
                if (this.pasteMode) {
                    const { step, pitch } = getStepPitch(pos);
                    this.pasteOffset = { step, pitch };
                    this.render();
                    return;
                }

                // 長押しドラッグ中ならノート移動
                if (isLongPress && draggingNote) {
                    const { step, pitch } = getStepPitch(pos);
                    draggingNote.step = Math.max(0, step);
                    draggingNote.pitch = pitch;
                    this.render();
                }

                // 新規ノート作成中ならドラッグで長さ更新
                if (isCreatingNote && creatingNote) {
                    const { step } = getStepPitch(pos);
                    const length = Math.max(1, step - createStartStep + 1);
                    creatingNote.length = length;
                    this.render();
                }
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const pos = getPos(e);
                const moved = Math.abs(pos.x - startX) > 5 || Math.abs(pos.y - startY) > 5;

                if (moved && !isLongPress && !isCreatingNote) {
                    clearTimeout(longPressTimer);
                }

                // 選択モード中のドラッグ
                if (this.selectionMode && this.selectionStart) {
                    const { step, pitch } = getStepPitch(pos);
                    this.selectionEnd = { step, pitch };
                    this.render();
                    return;
                }

                // ペーストモード中のドラッグ
                if (this.pasteMode) {
                    const { step, pitch } = getStepPitch(pos);
                    this.pasteOffset = { step, pitch };
                    this.render();
                    return;
                }

                // 長押しドラッグ中ならノート移動
                if (isLongPress && draggingNote) {
                    const { step, pitch } = getStepPitch(pos);
                    draggingNote.step = Math.max(0, step);
                    draggingNote.pitch = pitch;
                    this.render();
                }

                // 新規ノート作成中ならドラッグで長さ更新
                if (isCreatingNote && creatingNote) {
                    const { step } = getStepPitch(pos);
                    const length = Math.max(1, step - createStartStep + 1);
                    creatingNote.length = length;
                    this.render();
                }
            }
        });

        // タッチエンド
        this.canvas.addEventListener('touchend', (e) => {
            // 2本指パン中に1本離れた場合は何もしない
            if (e.touches.length === 1 && isTwoFingerPan) {
                return;
            }

            if (e.touches.length === 0) {
                // 2本指パン中だった場合はフラグリセットのみ
                if (isTwoFingerPan) {
                    isTwoFingerPan = false;
                    isDragging = false;
                    return;
                }

                // 選択モード中：範囲コピー確定
                if (this.selectionMode && this.selectionStart && this.selectionEnd) {
                    this.confirmRangeCopy();
                    isDragging = false;
                    return;
                }

                // ペーストモード中：ペースト確定
                if (this.pasteMode) {
                    this.confirmPaste();
                    isDragging = false;
                    return;
                }

                // ノート作成中でない場合のみタップ処理（既存ノート削除）
                if (isDragging && !isLongPress && !isCreatingNote) {
                    clearTimeout(longPressTimer);
                    const pos = getPosFromEvent(e);
                    const { step, pitch } = getStepPitch(pos);
                    // 既存ノートがあれば削除
                    const existingNote = this.findNoteAt(step, pitch);
                    if (existingNote) {
                        const song = this.getCurrentSong();
                        const track = song.tracks[this.currentTrack];
                        const idx = track.notes.indexOf(existingNote);
                        if (idx >= 0) {
                            track.notes.splice(idx, 1);
                            this.render();
                        }
                    }
                }

                isDragging = false;
                isLongPress = false;
                draggingNote = null;
                isCreatingNote = false;
                creatingNote = null;
                clearTimeout(longPressTimer);
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            // 選択モード中：範囲コピー確定
            if (this.selectionMode && this.selectionStart && this.selectionEnd) {
                this.confirmRangeCopy();
                isDragging = false;
                return;
            }

            // ペーストモード中：ペースト確定
            if (this.pasteMode) {
                this.confirmPaste();
                isDragging = false;
                return;
            }

            // ノート作成中でない場合のみタップ処理（既存ノート削除）
            if (isDragging && !isLongPress && !isCreatingNote) {
                clearTimeout(longPressTimer);
                const pos = getPos(e);
                const { step, pitch } = getStepPitch(pos);
                // 既存ノートがあれば削除
                const existingNote = this.findNoteAt(step, pitch);
                if (existingNote) {
                    const song = this.getCurrentSong();
                    const track = song.tracks[this.currentTrack];
                    const idx = track.notes.indexOf(existingNote);
                    if (idx >= 0) {
                        track.notes.splice(idx, 1);
                        this.render();
                    }
                }
            }

            isDragging = false;
            isLongPress = false;
            draggingNote = null;
            isCreatingNote = false;
            creatingNote = null;
            clearTimeout(longPressTimer);
        });

        this.canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            isLongPress = false;
            draggingNote = null;
            clearTimeout(longPressTimer);
        });
    },

    handleTap(step, pitch) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];

        // 既存ノートがあれば削除、なければ追加
        const existingNote = this.findNoteAt(step, pitch);

        if (existingNote) {
            // 削除
            const idx = track.notes.indexOf(existingNote);
            if (idx >= 0) {
                track.notes.splice(idx, 1);
            }
        } else {
            // 追加
            const { note, octave } = this.pitchToNote(pitch);
            this.playNote(note, octave);
            track.notes.push({ step, pitch, length: 1 });
        }
        this.render();
    },

    findNoteAt(step, pitch) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        return track.notes.find(n =>
            n.step <= step && n.step + n.length > step && n.pitch === pitch
        );
    },

    deleteNoteAt(step, pitch) {
        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const idx = track.notes.findIndex(n =>
            n.step <= step && n.step + n.length > step && n.pitch === pitch
        );
        if (idx >= 0) {
            track.notes.splice(idx, 1);
            this.render();
        }
    },

    // ========== 再生 ==========
    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this.updatePlayButton('play');

        const song = this.getCurrentSong();
        const stepDuration = 60 / song.bpm / 4; // 16分音符
        const startStep = this.isPaused ? this.currentStep : 0;
        let step = startStep;
        const maxSteps = song.bars * 16;

        this.isPaused = false;
        this.playInterval = setInterval(() => {
            // 全トラック再生
            song.tracks.forEach((track, trackIdx) => {
                track.notes.forEach(note => {
                    if (note.step === step) {
                        const { note: noteName, octave } = this.pitchToNote(note.pitch);
                        // 同時発音数1に制限（トラックごと）
                        this.playNoteMonophonic(noteName, octave, stepDuration * note.length, trackIdx);
                    }
                });
            });

            this.currentStep = step;
            this.render();

            step++;
            if (step >= maxSteps) {
                step = 0;
            }
        }, stepDuration * 1000);
    },

    pause() {
        this.isPlaying = false;
        this.isPaused = true;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.updatePlayButton('pause');
    },

    resume() {
        this.play();
    },

    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentStep = 0;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        this.updatePlayButton('stop');
        this.render();
    },

    updatePlayButton(state) {
        const playBtn = document.getElementById('sound-play-btn');
        if (!playBtn) return;

        const svg = playBtn.querySelector('svg');
        if (!svg) return;

        if (state === 'play') {
            // 停止アイコン（■）
            svg.innerHTML = '<rect x="6" y="6" width="12" height="12" />';
        } else {
            // 再生アイコン（▶）
            svg.innerHTML = '<path d="M8 5v14l11-7z" />';
        }
    },

    // ========== レンダリング ==========
    render() {
        if (!this.ctx) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const maxSteps = song.bars * 16;

        // 背景（ステージ設定の背景色を使用）
        const bgColor = App.projectData?.stage?.bgColor || '#3CBCFC';
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 偶数拍（2拍、4拍）の背景を薄くする
        const beatWidth = 4 * this.cellSize; // 1拍 = 4ステップ
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        for (let bar = 0; bar < song.bars; bar++) {
            for (let beat = 0; beat < 4; beat++) {
                // 偶数拍（2拍目=beat1、4拍目=beat3）を暗くする
                if (beat === 1 || beat === 3) {
                    const x = (bar * 16 + beat * 4) * this.cellSize - this.scrollX;
                    if (x + beatWidth >= 0 && x <= this.canvas.width) {
                        this.ctx.fillRect(x, 0, beatWidth, this.canvas.height);
                    }
                }
            }
        }

        // グリッド（白色）
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 0.5;
        const scrollY = this.scrollY || 0;

        // 縦線
        for (let i = 0; i <= Math.ceil(this.canvas.width / this.cellSize) + 1; i++) {
            this.ctx.beginPath();
            const x = i * this.cellSize - this.scrollX % this.cellSize;
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        // 横線（scrollYを適用）
        for (let i = 0; i <= Math.ceil(this.canvas.height / this.cellSize) + 1; i++) {
            this.ctx.beginPath();
            const y = i * this.cellSize - scrollY % this.cellSize;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }

        // オクターブ区切り（Cの音、白1px）
        const maxPitch = 71; // C1-B6 (6オクターブ)
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        for (let octave = 1; octave <= 6; octave++) {
            const cPitch = (octave - 1) * 12; // C1=0, C2=12, C3=24, etc.
            const y = (maxPitch - cPitch + 1) * this.cellSize - scrollY;
            if (y >= 0 && y <= this.canvas.height) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }
        }

        // 小節区切り（白1px）
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        const barWidth = 16 * this.cellSize;
        for (let bar = 0; bar <= song.bars; bar++) {
            const x = bar * barWidth - this.scrollX;
            if (x >= 0 && x <= this.canvas.width) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }
        }

        // 指定小節数外の範囲をグレーアウト
        const maxX = maxSteps * this.cellSize - this.scrollX;
        if (maxX < this.canvas.width) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(maxX, 0, this.canvas.width - maxX, this.canvas.height);
        }

        // ハイライト行
        // maxPitchは既に宣言済み
        if (this.highlightPitch >= 0 && this.highlightPitch <= 71) {
            const y = (maxPitch - this.highlightPitch) * this.cellSize - scrollY;
            if (y + this.cellSize >= 0 && y < this.canvas.height) {
                this.ctx.fillStyle = 'rgba(74, 124, 89, 0.3)';
                this.ctx.fillRect(0, y, this.canvas.width, this.cellSize);
            }
        }

        // ノート描画（白色）
        this.ctx.fillStyle = '#fff';

        track.notes.forEach(note => {
            const x = note.step * this.cellSize - this.scrollX;
            const y = (maxPitch - note.pitch) * this.cellSize - scrollY;
            const w = note.length * this.cellSize - 2;

            if (x + w >= 0 && x <= this.canvas.width && y + this.cellSize >= 0 && y < this.canvas.height) {
                this.ctx.fillRect(x + 1, y + 1, w, this.cellSize - 2);
            }
        });

        // 選択範囲の描画
        if (this.selectionMode && this.selectionStart && this.selectionEnd) {
            const step1 = Math.min(this.selectionStart.step, this.selectionEnd.step);
            const step2 = Math.max(this.selectionStart.step, this.selectionEnd.step);
            const pitch1 = Math.min(this.selectionStart.pitch, this.selectionEnd.pitch);
            const pitch2 = Math.max(this.selectionStart.pitch, this.selectionEnd.pitch);

            const x = step1 * this.cellSize - this.scrollX;
            const y = (maxPitch - pitch2) * this.cellSize - scrollY;
            const w = (step2 - step1 + 1) * this.cellSize;
            const h = (pitch2 - pitch1 + 1) * this.cellSize;

            this.ctx.strokeStyle = '#FFFF00';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, w, h);
            this.ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
            this.ctx.fillRect(x, y, w, h);
        }

        // ペーストプレビューの描画
        if (this.pasteMode && this.noteClipboard) {
            this.ctx.fillStyle = 'rgba(0, 255, 0, 0.4)';
            this.noteClipboard.notes.forEach(copyNote => {
                const newStep = this.pasteOffset.step + copyNote.relStep;
                const newPitch = this.pasteOffset.pitch + copyNote.relPitch;
                const x = newStep * this.cellSize - this.scrollX;
                const y = (maxPitch - newPitch) * this.cellSize - scrollY;
                const w = copyNote.length * this.cellSize - 2;

                if (x + w >= 0 && x <= this.canvas.width && y + this.cellSize >= 0 && y < this.canvas.height) {
                    this.ctx.fillRect(x + 1, y + 1, w, this.cellSize - 2);
                }
            });
        }

        // 現在位置（再生中のみ表示、ビビッドグリーン）
        if (this.isPlaying) {
            const x = this.currentStep * this.cellSize - this.scrollX;
            this.ctx.strokeStyle = '#00FF00';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
    }
};
