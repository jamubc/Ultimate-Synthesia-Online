// ============================================================================
// CORE DAW AUDIO INFRASTRUCTURE
// ============================================================================
// This module implements professional DAW-style audio routing and processing
// Features: 16 tracks, master + 4 aux buses, effects chains, latency compensation

// Global infrastructure objects
let audioBusSystem = null;
let audioGraphManager = null;
let trackManager = null;

// --- TRACK CLASS ---
// Represents a single audio track with its own gain, pan, effects chain, and routing
class Track {
    constructor(id, name, audioContext) {
        this.id = id;
        this.name = name;
        this.ctx = audioContext;

        // Track state
        this.muted = false;
        this.soloed = false;
        this.armed = false;

        // Create audio nodes for this track
        this.input = this.ctx.createGain(); // Track input (receives audio sources)
        this.preGain = this.ctx.createGain(); // Pre-fader gain (for effects send level)
        this.preGain.gain.value = 1.0;

        // Pan control using StereoPanner (more efficient than manual panning)
        this.panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        if (this.panner) this.panner.pan.value = 0; // Center

        this.fader = this.ctx.createGain(); // Main track fader
        this.fader.gain.value = 0.75; // Default track volume

        this.output = this.ctx.createGain(); // Track output (connects to buses)
        this.output.gain.value = 1.0;

        // Effects chain infrastructure
        this.effectsChain = [];
        this.effectsBypassNodes = []; // For bypassing effects

        // Routing - which buses this track sends to (master + aux buses)
        this.busRoutings = {
            master: { enabled: true, gain: this.ctx.createGain() }, // Always send to master by default
            aux: [] // Will be populated with aux send gains
        };
        this.busRoutings.master.gain.gain.value = 1.0;

        // Latency compensation
        this.reportedLatency = 0; // In samples
        this.delayCompensationNode = this.ctx.createDelay(1.0); // Max 1 second delay
        this.delayCompensationNode.delayTime.value = 0;

        // Build initial signal chain
        this.rebuildSignalChain();

        // VU meter data (for future metering)
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.output.connect(this.analyser);
    }

    // Rebuild the signal chain when effects are added/removed/reordered
    rebuildSignalChain() {
        // Disconnect everything
        try {
            this.input.disconnect();
            this.preGain.disconnect();
            if (this.panner) this.panner.disconnect();
            this.fader.disconnect();
            this.delayCompensationNode.disconnect();
            this.output.disconnect();
            this.effectsChain.forEach(fx => {
                if (fx.input) fx.input.disconnect();
                if (fx.output) fx.output.disconnect();
            });
        } catch (e) {
            // Nodes may not have been connected yet
        }

        // Rebuild chain: input -> preGain -> [effects] -> pan -> fader -> delayComp -> output
        let currentNode = this.input;
        currentNode.connect(this.preGain);
        currentNode = this.preGain;

        // Insert effects chain
        for (let i = 0; i < this.effectsChain.length; i++) {
            const effect = this.effectsChain[i];
            if (effect.bypassed) {
                // Skip bypassed effects
                continue;
            }
            currentNode.connect(effect.input);
            currentNode = effect.output;
        }

        // Connect to pan/fader
        if (this.panner) {
            currentNode.connect(this.panner);
            this.panner.connect(this.fader);
        } else {
            currentNode.connect(this.fader);
        }

        this.fader.connect(this.delayCompensationNode);
        this.delayCompensationNode.connect(this.output);

        // Reconnect analyser
        this.output.connect(this.analyser);
    }

    // Add an effect to this track's effects chain
    addEffect(effectDefinition) {
        // effectDefinition: { type, input, output, bypassed, latency, params }
        this.effectsChain.push(effectDefinition);
        this.rebuildSignalChain();
        this.recalculateLatency();
    }

    // Remove an effect by index
    removeEffect(index) {
        if (index >= 0 && index < this.effectsChain.length) {
            const fx = this.effectsChain[index];
            // Disconnect the effect
            try {
                if (fx.input) fx.input.disconnect();
                if (fx.output) fx.output.disconnect();
            } catch (e) {}

            this.effectsChain.splice(index, 1);
            this.rebuildSignalChain();
            this.recalculateLatency();
        }
    }

