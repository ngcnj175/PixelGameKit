/**
 * PixelGameKit - BGMエディタ（新UI対応）
 */

const BgmEditor = {
    canvas: null,
    ctx: null,
    currentStep: 0,
    currentTrack: 'pulse1',
    isRecording: false,
    isPlaying: false,
    playInterval: null,

    notes: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    octave: 4,

    init() {
        this.canvas = document.getElementById('sequencer-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }

        this.initControls();
        this.initKeyboard();
        this.initTrackSelector();
    },

    refresh() {
        this.initKeyboard();
        this.resize();
        this.render();
        this.updateStepDisplay();
    },

    resize() {
        const container = document.getElementById('sequencer-area');
        if (!container || !this.canvas) return;

        this.canvas.width = container.clientWidth - 16;
        this.canvas.height = container.clientHeight - 16;

        this.render();
    },

    initControls() {
        document.getElementById('step-prev')?.addEventListener('click', () => {
            this.currentStep = Math.max(0, this.currentStep - 1);
            this.updateStepDisplay();
            this.render();
        });

        document.getElementById('step-next')?.addEventListener('click', () => {
            const maxSteps = App.projectData.bgm.steps;
            this.currentStep = Math.min(maxSteps - 1, this.currentStep + 1);
            this.updateStepDisplay();
            this.render();
        });

        document.getElementById('rec-btn')?.addEventListener('click', () => {
            this.isRecording = !this.isRecording;
            document.getElementById('rec-btn').classList.toggle('active', this.isRecording);
        });

        document.getElementById('play-btn')?.addEventListener('click', () => {
            this.play();
        });

        document.getElementById('stop-btn')?.addEventListener('click', () => {
            this.stop();
        });
    },

    initKeyboard() {
        const container = document.getElementById('piano-keyboard');
        if (!container) return;

        container.innerHTML = '';

        const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
        const blackNotes = { 0: 'C#', 1: 'D#', 3: 'F#', 4: 'G#', 5: 'A#' };
        const keyWidth = 32;

        // 白鍵
        whiteNotes.forEach((note, index) => {
            const key = document.createElement('div');
            key.className = 'piano-key white';
            const noteOctave = index === 7 ? this.octave + 1 : this.octave;
            const actualNote = index === 7 ? 'C' : note;
            key.dataset.note = actualNote + noteOctave;

            key.addEventListener('click', () => this.onKeyPress(actualNote, noteOctave));
            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.onKeyPress(actualNote, noteOctave);
                key.classList.add('active');
            }, { passive: false });
            key.addEventListener('touchend', () => {
                key.classList.remove('active');
            });

            container.appendChild(key);
        });

        // 黒鍵
        Object.entries(blackNotes).forEach(([index, note]) => {
            const key = document.createElement('div');
            key.className = 'piano-key black';
            key.style.left = `${parseInt(index) * keyWidth + keyWidth * 0.65}px`;
            key.dataset.note = note + this.octave;

            key.addEventListener('click', () => this.onKeyPress(note, this.octave));
            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.onKeyPress(note, this.octave);
                key.classList.add('active');
            }, { passive: false });
            key.addEventListener('touchend', () => {
                key.classList.remove('active');
            });

            container.appendChild(key);
        });
    },

    initTrackSelector() {
        document.querySelectorAll('.track-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTrack = btn.dataset.track;
                document.querySelectorAll('.track-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
                this.render();
            });
        });
    },

    updateStepDisplay() {
        const display = document.getElementById('step-display');
        const maxSteps = App.projectData.bgm.steps;
        if (display) {
            display.textContent = `${this.currentStep + 1}/${maxSteps}`;
        }
    },

    onKeyPress(note, octave) {
        const fullNote = note + octave;

        if (typeof NesAudio !== 'undefined') {
            NesAudio.playNote(this.currentTrack, note, octave, 0.2);
        }

        if (this.isRecording) {
            this.inputNote(fullNote);
        }
    },

    inputNote(note) {
        const track = App.projectData.bgm.tracks[this.currentTrack];

        const existingIndex = track.findIndex(n => n.step === this.currentStep && n.note === note);

        if (existingIndex >= 0) {
            track.splice(existingIndex, 1);
        } else {
            track.push({
                step: this.currentStep,
                note: note,
                duration: 1
            });
        }

        const maxSteps = App.projectData.bgm.steps;
        this.currentStep = (this.currentStep + 1) % maxSteps;
        this.updateStepDisplay();
        this.render();
    },

    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.currentStep = 0;

        const bpm = App.projectData.bgm.bpm;
        const stepDuration = (60 / bpm / 4) * 1000;

        this.playInterval = setInterval(() => {
            this.playStep(this.currentStep);
            this.currentStep++;
            this.updateStepDisplay();
            this.render();

            if (this.currentStep >= App.projectData.bgm.steps) {
                this.currentStep = 0;
            }
        }, stepDuration);
    },

    stop() {
        this.isPlaying = false;
        if (this.playInterval) {
            clearInterval(this.playInterval);
            this.playInterval = null;
        }
    },

    playStep(step) {
        const tracks = App.projectData.bgm.tracks;

        Object.entries(tracks).forEach(([trackName, notes]) => {
            const notesAtStep = notes.filter(n => n.step === step);
            notesAtStep.forEach(n => {
                const noteName = n.note.replace(/\d/, '');
                const octave = parseInt(n.note.match(/\d/)?.[0] || '4');
                if (typeof NesAudio !== 'undefined') {
                    NesAudio.playNote(trackName, noteName, octave, 0.15);
                }
            });
        });
    },

    render() {
        if (!this.canvas || !this.ctx) return;
        if (App.currentScreen !== 'sound') return;

        const bgm = App.projectData.bgm;
        const steps = bgm.steps;
        const track = bgm.tracks[this.currentTrack];

        // クリア
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const stepWidth = this.canvas.width / steps;
        const noteHeight = this.canvas.height / 12;

        // グリッド
        this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        this.ctx.lineWidth = 1;

        for (let i = 0; i <= steps; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * stepWidth, 0);
            this.ctx.lineTo(i * stepWidth, this.canvas.height);
            this.ctx.stroke();
        }

        for (let i = 0; i <= 12; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * noteHeight);
            this.ctx.lineTo(this.canvas.width, i * noteHeight);
            this.ctx.stroke();
        }

        // 現在位置
        this.ctx.fillStyle = 'rgba(76, 201, 240, 0.2)';
        this.ctx.fillRect(this.currentStep * stepWidth, 0, stepWidth, this.canvas.height);

        // ノート
        this.ctx.fillStyle = '#4cc9f0';
        track.forEach(n => {
            const noteName = n.note.replace(/\d/, '');
            const noteIndex = this.notes.indexOf(noteName);
            if (noteIndex >= 0) {
                this.ctx.fillRect(
                    n.step * stepWidth + 2,
                    (11 - noteIndex) * noteHeight + 2,
                    stepWidth - 4,
                    noteHeight - 4
                );
            }
        });
    }
};
