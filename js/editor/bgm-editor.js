/**
 * PixelGameKit - BGMエディタ
 */

const BgmEditor = {
    currentStep: 0,
    currentTrack: 'pulse1',
    isRecording: false,
    isPlaying: false,
    playInterval: null,

    // 音階定義（1オクターブ）
    notes: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    octave: 4,

    init() {
        this.initControls();
        this.initKeyboard();
        this.initTrackSelector();
        this.updateStepDisplay();
    },

    initControls() {
        document.getElementById('step-prev')?.addEventListener('click', () => {
            this.currentStep = Math.max(0, this.currentStep - 1);
            this.updateStepDisplay();
        });

        document.getElementById('step-next')?.addEventListener('click', () => {
            const maxSteps = App.projectData.bgm.steps;
            this.currentStep = Math.min(maxSteps - 1, this.currentStep + 1);
            this.updateStepDisplay();
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
        const container = document.getElementById('keyboard-container');
        container.innerHTML = '';

        // 白鍵のノート
        const whiteNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'];
        const blackNotes = { 0: 'C#', 1: 'D#', 3: 'F#', 4: 'G#', 5: 'A#' };

        const keyboard = document.createElement('div');
        keyboard.style.cssText = 'display: flex; position: relative; height: 100%;';

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
            }, { passive: false });
            keyboard.appendChild(key);
        });

        // 黒鍵
        Object.entries(blackNotes).forEach(([index, note]) => {
            const key = document.createElement('div');
            key.className = 'piano-key black';
            key.style.left = `${parseInt(index) * 24 + 16}px`;
            key.dataset.note = note + this.octave;
            key.addEventListener('click', () => this.onKeyPress(note, this.octave));
            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.onKeyPress(note, this.octave);
            }, { passive: false });
            keyboard.appendChild(key);
        });

        container.appendChild(keyboard);
    },

    initTrackSelector() {
        document.querySelectorAll('.track-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTrack = btn.dataset.track;
                document.querySelectorAll('.track-btn').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
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

        // 音を鳴らす
        if (typeof NesAudio !== 'undefined') {
            NesAudio.playNote(this.currentTrack, note, octave, 0.2);
        }

        // RECモードならステップ入力
        if (this.isRecording) {
            this.inputNote(fullNote);
        }

        // キーのビジュアルフィードバック
        const key = document.querySelector(`[data-note="${fullNote}"]`);
        if (key) {
            key.classList.add('active');
            setTimeout(() => key.classList.remove('active'), 100);
        }
    },

    inputNote(note) {
        const track = App.projectData.bgm.tracks[this.currentTrack];

        // 同じステップに同じ音があれば削除、なければ追加
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

        // 次のステップへ
        const maxSteps = App.projectData.bgm.steps;
        this.currentStep = (this.currentStep + 1) % maxSteps;
        this.updateStepDisplay();
    },

    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.currentStep = 0;

        const bpm = App.projectData.bgm.bpm;
        const stepDuration = (60 / bpm / 4) * 1000; // 16分音符

        this.playInterval = setInterval(() => {
            this.playStep(this.currentStep);
            this.currentStep++;
            this.updateStepDisplay();

            if (this.currentStep >= App.projectData.bgm.steps) {
                this.currentStep = 0; // ループ
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
    }
};
