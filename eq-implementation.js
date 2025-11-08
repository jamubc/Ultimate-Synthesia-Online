// ========== EQ & ADVANCED FILTERING SYSTEM ==========

// Initialize EQ System
function initEQSystem() {
    if (!audioContext) return;

    // Create input/output nodes for before/after analysis
    eqInputGain = audioContext.createGain();
    eqOutputGain = audioContext.createGain();
    eqInputAnalyser = audioContext.createAnalyser();
    eqOutputAnalyser = audioContext.createAnalyser();
    eqInputAnalyser.fftSize = 2048;
    eqOutputAnalyser.fftSize = 2048;

    // Initialize Parametric EQ (8 bands)
    initParametricEQ();

    // Initialize Graphic EQ (31 bands, ISO frequencies)
    initGraphicEQ();

    // Initialize Advanced Filters
    initAdvancedFilters();

    // Initialize Dynamic EQ
    initDynamicEQ();

    // Setup visualizations
    setupEQVisualizations();

    // Setup UI event listeners
    setupEQEventListeners();

    console.log('EQ & Advanced Filtering System Initialized');
}

// Initialize 8-Band Parametric EQ
function initParametricEQ() {
    const defaultBands = [
        { freq: 30, gain: 0, q: 1.0, type: 'lowshelf' },
        { freq: 80, gain: 0, q: 1.4, type: 'peaking' },
        { freq: 200, gain: 0, q: 1.4, type: 'peaking' },
        { freq: 500, gain: 0, q: 1.4, type: 'peaking' },
        { freq: 1000, gain: 0, q: 1.4, type: 'peaking' },
        { freq: 3000, gain: 0, q: 1.4, type: 'peaking' },
        { freq: 8000, gain: 0, q: 1.4, type: 'peaking' },
        { freq: 16000, gain: 0, q: 1.0, type: 'highshelf' }
    ];

    parametricEQBands = defaultBands.map((band, idx) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        filter.gain.value = band.gain;
        filter.Q.value = band.q;

        return {
            filter,
            freq: band.freq,
            gain: band.gain,
            q: band.q,
            type: band.type,
            enabled: true,
            index: idx
        };
    });

    // Chain filters in series
    for (let i = 0; i < parametricEQBands.length - 1; i++) {
        parametricEQBands[i].filter.connect(parametricEQBands[i + 1].filter);
    }

    // Generate UI for bands
    generateParametricBandUI();
}