    // Toggle effect bypass
    toggleEffectBypass(index) {
        if (index >= 0 && index < this.effectsChain.length) {
            this.effectsChain[index].bypassed = !this.effectsChain[index].bypassed;
            this.rebuildSignalChain();
            this.recalculateLatency();
        }
    }

    // Recalculate total latency from effects chain
    recalculateLatency() {
        this.reportedLatency = 0;
        this.effectsChain.forEach(fx => {
            if (!fx.bypassed && fx.latency) {
                this.reportedLatency += fx.latency;
            }
        });
    }

    // Set track volume (fader)
    setVolume(value) {
        const now = this.ctx.currentTime;
        this.fader.gain.setTargetAtTime(value, now, 0.01);
    }

    // Set track pan (-1 to 1, -1=left, 0=center, 1=right)
    setPan(value) {
        if (this.panner) {
            const now = this.ctx.currentTime;
            this.panner.pan.setTargetAtTime(value, now, 0.01);
        }
    }

    // Mute/unmute
    setMute(muted) {
        this.muted = muted;
        const now = this.ctx.currentTime;
        this.output.gain.setTargetAtTime(muted ? 0 : 1, now, 0.01);
    }

    // Solo (handled by TrackManager)
    setSolo(soloed) {
        this.soloed = soloed;
    }

    // Connect this track to a bus
    connectToBus(busGainNode, sendLevel = 1.0) {
        this.output.connect(busGainNode);
        busGainNode.gain.value = sendLevel;
    }

    // Disconnect from all buses (for re-routing)
    disconnectFromAllBuses() {
        try {
            this.output.disconnect();
            // Reconnect analyser
            this.output.connect(this.analyser);
        } catch (e) {}
    }
}

// --- AUDIO BUS SYSTEM ---
// Manages master bus and auxiliary buses (for effects sends, submixes, etc.)
class AudioBusSystem {
    constructor(audioContext, numAuxBuses = 4) {
        this.ctx = audioContext;

        // Master Bus - final output
        this.masterBus = {
            name: 'Master',
            input: this.ctx.createGain(),
            fader: this.ctx.createGain(),
            output: this.ctx.createGain(),
            effectsChain: [],
            analyser: this.ctx.createAnalyser()
        };
        this.masterBus.input.gain.value = 1.0;
        this.masterBus.fader.gain.value = 0.7; // Default master volume
        this.masterBus.output.gain.value = 1.0;
        this.masterBus.analyser.fftSize = 2048;

        // Build master bus chain: input -> [effects] -> fader -> output -> analyser -> destination
        this.masterBus.input.connect(this.masterBus.fader);
        this.masterBus.fader.connect(this.masterBus.output);
        this.masterBus.output.connect(this.masterBus.analyser);

        // Auxiliary Buses - for effects sends, parallel processing, submixes
        this.auxBuses = [];
        for (let i = 0; i < numAuxBuses; i++) {
            const auxBus = {
                id: i,
                name: `Aux ${i + 1}`,
                input: this.ctx.createGain(),
                fader: this.ctx.createGain(),
                output: this.ctx.createGain(),
                effectsChain: [],
                analyser: this.ctx.createAnalyser(),
                returnToMaster: this.ctx.createGain() // Controls how much aux returns to master
            };
            auxBus.input.gain.value = 1.0;
            auxBus.fader.gain.value = 0.75;
            auxBus.output.gain.value = 1.0;
            auxBus.returnToMaster.gain.value = 1.0;
            auxBus.analyser.fftSize = 256;

            // Build aux bus chain: input -> [effects] -> fader -> output -> return -> master
            auxBus.input.connect(auxBus.fader);
            auxBus.fader.connect(auxBus.output);
            auxBus.output.connect(auxBus.analyser);
            auxBus.output.connect(auxBus.returnToMaster);
            auxBus.returnToMaster.connect(this.masterBus.input); // Return to master bus input

            this.auxBuses.push(auxBus);
        }
    }

