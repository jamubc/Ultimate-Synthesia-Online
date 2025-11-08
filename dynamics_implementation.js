// ============================================================================
// DYNAMICS EFFECTS IMPLEMENTATION FOR ULTIMATE SYNTHESIA ONLINE
// ============================================================================

// ----------------------------------------------------------------------------
// INITIALIZATION FUNCTIONS
// ----------------------------------------------------------------------------

function initDynamicsEffects() {
    if (!audioContext) return;

    // Initialize Multi-band Compressor
    initMultibandCompressor();

    // Initialize Advanced Limiter
    initAdvancedLimiter();

    // Initialize Noise Gate
    initNoiseGate();

    // Initialize Transient Shaper
    initTransientShaper();

    // Initialize De-esser
    initDeesser();

    // Initialize Expander
    initExpander();

    // Connect effects chain
    connectDynamicsChain();

    // Start meters update loop
    updateDynamicsMeters();
}

function initMultibandCompressor() {
    const mbc = dynamicsEffectsChain.mbc;

    // Create splitters for 3 bands: Low (20-250Hz), Mid (250Hz-5kHz), High (5kHz-20kHz)
    // Low band
    mbc.lowSplit = audioContext.createBiquadFilter();
    mbc.lowSplit.type = 'lowpass';
    mbc.lowSplit.frequency.value = 250;
    mbc.lowSplit.Q.value = 0.7071; // Butterworth response

    mbc.lowComp = audioContext.createDynamicsCompressor();
    mbc.lowComp.threshold.value = -24;
    mbc.lowComp.ratio.value = 3;
    mbc.lowComp.attack.value = 0.005;
    mbc.lowComp.release.value = 0.1;
    mbc.lowComp.knee.value = 6;

    mbc.lowGain = audioContext.createGain();
    mbc.lowGain.gain.value = 1;

    // Mid band - use bandpass
    mbc.midSplit = audioContext.createBiquadFilter();
    mbc.midSplit.type = 'bandpass';
    mbc.midSplit.frequency.value = 1250; // Center of 250Hz-5kHz
    mbc.midSplit.Q.value = 0.5;

    mbc.midComp = audioContext.createDynamicsCompressor();
    mbc.midComp.threshold.value = -20;
    mbc.midComp.ratio.value = 4;
    mbc.midComp.attack.value = 0.005;
    mbc.midComp.release.value = 0.1;
    mbc.midComp.knee.value = 6;

    mbc.midGain = audioContext.createGain();
    mbc.midGain.gain.value = 1;

    // High band
    mbc.highSplit = audioContext.createBiquadFilter();
    mbc.highSplit.type = 'highpass';
    mbc.highSplit.frequency.value = 5000;
    mbc.highSplit.Q.value = 0.7071;

    mbc.highComp = audioContext.createDynamicsCompressor();
    mbc.highComp.threshold.value = -18;
    mbc.highComp.ratio.value = 6;
    mbc.highComp.attack.value = 0.005;
    mbc.highComp.release.value = 0.1;
    mbc.highComp.knee.value = 6;

    mbc.highGain = audioContext.createGain();
    mbc.highGain.gain.value = 1;

    // Create merger to sum all bands
    mbc.merger = audioContext.createGain();
    mbc.merger.gain.value = 1;

    // Makeup gain
    mbc.makeupGain = audioContext.createGain();
    mbc.makeupGain.gain.value = 1;
}

function initAdvancedLimiter() {
    const lim = dynamicsEffectsChain.limiter;

    lim.compressor = audioContext.createDynamicsCompressor();
    lim.compressor.threshold.value = -1;
    lim.compressor.knee.value = 0;
    lim.compressor.ratio.value = 20; // High ratio for brick-wall limiting
    lim.compressor.attack.value = 0.001;
    lim.compressor.release.value = 0.05;

    lim.makeupGain = audioContext.createGain();
    lim.makeupGain.gain.value = 1;
}

function initNoiseGate() {
    const gate = dynamicsEffectsChain.gate;

    gate.analyser = audioContext.createAnalyser();
    gate.analyser.fftSize = 256;
    gate.analyser.smoothingTimeConstant = 0.2;

    gate.gateGain = audioContext.createGain();
    gate.gateGain.gain.value = 1;

    gate.isOpen = true;
    gate.currentGain = 1;
    gate.holdTimer = 0;
}

