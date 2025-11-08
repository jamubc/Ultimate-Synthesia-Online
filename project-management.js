// ============================================================================
// PROJECT MANAGEMENT SYSTEM FOR ULTIMATE SYNTHESIA ONLINE
// ============================================================================
// This file contains the complete project management implementation
// Copy this code and insert it before the closing </script> tag in index.html
// ============================================================================

// ----------------------------------------------------------------------------
// PROJECT STATE & UNDO/REDO SYSTEM
// ----------------------------------------------------------------------------

let projectName = 'Untitled Project';
let projectModified = false;
let autoSaveEnabled = true;
let autoSaveInterval = null;
let autoSaveIntervalMs = 120000; // 2 minutes

// Undo/Redo stacks
const undoStack = [];
const redoStack = [];
const MAX_UNDO_STACK_SIZE = 100;

// Command Pattern for Undo/Redo
class Command {
    constructor(description, executeFunc, undoFunc) {
        this.description = description;
        this.executeFunc = executeFunc;
        this.undoFunc = undoFunc;
        this.timestamp = Date.now();
    }

    execute() {
        if (this.executeFunc) this.executeFunc();
    }

    undo() {
        if (this.undoFunc) this.undoFunc();
    }
}

function executeCommand(command) {
    command.execute();
    undoStack.push(command);

    // Limit stack size
    if (undoStack.length > MAX_UNDO_STACK_SIZE) {
        undoStack.shift();
    }

    // Clear redo stack when new command is executed
    redoStack.length = 0;

    updateUndoRedoButtons();
    markProjectModified();
}

function undo() {
    if (undoStack.length === 0) return;

    const command = undoStack.pop();
    command.undo();
    redoStack.push(command);

    updateUndoRedoButtons();
    markProjectModified();
    updateProjectStatus('Undo: ' + command.description);
}

function redo() {
    if (redoStack.length === 0) return;

    const command = redoStack.pop();
    command.execute();
    undoStack.push(command);

    updateUndoRedoButtons();
    markProjectModified();
    updateProjectStatus('Redo: ' + command.description);
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
        undoBtn.disabled = undoStack.length === 0;
        undoBtn.title = undoStack.length > 0 ? `Undo: ${undoStack[undoStack.length - 1].description}` : 'Undo (Ctrl+Z)';
    }

    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
        redoBtn.title = redoStack.length > 0 ? `Redo: ${redoStack[redoStack.length - 1].description}` : 'Redo (Ctrl+Y)';
    }
}

function markProjectModified() {
    projectModified = true;
    updateProjectStatus('Modified');
}

function markProjectSaved() {
    projectModified = false;
    updateProjectStatus('Saved');
}

function updateProjectStatus(status) {
    const statusEl = document.getElementById('projectStatus');
    if (statusEl) {
        statusEl.textContent = status;
        setTimeout(() => {
            if (statusEl.textContent === status) {
                statusEl.textContent = projectModified ? 'Modified' : 'Ready';
            }
        }, 2000);
    }
}

// ----------------------------------------------------------------------------
// STATE SERIALIZATION
// ----------------------------------------------------------------------------