    // Connect master bus to the final destination (existing masterGain/limiter)
    connectToDestination(destinationNode) {
        this.masterBus.analyser.connect(destinationNode);
    }

    // Set master volume
    setMasterVolume(value) {
        const now = this.ctx.currentTime;
        this.masterBus.fader.gain.setTargetAtTime(value, now, 0.01);
    }

    // Set aux bus send level
    setAuxSendLevel(auxId, value) {
        if (auxId >= 0 && auxId < this.auxBuses.length) {
            const now = this.ctx.currentTime;
            this.auxBuses[auxId].fader.gain.setTargetAtTime(value, now, 0.01);
        }
    }

    // Set aux return level (how much aux bus returns to master)
    setAuxReturnLevel(auxId, value) {
        if (auxId >= 0 && auxId < this.auxBuses.length) {
            const now = this.ctx.currentTime;
            this.auxBuses[auxId].returnToMaster.gain.setTargetAtTime(value, now, 0.01);
        }
    }

    // Add effect to aux bus (e.g., reverb, delay)
    addEffectToAuxBus(auxId, effectDefinition) {
        if (auxId >= 0 && auxId < this.auxBuses.length) {
            const bus = this.auxBuses[auxId];
            bus.effectsChain.push(effectDefinition);
            this.rebuildAuxBusChain(auxId);
        }
    }

    // Rebuild aux bus signal chain
    rebuildAuxBusChain(auxId) {
        if (auxId < 0 || auxId >= this.auxBuses.length) return;

        const bus = this.auxBuses[auxId];

        // Disconnect
        try {
            bus.input.disconnect();
            bus.fader.disconnect();
            bus.output.disconnect();
            bus.effectsChain.forEach(fx => {
                if (fx.input) fx.input.disconnect();
                if (fx.output) fx.output.disconnect();
            });
        } catch (e) {}

        // Rebuild: input -> [effects] -> fader -> output
        let currentNode = bus.input;

        for (let i = 0; i < bus.effectsChain.length; i++) {
            const effect = bus.effectsChain[i];
            if (!effect.bypassed) {
                currentNode.connect(effect.input);
                currentNode = effect.output;
            }
        }

        currentNode.connect(bus.fader);
        bus.fader.connect(bus.output);
        bus.output.connect(bus.analyser);
        bus.output.connect(bus.returnToMaster);
    }
}

// --- TRACK MANAGER ---
// Manages all tracks and their solo/mute states
class TrackManager {
    constructor(audioContext, busSystem, maxTracks = 16) {
        this.ctx = audioContext;
        this.busSystem = busSystem;
        this.tracks = [];
        this.maxTracks = maxTracks;

        // Create default tracks
        for (let i = 0; i < maxTracks; i++) {
            const track = new Track(i, `Track ${i + 1}`, this.ctx);
            this.tracks.push(track);

            // Connect track to master bus by default
            track.connectToBus(this.busSystem.masterBus.input, 1.0);

            // Create aux send gains for this track
            for (let auxId = 0; auxId < this.busSystem.auxBuses.length; auxId++) {
                const sendGain = this.ctx.createGain();
                sendGain.gain.value = 0; // Aux sends off by default
                track.output.connect(sendGain);
                sendGain.connect(this.busSystem.auxBuses[auxId].input);
                track.busRoutings.aux.push({ auxId, gain: sendGain, enabled: false });
            }
        }
    }

    // Get track by ID
    getTrack(id) {
        return this.tracks[id] || null;
    }

    // Set track volume
    setTrackVolume(trackId, value) {
        const track = this.getTrack(trackId);
        if (track) track.setVolume(value);
    }

    // Set track pan
    setTrackPan(trackId, value) {
        const track = this.getTrack(trackId);
        if (track) track.setPan(value);
    }

    // Mute track
    setTrackMute(trackId, muted) {
        const track = this.getTrack(trackId);
        if (track) track.setMute(muted);
    }