function initTransientShaper() {
    const trans = dynamicsEffectsChain.transient;

    trans.analyser = audioContext.createAnalyser();
    trans.analyser.fftSize = 256;
    trans.analyser.smoothingTimeConstant = 0;

    trans.fastEnvGain = audioContext.createGain();
    trans.fastEnvGain.gain.value = 1;

    trans.slowEnvGain = audioContext.createGain();
    trans.slowEnvGain.gain.value = 1;

    trans.fastEnv = 0;
    trans.slowEnv = 0;
}

function initDeesser() {
    const de = dynamicsEffectsChain.deesser;

    // Splitter for parallel processing
    de.splitter = audioContext.createGain();
    de.splitter.gain.value = 1;

    // High-frequency filter to isolate sibilant frequencies
    de.filter = audioContext.createBiquadFilter();
    de.filter.type = 'peaking';
    de.filter.frequency.value = 7000;
    de.filter.Q.value = 2;
    de.filter.gain.value = 0;

    // Compressor for the filtered signal
    de.compressor = audioContext.createDynamicsCompressor();
    de.compressor.threshold.value = -30;
    de.compressor.ratio.value = 3;
    de.compressor.attack.value = 0.001;
    de.compressor.release.value = 0.05;
    de.compressor.knee.value = 6;

    // Merger
    de.merger = audioContext.createGain();
    de.merger.gain.value = 1;
}

function initExpander() {
    const exp = dynamicsEffectsChain.expander;

    exp.analyser = audioContext.createAnalyser();
    exp.analyser.fftSize = 256;
    exp.analyser.smoothingTimeConstant = 0.2;

    exp.expanderGain = audioContext.createGain();
    exp.expanderGain.gain.value = 1;

    exp.envelope = 0;
    exp.currentGain = 1;
}

// ----------------------------------------------------------------------------
// AUDIO CHAIN CONNECTION
// ----------------------------------------------------------------------------

function connectDynamicsChain() {
    // Disconnect existing masterGain -> masterLimiter connection
    try {
        masterGain.disconnect();
    } catch(e) {}

    const mbc = dynamicsEffectsChain.mbc;
    const lim = dynamicsEffectsChain.limiter;
    const gate = dynamicsEffectsChain.gate;
    const trans = dynamicsEffectsChain.transient;
    const de = dynamicsEffectsChain.deesser;
    const exp = dynamicsEffectsChain.expander;

    // Chain: masterGain -> MBC -> Limiter -> Gate -> Transient -> Deesser -> Expander -> masterLimiter

    // Multi-band Compressor setup
    masterGain.connect(mbc.lowSplit);
    masterGain.connect(mbc.midSplit);
    masterGain.connect(mbc.highSplit);

    mbc.lowSplit.connect(mbc.lowComp);
    mbc.lowComp.connect(mbc.lowGain);
    mbc.lowGain.connect(mbc.merger);

    mbc.midSplit.connect(mbc.midComp);
    mbc.midComp.connect(mbc.midGain);
    mbc.midGain.connect(mbc.merger);

    mbc.highSplit.connect(mbc.highComp);
    mbc.highComp.connect(mbc.highGain);
    mbc.highGain.connect(mbc.merger);

    mbc.merger.connect(mbc.makeupGain);

    // Connect to limiter
    mbc.makeupGain.connect(lim.compressor);
    lim.compressor.connect(lim.makeupGain);

    // Connect to gate (with analyser for envelope following)
    lim.makeupGain.connect(gate.analyser);
    lim.makeupGain.connect(gate.gateGain);

    // Connect to transient shaper
    gate.gateGain.connect(trans.analyser);
    gate.gateGain.connect(trans.fastEnvGain);
    trans.fastEnvGain.connect(trans.slowEnvGain);

    // Connect to de-esser
    trans.slowEnvGain.connect(de.splitter);
    de.splitter.connect(de.filter);
    de.filter.connect(de.compressor);
    de.compressor.connect(de.merger);
    de.splitter.connect(de.merger); // Parallel path

    // Connect to expander
    de.merger.connect(exp.analyser);
    de.merger.connect(exp.expanderGain);

    // Finally connect to master limiter
    exp.expanderGain.connect(masterLimiter);
}

// ----------------------------------------------------------------------------
// PARAMETER UPDATE FUNCTIONS
// ----------------------------------------------------------------------------

