// ===== AUDIO RECORDING ADDON FOR ULTIMATE SYNTHESIA ONLINE =====
// This code adds comprehensive audio recording capabilities
// Insert this code before the closing </script> tag in index.html

// Audio Input & Recording Event Listeners (add to window.addEventListener('load') section)
/*
document.getElementById('enableAudioInputButton').addEventListener('click', () => {
    if (audioInputEnabled) {
        teardownAudioInput();
    } else {
        setupAudioInput();
    }
});

document.getElementById('inputLevel').addEventListener('input', (e) => {
    if (audioInputGain) {
        audioInputGain.gain.value = parseFloat(e.target.value);
    }
});

document.getElementById('directMonitoring').addEventListener('change', (e) => {
    if (monitorGain) {
        const monitorLevel = parseFloat(document.getElementById('monitorLevel').value);
        monitorGain.gain.value = e.target.checked ? monitorLevel : 0;
    }
});

document.getElementById('monitorLevel').addEventListener('input', (e) => {
    if (monitorGain && document.getElementById('directMonitoring').checked) {
        monitorGain.gain.value = parseFloat(e.target.value);
    }
});
*/

// --- Audio Input & Recording Functions ---
async function setupAudioInput() {
    if (!audioContext) initAudio();
    if (!audioContext) {
        alert("Audio context not available.");
        return false;
    }

    try {
        audioInputStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                latency: 0
            }
        });

        audioInputSource = audioContext.createMediaStreamSource(audioInputStream);
        audioInputGain = audioContext.createGain();
        audioInputGain.gain.value = parseFloat(document.getElementById('inputLevel').value);

        audioInputAnalyser = audioContext.createAnalyser();
        audioInputAnalyser.fftSize = 256;
        audioInputAnalyser.smoothingTimeConstant = 0.3;

        monitorGain = audioContext.createGain();
        monitorGain.gain.value = 0;

        audioInputSource.connect(audioInputGain);
        audioInputGain.connect(audioInputAnalyser);
        audioInputGain.connect(monitorGain);
        monitorGain.connect(audioContext.destination);

        const latency = audioContext.baseLatency || 0;
        const outputLatency = audioContext.outputLatency || 0;
        audioInputLatency = (latency + outputLatency) * 1000;

        document.getElementById('audioLatencyDisplay').textContent = audioInputLatency.toFixed(1);
        document.getElementById('audioInputStatus').textContent = 'Connected';
        audioInputEnabled = true;

        startInputMeter();

        document.getElementById('audio-input-controls').style.display = 'block';
        document.getElementById('enableAudioInputButton').textContent = 'Disable Microphone';

        return true;
    } catch (error) {
        console.error('Error setting up audio input:', error);
        alert('Failed to access microphone: ' + error.message);
        return false;
    }
}

function teardownAudioInput() {
    if (inputMeterAnimationFrame) {
        cancelAnimationFrame(inputMeterAnimationFrame);
        inputMeterAnimationFrame = null;
    }
    if (audioInputSource) audioInputSource.disconnect();
    if (audioInputGain) audioInputGain.disconnect();
    if (audioInputAnalyser) audioInputAnalyser.disconnect();
    if (monitorGain) monitorGain.disconnect();
    if (audioInputStream) audioInputStream.getTracks().forEach(track => track.stop());

    audioInputSource = null;
    audioInputGain = null;
    audioInputAnalyser = null;
    monitorGain = null;
    audioInputStream = null;

    document.getElementById('audioInputStatus').textContent = 'Not Connected';
    document.getElementById('inputMeterBar').style.width = '0%';
    document.getElementById('audio-input-controls').style.display = 'none';
    document.getElementById('enableAudioInputButton').textContent = 'Enable Microphone';
    audioInputEnabled = false;
}

function startInputMeter() {
    if (!audioInputAnalyser) return;

    const bufferLength = audioInputAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const meterBar = document.getElementById('inputMeterBar');

    function updateMeter() {
        if (!audioInputEnabled || !audioInputAnalyser) return;

        audioInputAnalyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const db = 20 * Math.log10(rms + 0.0001);
        const normalized = Math.max(0, Math.min(1, (db + 60) / 60));

        meterBar.style.width = (normalized * 100) + '%';
        inputMeterAnimationFrame = requestAnimationFrame(updateMeter);
    }

    updateMeter();
}

function startAudioRecording(slotId) {
    if (!audioInputEnabled || !audioContext || !audioInputGain) {
        console.warn('Audio input not enabled');
        return false;
    }

    const slot = loopSlotsData[slotId];
    recordedAudioChunks = [];
    recordingSlotId = slotId;
    recordingStartTime = audioContext.currentTime;
    isRecordingAudio = true;

    const bufferSize = 4096;
    recordingProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    recordingProcessor.onaudioprocess = (e) => {
        if (!isRecordingAudio) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(inputData);
        recordedAudioChunks.push(chunk);
    };

    audioInputGain.connect(recordingProcessor);
    recordingProcessor.connect(audioContext.destination);

    slot.recordingMode = 'audio';
    slot.isArmedForAudio = true;
    console.log('Started audio recording for slot', slotId);
    return true;
}