function getCurrentSynthParams() {
    return {
        // Oscillators
        osc1: {
            waveform: waveformOsc1Select ? waveformOsc1Select.value : 'sawtooth',
            octave: octaveOsc1Select ? parseInt(octaveOsc1Select.value) : 4,
            detune: detuneOsc1Input ? parseFloat(detuneOsc1Input.value) : 0,
            level: levelOsc1Input ? parseFloat(levelOsc1Input.value) : 0.7
        },
        osc2: {
            enabled: enableOsc2Toggle ? enableOsc2Toggle.checked : true,
            waveform: waveformOsc2Select ? waveformOsc2Select.value : 'sawtooth',
            octave: octaveOsc2Select ? parseInt(octaveOsc2Select.value) : 0,
            fineTune: fineTuneOsc2Input ? parseFloat(fineTuneOsc2Input.value) : 0,
            delay: delayOsc2Input ? parseFloat(delayOsc2Input.value) : 0,
            level: levelOsc2Input ? parseFloat(levelOsc2Input.value) : 0.7
        },
        sub: {
            enabled: enableSubToggle ? enableSubToggle.checked : true,
            waveform: waveformSubSelect ? waveformSubSelect.value : 'square',
            octave: octaveSubSelect ? parseInt(octaveSubSelect.value) : -2,
            level: levelSubInput ? parseFloat(levelSubInput.value) : 0.5
        },
        noise: {
            enabled: enableNoiseToggle ? enableNoiseToggle.checked : false,
            type: noiseTypeSelect ? noiseTypeSelect.value : 'white',
            level: levelNoiseInput ? parseFloat(levelNoiseInput.value) : 0
        },
        pulseWidth: pulseWidthInput ? parseFloat(pulseWidthInput.value) : 0.5,
        oscSlop: oscSlopInput ? parseFloat(oscSlopInput.value) : 0.005,

        // Envelope
        adsr: {
            enabled: enableAdsrToggle ? enableAdsrToggle.checked : true,
            attack: attackInput ? parseFloat(attackInput.value) : 0.05,
            decay: decayInput ? parseFloat(decayInput.value) : 0.1,
            sustain: sustainInput ? parseFloat(sustainInput.value) : 0.6,
            release: releaseInput ? parseFloat(releaseInput.value) : 0.5
        },

        // Filter
        filter: {
            enabled: enableFilterToggle ? enableFilterToggle.checked : true,
            type: filterTypeSelect ? filterTypeSelect.value : 'lowpass',
            cutoff: filterCutoffInput ? parseFloat(filterCutoffInput.value) : 5000,
            resonance: filterResonanceInput ? parseFloat(filterResonanceInput.value) : 2
        },

        // Effects
        reverb: {
            enabled: enableReverb ? enableReverb.checked : false,
            type: reverbType ? reverbType.value : 'room',
            mix: reverbMix ? parseFloat(reverbMix.value) : 0.3,
            decay: reverbDecay ? parseFloat(reverbDecay.value) : 1.5
        },
        delay: {
            enabled: enableDelay ? enableDelay.checked : false,
            time: delayTime ? parseFloat(delayTime.value) : 375,
            feedback: delayFeedback ? parseFloat(delayFeedback.value) : 0.3,
            mix: delayMix ? parseFloat(delayMix.value) : 0.3,
            pingPong: delayPingPong ? delayPingPong.checked : false
        },
        chorus: {
            enabled: enableChorus ? enableChorus.checked : false,
            rate: chorusRate ? parseFloat(chorusRate.value) : 1.5,
            depth: chorusDepth ? parseFloat(chorusDepth.value) : 0.5,
            mix: chorusMix ? parseFloat(chorusMix.value) : 0.4
        },
        flanger: {
            enabled: enableFlanger ? enableFlanger.checked : false,
            rate: flangerRate ? parseFloat(flangerRate.value) : 0.5,
            depth: flangerDepth ? parseFloat(flangerDepth.value) : 0.7,
            feedback: flangerFeedback ? parseFloat(flangerFeedback.value) : 0.5,
            mix: flangerMix ? parseFloat(flangerMix.value) : 0.5
        },
        phaser: {
            enabled: enablePhaser ? enablePhaser.checked : false,
            rate: phaserRate ? parseFloat(phaserRate.value) : 0.5,
            depth: phaserDepth ? parseFloat(phaserDepth.value) : 0.5,
            stages: phaserStages ? parseInt(phaserStages.value) : 4,
            mix: phaserMix ? parseFloat(phaserMix.value) : 0.5
        },
        distortion: typeof enableDistortionToggle !== 'undefined' && enableDistortionToggle ? {
            enabled: enableDistortionToggle.checked,
            type: distortionTypeSelect ? distortionTypeSelect.value : 'soft',
            drive: distortionDriveInput ? parseFloat(distortionDriveInput.value) : 10,
            tone: distortionToneInput ? parseFloat(distortionToneInput.value) : 3000,
            bitDepth: distortionBitDepthInput ? parseFloat(distortionBitDepthInput.value) : 8,
            sampleRate: distortionSampleRateInput ? parseFloat(distortionSampleRateInput.value) : 8000,
            mix: distortionMixInput ? parseFloat(distortionMixInput.value) : 0.5,
            output: distortionOutputInput ? parseFloat(distortionOutputInput.value) : 0.7
        } : null,

        // Master
        masterVolume: masterVolumeInput ? parseFloat(masterVolumeInput.value) : 0.7,
        bpm: currentBPM || 120,
        metronomeEnabled: metronomeEnabled || false
    };
}