    // Solo track (mutes all other tracks)
    setTrackSolo(trackId, soloed) {
        const track = this.getTrack(trackId);
        if (!track) return;

        track.setSolo(soloed);

        // Handle solo logic
        const anySoloed = this.tracks.some(t => t.soloed);

        this.tracks.forEach(t => {
            if (anySoloed) {
                // If any track is soloed, mute all non-soloed tracks
                if (!t.soloed) {
                    t.output.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
                } else {
                    t.output.gain.setTargetAtTime(t.muted ? 0 : 1, this.ctx.currentTime, 0.01);
                }
            } else {
                // No tracks soloed, restore normal mute state
                t.output.gain.setTargetAtTime(t.muted ? 0 : 1, this.ctx.currentTime, 0.01);
            }
        });
    }

    // Set aux send level for a track
    setAuxSend(trackId, auxId, value) {
        const track = this.getTrack(trackId);
        if (!track) return;

        const auxRouting = track.busRoutings.aux.find(r => r.auxId === auxId);
        if (auxRouting) {
            const now = this.ctx.currentTime;
            auxRouting.gain.gain.setTargetAtTime(value, now, 0.01);
            auxRouting.enabled = value > 0;
        }
    }

    // Apply latency compensation (Plugin Delay Compensation)
    applyLatencyCompensation() {
        // Calculate maximum latency across all tracks
        let maxLatency = 0;
        this.tracks.forEach(track => {
            if (track.reportedLatency > maxLatency) {
                maxLatency = track.reportedLatency;
            }
        });

        // Apply delay compensation to all tracks
        this.tracks.forEach(track => {
            const compensationSamples = maxLatency - track.reportedLatency;
            const compensationSeconds = compensationSamples / this.ctx.sampleRate;
            track.delayCompensationNode.delayTime.value = Math.max(0, compensationSeconds);
        });
    }
}

