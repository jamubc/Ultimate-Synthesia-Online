# Ultimate Synthesia Online
**Supports midi devices**

---
## **[🎹 CLICK HERE TO TRY THE LIVE DEMO! 🎹](https://shubinwang.com/midi/)**
---

## Screenshots
<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;">
  <img width="457" alt="screenshot 2025-05-20 at 16 37 17" src="https://github.com/user-attachments/assets/88d29ace-ad69-4468-a4f7-ec8ff1fdbf84" />
  <img width="457" alt="screenshot 2025-05-20 at 16 37 28" src="https://github.com/user-attachments/assets/552c0dfd-1b03-4855-a1fd-f3865a0ea10e" />
  <img width="457" alt="screenshot 2025-05-20 at 16 37 32" src="https://github.com/user-attachments/assets/df308f9f-4c5b-4002-af3b-172bee9513d7" />
  <img width="457" alt="screenshot 2025-05-20 at 16 37 44" src="https://github.com/user-attachments/assets/2c362268-63b0-4501-972a-553e23dbbcda" />
</div>

Ultimate Synthesia Online is a feature-rich web-based synthesizer application built with HTML, CSS, and JavaScript using the Web Audio API. It allows users to generate and manipulate sounds through a virtual keyboard, computer keyboard, or MIDI input. The application includes multiple oscillators, ADSR envelope controls, filters, a "Synthesia"-style falling notes visualizer, a multi-slot looper, a metronome with tap tempo, and various UI customization options.

## Features

* **Sound Generation:**
    * Two primary oscillators with selectable waveforms (Sine, Square, Sawtooth, Triangle, Pulse), octave control, detune/fine-tune, and level adjustment.
    * Pulse Width control for pulse waveforms.
    * Sub oscillator with selectable waveforms, octave control, and level.
    * Noise generator (White, Pink approx.) with level control.
    * Oscillator Slop for a more analog feel.
* **Sound Shaping:**
    * ADSR (Attack, Decay, Sustain, Release) envelope for amplitude shaping.
    * Multi-mode filter (Lowpass, Highpass, Bandpass, Notch, Allpass/Bypass) with cutoff and resonance controls.
* **Input Methods:**
    * On-screen virtual piano keyboard (1-4 octaves).
    * Computer keyboard mapping for playing notes.
    * Mouse and Touch input on the virtual keyboard with dragging support.
    * MIDI input support.
    * Sustain pedal functionality (via Space bar).
* **Visuals & UI:**
    * Real-time audio visualizer (Master Output, Osc 1 Sum, Osc 2 Sum).
    * "Synthesia"-style falling notes display with hit line and burst animation.
    * Multiple UI themes (e.g., Midnight Drive, Solarized Dark, Cyber Glow, etc.).
    * Adjustable UI scaling.
    * LED indicators for note activity and looper status.
* **Looper:**
    * 4-slot launchpad-style looper.
    * Record, play, stop, and clear loops per slot.
    * Arming functionality for recording.
    * Quantization to metronome beat for recording and playback start.
    * Status display for each loop slot.
* **Metronome & Tempo:**
    * Enableable metronome with visual LED indicator and click sound.
    * Adjustable BPM (Beats Per Minute).
    * Tap Tempo functionality.
* **Other:**
    * Master volume control.
    * "Panic" button to stop all sounds immediately.
    * Persistent theme, UI scale, and Synthesia visibility settings via localStorage.
    * Footer with links to contributor GitHub profiles.

## How to Use

1. Clone the repository or download the files.
2. Open `index.html` in a modern web browser that supports the Web Audio API (e.g., Chrome, Firefox, Safari, Edge).
3. The synthesizer interface will load.
4. Use your mouse, touch, computer keyboard, or a connected MIDI controller to play notes.
5. Adjust the various controls in the control panel to shape the sound.
6. Explore the "Show Looper" button to record and play back loops.
7. Enable the "Falling Notes" for a visual playing guide.
8. Use the Metronome and Tap Tempo to set the rhythm.
9. Change UI themes and scale in the "Master & Settings" section.

## Key JavaScript Components

* **Audio Initialization (`initAudio`):** Sets up the `AudioContext`, master gain, limiter, analysers, and noise buffers.
* **Note Handling (`playNote`, `stopNote`):** Manages the creation, modification, and termination of sound units (oscillators, gains, envelopes).
* **Keyboard Interaction (`setupKeyboardEvents`, `createKeyboard`):** Handles input from the virtual keyboard, computer keyboard, and mouse/touch.
* **MIDI Integration (`setupMIDI`, `onM`):** Listens for and processes MIDI messages.
* **Synthesizer Parameter Management (`getCurrentSynthParams`):** Retrieves current settings from UI controls.
* **Control Event Handling (`setupControlEvents`):** Attaches listeners to UI controls to update audio parameters or UI state.
* **Visualizer (`visualize`, `resizeCanvas`):** Renders the waveform on the canvas.
* **Synthesia Falling Notes (`startFallingNote`, `animateFallingNoteElement`, `releaseFallingNote`):** Manages the animation of falling notes.
* **Looper Logic (`initializeLoopSlots`, `armSlot`, `toggleRecordOnArmedSlot`, `togglePlaySlot`, `clearSlot`, etc.):** Handles all functionalities of the looper.
* **Metronome Logic (`toggleMetronome`, `adjustBPM`, `handleTapTempo`, `metronomeTick`):** Manages the metronome functionality.
* **Theming and Scaling (`applyTheme`, `applyUIScale`):** Applies visual changes to the UI.
* **Emergency Stop (`emergencyStopAllSounds`):** A panic function to cease all audio activity.

## Credits
* **jamubc** ([https://github.com/jamubc](https://github.com/jamubc))
* **shubin123** ([https://github.com/shubin123](https://github.com/shubin123))