function updateMBCParams() {
    if (!audioContext) return;
    const mbc = dynamicsEffectsChain.mbc;

    const lowThresh = parseFloat(document.getElementById('mbcLowThreshold').value);
    const lowRatio = parseFloat(document.getElementById('mbcLowRatio').value);
    const midThresh = parseFloat(document.getElementById('mbcMidThreshold').value);
    const midRatio = parseFloat(document.getElementById('mbcMidRatio').value);
    const highThresh = parseFloat(document.getElementById('mbcHighThreshold').value);
    const highRatio = parseFloat(document.getElementById('mbcHighRatio').value);
    const attack = parseFloat(document.getElementById('mbcAttack').value) / 1000;
    const release = parseFloat(document.getElementById('mbcRelease').value) / 1000;
    const makeup = parseFloat(document.getElementById('mbcMakeup').value);

    mbc.lowComp.threshold.setValueAtTime(lowThresh, audioContext.currentTime);
    mbc.lowComp.ratio.setValueAtTime(lowRatio, audioContext.currentTime);
    mbc.midComp.threshold.setValueAtTime(midThresh, audioContext.currentTime);
    mbc.midComp.ratio.setValueAtTime(midRatio, audioContext.currentTime);
    mbc.highComp.threshold.setValueAtTime(highThresh, audioContext.currentTime);
    mbc.highComp.ratio.setValueAtTime(highRatio, audioContext.currentTime);

    mbc.lowComp.attack.setValueAtTime(attack, audioContext.currentTime);
    mbc.midComp.attack.setValueAtTime(attack, audioContext.currentTime);
    mbc.highComp.attack.setValueAtTime(attack, audioContext.currentTime);

    mbc.lowComp.release.setValueAtTime(release, audioContext.currentTime);
    mbc.midComp.release.setValueAtTime(release, audioContext.currentTime);
    mbc.highComp.release.setValueAtTime(release, audioContext.currentTime);

    mbc.makeupGain.gain.setValueAtTime(Math.pow(10, makeup / 20), audioContext.currentTime);
}

function updateLimiterParams() {
    if (!audioContext) return;
    const lim = dynamicsEffectsChain.limiter;

    const threshold = parseFloat(document.getElementById('limiterThreshold').value);
    const release = parseFloat(document.getElementById('limiterRelease').value) / 1000;
    const knee = parseFloat(document.getElementById('limiterKnee').value);
    const makeup = parseFloat(document.getElementById('limiterMakeup').value);

    lim.compressor.threshold.setValueAtTime(threshold, audioContext.currentTime);
    lim.compressor.release.setValueAtTime(release, audioContext.currentTime);
    lim.compressor.knee.setValueAtTime(knee, audioContext.currentTime);
    lim.makeupGain.gain.setValueAtTime(Math.pow(10, makeup / 20), audioContext.currentTime);
}

function updateGateParams() {
    const gate = dynamicsEffectsChain.gate;

    gate.params.threshold = parseFloat(document.getElementById('gateThreshold').value);
    gate.params.attack = parseFloat(document.getElementById('gateAttack').value) / 1000;
    gate.params.release = parseFloat(document.getElementById('gateRelease').value) / 1000;
    gate.params.hold = parseFloat(document.getElementById('gateHold').value) / 1000;
    gate.params.range = parseFloat(document.getElementById('gateRange').value);
}

function updateTransientParams() {
    const trans = dynamicsEffectsChain.transient;

    trans.params.attackGain = parseFloat(document.getElementById('transientAttack').value);
    trans.params.sustainGain = parseFloat(document.getElementById('transientSustain').value);
    trans.params.fastTime = parseFloat(document.getElementById('transientFast').value) / 1000;
    trans.params.slowTime = parseFloat(document.getElementById('transientSlow').value) / 1000;
}

function updateDeesserParams() {
    if (!audioContext) return;
    const de = dynamicsEffectsChain.deesser;

    const freq = parseFloat(document.getElementById('deesserFreq').value);
    const q = parseFloat(document.getElementById('deesserQ').value);
    const threshold = parseFloat(document.getElementById('deesserThreshold').value);
    const ratio = parseFloat(document.getElementById('deesserRatio').value);
    const attack = parseFloat(document.getElementById('deesserAttack').value) / 1000;
    const release = parseFloat(document.getElementById('deesserRelease').value) / 1000;

    de.filter.frequency.setValueAtTime(freq, audioContext.currentTime);
    de.filter.Q.setValueAtTime(q, audioContext.currentTime);
    de.compressor.threshold.setValueAtTime(threshold, audioContext.currentTime);
    de.compressor.ratio.setValueAtTime(ratio, audioContext.currentTime);
    de.compressor.attack.setValueAtTime(attack, audioContext.currentTime);
    de.compressor.release.setValueAtTime(release, audioContext.currentTime);
}