// --- AUDIO GRAPH MANAGER ---
// Centralized manager for the entire audio graph
class AudioGraphManager {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.busSystem = null;
        this.trackManager = null;
        this.effectsLibrary = {};
    }

    // Initialize the entire audio system
    initialize(numAuxBuses = 4, numTracks = 16) {
        // Create bus system
        this.busSystem = new AudioBusSystem(this.ctx, numAuxBuses);

        // Create track manager
        this.trackManager = new TrackManager(this.ctx, this.busSystem, numTracks);

        // Initialize effects library
        this.initializeEffectsLibrary();
    }

    // Connect to existing audio destination
    connectToExistingInfrastructure(existingMasterGain) {
        // Connect the master bus output to the existing infrastructure
        this.busSystem.connectToDestination(existingMasterGain);
    }

    // Initialize built-in effects library
    initializeEffectsLibrary() {
        // Effect factory functions
        this.effectsLibrary = {
            // Simple gain effect
            'gain': (params = {}) => {
                const gain = this.ctx.createGain();
                gain.gain.value = params.amount || 1.0;
                return {
                    type: 'gain',
                    input: gain,
                    output: gain,
                    bypassed: false,
                    latency: 0,
                    params: params,
                    node: gain
                };
            },

            // Simple delay effect
            'delay': (params = {}) => {
                const input = this.ctx.createGain();
                const delay = this.ctx.createDelay(5.0);
                const feedback = this.ctx.createGain();
                const wet = this.ctx.createGain();
                const dry = this.ctx.createGain();
                const output = this.ctx.createGain();

                delay.delayTime.value = params.time || 0.5;
                feedback.gain.value = params.feedback || 0.3;
                wet.gain.value = params.mix || 0.5;
                dry.gain.value = 1.0 - (params.mix || 0.5);

                // Routing: input -> delay -> feedback (loop) -> wet
                //          input -> dry
                //          wet + dry -> output
                input.connect(delay);
                input.connect(dry);
                delay.connect(feedback);
                feedback.connect(delay);
                delay.connect(wet);
                wet.connect(output);
                dry.connect(output);

                return {
                    type: 'delay',
                    input: input,
                    output: output,
                    bypassed: false,
                    latency: Math.floor(delay.delayTime.value * this.ctx.sampleRate),
                    params: params,
                    nodes: { input, delay, feedback, wet, dry, output }
                };
            },

            // Simple reverb (using convolver with generated impulse)
            'reverb': (params = {}) => {
                const input = this.ctx.createGain();
                const convolver = this.ctx.createConvolver();
                const wet = this.ctx.createGain();
                const dry = this.ctx.createGain();
                const output = this.ctx.createGain();

                // Generate simple reverb impulse response
                const duration = params.duration || 2.0;
                const decay = params.decay || 2.0;
                const length = this.ctx.sampleRate * duration;
                const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
                const left = impulse.getChannelData(0);
                const right = impulse.getChannelData(1);

                for (let i = 0; i < length; i++) {
                    const n = i / length;
                    const envelope = Math.exp(-decay * n);
                    left[i] = (Math.random() * 2 - 1) * envelope;
                    right[i] = (Math.random() * 2 - 1) * envelope;
                }

                convolver.buffer = impulse;
                wet.gain.value = params.mix || 0.3;
                dry.gain.value = 1.0 - (params.mix || 0.3);

                // Routing
                input.connect(convolver);
                input.connect(dry);
                convolver.connect(wet);
                wet.connect(output);
                dry.connect(output);

                return {
                    type: 'reverb',
                    input: input,
                    output: output,
                    bypassed: false,
                    latency: 512, // Typical convolver latency
                    params: params,
                    nodes: { input, convolver, wet, dry, output }
                };
            },

            // Compressor effect
            'compressor': (params = {}) => {
                const compressor = this.ctx.createDynamicsCompressor();
                compressor.threshold.value = params.threshold || -24;
                compressor.knee.value = params.knee || 30;
                compressor.ratio.value = params.ratio || 12;
                compressor.attack.value = params.attack || 0.003;
                compressor.release.value = params.release || 0.25;

                return {
                    type: 'compressor',
                    input: compressor,
                    output: compressor,
                    bypassed: false,
                    latency: 128, // Typical compressor lookahead
                    params: params,
                    node: compressor
                };
            },

            // EQ effect (3-band)
            'eq3': (params = {}) => {
                const input = this.ctx.createGain();
                const low = this.ctx.createBiquadFilter();
                const mid = this.ctx.createBiquadFilter();
                const high = this.ctx.createBiquadFilter();
                const output = this.ctx.createGain();

                low.type = 'lowshelf';
                low.frequency.value = params.lowFreq || 250;
                low.gain.value = params.lowGain || 0;

                mid.type = 'peaking';
                mid.frequency.value = params.midFreq || 1000;
                mid.Q.value = params.midQ || 1.0;
                mid.gain.value = params.midGain || 0;

                high.type = 'highshelf';
                high.frequency.value = params.highFreq || 4000;
                high.gain.value = params.highGain || 0;

                input.connect(low);
                low.connect(mid);
                mid.connect(high);
                high.connect(output);

                return {
                    type: 'eq3',
                    input: input,
                    output: output,
                    bypassed: false,
                    latency: 0,
                    params: params,
                    nodes: { input, low, mid, high, output }
                };
            }
        };
    }

    // Create and add an effect to a track
    addEffectToTrack(trackId, effectType, params = {}) {
        const track = this.trackManager.getTrack(trackId);
        if (!track) return null;

        const effectFactory = this.effectsLibrary[effectType];
        if (!effectFactory) {
            console.warn(`Effect type "${effectType}" not found in library`);
            return null;
        }

        const effect = effectFactory(params);
        track.addEffect(effect);
        this.trackManager.applyLatencyCompensation();

        return effect;
    }

    // Create and add an effect to an aux bus
    addEffectToAuxBus(auxId, effectType, params = {}) {
        const effectFactory = this.effectsLibrary[effectType];
        if (!effectFactory) {
            console.warn(`Effect type "${effectType}" not found in library`);
            return null;
        }

        const effect = effectFactory(params);
        this.busSystem.addEffectToAuxBus(auxId, effect);

        return effect;
    }

    // Get audio graph info for debugging
    getGraphInfo() {
        return {
            tracks: this.trackManager.tracks.map(t => ({
                id: t.id,
                name: t.name,
                muted: t.muted,
                soloed: t.soloed,
                volume: t.fader.gain.value,
                pan: t.panner ? t.panner.pan.value : 0,
                effects: t.effectsChain.length,
                latency: t.reportedLatency
            })),
            buses: {
                master: {
                    volume: this.busSystem.masterBus.fader.gain.value
                },
                aux: this.busSystem.auxBuses.map(b => ({
                    id: b.id,
                    name: b.name,
                    volume: b.fader.gain.value,
                    return: b.returnToMaster.gain.value
                }))
            }
        };
    }
}