// Generate Parametric EQ Band UI
function generateParametricBandUI() {
    const container = document.getElementById('parametricBands');
    if (!container) return;

    container.innerHTML = '';

    parametricEQBands.forEach((band, idx) => {
        const bandElement = document.createElement('div');
        bandElement.style.cssText = 'background: var(--primary-surface-color); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);';

        bandElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-weight: bold; font-size: 0.9em;">Band ${idx + 1}</span>
                <label style="font-size: 0.85em;">
                    <input type="checkbox" class="eq-band-enable" data-band="${idx}" checked /> On
                </label>
            </div>
            <label style="display: block; font-size: 0.85em; margin-bottom: 5px;">
                Type:
                <select class="eq-band-type" data-band="${idx}" style="width: 100%; padding: 3px; margin-top: 2px;">
                    <option value="lowpass">Lowpass</option>
                    <option value="highpass">Highpass</option>
                    <option value="bandpass">Bandpass</option>
                    <option value="lowshelf" ${band.type === 'lowshelf' ? 'selected' : ''}>Low Shelf</option>
                    <option value="highshelf" ${band.type === 'highshelf' ? 'selected' : ''}>High Shelf</option>
                    <option value="peaking" ${band.type === 'peaking' ? 'selected' : ''}>Peaking (Bell)</option>
                    <option value="notch">Notch</option>
                </select>
            </label>
            <label style="display: block; font-size: 0.85em; margin-bottom: 5px;">
                Freq: <span class="eq-band-freq-value" data-band="${idx}">${band.freq}</span> Hz
                <input type="range" class="eq-band-freq" data-band="${idx}" min="20" max="20000" value="${band.freq}" style="width: 100%;" />
            </label>
            <label style="display: block; font-size: 0.85em; margin-bottom: 5px;">
                Gain: <span class="eq-band-gain-value" data-band="${idx}">${band.gain.toFixed(1)}</span> dB
                <input type="range" class="eq-band-gain" data-band="${idx}" min="-18" max="18" step="0.1" value="${band.gain}" style="width: 100%;" />
            </label>
            <label style="display: block; font-size: 0.85em;">
                Q: <span class="eq-band-q-value" data-band="${idx}">${band.q.toFixed(2)}</span>
                <input type="range" class="eq-band-q" data-band="${idx}" min="0.1" max="10" step="0.1" value="${band.q}" style="width: 100%;" />
            </label>
        `;

        container.appendChild(bandElement);
    });
}

// Initialize 31-Band Graphic EQ (ISO Frequencies)
function initGraphicEQ() {
    // ISO 1/3 octave center frequencies
    const isoFrequencies = [
        20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
        200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
        2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
    ];

    graphicEQBands = isoFrequencies.map((freq, idx) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.gain.value = 0;
        filter.Q.value = 4.3; // 1/3 octave bandwidth

        return {
            filter,
            freq,
            gain: 0,
            enabled: false,
            index: idx
        };
    });

    // Chain filters in series
    for (let i = 0; i < graphicEQBands.length - 1; i++) {
        graphicEQBands[i].filter.connect(graphicEQBands[i + 1].filter);
    }

    // Generate UI
    generateGraphicEQUI();
}

// Generate Graphic EQ UI
function generateGraphicEQUI() {
    const container = document.getElementById('graphicEQSliders');
    if (!container) return;

    container.innerHTML = '';

    graphicEQBands.forEach((band, idx) => {
        const sliderWrapper = document.createElement('div');
        sliderWrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center; flex: 1;';

        const freqLabel = band.freq >= 1000
            ? (band.freq / 1000).toFixed(band.freq % 1000 === 0 ? 1 : 2) + 'k'
            : band.freq;

        sliderWrapper.innerHTML = `
            <input type="range" orient="vertical" class="graphic-eq-slider" data-band="${idx}"
                   min="-12" max="12" step="0.5" value="0"
                   style="writing-mode: bt-lr; -webkit-appearance: slider-vertical; width: 20px; height: 150px; margin: 5px 0;" />
            <div class="graphic-eq-value" data-band="${idx}" style="font-size: 0.7em; margin: 3px 0; min-height: 20px; color: var(--accent-color);">0</div>
            <div style="font-size: 0.65em; color: var(--text-muted-color); writing-mode: vertical-rl; transform: rotate(180deg); margin-top: 5px;">${freqLabel}</div>
        `;

        container.appendChild(sliderWrapper);
    });
}

// Initialize Advanced Filters
function initAdvancedFilters() {
    // State-Variable Filter (simultaneous LP/BP/HP)
    stateVarFilterLP = audioContext.createBiquadFilter();
    stateVarFilterBP = audioContext.createBiquadFilter();
    stateVarFilterHP = audioContext.createBiquadFilter();
    stateVarFilterLP.type = 'lowpass';
    stateVarFilterBP.type = 'bandpass';
    stateVarFilterHP.type = 'highpass';

    stateVarMixLP = audioContext.createGain();
    stateVarMixBP = audioContext.createGain();
    stateVarMixHP = audioContext.createGain();
    stateVarMixLP.gain.value = 0.33;
    stateVarMixBP.gain.value = 0.33;
    stateVarMixHP.gain.value = 0.33;

    // Comb Filter
    combFilterDelay = audioContext.createDelay(0.1);
    combFilterGain = audioContext.createGain();
    combFilterFeedback = audioContext.createGain();
    combFilterDelay.delayTime.value = 0.01; // 10ms
    combFilterFeedback.gain.value = 0.5;

    // Formant Filter (3 bandpass filters for vowel sounds)
    const formantPresets = {
        'a': [{ freq: 700, q: 6 }, { freq: 1220, q: 10 }, { freq: 2600, q: 14 }],
        'e': [{ freq: 530, q: 6 }, { freq: 1840, q: 10 }, { freq: 2480, q: 14 }],
        'i': [{ freq: 390, q: 6 }, { freq: 1990, q: 10 }, { freq: 2550, q: 14 }],
        'o': [{ freq: 570, q: 6 }, { freq: 840, q: 10 }, { freq: 2410, q: 14 }],
        'u': [{ freq: 440, q: 6 }, { freq: 1020, q: 10 }, { freq: 2240, q: 14 }]
    };

    formantFilters = [0, 1, 2].map(i => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = formantPresets['a'][i].freq;
        filter.Q.value = formantPresets['a'][i].q;
        return { filter, presets: formantPresets };
    });

    // Chain formant filters
    formantFilters[0].filter.connect(formantFilters[1].filter);
    formantFilters[1].filter.connect(formantFilters[2].filter);

    // Ladder Filter (Moog-style, 4-pole 24dB/oct)
    ladderFilters = [0, 1, 2, 3].map(() => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        filter.Q.value = 0.7;
        return filter;
    });

    // Chain ladder filters
    for (let i = 0; i < ladderFilters.length - 1; i++) {
        ladderFilters[i].connect(ladderFilters[i + 1]);
    }

    // Ladder saturation
    ladderFilterShaper = audioContext.createWaveShaper();
    ladderFilterShaper.curve = createSaturationCurve(0);
}

// Create saturation curve for ladder filter
function createSaturationCurve(amount) {
    const samples = 1024;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i / samples) * 2 - 1;
        if (amount === 0) {
            curve[i] = x;
        } else {
            curve[i] = Math.tanh(x * (1 + amount * 5));
        }
    }
    return curve;
}

// Initialize Dynamic EQ
function initDynamicEQ() {
    const frequencies = [100, 500, 2000, 8000];

    dynamicEQBands = frequencies.map((freq, idx) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.gain.value = 0;
        filter.Q.value = 2;

        const compressor = audioContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 12;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        const inputGain = audioContext.createGain();
        const outputGain = audioContext.createGain();

        inputGain.connect(filter);
        filter.connect(compressor);
        compressor.connect(outputGain);

        return {
            filter,
            compressor,
            inputGain,
            outputGain,
            freq,
            enabled: false,
            index: idx
        };
    });

    generateDynamicEQUI();
}

// Generate Dynamic EQ UI
function generateDynamicEQUI() {
    const container = document.getElementById('dynamicEQBands');
    if (!container) return;

    container.innerHTML = '';

    dynamicEQBands.forEach((band, idx) => {
        const bandElement = document.createElement('div');
        bandElement.style.cssText = 'background: var(--primary-surface-color); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);';

        bandElement.innerHTML = `
            <div style="margin-bottom: 8px;">
                <label style="font-weight: bold; font-size: 0.9em;">
                    <input type="checkbox" class="dynamic-eq-enable" data-band="${idx}" /> ${band.freq} Hz
                </label>
            </div>
            <label style="display: block; font-size: 0.85em; margin-bottom: 5px;">
                Threshold: <span class="dynamic-eq-thresh-value" data-band="${idx}">-24</span> dB
                <input type="range" class="dynamic-eq-thresh" data-band="${idx}" min="-60" max="0" value="-24" style="width: 100%;" />
            </label>
            <label style="display: block; font-size: 0.85em; margin-bottom: 5px;">
                Ratio: <span class="dynamic-eq-ratio-value" data-band="${idx}">4.0</span>:1
                <input type="range" class="dynamic-eq-ratio" data-band="${idx}" min="1" max="20" step="0.5" value="4" style="width: 100%;" />
            </label>
            <label style="display: block; font-size: 0.85em;">
                Q: <span class="dynamic-eq-q-value" data-band="${idx}">2.0</span>
                <input type="range" class="dynamic-eq-q" data-band="${idx}" min="0.5" max="10" step="0.1" value="2" style="width: 100%;" />
            </label>
        `;

        container.appendChild(bandElement);
    });
}

// Setup EQ Visualizations
function setupEQVisualizations() {
    eqFrequencyResponseCanvas = document.getElementById('eqFrequencyResponseCanvas');
    graphicEQCanvas = document.getElementById('graphicEQCanvas');
    eqSpectrumCanvas = document.getElementById('eqSpectrumCanvas');

    if (eqFrequencyResponseCanvas) {
        eqFrequencyResponseCtx = eqFrequencyResponseCanvas.getContext('2d');
        eqFrequencyResponseCanvas.addEventListener('click', handleEQCanvasClick);
    }

    if (graphicEQCanvas) {
        graphicEQCtx = graphicEQCanvas.getContext('2d');
    }

    if (eqSpectrumCanvas) {
        eqSpectrumCtx = eqSpectrumCanvas.getContext('2d');
    }

    animateEQVisuals();
}

// Handle EQ canvas clicks for interactive adjustment
function handleEQCanvasClick(e) {
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    const minFreq = Math.log10(20);
    const maxFreq = Math.log10(20000);
    const freq = Math.pow(10, minFreq + (x / width) * (maxFreq - minFreq));
    const gain = 18 - (y / height) * 36;

    let nearestBand = null;
    let minDist = Infinity;

    parametricEQBands.forEach(band => {
        const dist = Math.abs(Math.log10(band.freq) - Math.log10(freq));
        if (dist < minDist) {
            minDist = dist;
            nearestBand = band;
        }
    });

    if (nearestBand) {
        nearestBand.freq = freq;
        nearestBand.gain = gain;
        nearestBand.filter.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.01);
        nearestBand.filter.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);

        const freqInput = document.querySelector(`.eq-band-freq[data-band="${nearestBand.index}"]`);
        const gainInput = document.querySelector(`.eq-band-gain[data-band="${nearestBand.index}"]`);
        const freqValue = document.querySelector(`.eq-band-freq-value[data-band="${nearestBand.index}"]`);
        const gainValue = document.querySelector(`.eq-band-gain-value[data-band="${nearestBand.index}"]`);

        if (freqInput) freqInput.value = freq;
        if (gainInput) gainInput.value = gain;
        if (freqValue) freqValue.textContent = freq.toFixed(0);
        if (gainValue) gainValue.textContent = gain.toFixed(1);
    }
}

// Draw frequency response curve
function drawFrequencyResponse() {
    if (!eqFrequencyResponseCtx) return;

    const canvas = eqFrequencyResponseCanvas;
    const ctx = eqFrequencyResponseCtx;
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    for (let db = -18; db <= 18; db += 6) {
        const y = height / 2 - (db / 18) * (height / 2);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    freqs.forEach(freq => {
        const x = freqToX(freq, width);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    });

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!document.getElementById('eqEnableParametric')?.checked) return;

    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
        const freq = xToFreq(x, width);
        let totalGain = 0;

        parametricEQBands.forEach(band => {
            if (!band.enabled) return;
            const gain = calculateFilterResponse(freq, band.freq, band.gain, band.q, band.type);
            totalGain += gain;
        });

        const y = height / 2 - (totalGain / 18) * (height / 2);

        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.stroke();

    parametricEQBands.forEach((band, idx) => {
        if (!band.enabled) return;

        const x = freqToX(band.freq, width);
        const y = height / 2 - (band.gain / 18) * (height / 2);

        ctx.fillStyle = band.type === 'peaking' ? '#00ff00' :
                       band.type === 'lowshelf' ? '#ffaa00' :
                       band.type === 'highshelf' ? '#ffaa00' : '#ff0000';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText((idx + 1).toString(), x - 3, y - 8);
    });
}

// Calculate filter response at frequency
function calculateFilterResponse(testFreq, centerFreq, gain, q, type) {
    if (type === 'peaking') {
        const ratio = testFreq / centerFreq;
        const bw = 1 / q;
        const response = 1 + (Math.pow(10, gain / 20) - 1) / (1 + Math.pow((Math.log(ratio) / (bw * Math.log(2))), 2));
        return 20 * Math.log10(response);
    } else if (type === 'lowshelf' || type === 'highshelf') {
        const ratio = testFreq / centerFreq;
        if (type === 'lowshelf') {
            const rolloff = 1 / (1 + ratio * ratio);
            return gain * rolloff;
        } else {
            const rolloff = (ratio * ratio) / (1 + ratio * ratio);
            return gain * rolloff;
        }
    }
    return 0;
}

// Convert frequency to x position (log scale)
function freqToX(freq, width) {
    const minFreq = Math.log10(20);
    const maxFreq = Math.log10(20000);
    return ((Math.log10(freq) - minFreq) / (maxFreq - minFreq)) * width;
}

// Convert x position to frequency
function xToFreq(x, width) {
    const minFreq = Math.log10(20);
    const maxFreq = Math.log10(20000);
    return Math.pow(10, minFreq + (x / width) * (maxFreq - minFreq));
}

// Draw graphic EQ visualization
function drawGraphicEQ() {
    if (!graphicEQCtx) return;

    const canvas = graphicEQCanvas;
    const ctx = graphicEQCtx;
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    if (!document.getElementById('eqEnableGraphic')?.checked) return;

    const barWidth = width / graphicEQBands.length;

    graphicEQBands.forEach((band, idx) => {
        const x = idx * barWidth;
        const barHeight = (band.gain / 12) * (height / 2);
        const y = height / 2 - barHeight;

        ctx.fillStyle = band.gain > 0 ? '#00ff00' : band.gain < 0 ? '#ff0000' : '#555';
        ctx.fillRect(x + 1, y, barWidth - 2, Math.abs(barHeight));
    });
}

// Draw spectrum with before/after
function drawEQSpectrum() {
    if (!eqSpectrumCtx || !eqInputAnalyser || !eqOutputAnalyser) return;

    const canvas = eqSpectrumCanvas;
    const ctx = eqSpectrumCtx;
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const bufferLength = eqInputAnalyser.frequencyBinCount;
    const beforeData = new Uint8Array(bufferLength);
    const afterData = new Uint8Array(bufferLength);

    eqInputAnalyser.getByteFrequencyData(beforeData);
    eqOutputAnalyser.getByteFrequencyData(afterData);

    const showBefore = document.getElementById('spectrumShowBefore')?.checked;
    const showAfter = document.getElementById('spectrumShowAfter')?.checked;

    if (showBefore) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < bufferLength; i++) {
            const x = (i / bufferLength) * width;
            const y = height - (beforeData[i] / 255) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    if (showAfter) {
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < bufferLength; i++) {
            const x = (i / bufferLength) * width;
            const y = height - (afterData[i] / 255) * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }
}

// Animate EQ visuals
function animateEQVisuals() {
    drawFrequencyResponse();
    drawGraphicEQ();
    drawEQSpectrum();
    eqAnimationFrame = requestAnimationFrame(animateEQVisuals);
}

// Setup EQ Event Listeners
function setupEQEventListeners() {
    // Mode switching
    document.querySelectorAll('.eq-mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.eq-mode-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const mode = e.target.dataset.mode;
            document.querySelectorAll('.eq-section').forEach(section => {
                section.style.display = 'none';
            });

            if (mode === 'parametric') document.getElementById('parametricEQSection').style.display = 'block';
            if (mode === 'graphic') document.getElementById('graphicEQSection').style.display = 'block';
            if (mode === 'advanced') document.getElementById('advancedFiltersSection').style.display = 'block';
            if (mode === 'dynamic') document.getElementById('dynamicEQSection').style.display = 'block';
        });
    });

    setupParametricEQControls();
    setupGraphicEQControls();
    setupAdvancedFilterControls();
    setupDynamicEQControls();
}

// Setup Parametric EQ Controls
function setupParametricEQControls() {
    const resetBtn = document.getElementById('eqResetParametric');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            parametricEQBands.forEach((band, idx) => {
                band.gain = 0;
                band.filter.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);

                const gainInput = document.querySelector(`.eq-band-gain[data-band="${idx}"]`);
                const gainValue = document.querySelector(`.eq-band-gain-value[data-band="${idx}"]`);
                if (gainInput) gainInput.value = 0;
                if (gainValue) gainValue.textContent = '0.0';
            });
        });
    }

    document.addEventListener('change', (e) => {
        const target = e.target;

        if (target.classList.contains('eq-band-enable')) {
            const idx = parseInt(target.dataset.band);
            parametricEQBands[idx].enabled = target.checked;
        }

        if (target.classList.contains('eq-band-type')) {
            const idx = parseInt(target.dataset.band);
            const type = target.value;
            parametricEQBands[idx].type = type;
            parametricEQBands[idx].filter.type = type;
        }
    });

    document.addEventListener('input', (e) => {
        const target = e.target;

        if (target.classList.contains('eq-band-freq')) {
            const idx = parseInt(target.dataset.band);
            const freq = parseFloat(target.value);
            parametricEQBands[idx].freq = freq;
            parametricEQBands[idx].filter.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.01);
            const valueSpan = document.querySelector(`.eq-band-freq-value[data-band="${idx}"]`);
            if (valueSpan) valueSpan.textContent = freq.toFixed(0);
        }

        if (target.classList.contains('eq-band-gain')) {
            const idx = parseInt(target.dataset.band);
            const gain = parseFloat(target.value);
            parametricEQBands[idx].gain = gain;
            parametricEQBands[idx].filter.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);
            const valueSpan = document.querySelector(`.eq-band-gain-value[data-band="${idx}"]`);
            if (valueSpan) valueSpan.textContent = gain.toFixed(1);
        }

        if (target.classList.contains('eq-band-q')) {
            const idx = parseInt(target.dataset.band);
            const q = parseFloat(target.value);
            parametricEQBands[idx].q = q;
            parametricEQBands[idx].filter.Q.setTargetAtTime(q, audioContext.currentTime, 0.01);
            const valueSpan = document.querySelector(`.eq-band-q-value[data-band="${idx}"]`);
            if (valueSpan) valueSpan.textContent = q.toFixed(2);
        }
    });
}

// Setup Graphic EQ Controls
function setupGraphicEQControls() {
    const resetBtn = document.getElementById('eqResetGraphic');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            graphicEQBands.forEach((band, idx) => {
                band.gain = 0;
                band.filter.gain.setTargetAtTime(0, audioContext.currentTime, 0.01);

                const slider = document.querySelector(`.graphic-eq-slider[data-band="${idx}"]`);
                const value = document.querySelector(`.graphic-eq-value[data-band="${idx}"]`);
                if (slider) slider.value = 0;
                if (value) value.textContent = '0';
            });
        });
    }

    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('graphic-eq-slider')) {
            const idx = parseInt(e.target.dataset.band);
            const gain = parseFloat(e.target.value);
            graphicEQBands[idx].gain = gain;
            graphicEQBands[idx].filter.gain.setTargetAtTime(gain, audioContext.currentTime, 0.01);

            const valueSpan = document.querySelector(`.graphic-eq-value[data-band="${idx}"]`);
            if (valueSpan) {
                valueSpan.textContent = gain >= 0 ? '+' + gain.toFixed(1) : gain.toFixed(1);
                valueSpan.style.color = gain > 0 ? '#00ff00' : gain < 0 ? '#ff0000' : 'var(--accent-color)';
            }
        }
    });
}

// Setup Advanced Filter Controls
function setupAdvancedFilterControls() {
    const svFreq = document.getElementById('stateVarFreq');
    const svRes = document.getElementById('stateVarRes');
    const svLPMix = document.getElementById('svLPMix');
    const svBPMix = document.getElementById('svBPMix');
    const svHPMix = document.getElementById('svHPMix');

    if (svFreq) {
        svFreq.addEventListener('input', (e) => {
            const freq = parseFloat(e.target.value);
            [stateVarFilterLP, stateVarFilterBP, stateVarFilterHP].forEach(f => {
                f.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.01);
            });
            document.getElementById('stateVarFreqValue').textContent = freq.toFixed(0);
        });
    }

    if (svRes) {
        svRes.addEventListener('input', (e) => {
            const res = parseFloat(e.target.value);
            [stateVarFilterLP, stateVarFilterBP, stateVarFilterHP].forEach(f => {
                f.Q.setTargetAtTime(res, audioContext.currentTime, 0.01);
            });
            document.getElementById('stateVarResValue').textContent = res.toFixed(1);
        });
    }

    [svLPMix, svBPMix, svHPMix].forEach((slider, idx) => {
        if (!slider) return;
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) / 100;
            const gains = [stateVarMixLP, stateVarMixBP, stateVarMixHP];
            const valueSpans = ['svLPValue', 'svBPValue', 'svHPValue'];
            gains[idx].gain.setTargetAtTime(val, audioContext.currentTime, 0.01);
            document.getElementById(valueSpans[idx]).textContent = (val * 100).toFixed(0);
        });
    });

    const combDelay = document.getElementById('combDelay');
    const combFeedback = document.getElementById('combFeedback');

    if (combDelay) {
        combDelay.addEventListener('input', (e) => {
            const delay = parseFloat(e.target.value) / 1000;
            combFilterDelay.delayTime.setTargetAtTime(delay, audioContext.currentTime, 0.01);
            document.getElementById('combDelayValue').textContent = (delay * 1000).toFixed(1);
        });
    }

    if (combFeedback) {
        combFeedback.addEventListener('input', (e) => {
            const feedback = parseFloat(e.target.value) / 100;
            combFilterFeedback.gain.setTargetAtTime(feedback, audioContext.currentTime, 0.01);
            document.getElementById('combFeedbackValue').textContent = (feedback * 100).toFixed(0);
        });
    }

    const formantVowel = document.getElementById('formantVowel');
    const formantShift = document.getElementById('formantShift');
    const formantQ = document.getElementById('formantQ');

    if (formantVowel) {
        formantVowel.addEventListener('change', (e) => {
            const vowel = e.target.value;
            const shift = parseFloat(formantShift?.value || 0);
            updateFormantFilters(vowel, shift);
        });
    }

    if (formantShift) {
        formantShift.addEventListener('input', (e) => {
            const shift = parseFloat(e.target.value);
            const vowel = formantVowel?.value || 'a';
            updateFormantFilters(vowel, shift);
            document.getElementById('formantShiftValue').textContent = shift.toFixed(0);
        });
    }

    if (formantQ) {
        formantQ.addEventListener('input', (e) => {
            const q = parseFloat(e.target.value);
            formantFilters.forEach(({ filter }) => {
                filter.Q.setTargetAtTime(q, audioContext.currentTime, 0.01);
            });
            document.getElementById('formantQValue').textContent = q.toFixed(1);
        });
    }

    const ladderCutoff = document.getElementById('ladderCutoff');
    const ladderRes = document.getElementById('ladderRes');
    const ladderSat = document.getElementById('ladderSat');

    if (ladderCutoff) {
        ladderCutoff.addEventListener('input', (e) => {
            const cutoff = parseFloat(e.target.value);
            ladderFilters.forEach(f => {
                f.frequency.setTargetAtTime(cutoff, audioContext.currentTime, 0.01);
            });
            document.getElementById('ladderCutoffValue').textContent = cutoff.toFixed(0);
        });
    }

    if (ladderRes) {
        ladderRes.addEventListener('input', (e) => {
            const res = parseFloat(e.target.value) / 100;
            const q = 0.7 + res * 20;
            ladderFilters.forEach(f => {
                f.Q.setTargetAtTime(q, audioContext.currentTime, 0.01);
            });
            document.getElementById('ladderResValue').textContent = (res * 100).toFixed(0);
        });
    }

    if (ladderSat) {
        ladderSat.addEventListener('input', (e) => {
            const sat = parseFloat(e.target.value) / 100;
            if (ladderFilterShaper) {
                ladderFilterShaper.curve = createSaturationCurve(sat);
            }
            document.getElementById('ladderSatValue').textContent = (sat * 100).toFixed(0);
        });
    }
}

// Update formant filters based on vowel and shift
function updateFormantFilters(vowel, shift) {
    const shiftFactor = Math.pow(2, shift / 12);

    formantFilters.forEach(({ filter, presets }, idx) => {
        const baseFreq = presets[vowel][idx].freq;
        const newFreq = baseFreq * shiftFactor;
        filter.frequency.setTargetAtTime(newFreq, audioContext.currentTime, 0.01);
    });
}

// Setup Dynamic EQ Controls
function setupDynamicEQControls() {
    document.addEventListener('input', (e) => {
        const target = e.target;

        if (target.classList.contains('dynamic-eq-thresh')) {
            const idx = parseInt(target.dataset.band);
            const thresh = parseFloat(target.value);
            dynamicEQBands[idx].compressor.threshold.setTargetAtTime(thresh, audioContext.currentTime, 0.01);
            document.querySelector(`.dynamic-eq-thresh-value[data-band="${idx}"]`).textContent = thresh.toFixed(0);
        }

        if (target.classList.contains('dynamic-eq-ratio')) {
            const idx = parseInt(target.dataset.band);
            const ratio = parseFloat(target.value);
            dynamicEQBands[idx].compressor.ratio.setTargetAtTime(ratio, audioContext.currentTime, 0.01);
            document.querySelector(`.dynamic-eq-ratio-value[data-band="${idx}"]`).textContent = ratio.toFixed(1);
        }

        if (target.classList.contains('dynamic-eq-q')) {
            const idx = parseInt(target.dataset.band);
            const q = parseFloat(target.value);
            dynamicEQBands[idx].filter.Q.setTargetAtTime(q, audioContext.currentTime, 0.01);
            document.querySelector(`.dynamic-eq-q-value[data-band="${idx}"]`).textContent = q.toFixed(1);
        }
    });
}

// END OF EQ IMPLEMENTATION
// ADD THESE LINES TO initAudio():
//   - After line "initMixer();" add: initEQSystem();
//
// ADD THIS TO TOGGLE BUTTON SETUP (after toggleMixerButton listener):
/*
toggleEQButton.addEventListener('click', () => {
    const isOpen = eqContainer.style.display !== 'none';
    eqContainer.style.display = isOpen ? 'none' : 'block';
    toggleEQButton.textContent = isOpen ? 'Show EQ & Filters' : 'Hide EQ & Filters';
});
*/
//
// ADD THIS TO ELEMENT INITIALIZATION (around line 5500):
//   toggleEQButton = document.getElementById('toggleEQButton');
//   eqContainer = document.getElementById('eqContainer');