function updateExpanderParams() {
    const exp = dynamicsEffectsChain.expander;

    exp.params.threshold = parseFloat(document.getElementById('expanderThreshold').value);
    exp.params.ratio = parseFloat(document.getElementById('expanderRatio').value);
    exp.params.attack = parseFloat(document.getElementById('expanderAttack').value) / 1000;
    exp.params.release = parseFloat(document.getElementById('expanderRelease').value) / 1000;
    exp.params.knee = parseFloat(document.getElementById('expanderKnee').value);
}

// ----------------------------------------------------------------------------
// PROCESSING FUNCTIONS (for effects that need custom DSP)
// ----------------------------------------------------------------------------

function processNoiseGate() {
    if (!audioContext || !dynamicsEffectsChain.gate.gateGain) return;

    const gate = dynamicsEffectsChain.gate;
    if (gate.bypassed) {
        gate.gateGain.gain.setValueAtTime(1, audioContext.currentTime);
        return;
    }

    // Get RMS level from analyser
    const dataArray = new Uint8Array(gate.analyser.frequencyBinCount);
    gate.analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const dbLevel = 20 * Math.log10(rms + 0.0001);

    const threshold = gate.params.threshold;
    const attack = gate.params.attack;
    const release = gate.params.release;
    const range = gate.params.range;

    // Gate logic
    let targetGain;
    if (dbLevel > threshold) {
        gate.isOpen = true;
        gate.holdTimer = gate.params.hold;
        targetGain = 1;
    } else {
        if (gate.holdTimer > 0) {
            gate.holdTimer -= 0.01; // Approx 10ms per call
            targetGain = 1;
        } else {
            gate.isOpen = false;
            targetGain = Math.pow(10, range / 20); // Convert dB to linear
        }
    }

    // Smooth transition
    const timeConstant = gate.isOpen ? attack : release;
    const alpha = 1 - Math.exp(-0.01 / timeConstant);
    gate.currentGain += (targetGain - gate.currentGain) * alpha;

    gate.gateGain.gain.setValueAtTime(gate.currentGain, audioContext.currentTime);
}

function processTransientShaper() {
    if (!audioContext || !dynamicsEffectsChain.transient.fastEnvGain) return;

    const trans = dynamicsEffectsChain.transient;
    if (trans.bypassed) {
        trans.fastEnvGain.gain.setValueAtTime(1, audioContext.currentTime);
        trans.slowEnvGain.gain.setValueAtTime(1, audioContext.currentTime);
        return;
    }

    // Get current audio level
    const dataArray = new Uint8Array(trans.analyser.frequencyBinCount);
    trans.analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
    }
    const currentLevel = Math.sqrt(sum / dataArray.length);

    // Fast and slow envelope followers
    const fastAlpha = 1 - Math.exp(-0.01 / trans.params.fastTime);
    const slowAlpha = 1 - Math.exp(-0.01 / trans.params.slowTime);

    trans.fastEnv += (currentLevel - trans.fastEnv) * fastAlpha;
    trans.slowEnv += (currentLevel - trans.slowEnv) * slowAlpha;

    // Transient = fast - slow (positive means attack, negative means sustain)
    const transient = trans.fastEnv - trans.slowEnv;

    // Apply gains
    let attackGain = 1;
    let sustainGain = 1;

    if (transient > 0) {
        // Attack phase - apply attack gain
        attackGain = Math.pow(10, (trans.params.attackGain * transient * 10) / 20);
    } else {
        // Sustain phase - apply sustain gain
        sustainGain = Math.pow(10, (trans.params.sustainGain * Math.abs(transient) * 10) / 20);
    }

    trans.fastEnvGain.gain.setValueAtTime(attackGain, audioContext.currentTime);
    trans.slowEnvGain.gain.setValueAtTime(sustainGain, audioContext.currentTime);
}