// --- INITIALIZATION FUNCTION ---
function initDAWAudioInfrastructure() {
    if (!audioContext) {
        console.warn("AudioContext not initialized yet. DAW infrastructure initialization skipped.");
        return;
    }

    console.log("Initializing DAW Audio Infrastructure...");

    // Create the audio graph manager
    audioGraphManager = new AudioGraphManager(audioContext);

    // Initialize with 4 aux buses and 16 tracks
    audioGraphManager.initialize(4, 16);

    // Connect to existing audio infrastructure (masterGain)
    // The new system will feed into the existing masterGain -> masterLimiter -> analyser -> destination
    audioGraphManager.connectToExistingInfrastructure(masterGain);

    // Store references for easy access
    audioBusSystem = audioGraphManager.busSystem;
    trackManager = audioGraphManager.trackManager;

    console.log("DAW Audio Infrastructure initialized successfully!");
    console.log("- 16 tracks created");
    console.log("- Master bus + 4 aux buses created");
    console.log("- Signal routing matrix operational");
    console.log("- Effects chain system ready");
    console.log("- Latency compensation enabled");

    // Create UI for the new infrastructure
    createDAWInfrastructureUI();
}

// --- UI CREATION ---
function createDAWInfrastructureUI() {
    // Find the controls container
    const controlsContainer = document.querySelector('.controls');
    if (!controlsContainer) return;

    // Create DAW controls section
    const dawControlsHTML = `
        <div class="control-group" id="daw-infrastructure-group">
            <div class="control-title">DAW Audio Infrastructure</div>

            <div style="margin-bottom: 10px; font-size: 0.9em; color: var(--text-muted-color);">
                Professional audio routing system with 16 tracks, master + 4 aux buses
            </div>

            <!-- Track Selection -->
            <label> Active Track
                <select id="daw-track-select">
                    ${Array.from({length: 16}, (_, i) => `<option value="${i}">Track ${i + 1}</option>`).join('')}
                </select>
            </label>

            <!-- Track Controls -->
            <div id="daw-track-controls">
                <label>Track Volume <input type="range" id="daw-track-volume" min="0" max="1" step="0.01" value="0.75" class="horizontal-slider" /></label>
                <label>Track Pan <input type="range" id="daw-track-pan" min="-1" max="1" step="0.01" value="0" class="horizontal-slider" /></label>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <label style="flex: 1;"><input type="checkbox" id="daw-track-mute" /> Mute</label>
                    <label style="flex: 1;"><input type="checkbox" id="daw-track-solo" /> Solo</label>
                </div>
            </div>

            <hr style="border-color: var(--border-color); margin: 15px 0;" />

            <!-- Aux Sends -->
            <div class="control-title">Aux Sends (Effects Buses)</div>
            <label>Aux 1 Send <input type="range" id="daw-aux1-send" min="0" max="1" step="0.01" value="0" class="horizontal-slider" /></label>
            <label>Aux 2 Send <input type="range" id="daw-aux2-send" min="0" max="1" step="0.01" value="0" class="horizontal-slider" /></label>
            <label>Aux 3 Send <input type="range" id="daw-aux3-send" min="0" max="1" step="0.01" value="0" class="horizontal-slider" /></label>
            <label>Aux 4 Send <input type="range" id="daw-aux4-send" min="0" max="1" step="0.01" value="0" class="horizontal-slider" /></label>

            <hr style="border-color: var(--border-color); margin: 15px 0;" />

            <!-- Effects Chain -->
            <div class="control-title">Track Effects Chain</div>
            <label> Add Effect
                <select id="daw-effect-type">
                    <option value="">-- Select Effect --</option>
                    <option value="compressor">Compressor</option>
                    <option value="eq3">3-Band EQ</option>
                    <option value="delay">Delay</option>
                    <option value="reverb">Reverb</option>
                    <option value="gain">Gain</option>
                </select>
            </label>
            <button id="daw-add-effect" class="std-button">Add Effect to Track</button>
            <div id="daw-effects-list" style="margin-top: 10px; font-size: 0.85em; color: var(--text-muted-color);">
                No effects on this track
            </div>

            <hr style="border-color: var(--border-color); margin: 15px 0;" />

            <!-- Bus Controls -->
            <div class="control-title">Bus Returns</div>
            <label>Aux 1 Return <input type="range" id="daw-aux1-return" min="0" max="1" step="0.01" value="1" class="horizontal-slider" /></label>
            <label>Aux 2 Return <input type="range" id="daw-aux2-return" min="0" max="1" step="0.01" value="1" class="horizontal-slider" /></label>

            <hr style="border-color: var(--border-color); margin: 15px 0;" />

            <!-- Info Display -->
            <button id="daw-show-graph-info" class="std-button">Show Audio Graph Info</button>
            <div id="daw-graph-info" style="margin-top: 10px; font-size: 0.75em; color: var(--text-muted-color); display: none;">
                Graph info will appear here
            </div>
        </div>
    `;

    // Insert the DAW controls before the Master & Settings group
    const masterGroup = document.querySelector('.controls .control-group:has(#masterVolume)');
    if (masterGroup) {
        masterGroup.insertAdjacentHTML('beforebegin', dawControlsHTML);
    } else {
        controlsContainer.insertAdjacentHTML('beforeend', dawControlsHTML);
    }

    // Setup event listeners for DAW controls
    setupDAWControlEvents();
}

