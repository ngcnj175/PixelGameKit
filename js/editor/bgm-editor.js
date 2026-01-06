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
    isRecording: false,
    isPlaying: false,
    playInterval: null,

    // ピアノロール
    cellSize: 20,
    scrollX: 0, // 横スクロール位置
    viewOctave: 3, // 表示オクターブ開始位置
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

        // ソングデータ初期化
        if (!App.projectData.songs) {
            App.projectData.songs = [];
        }
        this.songs = App.projectData.songs;
        if (this.songs.length === 0) {
            this.addSong();
        }

        this.initSongPalette();
        this.initTrackTabs();
        this.initBpmBarControls();
        this.initTools();
        this.initPlayerPanel();
        this.initKeyboard();
        this.initPianoRoll();
        this.resize();
    },

    refresh() {
        if (!App.projectData.songs) {
            App.projectData.songs = [];
        }
        this.songs = App.projectData.songs;
        if (this.songs.length === 0) {
            this.addSong();
        }
        this.initSongPalette();
        this.render();
    },

    resize() {
        if (!this.canvas) return;
        // ピアノロール: 16x16グリッド
        this.canvas.width = 320;
        this.canvas.height = 320;
        this.canvas.style.width = '320px';
        this.canvas.style.height = '320px';
        this.render();
    },

    // ========== ソングパレット ==========
    initSongPalette() {
        const container = document.getElementById('song-palette');
        if (!container) return;

        // 既存ボタン削除（追加ボタン以外）
        container.querySelectorAll('.song-btn:not(.add-btn)').forEach(btn => btn.remove());

        // ソングボタン作成
        this.songs.forEach((song, idx) => {
            const btn = document.createElement('button');
            btn.className = 'song-btn' + (idx === this.currentSongIdx ? ' active' : '');
            btn.textContent = song.name || `Song${idx + 1}`;
            btn.addEventListener('click', () => this.selectSong(idx));
            container.appendChild(btn);
        });

        // 追加ボタン
        const addBtn = document.getElementById('add-song-btn');
        if (addBtn) {
            addBtn.onclick = () => this.addSong();
        }
    },

    addSong() {
        const id = this.songs.length;
        const song = {
            id: id,
            name: `Song${id + 1}`,
            bpm: 120,
            bars: 1,
            tracks: [
                { type: 'square', notes: [] },
                { type: 'square', notes: [] },
                { type: 'triangle', notes: [] },
                { type: 'noise', notes: [] }
            ]
        };
        this.songs.push(song);
        this.currentSongIdx = id;
        this.initSongPalette();
        this.updateBpmBarDisplay();
        this.render();
    },

    selectSong(idx) {
        this.currentSongIdx = idx;
        this.scrollX = 0;
        this.currentStep = 0;
        this.initSongPalette();
        this.updateBpmBarDisplay();
        this.render();
    },

    getCurrentSong() {
        return this.songs[this.currentSongIdx] || this.songs[0];
    },

    // ========== トラックタブ ==========
    initTrackTabs() {
        const tabs = document.querySelectorAll('.track-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTrack = parseInt(tab.dataset.track);
                this.render();
            });
        });
    },

    // ========== BPM/BAR コントロール ==========
    initBpmBarControls() {
        // BPM
        document.getElementById('bpm-dec')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bpm = Math.max(60, song.bpm - 5);
            this.updateBpmBarDisplay();
        });
        document.getElementById('bpm-inc')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bpm = Math.min(200, song.bpm + 5);
            this.updateBpmBarDisplay();
        });

        // BAR
        document.getElementById('bar-dec')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bars = Math.max(1, song.bars - 1);
            this.updateBpmBarDisplay();
            this.render();
        });
        document.getElementById('bar-inc')?.addEventListener('click', () => {
            const song = this.getCurrentSong();
            song.bars = Math.min(16, song.bars + 1);
            this.updateBpmBarDisplay();
            this.render();
        });

        this.updateBpmBarDisplay();
    },

    updateBpmBarDisplay() {
        const song = this.getCurrentSong();
        const bpmVal = document.getElementById('bpm-value');
        const barVal = document.getElementById('bar-value');
        if (bpmVal) bpmVal.textContent = song.bpm;
        if (barVal) barVal.textContent = song.bars;
    },

    // ========== 編集ツール ==========
    initTools() {
        const tools = document.querySelectorAll('.sound-tool');
        tools.forEach(tool => {
            tool.addEventListener('click', () => {
                tools.forEach(t => t.classList.remove('active'));
                tool.classList.add('active');
                if (tool.id === 'tool-pencil') this.currentTool = 'pencil';
                else if (tool.id === 'tool-eraser') this.currentTool = 'eraser';
                else if (tool.id === 'tool-copy') this.currentTool = 'copy';
            });
        });
    },

    // ========== プレイヤーパネル ==========
    initPlayerPanel() {
        // DEL (UNDO)
        document.getElementById('sound-del-btn')?.addEventListener('click', () => {
            this.deleteLastNote();
        });

        // REST
        document.getElementById('sound-rest-btn')?.addEventListener('click', () => {
            this.inputRest();
        });

        // TIE
        document.getElementById('sound-tie-btn')?.addEventListener('click', () => {
            this.inputTie();
        });

        // PLAY/STOP
        document.getElementById('sound-play-btn')?.addEventListener('click', () => {
            if (this.isPlaying) {
                this.stop();
            } else {
                this.play();
            }
        });

        // REC
        document.getElementById('sound-rec-btn')?.addEventListener('click', (e) => {
            this.isRecording = !this.isRecording;
            e.target.classList.toggle('active', this.isRecording);
            if (this.isRecording) {
                this.currentStep = 0;
            }
        });
    },

    // ========== 鍵盤 ==========
    initKeyboard() {
        const container = document.getElementById('piano-keyboard');
        if (!container) return;
        container.innerHTML = '';

        // 5オクターブ (C1-B5)
        const octaves = [1, 2, 3, 4, 5];
        let whiteKeyIndex = 0;

        octaves.forEach(oct => {
            this.noteNames.forEach((note, idx) => {
                const isBlack = note.includes('#');
                const key = document.createElement('div');
                key.className = 'piano-key ' + (isBlack ? 'black' : 'white');
                key.dataset.note = note;
                key.dataset.octave = oct;

                if (isBlack) {
                    // 黒鍵の位置を計算
                    const prevWhiteKeys = whiteKeyIndex;
                    key.style.left = (prevWhiteKeys * 28 - 9) + 'px';
                } else {
                    whiteKeyIndex++;
                }

                // タッチ/クリック
                const handler = (e) => {
                    e.preventDefault();
                    this.onKeyPress(note, oct);
                };
                key.addEventListener('touchstart', handler);
                key.addEventListener('mousedown', handler);

                container.appendChild(key);
            });
        });
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

        // REC中ならノート入力
        if (this.isRecording) {
            this.inputNote(note, octave);
        }
    },

    playNote(note, octave, duration = 0.2) {
        if (!this.audioCtx) return;

        const freq = this.getFrequency(note, octave);
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        // 波形タイプ
        const trackType = this.trackTypes[this.currentTrack];
        if (trackType === 'square') {
            osc.type = 'square';
        } else if (trackType === 'triangle') {
            osc.type = 'triangle';
        } else {
            // ノイズ用にホワイトノイズを作成
            osc.type = 'sawtooth';
        }

        osc.frequency.value = freq;
        gain.gain.value = 0.3;

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + duration);
        osc.stop(this.audioCtx.currentTime + duration);
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
        if (track.notes.length > 0) {
            const lastNote = track.notes[track.notes.length - 1];
            lastNote.length++;
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

    // ========== ピアノロール ==========
    initPianoRoll() {
        if (!this.canvas) return;

        let isDragging = false;
        let startX = 0, startY = 0;
        let startStep = 0, startPitch = 0;

        const getPos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        };

        // タップ/ドラッグ
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const pos = getPos(e);
            this.handlePianoRollInput(pos, 'start');
            isDragging = true;
            startX = pos.x;
            startY = pos.y;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            const pos = getPos(e);
            this.handlePianoRollInput(pos, 'start');
            isDragging = true;
            startX = pos.x;
            startY = pos.y;
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (isDragging) {
                const pos = getPos(e);
                this.handlePianoRollInput(pos, 'move', startX, startY);
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const pos = getPos(e);
                this.handlePianoRollInput(pos, 'move', startX, startY);
            }
        });

        this.canvas.addEventListener('touchend', () => { isDragging = false; });
        this.canvas.addEventListener('mouseup', () => { isDragging = false; });
        this.canvas.addEventListener('mouseleave', () => { isDragging = false; });

        // ダブルタップで削除
        let lastTap = 0;
        this.canvas.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                const pos = getPos(e.changedTouches ? { touches: e.changedTouches } : e);
                this.handlePianoRollInput(pos, 'dblclick');
            }
            lastTap = now;
        });
        this.canvas.addEventListener('dblclick', (e) => {
            const pos = getPos(e);
            this.handlePianoRollInput(pos, 'dblclick');
        });
    },

    handlePianoRollInput(pos, action, startX = 0, startY = 0) {
        const step = Math.floor((pos.x + this.scrollX) / this.cellSize);
        // 音階（上が高音）
        const pitch = 15 - Math.floor(pos.y / this.cellSize) + this.viewOctave * 12;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];

        if (action === 'start') {
            // ワンタップで入力（鉛筆ツール）
            if (this.currentTool === 'pencil') {
                const { note, octave } = this.pitchToNote(pitch);
                this.playNote(note, octave);
                track.notes.push({ step, pitch, length: 1 });
                this.render();
            } else if (this.currentTool === 'eraser') {
                this.deleteNoteAt(step, pitch);
            }
        } else if (action === 'move' && this.currentTool === 'pencil') {
            // スワイプで長さ延長
            const length = Math.max(1, Math.floor((pos.x - startX) / this.cellSize) + 1);
            if (track.notes.length > 0) {
                const lastNote = track.notes[track.notes.length - 1];
                if (lastNote.pitch === pitch) {
                    lastNote.length = length;
                    this.render();
                }
            }
        } else if (action === 'dblclick') {
            // ダブルタップで削除
            this.deleteNoteAt(step, pitch);
        }
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

        const playBtn = document.getElementById('sound-play-btn');
        if (playBtn) playBtn.textContent = '⏹';

        const song = this.getCurrentSong();
        const stepDuration = 60 / song.bpm / 4; // 16分音符
        let step = 0;
        const maxSteps = song.bars * 16;

        this.playInterval = setInterval(() => {
            // 全トラック再生
            song.tracks.forEach((track, trackIdx) => {
                track.notes.forEach(note => {
                    if (note.step === step) {
                        const { note: noteName, octave } = this.pitchToNote(note.pitch);
                        const savedTrack = this.currentTrack;
                        this.currentTrack = trackIdx;
                        this.playNote(noteName, octave, stepDuration * note.length);
                        this.currentTrack = savedTrack;
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

    stop() {
        this.isPlaying = false;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
        const playBtn = document.getElementById('sound-play-btn');
        if (playBtn) playBtn.textContent = '▶';
    },

    // ========== レンダリング ==========
    render() {
        if (!this.ctx) return;

        const song = this.getCurrentSong();
        const track = song.tracks[this.currentTrack];
        const maxSteps = song.bars * 16;

        // 背景
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // グリッド
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;

        for (let i = 0; i <= 16; i++) {
            // 縦線
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.cellSize - this.scrollX % this.cellSize, 0);
            this.ctx.lineTo(i * this.cellSize - this.scrollX % this.cellSize, this.canvas.height);
            this.ctx.stroke();

            // 横線
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.cellSize);
            this.ctx.lineTo(this.canvas.width, i * this.cellSize);
            this.ctx.stroke();
        }

        // 小節区切り
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 2;
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

        // ハイライト行
        if (this.highlightPitch >= 0) {
            const y = (15 - (this.highlightPitch - this.viewOctave * 12)) * this.cellSize;
            if (y >= 0 && y < this.canvas.height) {
                this.ctx.fillStyle = 'rgba(74, 124, 89, 0.3)';
                this.ctx.fillRect(0, y, this.canvas.width, this.cellSize);
            }
        }

        // ノート描画
        const colors = ['#4ecdc4', '#ff6b6b', '#ffd93d', '#6bcb77'];
        this.ctx.fillStyle = colors[this.currentTrack];

        track.notes.forEach(note => {
            const x = note.step * this.cellSize - this.scrollX;
            const y = (15 - (note.pitch - this.viewOctave * 12)) * this.cellSize;
            const w = note.length * this.cellSize - 2;

            if (x + w >= 0 && x <= this.canvas.width && y >= 0 && y < this.canvas.height) {
                this.ctx.fillRect(x + 1, y + 1, w, this.cellSize - 2);
            }
        });

        // 現在位置
        if (this.isPlaying || this.isRecording) {
            const x = this.currentStep * this.cellSize - this.scrollX;
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
    }
};