function serializeProjectState() {
    const state = {
        version: '1.0',
        projectName: projectName,
        timestamp: new Date().toISOString(),

        // Synth parameters
        synth: getCurrentSynthParams(),

        // Looper data
        looper: {
            slots: loopSlotsData ? loopSlotsData.map(slot => ({
                id: slot.id,
                recordedEvents: slot.recordedEvents || [],
                loopDuration: slot.loopDuration || 0,
                statusText: slot.statusText || 'Empty'
            })) : []
        },

        // Mixer state
        mixer: {
            channels: mixerChannels ? mixerChannels.slice(0, NUM_MIXER_CHANNELS).map((ch, i) => ({
                label: document.querySelector(`[data-channel="${i}"]`)?.value || `Track ${i + 1}`,
                gain: ch.originalGain || 0.75,
                pan: document.querySelector(`.pan-knob[data-channel="${i}"]`)?.value || 0,
                muted: document.querySelector(`.mute-button[data-channel="${i}"]`)?.classList.contains('active') || false,
                solo: soloedChannels ? soloedChannels.has(i) : false
            })) : []
        },

        // Sample library (excluding actual audio buffers)
        samples: {
            library: Object.keys(sampleLibrary).map(id => ({
                id: id,
                name: sampleLibrary[id].name,
                settings: sampleLibrary[id].settings
                // Note: Audio buffers cannot be serialized, only metadata
            })),
            drumPads: drumPads ? [...drumPads] : [],
            samplerMode: currentSamplerMode || 'synth'
        },

        // Automation data
        automation: {
            data: typeof automationData !== 'undefined' ? JSON.parse(JSON.stringify(automationData)) : {},
            mode: typeof automationMode !== 'undefined' ? automationMode : 'off',
            selectedParam: typeof selectedAutomationParam !== 'undefined' ? selectedAutomationParam : 'masterVolume'
        },

        // LFO state
        lfos: typeof lfoState !== 'undefined' ? {
            lfo1: {
                enabled: lfoState.lfo1.enabled,
                target: lfoState.lfo1.target,
                waveform: lfoState.lfo1.waveform,
                rate: lfoState.lfo1.rate,
                depth: lfoState.lfo1.depth,
                phase: lfoState.lfo1.phase
            },
            lfo2: {
                enabled: lfoState.lfo2.enabled,
                target: lfoState.lfo2.target,
                waveform: lfoState.lfo2.waveform,
                rate: lfoState.lfo2.rate,
                depth: lfoState.lfo2.depth,
                phase: lfoState.lfo2.phase
            }
        } : null,

        // Piano Roll data
        pianoRoll: typeof prNotes !== 'undefined' ? {
            notes: [...prNotes],
            gridSize: prGridSize || 8,
            length: prLength || 8
        } : null,

        // Step Sequencer data
        stepSequencer: typeof ssPatterns !== 'undefined' ? {
            patterns: ssPatterns.map(p => [...p]),
            currentPattern: ssCurrentPattern || 0,
            steps: ssSteps || 16
        } : null,

        // Arpeggiator state
        arpeggiator: typeof arpState !== 'undefined' ? {
            enabled: arpState.enabled,
            mode: arpState.mode,
            rate: arpState.rate,
            octaves: arpState.octaves
        } : null,

        // UI settings
        ui: {
            theme: uiThemeSelect ? uiThemeSelect.value : 'midnight-drive',
            scale: uiScaleInput ? parseFloat(uiScaleInput.value) : 100,
            synthesiaEnabled: synthesiaToggle ? synthesiaToggle.checked : false,
            numOctaves: numOctavesSelect ? parseInt(numOctavesSelect.value) : 2,
            visualizerSource: visualizerSourceSelect ? visualizerSourceSelect.value : 'master'
        }
    };

    return state;
}