// --- DAW CONTROL EVENT HANDLERS ---
function setupDAWControlEvents() {
    if (!audioGraphManager) return;

    const trackSelect = document.getElementById('daw-track-select');
    const trackVolume = document.getElementById('daw-track-volume');
    const trackPan = document.getElementById('daw-track-pan');
    const trackMute = document.getElementById('daw-track-mute');
    const trackSolo = document.getElementById('daw-track-solo');

    const aux1Send = document.getElementById('daw-aux1-send');
    const aux2Send = document.getElementById('daw-aux2-send');
    const aux3Send = document.getElementById('daw-aux3-send');
    const aux4Send = document.getElementById('daw-aux4-send');

    const aux1Return = document.getElementById('daw-aux1-return');
    const aux2Return = document.getElementById('daw-aux2-return');

    const effectType = document.getElementById('daw-effect-type');
    const addEffectBtn = document.getElementById('daw-add-effect');
    const effectsList = document.getElementById('daw-effects-list');

    const showGraphInfoBtn = document.getElementById('daw-show-graph-info');
    const graphInfoDiv = document.getElementById('daw-graph-info');

    let currentTrackId = 0;

    // Update UI when track is selected
    function updateTrackUI() {
        const track = trackManager.getTrack(currentTrackId);
        if (!track) return;

        trackVolume.value = track.fader.gain.value;
        trackPan.value = track.panner ? track.panner.pan.value : 0;
        trackMute.checked = track.muted;
        trackSolo.checked = track.soloed;

        // Update aux sends
        if (track.busRoutings.aux[0]) aux1Send.value = track.busRoutings.aux[0].gain.gain.value;
        if (track.busRoutings.aux[1]) aux2Send.value = track.busRoutings.aux[1].gain.gain.value;
        if (track.busRoutings.aux[2]) aux3Send.value = track.busRoutings.aux[2].gain.gain.value;
        if (track.busRoutings.aux[3]) aux4Send.value = track.busRoutings.aux[3].gain.gain.value;

        // Update effects list
        updateEffectsList();
    }

    function updateEffectsList() {
        const track = trackManager.getTrack(currentTrackId);
        if (!track || track.effectsChain.length === 0) {
            effectsList.innerHTML = 'No effects on this track';
            return;
        }

        effectsList.innerHTML = track.effectsChain.map((fx, i) =>
            `${i + 1}. ${fx.type}${fx.bypassed ? ' (bypassed)' : ''} - ${fx.latency} samples latency`
        ).join('<br>');
    }

    // Track selection
    if (trackSelect) {
        trackSelect.addEventListener('change', (e) => {
            currentTrackId = parseInt(e.target.value);
            updateTrackUI();
        });
    }

    // Track controls
    if (trackVolume) {
        trackVolume.addEventListener('input', (e) => {
            trackManager.setTrackVolume(currentTrackId, parseFloat(e.target.value));
        });
    }

    if (trackPan) {
        trackPan.addEventListener('input', (e) => {
            trackManager.setTrackPan(currentTrackId, parseFloat(e.target.value));
        });
    }

    if (trackMute) {
        trackMute.addEventListener('change', (e) => {
            trackManager.setTrackMute(currentTrackId, e.target.checked);
        });
    }

    if (trackSolo) {
        trackSolo.addEventListener('change', (e) => {
            trackManager.setTrackSolo(currentTrackId, e.target.checked);
        });
    }

    // Aux sends
    if (aux1Send) {
        aux1Send.addEventListener('input', (e) => {
            trackManager.setAuxSend(currentTrackId, 0, parseFloat(e.target.value));
        });
    }

    if (aux2Send) {
        aux2Send.addEventListener('input', (e) => {
            trackManager.setAuxSend(currentTrackId, 1, parseFloat(e.target.value));
        });
    }

    if (aux3Send) {
        aux3Send.addEventListener('input', (e) => {
            trackManager.setAuxSend(currentTrackId, 2, parseFloat(e.target.value));
        });
    }

    if (aux4Send) {
        aux4Send.addEventListener('input', (e) => {
            trackManager.setAuxSend(currentTrackId, 3, parseFloat(e.target.value));
        });
    }

    // Aux returns
    if (aux1Return) {
        aux1Return.addEventListener('input', (e) => {
            audioBusSystem.setAuxReturnLevel(0, parseFloat(e.target.value));
        });
    }

    if (aux2Return) {
        aux2Return.addEventListener('input', (e) => {
            audioBusSystem.setAuxReturnLevel(1, parseFloat(e.target.value));
        });
    }

    // Add effect
    if (addEffectBtn) {
        addEffectBtn.addEventListener('click', () => {
            const type = effectType.value;
            if (!type) {
                alert('Please select an effect type');
                return;
            }

            // Default parameters for each effect type
            const defaultParams = {
                'compressor': { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
                'eq3': { lowGain: 0, midGain: 0, highGain: 0 },
                'delay': { time: 0.375, feedback: 0.3, mix: 0.3 },
                'reverb': { duration: 2.0, decay: 2.0, mix: 0.2 },
                'gain': { amount: 1.0 }
            };

            audioGraphManager.addEffectToTrack(currentTrackId, type, defaultParams[type] || {});
            updateEffectsList();
            effectType.value = '';
        });
    }

    // Show graph info
    if (showGraphInfoBtn) {
        showGraphInfoBtn.addEventListener('click', () => {
            const info = audioGraphManager.getGraphInfo();
            graphInfoDiv.style.display = graphInfoDiv.style.display === 'none' ? 'block' : 'none';
            graphInfoDiv.innerHTML = `<pre>${JSON.stringify(info, null, 2)}</pre>`;
        });
    }

    // Initialize UI
    updateTrackUI();
}

// ============================================================================
// END OF DAW AUDIO INFRASTRUCTURE
// ============================================================================
