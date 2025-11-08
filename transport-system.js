// ========== TRANSPORT SYSTEM FUNCTIONS ==========

// Convert bars to seconds based on current tempo and time signatures
function barsToSeconds(bars) {
    let seconds = 0;
    let currentBar = 0;
    let currentTempo = currentBPM;
    let currentTimeSig = currentTimeSignature;

    // Process tempo points and time signature changes
    while (currentBar < bars) {
        const nextBar = currentBar + 1;
        const barDuration = (60 / currentTempo) * currentTimeSig.numerator * (4 / currentTimeSig.denominator);

        if (nextBar <= bars) {
            seconds += barDuration;
        } else {
            seconds += barDuration * (bars - currentBar);
        }

        currentBar = nextBar;

        // Check for tempo changes at this bar
        const tempoChange = tempoPoints.find(tp => tp.bar === currentBar);
        if (tempoChange) currentTempo = tempoChange.bpm;

        // Check for time signature changes at this bar
        const timeSigChange = timeSigChanges.find(ts => ts.bar === currentBar);
        if (timeSigChange) currentTimeSig = {numerator: timeSigChange.numerator, denominator: timeSigChange.denominator};
    }

    return seconds;
}

// Convert seconds to bars
function secondsToBars(seconds) {
    let bar = 0;
    let elapsedSeconds = 0;
    let currentTempo = currentBPM;
    let currentTimeSig = currentTimeSignature;

    while (elapsedSeconds < seconds) {
        const barDuration = (60 / currentTempo) * currentTimeSig.numerator * (4 / currentTimeSig.denominator);

        if (elapsedSeconds + barDuration <= seconds) {
            elapsedSeconds += barDuration;
            bar++;

            // Check for tempo changes
            const tempoChange = tempoPoints.find(tp => tp.bar === bar);
            if (tempoChange) currentTempo = tempoChange.bpm;

            // Check for time signature changes
            const timeSigChange = timeSigChanges.find(ts => ts.bar === currentBar);
            if (timeSigChange) currentTimeSig = {numerator: timeSigChange.numerator, denominator: timeSigChange.denominator};
        } else {
            // Partial bar
            const remainingSeconds = seconds - elapsedSeconds;
            bar += remainingSeconds / barDuration;
            break;
        }
    }

    return bar;
}

// Get BPM at a specific bar (handles tempo automation)
function getBPMAtBar(bar) {
    const sortedPoints = [...tempoPoints].sort((a, b) => a.bar - b.bar);
    let currentBPM_local = currentBPM;

    for (const point of sortedPoints) {
        if (point.bar <= bar) {
            currentBPM_local = point.bpm;
        } else {
            break;
        }
    }

    return currentBPM_local;
}

// Format timecode based on current format setting
function formatTimecode(seconds) {
    if (timecodeFormat === 'time') {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    } else if (timecodeFormat === 'samples') {
        if (!audioContext) return '0';
        const samples = Math.floor(seconds * audioContext.sampleRate);
        return samples.toString();
    } else { // bars
        const totalBars = secondsToBars(seconds);
        const bars = Math.floor(totalBars) + 1;
        const beatsPerBar = currentTimeSignature.numerator;
        const remainingBeats = (totalBars - Math.floor(totalBars)) * beatsPerBar;
        const beats = Math.floor(remainingBeats) + 1;
        const ticks = Math.floor((remainingBeats - Math.floor(remainingBeats)) * 960);
        return `${bars}:${beats}:${ticks.toString().padStart(3, '0')}`;
    }
}

// Update transport timecode display
function updateTransportTimecode() {
    if (!transportTimecodeDisplay) return;
    transportTimecodeDisplay.textContent = formatTimecode(transportPosition);
}

// Start count-in before recording/playback
function startCountIn(callback) {
    if (!countInEnabled || countInBars <= 0) {
        callback();
        return;
    }

    transportState = TransportState.COUNT_IN;
    countInBeatsRemaining = countInBars * currentTimeSignature.numerator;

    if (countInIndicator) {
        countInIndicator.style.display = 'inline';
        countInIndicator.textContent = countInBeatsRemaining;
    }

    // Play count-in clicks
    const beatDuration = (60 / currentBPM) * 1000;
    countInIntervalId = setInterval(() => {
        playMetronomeClickSound();
        countInBeatsRemaining--;

        if (countInIndicator) {
            countInIndicator.textContent = countInBeatsRemaining;
        }

        if (countInBeatsRemaining <= 0) {
            clearInterval(countInIntervalId);
            countInIntervalId = null;
            if (countInIndicator) {
                countInIndicator.style.display = 'none';
            }
            callback();
        }
    }, beatDuration);
}

// Transport Play
function transportPlay() {
    if (!audioContext) initAudio();
    if (!audioContext) {
        alert("Audio context not ready!");
        return;
    }

    if (transportState === TransportState.PLAYING) return;

    // If paused, resume from pause position
    if (transportState === TransportState.PAUSED) {
        transportPosition = transportPausePosition;
    }

    // Start count-in if enabled and starting from the beginning
    if (countInEnabled && transportPosition === 0) {
        startCountIn(() => {
            transportState = TransportState.PLAYING;
            transportStartTime = audioContext.currentTime - transportPosition;
            startPlayheadAnimation();
            updateTransportUI();
        });
    } else {
        transportState = TransportState.PLAYING;
        transportStartTime = audioContext.currentTime - transportPosition;
        startPlayheadAnimation();
        updateTransportUI();
    }
}