function deserializeProjectState(state) {
    if (!state || !state.version) {
        console.error('Invalid project state');
        return false;
    }

    try {
        // Update project name
        if (state.projectName) {
            projectName = state.projectName;
        }

        // Restore synth parameters
        if (state.synth) {
            const s = state.synth;

            // Oscillators
            if (s.osc1) {
                if (waveformOsc1Select) waveformOsc1Select.value = s.osc1.waveform;
                if (octaveOsc1Select) octaveOsc1Select.value = s.osc1.octave;
                if (detuneOsc1Input) detuneOsc1Input.value = s.osc1.detune;
                if (levelOsc1Input) levelOsc1Input.value = s.osc1.level;
            }

            if (s.osc2) {
                if (enableOsc2Toggle) enableOsc2Toggle.checked = s.osc2.enabled;
                if (waveformOsc2Select) waveformOsc2Select.value = s.osc2.waveform;
                if (octaveOsc2Select) octaveOsc2Select.value = s.osc2.octave;
                if (fineTuneOsc2Input) fineTuneOsc2Input.value = s.osc2.fineTune;
                if (delayOsc2Input) delayOsc2Input.value = s.osc2.delay;
                if (levelOsc2Input) levelOsc2Input.value = s.osc2.level;
                if (osc2ControlsWrapper) osc2ControlsWrapper.style.display = s.osc2.enabled ? 'block' : 'none';
            }

            if (s.sub) {
                if (enableSubToggle) enableSubToggle.checked = s.sub.enabled;
                if (waveformSubSelect) waveformSubSelect.value = s.sub.waveform;
                if (octaveSubSelect) octaveSubSelect.value = s.sub.octave;
                if (levelSubInput) levelSubInput.value = s.sub.level;
                if (subOscControls) subOscControls.style.display = s.sub.enabled ? 'block' : 'none';
            }

            if (s.noise) {
                if (enableNoiseToggle) enableNoiseToggle.checked = s.noise.enabled;
                if (noiseTypeSelect) noiseTypeSelect.value = s.noise.type;
                if (levelNoiseInput) levelNoiseInput.value = s.noise.level;
                if (noiseControls) noiseControls.style.display = s.noise.enabled ? 'block' : 'none';
            }

            if (pulseWidthInput && s.pulseWidth !== undefined) pulseWidthInput.value = s.pulseWidth;
            if (oscSlopInput && s.oscSlop !== undefined) oscSlopInput.value = s.oscSlop;

            // Envelope
            if (s.adsr) {
                if (enableAdsrToggle) enableAdsrToggle.checked = s.adsr.enabled;
                if (attackInput) attackInput.value = s.adsr.attack;
                if (decayInput) decayInput.value = s.adsr.decay;
                if (sustainInput) sustainInput.value = s.adsr.sustain;
                if (releaseInput) releaseInput.value = s.adsr.release;
                if (adsrControls) adsrControls.style.display = s.adsr.enabled ? 'block' : 'none';
            }

            // Filter
            if (s.filter) {
                if (enableFilterToggle) enableFilterToggle.checked = s.filter.enabled;
                if (filterTypeSelect) filterTypeSelect.value = s.filter.type;
                if (filterCutoffInput) filterCutoffInput.value = s.filter.cutoff;
                if (filterResonanceInput) filterResonanceInput.value = s.filter.resonance;
                if (filterControlsElement) filterControlsElement.style.display = s.filter.enabled ? 'block' : 'none';

                // Update audio filter
                if (audioContext && filterNode && s.filter.enabled) {
                    filterNode.type = s.filter.type;
                    filterNode.frequency.setValueAtTime(s.filter.cutoff, audioContext.currentTime);
                    filterNode.Q.setValueAtTime(s.filter.resonance, audioContext.currentTime);
                }
            }

            // Effects
            if (s.reverb && enableReverb) {
                enableReverb.checked = s.reverb.enabled;
                if (reverbType) reverbType.value = s.reverb.type;
                if (reverbMix) reverbMix.value = s.reverb.mix;
                if (reverbDecay) reverbDecay.value = s.reverb.decay;
                if (reverbControls) reverbControls.style.display = s.reverb.enabled ? 'block' : 'none';
                if (s.reverb.enabled && typeof updateReverbImpulse === 'function') updateReverbImpulse();
            }

            if (s.delay && enableDelay) {
                enableDelay.checked = s.delay.enabled;
                if (delayTime) delayTime.value = s.delay.time;
                if (delayFeedback) delayFeedback.value = s.delay.feedback;
                if (delayMix) delayMix.value = s.delay.mix;
                if (delayPingPong) delayPingPong.checked = s.delay.pingPong;
                if (delayControls) delayControls.style.display = s.delay.enabled ? 'block' : 'none';
            }

            if (s.chorus && enableChorus) {
                enableChorus.checked = s.chorus.enabled;
                if (chorusRate) chorusRate.value = s.chorus.rate;
                if (chorusDepth) chorusDepth.value = s.chorus.depth;
                if (chorusMix) chorusMix.value = s.chorus.mix;
                if (chorusControls) chorusControls.style.display = s.chorus.enabled ? 'block' : 'none';
                if (s.chorus.enabled && typeof updateChorusParams === 'function') updateChorusParams();
            }

            if (s.flanger && enableFlanger) {
                enableFlanger.checked = s.flanger.enabled;
                if (flangerRate) flangerRate.value = s.flanger.rate;
                if (flangerDepth) flangerDepth.value = s.flanger.depth;
                if (flangerFeedback) flangerFeedback.value = s.flanger.feedback;
                if (flangerMix) flangerMix.value = s.flanger.mix;
                if (flangerControls) flangerControls.style.display = s.flanger.enabled ? 'block' : 'none';
                if (s.flanger.enabled && typeof updateFlangerParams === 'function') updateFlangerParams();
            }

            if (s.phaser && enablePhaser) {
                enablePhaser.checked = s.phaser.enabled;
                if (phaserRate) phaserRate.value = s.phaser.rate;
                if (phaserDepth) phaserDepth.value = s.phaser.depth;
                if (phaserStages) phaserStages.value = s.phaser.stages;
                if (phaserMix) phaserMix.value = s.phaser.mix;
                if (phaserControls) phaserControls.style.display = s.phaser.enabled ? 'block' : 'none';
                if (s.phaser.enabled) {
                    if (typeof updatePhaserStages === 'function') updatePhaserStages();
                    if (typeof updatePhaserParams === 'function') updatePhaserParams();
                }
            }

            // Master
            if (s.masterVolume !== undefined && masterVolumeInput) {
                masterVolumeInput.value = s.masterVolume;
                if (audioContext && masterGain) {
                    masterGain.gain.setValueAtTime(s.masterVolume, audioContext.currentTime);
                }
            }

            if (s.bpm !== undefined) {
                currentBPM = s.bpm;
                if (typeof updateBPMDisplay === 'function') updateBPMDisplay();
            }

            if (s.metronomeEnabled !== undefined && metronomeToggle) {
                metronomeToggle.checked = s.metronomeEnabled;
                metronomeEnabled = s.metronomeEnabled;
            }
        }

        // Restore looper data
        if (state.looper && state.looper.slots && loopSlotsData) {
            state.looper.slots.forEach((savedSlot, i) => {
                if (i < loopSlotsData.length) {
                    loopSlotsData[i].recordedEvents = savedSlot.recordedEvents || [];
                    loopSlotsData[i].loopDuration = savedSlot.loopDuration || 0;
                    loopSlotsData[i].statusText = savedSlot.statusText || 'Empty';
                }
            });
            if (typeof updateAllLoopSlotButtons === 'function') updateAllLoopSlotButtons();
        }

        // Restore mixer state
        if (state.mixer && state.mixer.channels && mixerChannels) {
            state.mixer.channels.forEach((savedCh, i) => {
                if (i < mixerChannels.length && mixerChannels[i]) {
                    const labelEl = document.querySelector(`.track-label[data-channel="${i}"]`);
                    if (labelEl) labelEl.value = savedCh.label || `Track ${i + 1}`;

                    const faderEl = document.querySelector(`.fader[data-channel="${i}"]`);
                    if (faderEl && audioContext) {
                        const dbValue = gainToDb(savedCh.gain || 0.75);
                        faderEl.value = dbValue;
                        mixerChannels[i].gainNode.gain.setValueAtTime(savedCh.gain || 0.75, audioContext.currentTime);
                        const faderValueEl = faderEl.parentElement.querySelector('.fader-value');
                        if (faderValueEl) faderValueEl.textContent = dbValue === -60 ? '-∞ dB' : dbValue.toFixed(1) + ' dB';
                    }

                    const panEl = document.querySelector(`.pan-knob[data-channel="${i}"]`);
                    if (panEl && audioContext && mixerChannels[i].panNode) {
                        panEl.value = savedCh.pan || 0;
                        mixerChannels[i].panNode.pan.setValueAtTime(savedCh.pan || 0, audioContext.currentTime);
                    }

                    const muteBtn = document.querySelector(`.mute-button[data-channel="${i}"]`);
                    if (muteBtn) {
                        if (savedCh.muted) muteBtn.classList.add('active');
                        else muteBtn.classList.remove('active');
                    }

                    if (savedCh.solo) soloedChannels.add(i);
                    else soloedChannels.delete(i);
                }
            });
            if (typeof updateSoloMuteStates === 'function') updateSoloMuteStates();
        }

        // Restore automation data
        if (state.automation && typeof automationData !== 'undefined') {
            automationData = JSON.parse(JSON.stringify(state.automation.data || {}));
            if (state.automation.mode && typeof automationMode !== 'undefined') automationMode = state.automation.mode;
            if (state.automation.selectedParam && typeof selectedAutomationParam !== 'undefined') {
                selectedAutomationParam = state.automation.selectedParam;
                const selEl = document.getElementById('automationParameterSelect');
                if (selEl) selEl.value = selectedAutomationParam;
            }
            if (typeof drawAutomationLane === 'function') drawAutomationLane();
        }

        // Restore LFO state
        if (state.lfos && typeof lfoState !== 'undefined') {
            if (state.lfos.lfo1) {
                Object.assign(lfoState.lfo1, state.lfos.lfo1);
                document.getElementById('lfo1Enable').checked = state.lfos.lfo1.enabled;
                document.getElementById('lfo1Target').value = state.lfos.lfo1.target;
                document.getElementById('lfo1Waveform').value = state.lfos.lfo1.waveform;
                document.getElementById('lfo1Rate').value = state.lfos.lfo1.rate;
                document.getElementById('lfo1Depth').value = state.lfos.lfo1.depth;
                document.getElementById('lfo1Phase').value = state.lfos.lfo1.phase;
                if (typeof updateLFODisplay === 'function') updateLFODisplay('lfo1');
            }
            if (state.lfos.lfo2) {
                Object.assign(lfoState.lfo2, state.lfos.lfo2);
                document.getElementById('lfo2Enable').checked = state.lfos.lfo2.enabled;
                document.getElementById('lfo2Target').value = state.lfos.lfo2.target;
                document.getElementById('lfo2Waveform').value = state.lfos.lfo2.waveform;
                document.getElementById('lfo2Rate').value = state.lfos.lfo2.rate;
                document.getElementById('lfo2Depth').value = state.lfos.lfo2.depth;
                document.getElementById('lfo2Phase').value = state.lfos.lfo2.phase;
                if (typeof updateLFODisplay === 'function') updateLFODisplay('lfo2');
            }
        }

        // Restore Piano Roll
        if (state.pianoRoll && typeof prNotes !== 'undefined') {
            prNotes = [...state.pianoRoll.notes];
            if (state.pianoRoll.gridSize) prGridSize = state.pianoRoll.gridSize;
            if (state.pianoRoll.length) prLength = state.pianoRoll.length;
            if (typeof drawPianoRoll === 'function') drawPianoRoll();
        }

        // Restore Step Sequencer
        if (state.stepSequencer && typeof ssPatterns !== 'undefined') {
            ssPatterns = state.stepSequencer.patterns.map(p => [...p]);
            if (state.stepSequencer.currentPattern !== undefined) ssCurrentPattern = state.stepSequencer.currentPattern;
            if (state.stepSequencer.steps) ssSteps = state.stepSequencer.steps;
            if (typeof renderStepSeqGrid === 'function') renderStepSeqGrid();
        }

        // Restore Arpeggiator
        if (state.arpeggiator && typeof arpState !== 'undefined') {
            arpState.enabled = state.arpeggiator.enabled;
            arpState.mode = state.arpeggiator.mode;
            arpState.rate = state.arpeggiator.rate;
            arpState.octaves = state.arpeggiator.octaves;

            const arpEnabled = document.getElementById('arpEnabled');
            const arpMode = document.getElementById('arpMode');
            const arpRateEl = document.getElementById('arpRate');
            const arpOctaves = document.getElementById('arpOctaves');

            if (arpEnabled) arpEnabled.checked = state.arpeggiator.enabled;
            if (arpMode) arpMode.value = state.arpeggiator.mode;
            if (arpRateEl) arpRateEl.value = state.arpeggiator.rate;
            if (arpOctaves) arpOctaves.value = state.arpeggiator.octaves;
        }

        // Restore UI settings
        if (state.ui) {
            if (state.ui.theme && uiThemeSelect) {
                uiThemeSelect.value = state.ui.theme;
                applyTheme(state.ui.theme);
            }
            if (state.ui.scale && uiScaleInput) {
                uiScaleInput.value = state.ui.scale;
                applyUIScale(state.ui.scale);
            }
            if (state.ui.synthesiaEnabled !== undefined && synthesiaToggle) {
                synthesiaToggle.checked = state.ui.synthesiaEnabled;
                if (synthesiaContainer) {
                    synthesiaContainer.classList.toggle('active', state.ui.synthesiaEnabled);
                }
            }
            if (state.ui.numOctaves && numOctavesSelect) {
                numOctavesSelect.value = state.ui.numOctaves;
            }
            if (state.ui.visualizerSource && visualizerSourceSelect) {
                visualizerSourceSelect.value = state.ui.visualizerSource;
            }
        }

        markProjectSaved();
        updateProjectStatus('Project loaded: ' + (state.projectName || 'Untitled'));
        return true;

    } catch (error) {
        console.error('Error deserializing project state:', error);
        alert('Error loading project: ' + error.message);
        return false;
    }
}

