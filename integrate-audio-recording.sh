#!/bin/bash
# Integration script for audio recording features

FILE="/home/user/Ultimate-Synthesia-Online/index.html"

echo "Integrating audio recording features into Ultimate Synthesia Online..."

# Step 1: Find where to add event listeners (in window.addEventListener('load') section)
# We need to add the audio input event listeners

# Find the closing of window.addEventListener('load')
LINE_NUM=$(grep -n "if(sE && audioContext && synthesiaContainer && synthesiaContainer.classList.contains('active')) createSynthesiaGrid();" "$FILE" | tail -1 | cut -d: -f1)

if [ -z "$LINE_NUM" ]; then
    echo "Error: Could not find insertion point"
    exit 1
fi

echo "Found insertion point at line $LINE_NUM"

# Create a temporary file with the additions
cat > /tmp/audio_event_listeners.txt << 'EOF'

                // Audio Input & Recording Event Listeners
                const audioInputButton = document.getElementById('enableAudioInputButton');
                if (audioInputButton) {
                    audioInputButton.addEventListener('click', () => {
                        if (audioInputEnabled) {
                            teardownAudioInput();
                        } else {
                            setupAudioInput();
                        }
                    });
                }

                const inputLevelSlider = document.getElementById('inputLevel');
                if (inputLevelSlider) {
                    inputLevelSlider.addEventListener('input', (e) => {
                        if (audioInputGain) {
                            audioInputGain.gain.value = parseFloat(e.target.value);
                        }
                    });
                }

                const directMonitoringToggle = document.getElementById('directMonitoring');
                if (directMonitoringToggle) {
                    directMonitoringToggle.addEventListener('change', (e) => {
                        if (monitorGain) {
                            const monitorLevel = parseFloat(document.getElementById('monitorLevel').value);
                            monitorGain.gain.value = e.target.checked ? monitorLevel : 0;
                        }
                    });
                }

                const monitorLevelSlider = document.getElementById('monitorLevel');
                if (monitorLevelSlider) {
                    monitorLevelSlider.addEventListener('input', (e) => {
                        if (monitorGain && document.getElementById('directMonitoring').checked) {
                            monitorGain.gain.value = parseFloat(e.target.value);
                        }
                    });
                }
EOF

# Insert after the found line
sed -i "${LINE_NUM}r /tmp/audio_event_listeners.txt" "$FILE"

echo "Added event listeners"

# Step 2: Find the closing script tag and insert the audio recording functions
SCRIPT_END=$(grep -n "</script>" "$FILE" | head -1 | cut -d: -f1)

if [ -z "$SCRIPT_END" ]; then
    echo "Error: Could not find closing script tag"
    exit 1
fi

echo "Found closing script tag at line $SCRIPT_END"

# Insert the audio recording functions before the closing script tag
INSERTION_LINE=$((SCRIPT_END - 1))

# Read the addon file and insert it
cat /home/user/Ultimate-Synthesia-Online/audio-recording-addon.js | grep -v "^//" | grep -v "^$" | sed '1,/^async function setupAudioInput/d' > /tmp/audio_funcs_clean.txt

# Insert with proper indentation
sed -i "${INSERTION_LINE}r /tmp/audio_funcs_clean.txt" "$FILE"

echo "Added audio recording functions"

echo "Integration complete!"
echo ""
echo "Note: You still need to modify the looper recording functions to call:"
echo "  - startAudioRecording(slotId) when audio input is enabled"
echo "  - stopAudioRecording(slotId) and saveAudioTake()"
echo "  - playAudioBuffer(slotId) instead of MIDI playback for audio mode"
echo "  - stopAudioPlayback(slotId) when stopping audio slots"