// Transport Pause
function transportPause() {
    if (transportState !== TransportState.PLAYING) return;

    transportPausePosition = transportPosition;
    transportState = TransportState.PAUSED;
    stopPlayheadAnimation();
    updateTransportUI();
}

// Transport Stop
function transportStop() {
    if (countInIntervalId) {
        clearInterval(countInIntervalId);
        countInIntervalId = null;
        if (countInIndicator) countInIndicator.style.display = 'none';
    }

    transportState = TransportState.STOPPED;
    transportPosition = 0;
    transportPausePosition = 0;
    stopPlayheadAnimation();
    updateTransportUI();
    updateTransportTimecode();
    updatePlayheadPosition();
}

// Transport Record
function transportRecord() {
    if (!audioContext) initAudio();
    if (!audioContext) return;

    // Start count-in then begin recording
    startCountIn(() => {
        transportState = TransportState.RECORDING;
        transportStartTime = audioContext.currentTime - transportPosition;
        startPlayheadAnimation();
        updateTransportUI();
    });
}

// Return to Zero
function transportReturnToZero() {
    if (transportState === TransportState.PLAYING || transportState === TransportState.RECORDING) {
        transportStop();
    }
    transportPosition = 0;
    transportPausePosition = 0;
    updateTransportTimecode();
    updatePlayheadPosition();
}

// Rewind
function transportRewind() {
    const rewindAmount = 1; // 1 bar
    const rewindSeconds = barsToSeconds(rewindAmount);
    transportPosition = Math.max(0, transportPosition - rewindSeconds);

    if (transportState === TransportState.PLAYING) {
        transportStartTime = audioContext.currentTime - transportPosition;
    } else {
        transportPausePosition = transportPosition;
    }

    updateTransportTimecode();
    updatePlayheadPosition();
}

// Fast Forward
function transportFastForward() {
    const ffAmount = 1; // 1 bar
    const ffSeconds = barsToSeconds(ffAmount);
    transportPosition += ffSeconds;

    if (transportState === TransportState.PLAYING) {
        transportStartTime = audioContext.currentTime - transportPosition;
    } else {
        transportPausePosition = transportPosition;
    }

    updateTransportTimecode();
    updatePlayheadPosition();
}

// Toggle Loop/Cycle
function transportToggleCycle() {
    transportLoopEnabled = !transportLoopEnabled;
    updateTransportUI();
}

// Update transport UI based on state
function updateTransportUI() {
    if (!transportPlayBtn) return;

    // Update button states
    if (transportState === TransportState.PLAYING || transportState === TransportState.RECORDING) {
        transportPlayBtn.style.background = 'var(--accent-color)';
        if (transportPauseBtn) transportPauseBtn.style.display = 'inline-block';
    } else {
        transportPlayBtn.style.background = '';
        if (transportPauseBtn) transportPauseBtn.style.display = 'none';
    }

    if (transportState === TransportState.PAUSED && transportPauseBtn) {
        transportPauseBtn.style.background = 'var(--accent-color)';
    } else if (transportPauseBtn) {
        transportPauseBtn.style.background = '';
    }

    if (transportState === TransportState.RECORDING && transportRecordBtn) {
        transportRecordBtn.style.background = '#f44336';
        transportRecordBtn.style.animation = 'pulse 1s infinite';
    } else if (transportRecordBtn) {
        transportRecordBtn.style.background = '';
        transportRecordBtn.style.animation = '';
    }

    if (transportCycleBtn) {
        transportCycleBtn.style.background = transportLoopEnabled ? 'var(--accent-color)' : '';
    }
}

// Playhead Animation
function startPlayheadAnimation() {
    stopPlayheadAnimation();

    function animate() {
        if (transportState === TransportState.PLAYING || transportState === TransportState.RECORDING) {
            transportPosition = audioContext.currentTime - transportStartTime;

            // Handle looping
            if (transportLoopEnabled && loopEndInput && loopStartInput) {
                const loopStartSec = barsToSeconds(parseFloat(loopStartInput.value) - 1);
                const loopEndSec = barsToSeconds(parseFloat(loopEndInput.value) - 1);

                if (transportPosition >= loopEndSec) {
                    transportPosition = loopStartSec;
                    transportStartTime = audioContext.currentTime - transportPosition;
                }
            }

            updateTransportTimecode();
            updatePlayheadPosition();

            playheadAnimationId = requestAnimationFrame(animate);
        }
    }

    playheadAnimationId = requestAnimationFrame(animate);
}

function stopPlayheadAnimation() {
    if (playheadAnimationId) {
        cancelAnimationFrame(playheadAnimationId);
        playheadAnimationId = null;
    }
}