// ----------------------------------------------------------------------------
// PROJECT SAVE/LOAD FUNCTIONS
// ----------------------------------------------------------------------------

function saveProject() {
    const state = serializeProjectState();

    // Save to localStorage
    try {
        const stateJson = JSON.stringify(state);
        localStorage.setItem('uso_current_project', stateJson);
        localStorage.setItem('uso_project_name', projectName);
        localStorage.setItem('uso_last_save', new Date().toISOString());

        markProjectSaved();
        updateProjectStatus('Project saved: ' + projectName);
        return true;
    } catch (error) {
        console.error('Error saving project:', error);
        alert('Error saving project: ' + error.message);
        return false;
    }
}

function loadProject() {
    try {
        const stateJson = localStorage.getItem('uso_current_project');
        if (!stateJson) {
            updateProjectStatus('No saved project found');
            return false;
        }

        const state = JSON.parse(stateJson);
        return deserializeProjectState(state);
    } catch (error) {
        console.error('Error loading project:', error);
        alert('Error loading project: ' + error.message);
        return false;
    }
}

function saveProjectAs() {
    const newName = prompt('Enter project name:', projectName);
    if (newName && newName.trim()) {
        projectName = newName.trim();
        return saveProject();
    }
    return false;
}

function newProject() {
    if (projectModified) {
        if (!confirm('You have unsaved changes. Create new project?')) {
            return;
        }
    }

    // Reset to default state
    projectName = 'Untitled Project';
    projectModified = false;
    undoStack.length = 0;
    redoStack.length = 0;

    // Clear looper slots
    if (loopSlotsData) {
        loopSlotsData.forEach((slot, i) => {
            if (typeof clearSlot === 'function') clearSlot(i);
        });
    }

    // Clear piano roll
    if (typeof clearPianoRoll === 'function') clearPianoRoll();

    // Clear step sequencer
    if (typeof ssPatterns !== 'undefined') {
        ssPatterns = [[], [], [], []];
        if (typeof renderStepSeqGrid === 'function') renderStepSeqGrid();
    }

    // Clear automation
    if (typeof clearAllAutomation === 'function') clearAllAutomation();

    updateUndoRedoButtons();
    updateProjectStatus('New project created');
}