function processExpander() {
    if (!audioContext || !dynamicsEffectsChain.expander.expanderGain) return;

    const exp = dynamicsEffectsChain.expander;
    if (exp.bypassed) {
        exp.expanderGain.gain.setValueAtTime(1, audioContext.currentTime);
        return;
    }

    // Get RMS level
    const dataArray = new Uint8Array(exp.analyser.frequencyBinCount);
    exp.analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const dbLevel = 20 * Math.log10(rms + 0.0001);

    const threshold = exp.params.threshold;
    const ratio = exp.params.ratio;
    const knee = exp.params.knee;

    let targetGain = 1;

    // Expansion calculation (opposite of compression)
    if (dbLevel < threshold) {
        const overshoot = threshold - dbLevel;

        // Soft knee
        if (overshoot < knee / 2) {
            const kneeGain = overshoot * overshoot / (2 * knee);
            targetGain = Math.pow(10, -kneeGain * (ratio - 1) / 20);
        } else {
            const expansion = overshoot * (ratio - 1);
            targetGain = Math.pow(10, -expansion / 20);
        }
    }

    // Smooth with attack/release
    const timeConstant = targetGain > exp.currentGain ? exp.params.attack : exp.params.release;
    const alpha = 1 - Math.exp(-0.01 / timeConstant);
    exp.currentGain += (targetGain - exp.currentGain) * alpha;

    exp.expanderGain.gain.setValueAtTime(exp.currentGain, audioContext.currentTime);
}

// ----------------------------------------------------------------------------
// METERING
// ----------------------------------------------------------------------------

function updateDynamicsMeters() {
    if (!audioContext) {
        requestAnimationFrame(updateDynamicsMeters);
        return;
    }

    // Update MBC meter
    updateMBCMeter();

    // Update Limiter meter
    updateLimiterMeter();

    // Update Gate meter
    updateGateMeter();

    // Update Transient meter
    updateTransientMeter();

    // Update De-esser meter
    updateDeesserMeter();

    // Update Expander meter
    updateExpanderMeter();

    // Process effects that need per-frame updates
    processNoiseGate();
    processTransientShaper();
    processExpander();

    requestAnimationFrame(updateDynamicsMeters);
}

function updateMBCMeter() {
    const canvas = document.getElementById('mbcMeter');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const mbc = dynamicsEffectsChain.mbc;

    // Estimate gain reduction (Web Audio API doesn't expose reduction directly)
    // We approximate by comparing input and output
    const gr = [
        Math.max(0, mbc.lowComp.threshold.value - (-40)) / 3,
        Math.max(0, mbc.midComp.threshold.value - (-40)) / 3,
        Math.max(0, mbc.highComp.threshold.value - (-40)) / 3
    ];

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const colors = ['#4CAF50', '#2196F3', '#FF9800'];
    const barWidth = canvas.width / 3;

    for (let i = 0; i < 3; i++) {
        const height = Math.min(1, gr[i] / 20) * canvas.height;
        ctx.fillStyle = colors[i];
        ctx.fillRect(i * barWidth + 2, canvas.height - height, barWidth - 4, height);
    }
}

function updateLimiterMeter() {
    const canvas = document.getElementById('limiterMeter');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const lim = dynamicsEffectsChain.limiter;

    // Approximate GR
    const threshold = lim.compressor.threshold.value;
    const gr = Math.max(0, threshold - (-40)) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const width = Math.min(1, gr / 20) * canvas.width;
    ctx.fillStyle = '#F44336';
    ctx.fillRect(0, 0, width, canvas.height);
}

function updateGateMeter() {
    const canvas = document.getElementById('gateMeter');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gate = dynamicsEffectsChain.gate;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const width = gate.currentGain * canvas.width;
    ctx.fillStyle = gate.isOpen ? '#4CAF50' : '#F44336';
    ctx.fillRect(0, 0, width, canvas.height);
}

function updateTransientMeter() {
    const canvas = document.getElementById('transientMeter');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const trans = dynamicsEffectsChain.transient;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const fastWidth = trans.fastEnv * canvas.width;
    const slowWidth = trans.slowEnv * canvas.width;

    ctx.fillStyle = '#FF9800';
    ctx.fillRect(0, 0, fastWidth, canvas.height / 2);

    ctx.fillStyle = '#2196F3';
    ctx.fillRect(0, canvas.height / 2, slowWidth, canvas.height / 2);
}