// Update playhead visual position
function updatePlayheadPosition() {
    if (!timelinePlayheadElement) return;

    // Calculate pixel position based on zoom and position
    const pixelsPerSecond = 50; // Base pixels per second (adjust with zoom)
    const pixelPosition = transportPosition * pixelsPerSecond;

    timelinePlayheadElement.style.left = pixelPosition + 'px';

    // Auto-scroll if follow playhead is enabled
    if (followPlayheadEnabled) {
        const scrollContainer = document.getElementById('timelineScrollContainer');
        if (scrollContainer) {
            const containerWidth = scrollContainer.clientWidth;
            const scrollPos = scrollContainer.scrollLeft;

            if (pixelPosition > scrollPos + containerWidth - 100) {
                scrollContainer.scrollLeft = pixelPosition - containerWidth / 2;
            } else if (pixelPosition < scrollPos + 100) {
                scrollContainer.scrollLeft = Math.max(0, pixelPosition - 100);
            }
        }
    }
}

// Scrub playhead (seek to position)
function scrubPlayhead(seconds) {
    transportPosition = Math.max(0, seconds);

    if (transportState === TransportState.PLAYING) {
        transportStartTime = audioContext.currentTime - transportPosition;
    } else {
        transportPausePosition = transportPosition;
    }

    updateTransportTimecode();
    updatePlayheadPosition();
}

// ========== TEMPO AUTOMATION ==========

function addTempoPoint(bar, bpm) {
    // Remove existing point at this bar
    tempoPoints = tempoPoints.filter(tp => tp.bar !== bar);

    // Add new point
    tempoPoints.push({bar, bpm, curve: 'instant'});
    tempoPoints.sort((a, b) => a.bar - b.bar);

    drawTempoLane();
}

function removeTempoPoint(bar) {
    tempoPoints = tempoPoints.filter(tp => tp.bar !== bar);
    drawTempoLane();
}

function clearTempoPoints() {
    tempoPoints = [];
    drawTempoLane();
}

function drawTempoLane() {
    if (!tempoLaneCanvas) return;

    const canvas = tempoLaneCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 5; i++) {
        const y = (height / 5) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Draw tempo line
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const pixelsPerBar = 80;
    const minBPM = MIN_BPM;
    const maxBPM = MAX_BPM;

    // Draw baseline at current BPM
    const baselineY = height - ((currentBPM - minBPM) / (maxBPM - minBPM)) * height;
    ctx.moveTo(0, baselineY);

    // Draw tempo points
    for (const point of tempoPoints) {
        const x = point.bar * pixelsPerBar;
        const y = height - ((point.bpm - minBPM) / (maxBPM - minBPM)) * height;
        ctx.lineTo(x, y);
    }

    ctx.stroke();

    // Draw tempo point markers
    ctx.fillStyle = '#00ff00';
    for (const point of tempoPoints) {
        const x = point.bar * pixelsPerBar;
        const y = height - ((point.bpm - minBPM) / (maxBPM - minBPM)) * height;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Draw BPM label
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.fillText(`${point.bpm} BPM`, x + 8, y - 8);
        ctx.fillStyle = '#00ff00';
    }
}

// ========== TIME SIGNATURE CHANGES ==========

function addTimeSigChange(bar, numerator, denominator) {
    timeSigChanges = timeSigChanges.filter(ts => ts.bar !== bar);
    timeSigChanges.push({bar, numerator, denominator});
    timeSigChanges.sort((a, b) => a.bar - b.bar);
}

function clearTimeSigChanges() {
    timeSigChanges = [];
}

// ========== MARKERS & REGIONS ==========

function addMarker(name, positionBars, color) {
    const colorToUse = color || markerColors[markers.length % markerColors.length];
    markers.push({name, position: positionBars, color: colorToUse});
    markers.sort((a, b) => a.position - b.position);
    renderMarkers();
}

function removeMarker(index) {
    markers.splice(index, 1);
    renderMarkers();
}

function jumpToMarker(index) {
    if (index < 0 || index >= markers.length) return;
    const marker = markers[index];
    scrubPlayhead(barsToSeconds(marker.position));
}

function renderMarkers() {
    const container = document.getElementById('timelineMarkersContainer');
    if (!container) return;

    container.innerHTML = '';
    const pixelsPerBar = 80;

    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const div = document.createElement('div');
        div.className = 'timeline-marker';
        div.style.position = 'absolute';
        div.style.left = (marker.position * pixelsPerBar) + 'px';
        div.style.top = '0';
        div.style.width = '2px';
        div.style.height = '100%';
        div.style.background = marker.color;
        div.style.cursor = 'pointer';
        div.title = marker.name;

        const label = document.createElement('div');
        label.textContent = marker.name;
        label.style.position = 'absolute';
        label.style.bottom = '100%';
        label.style.left = '4px';
        label.style.fontSize = '10px';
        label.style.color = marker.color;
        label.style.whiteSpace = 'nowrap';
        label.style.pointerEvents = 'none';
        div.appendChild(label);

        div.addEventListener('click', () => jumpToMarker(i));
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (confirm(`Delete marker "${marker.name}"?`)) {
                removeMarker(i);
            }
        });

        container.appendChild(div);
    }
}