function downloadProject() {
    const state = serializeProjectState();
    const stateJson = JSON.stringify(state, null, 2);
    const blob = new Blob([stateJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = (projectName || 'project') + '.uso.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    updateProjectStatus('Project downloaded');
}

function uploadProject(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const state = JSON.parse(e.target.result);
            if (deserializeProjectState(state)) {
                updateProjectStatus('Project uploaded: ' + (state.projectName || 'Untitled'));
            }
        } catch (error) {
            console.error('Error parsing project file:', error);
            alert('Error loading project file: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// ----------------------------------------------------------------------------
// TEMPLATE SYSTEM
// ----------------------------------------------------------------------------

function saveTemplate() {
    const templateName = prompt('Enter template name:');
    if (!templateName || !templateName.trim()) return;

    const state = serializeProjectState();
    state.templateName = templateName.trim();

    try {
        // Get existing templates
        const templatesJson = localStorage.getItem('uso_templates') || '{}';
        const templates = JSON.parse(templatesJson);

        // Add new template
        templates[templateName.trim()] = state;

        // Save back
        localStorage.setItem('uso_templates', JSON.stringify(templates));

        updateProjectStatus('Template saved: ' + templateName);
    } catch (error) {
        console.error('Error saving template:', error);
        alert('Error saving template: ' + error.message);
    }
}

function loadTemplate() {
    try {
        const templatesJson = localStorage.getItem('uso_templates') || '{}';
        const templates = JSON.parse(templatesJson);
        const templateNames = Object.keys(templates);

        if (templateNames.length === 0) {
            alert('No templates found');
            return;
        }

        // Show template selection
        let message = 'Select template:\n\n';
        templateNames.forEach((name, i) => {
            message += `${i + 1}. ${name}\n`;
        });

        const selection = prompt(message + '\nEnter number:');
        if (!selection) return;

        const index = parseInt(selection) - 1;
        if (index >= 0 && index < templateNames.length) {
            const templateName = templateNames[index];
            const state = templates[templateName];

            if (deserializeProjectState(state)) {
                projectName = 'Untitled Project'; // Don't use template name as project name
                updateProjectStatus('Template loaded: ' + templateName);
            }
        }
    } catch (error) {
        console.error('Error loading template:', error);
        alert('Error loading template: ' + error.message);
    }
}

// ----------------------------------------------------------------------------
// PRESET MANAGEMENT
// ----------------------------------------------------------------------------

function savePreset() {
    const presetName = prompt('Enter preset name:');
    if (!presetName || !presetName.trim()) return;

    const preset = getCurrentSynthParams();
    preset.presetName = presetName.trim();

    try {
        const presetsJson = localStorage.getItem('uso_presets') || '{}';
        const presets = JSON.parse(presetsJson);

        presets[presetName.trim()] = preset;
        localStorage.setItem('uso_presets', JSON.stringify(presets));

        updateProjectStatus('Preset saved: ' + presetName);
    } catch (error) {
        console.error('Error saving preset:', error);
        alert('Error saving preset: ' + error.message);
    }
}

function loadPreset() {
    try {
        const presetsJson = localStorage.getItem('uso_presets') || '{}';
        const presets = JSON.parse(presetsJson);
        const presetNames = Object.keys(presets);

        if (presetNames.length === 0) {
            alert('No presets found');
            return;
        }

        let message = 'Select preset:\n\n';
        presetNames.forEach((name, i) => {
            message += `${i + 1}. ${name}\n`;
        });

        const selection = prompt(message + '\nEnter number:');
        if (!selection) return;

        const index = parseInt(selection) - 1;
        if (index >= 0 && index < presetNames.length) {
            const presetName = presetNames[index];
            const preset = presets[presetName];

            // Apply preset
            const state = {
                version: '1.0',
                synth: preset
            };

            if (deserializeProjectState(state)) {
                updateProjectStatus('Preset loaded: ' + presetName);
            }
        }
    } catch (error) {
        console.error('Error loading preset:', error);
        alert('Error loading preset: ' + error.message);
    }
}

// ----------------------------------------------------------------------------
// AUTO-SAVE SYSTEM
// ----------------------------------------------------------------------------

function startAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
    }

    if (autoSaveEnabled) {
        autoSaveInterval = setInterval(() => {
            if (projectModified) {
                saveProject();
                console.log('Auto-saved project at ' + new Date().toLocaleTimeString());
            }
        }, autoSaveIntervalMs);
    }
}

function stopAutoSave() {
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }
}

function toggleAutoSave(enabled) {
    autoSaveEnabled = enabled;
    if (enabled) {
        startAutoSave();
        updateProjectStatus('Auto-save enabled');
    } else {
        stopAutoSave();
        updateProjectStatus('Auto-save disabled');
    }
}

// Auto-recovery on page load
function attemptAutoRecovery() {
    try {
        const lastSave = localStorage.getItem('uso_last_save');
        const currentProject = localStorage.getItem('uso_current_project');

        if (lastSave && currentProject) {
            const lastSaveDate = new Date(lastSave);
            const now = new Date();
            const diffMinutes = (now - lastSaveDate) / (1000 * 60);

            // If last save was less than 24 hours ago, offer to recover
            if (diffMinutes < 1440) {
                if (confirm(`Found auto-saved project from ${lastSaveDate.toLocaleString()}. Restore?`)) {
                    loadProject();
                }
            }
        }
    } catch (error) {
        console.error('Error during auto-recovery:', error);
    }
}

// ----------------------------------------------------------------------------
// INITIALIZATION AND EVENT LISTENERS
// ----------------------------------------------------------------------------

function initProjectManagement() {
    // New Project
    const newProjectBtn = document.getElementById('newProjectBtn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', newProject);
    }

    // Open Project
    const openProjectBtn = document.getElementById('openProjectBtn');
    if (openProjectBtn) {
        openProjectBtn.addEventListener('click', loadProject);
    }

    // Save Project
    const saveProjectBtn = document.getElementById('saveProjectBtn');
    if (saveProjectBtn) {
        saveProjectBtn.addEventListener('click', saveProject);
    }

    // Save As
    const saveAsProjectBtn = document.getElementById('saveAsProjectBtn');
    if (saveAsProjectBtn) {
        saveAsProjectBtn.addEventListener('click', saveProjectAs);
    }

    // Download Project
    const downloadProjectBtn = document.getElementById('downloadProjectBtn');
    if (downloadProjectBtn) {
        downloadProjectBtn.addEventListener('click', downloadProject);
    }

    // Upload Project
    const uploadProjectBtn = document.getElementById('uploadProjectBtn');
    const uploadProjectInput = document.getElementById('uploadProjectInput');
    if (uploadProjectBtn && uploadProjectInput) {
        uploadProjectBtn.addEventListener('click', () => uploadProjectInput.click());
        uploadProjectInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                uploadProject(e.target.files[0]);
                e.target.value = ''; // Reset input
            }
        });
    }

    // Undo/Redo
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);

    // Keyboard shortcuts for undo/redo
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault();
            undo();
        } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
            e.preventDefault();
            redo();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveProject();
        }
    });

    // Templates
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    const loadTemplateBtn = document.getElementById('loadTemplateBtn');
    if (saveTemplateBtn) saveTemplateBtn.addEventListener('click', saveTemplate);
    if (loadTemplateBtn) loadTemplateBtn.addEventListener('click', loadTemplate);

    // Presets
    const savePresetBtn = document.getElementById('savePresetBtn');
    const loadPresetBtn = document.getElementById('loadPresetBtn');
    if (savePresetBtn) savePresetBtn.addEventListener('click', savePreset);
    if (loadPresetBtn) loadPresetBtn.addEventListener('click', loadPreset);

    // Auto-save toggle
    const autoSaveToggle = document.getElementById('autoSaveToggle');
    if (autoSaveToggle) {
        autoSaveToggle.addEventListener('change', (e) => {
            toggleAutoSave(e.target.checked);
        });

        // Start auto-save if enabled
        if (autoSaveToggle.checked) {
            startAutoSave();
        }
    }

    // Attempt auto-recovery
    attemptAutoRecovery();

    updateUndoRedoButtons();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProjectManagement);
} else {
    initProjectManagement();
}

// Before unload warning
window.addEventListener('beforeunload', (e) => {
    if (projectModified && autoSaveEnabled) {
        saveProject(); // Quick save before unload
    }

    if (projectModified && !autoSaveEnabled) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
    }
});