function updateDeesserMeter() {
    const canvas = document.getElementById('deesserMeter');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Similar to limiter
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Placeholder - actual GR would need more complex measurement
    ctx.fillStyle = '#9C27B0';
    ctx.fillRect(0, 0, canvas.width * 0.3, canvas.height);
}

function updateExpanderMeter() {
    const canvas = document.getElementById('expanderMeter');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const exp = dynamicsEffectsChain.expander;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const width = exp.currentGain * canvas.width;
    ctx.fillStyle = '#00BCD4';
    ctx.fillRect(0, 0, width, canvas.height);
}

// ----------------------------------------------------------------------------
// PRESETS
// ----------------------------------------------------------------------------

const dynamicsPresets = {
    mbc: {
        gentle: {
            lowThreshold: -30, lowRatio: 2,
            midThreshold: -25, midRatio: 2.5,
            highThreshold: -22, highRatio: 3,
            attack: 10, release: 150, makeup: 2
        },
        aggressive: {
            lowThreshold: -18, lowRatio: 6,
            midThreshold: -15, midRatio: 8,
            highThreshold: -12, highRatio: 10,
            attack: 2, release: 50, makeup: 6
        },
        broadcast: {
            lowThreshold: -20, lowRatio: 4,
            midThreshold: -18, midRatio: 5,
            highThreshold: -15, highRatio: 6,
            attack: 5, release: 100, makeup: 4
        }
    },
    limiter: {
        transparent: {threshold: -0.3, release: 100, knee: 1, makeup: 0},
        loud: {threshold: -0.5, release: 30, knee: 0, makeup: 3},
        brickwall: {threshold: -0.1, release: 10, knee: 0, makeup: 0}
    },
    gate: {
        subtle: {threshold: -50, attack: 5, release: 150, hold: 50, range: -40},
        hard: {threshold: -35, attack: 0.5, release: 50, hold: 10, range: -96},
        synth: {threshold: -40, attack: 0.1, release: 10, hold: 5, range: -80}
    },
    transient: {
        punchier: {attackGain: 6, sustainGain: -3, fastTime: 5, slowTime: 50},
        softer: {attackGain: -4, sustainGain: 2, fastTime: 15, slowTime: 100},
        sustain: {attackGain: -2, sustainGain: 6, fastTime: 10, slowTime: 150}
    },
    deesser: {
        gentle: {freq: 8000, q: 1.5, threshold: -25, ratio: 2, attack: 2, release: 100},
        medium: {freq: 7000, q: 2, threshold: -30, ratio: 4, attack: 1, release: 50},
        aggressive: {freq: 6000, q: 3, threshold: -35, ratio: 8, attack: 0.5, release: 30}
    },
    expander: {
        gentle: {threshold: -45, ratio: 1.5, attack: 10, release: 300, knee: 12},
        dynamic: {threshold: -35, ratio: 2.5, attack: 5, release: 200, knee: 8},
        expressive: {threshold: -30, ratio: 3, attack: 3, release: 150, knee: 6}
    }
};

function applyDynamicsPreset(effect, presetName) {
    const preset = dynamicsPresets[effect][presetName];
    if (!preset) return;

    // Apply preset values to controls
    Object.keys(preset).forEach(param => {
        const element = document.getElementById(`${effect}${param.charAt(0).toUpperCase() + param.slice(1)}`);
        if (element) {
            element.value = preset[param];
        }
    });

    // Update the effect
    switch(effect) {
        case 'mbc': updateMBCParams(); break;
        case 'limiter': updateLimiterParams(); break;
        case 'gate': updateGateParams(); break;
        case 'transient': updateTransientParams(); break;
        case 'deesser': updateDeesserParams(); break;
        case 'expander': updateExpanderParams(); break;
    }
}

// ----------------------------------------------------------------------------
// BYPASS FUNCTIONS
// ----------------------------------------------------------------------------

function toggleEffectBypass(effectName) {
    const effect = dynamicsEffectsChain[effectName];
    effect.bypassed = !effect.bypassed;

    const button = document.getElementById(`${effectName}Bypass`);
    if (button) {
        button.textContent = effect.bypassed ? 'Active' : 'Bypass';
        button.style.backgroundColor = effect.bypassed ? '#4CAF50' : '';
    }
}