function stopAudioRecording(slotId) {
    if (!isRecordingAudio || recordingSlotId !== slotId) return null;

    isRecordingAudio = false;
    const recordingDuration = audioContext.currentTime - recordingStartTime;

    if (recordingProcessor) {
        recordingProcessor.disconnect();
        audioInputGain.disconnect(recordingProcessor);
        recordingProcessor.onaudioprocess = null;
        recordingProcessor = null;
    }

    if (recordedAudioChunks.length === 0) {
        console.warn('No audio recorded');
        return null;
    }

    const totalLength = recordedAudioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const audioBuffer = audioContext.createBuffer(1, totalLength, audioContext.sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    let offset = 0;
    for (const chunk of recordedAudioChunks) {
        channelData.set(chunk, offset);
        offset += chunk.length;
    }

    recordedAudioChunks = [];
    recordingSlotId = -1;

    console.log('Stopped audio recording, duration:', recordingDuration.toFixed(2), 's, buffer length:', audioBuffer.length);
    return audioBuffer;
}

function saveAudioTake(slotId, audioBuffer) {
    const slot = loopSlotsData[slotId];
    const takeNumber = slot.audioTakes.length + 1;
    const take = {
        buffer: audioBuffer,
        name: `Take ${takeNumber}`,
        timestamp: Date.now()
    };

    slot.audioTakes.push(take);
    slot.currentTakeIndex = slot.audioTakes.length - 1;
    slot.audioBuffer = audioBuffer;
    slot.loopDuration = (audioBuffer.duration * 1000);

    console.log(`Saved take ${takeNumber} for slot ${slotId}, duration: ${audioBuffer.duration.toFixed(2)}s`);

    createWaveformVisualization(slotId);

    return takeNumber;
}

function switchAudioTake(slotId, takeIndex) {
    const slot = loopSlotsData[slotId];
    if (takeIndex < 0 || takeIndex >= slot.audioTakes.length) return false;

    slot.currentTakeIndex = takeIndex;
    slot.audioBuffer = slot.audioTakes[takeIndex].buffer;
    slot.loopDuration = (slot.audioBuffer.duration * 1000);

    console.log(`Switched to take ${takeIndex + 1} for slot ${slotId}`);
    createWaveformVisualization(slotId);

    return true;
}

function playAudioBuffer(slotId) {
    const slot = loopSlotsData[slotId];
    if (!slot.audioBuffer || !audioContext) return false;

    if (slot.audioPlaybackSource) {
        try {
            slot.audioPlaybackSource.stop();
        } catch (e) {}
        slot.audioPlaybackSource = null;
    }

    const source = audioContext.createBufferSource();
    source.buffer = slot.audioBuffer;
    source.loop = true;

    const slotGain = audioContext.createGain();
    slotGain.gain.value = 1.0;

    source.connect(slotGain);
    slotGain.connect(masterGain);

    source.start(audioContext.currentTime);
    slot.audioPlaybackSource = source;

    source.onended = () => {
        if (slot.isPlaying && slot.recordingMode === 'audio') {
            playAudioBuffer(slotId);
        } else {
            slot.audioPlaybackSource = null;
        }
    };

    console.log('Playing audio buffer for slot', slotId);
    return true;
}

function stopAudioPlayback(slotId) {
    const slot = loopSlotsData[slotId];
    if (slot.audioPlaybackSource) {
        try {
            slot.audioPlaybackSource.stop();
        } catch (e) {}
        slot.audioPlaybackSource = null;
    }
}

function createWaveformVisualization(slotId) {
    const slot = loopSlotsData[slotId];
    if (!slot.audioBuffer) return;

    const statusEl = document.getElementById(`loop-slot-status-${slotId}`);
    if (!statusEl) return;

    const existingCanvas = document.getElementById(`waveform-${slotId}`);
    if (existingCanvas) existingCanvas.remove();

    const canvas = document.createElement('canvas');
    canvas.id = `waveform-${slotId}`;
    canvas.width = 200;
    canvas.height = 40;
    canvas.style.width = '100%';
    canvas.style.height = '40px';
    canvas.style.marginTop = '5px';
    canvas.style.border = '1px solid var(--border-color)';
    canvas.style.background = 'var(--bg-darker)';

    const ctx = canvas.getContext('2d');
    const buffer = slot.audioBuffer;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;

    ctx.fillStyle = '#00ff88';
    ctx.strokeStyle = '#00ff88';

    for (let i = 0; i < canvas.width; i++) {
        let min = 1.0;
        let max = -1.0;

        for (let j = 0; j < step; j++) {
            const datum = data[(i * step) + j] || 0;
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }

        const yMin = (1 + min) * amp;
        const yMax = (1 + max) * amp;

        ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
    }

    statusEl.appendChild(canvas);
}
