# DAW Audio Infrastructure - Implementation Guide

## Overview

This implementation adds professional DAW-style core audio infrastructure to Ultimate Synthesia Online, including:

1. **Audio Bus System** - Master bus + 4 auxiliary buses using GainNodes
2. **Signal Routing Matrix** - Flexible routing of tracks to different buses
3. **Track Architecture** - 16 professional audio tracks with individual controls
4. **Effects Chain System** - Chain multiple effects per track with bypass capability
5. **Audio Graph Manager** - Centralized management of complex Web Audio node connections
6. **Latency Compensation** - Basic Plugin Delay Compensation (PDC)

All features are implemented using vanilla JavaScript and Web Audio API only, with no external dependencies.

---

## Features Implemented

### 1. Audio Bus System (`AudioBusSystem` class)

**Master Bus:**
- Single master output bus with input, fader, output, and analyser nodes
- Chain: `input -> [effects] -> fader -> output -> analyser -> destination`
- Connects to existing `masterGain` infrastructure

**Auxiliary Buses (4 buses):**
- Aux 1-4: Each with input, fader, output, analyser, and return-to-master gain
- Used for effects sends (reverb, delay, etc.)
- Chain: `input -> [effects] -> fader -> output -> return -> master`
- Configurable send/return levels

**Methods:**
- `setMasterVolume(value)` - Control master bus volume
- `setAuxSendLevel(auxId, value)` - Control aux bus fader
- `setAuxReturnLevel(auxId, value)` - Control how much aux returns to master
- `addEffectToAuxBus(auxId, effectDefinition)` - Add effects to aux buses

### 2. Track Architecture (`Track` class)

Each track includes:
- **Input/Output nodes:** Clean separation of concerns
- **Pre-fader gain:** For aux sends
- **Pan control:** StereoPanner (-1 to 1, left to right)
- **Fader:** Main volume control
- **Effects chain:** Series of effects processors
- **Delay compensation:** For latency alignment
- **Analyser:** For future VU metering

**Signal Flow:**
```
input -> preGain -> [effects] -> pan -> fader -> delayComp -> output
```

**Track State:**
- Mute/Solo capability
- Armed status (for future recording)
- Volume and pan controls
- Effects bypass states

**Methods:**
- `addEffect(effectDefinition)` - Add an effect to the chain
- `removeEffect(index)` - Remove an effect
- `toggleEffectBypass(index)` - Bypass/unbypass an effect
- `setVolume(value)` - Set track fader level
- `setPan(value)` - Set stereo pan position
- `setMute(muted)` - Mute/unmute track
- `rebuildSignalChain()` - Reconnect all nodes (called automatically)
- `recalculateLatency()` - Update latency compensation

### 3. Signal Routing Matrix

**Routing Capabilities:**
- Each track connects to the master bus by default
- Each track has 4 aux send controls (0-1 range)
- Aux sends are post-fader (after track volume)
- Multiple tracks can send to the same aux bus
- Aux buses return to the master bus input

**Bus Routing Structure:**
```
Track 1 ──┬──> Master Bus ──> [existing masterGain/limiter]
Track 2 ──┤
...       │
Track 16 ─┤
          │
          ├──> Aux 1 (e.g., Reverb) ──> Master Bus
          ├──> Aux 2 (e.g., Delay) ───> Master Bus
          ├──> Aux 3 ──> Master Bus
          └──> Aux 4 ──> Master Bus
```

### 4. Effects Chain System

**Built-in Effects:**

1. **Compressor**
   - Parameters: threshold, knee, ratio, attack, release
   - Uses Web Audio DynamicsCompressor
   - Latency: 128 samples

2. **3-Band EQ**
   - Low shelf, parametric mid, high shelf
   - Parameters: lowFreq, lowGain, midFreq, midQ, midGain, highFreq, highGain
   - Uses BiquadFilter nodes
   - Latency: 0 samples

3. **Delay**
   - Parameters: time (delay time), feedback, mix (wet/dry)
   - Feedback loop for repeating echoes
   - Latency: Varies with delay time

4. **Reverb**
   - Generated impulse response convolution
   - Parameters: duration, decay, mix
   - Latency: 512 samples

5. **Gain**
   - Simple volume adjustment
   - Parameter: amount
   - Latency: 0 samples

**Effect Definition Structure:**
```javascript
{
    type: 'compressor',        // Effect type
    input: AudioNode,          // Input node
    output: AudioNode,         // Output node
    bypassed: false,           // Bypass state
    latency: 128,              // Latency in samples
    params: {},                // Effect parameters
    node/nodes: {}             // Internal nodes
}
```

**Chain Management:**
- Effects are processed in series
- Bypassed effects are skipped in the signal chain
- Adding/removing effects triggers automatic chain rebuild
- Latency is recalculated after any chain change

### 5. Audio Graph Manager (`AudioGraphManager` class)

**Centralized Control:**
- Manages the entire audio routing system
- Creates and connects all buses and tracks
- Provides a unified API for the audio graph

**Methods:**
- `initialize(numAuxBuses, numTracks)` - Set up the system
- `connectToExistingInfrastructure(masterGain)` - Connect to existing audio path
- `addEffectToTrack(trackId, effectType, params)` - Add effect to a track
- `addEffectToAuxBus(auxId, effectType, params)` - Add effect to aux bus
- `getGraphInfo()` - Get detailed info about the current state

**Usage Example:**
```javascript
// System is initialized automatically in initAudio()
// Access via global variables:
audioGraphManager.addEffectToTrack(0, 'reverb', { mix: 0.3, decay: 2.0 });
trackManager.setTrackVolume(0, 0.8);
trackManager.setAuxSend(0, 0, 0.5); // Track 0, Aux 0, 50% send
```

### 6. Track Manager (`TrackManager` class)

**Manages All Tracks:**
- Creates and initializes all tracks
- Handles solo/mute logic
- Manages aux send routing
- Applies latency compensation

**Solo Logic:**
- When any track is soloed, all non-soloed tracks are muted
- Multiple tracks can be soloed simultaneously
- Soloed tracks respect their individual mute state
- Unsoloing all tracks restores normal mute states

**Methods:**
- `getTrack(id)` - Get track by ID
- `setTrackVolume(trackId, value)` - Set track volume
- `setTrackPan(trackId, value)` - Set track pan
- `setTrackMute(trackId, muted)` - Mute/unmute track
- `setTrackSolo(trackId, soloed)` - Solo/unsolo track
- `setAuxSend(trackId, auxId, value)` - Set aux send level
- `applyLatencyCompensation()` - Calculate and apply PDC

### 7. Latency Compensation (PDC)

**Plugin Delay Compensation:**
- Automatically calculates latency for each track's effects chain
- Finds the maximum latency across all tracks
- Applies delay compensation to align all tracks
- Uses delay nodes for sample-accurate alignment

**How It Works:**
1. Each effect reports its latency in samples
2. Track calculates total latency: `sum(effect.latency)` for non-bypassed effects
3. TrackManager finds max latency across all tracks
4. Each track gets compensated: `delay = maxLatency - trackLatency`
5. DelayNode applies the compensation

**Latency Values:**
- Compressor: 128 samples (lookahead)
- Reverb: 512 samples (convolver)
- Delay: Variable (based on delay time)
- EQ: 0 samples
- Gain: 0 samples

---

## Integration Instructions

### Method 1: Include as External Script (Recommended)

1. Add this line to `index.html` in the `<head>` section, **after** the existing stylesheet:

```html
<script src="daw-audio-infrastructure.js"></script>
```

2. In the JavaScript section of `index.html`, find the `initAudio()` function (around line 415-457)

3. Add this line **at the end** of the `initAudio()` function, right before the closing brace:

```javascript
// Initialize DAW core audio infrastructure
initDAWAudioInfrastructure();
```

The modified `initAudio()` function should end like this:

```javascript
function initAudio() {
    if(audioContext) return;
    audioContext = new AudioContextGlobal();
    createNoiseBuffers(); createMetronomeClickBuffer();

    // ... existing audio initialization code ...

    visualizerCanvas = document.getElementById('visualizerCanvas');
    visualizerContext = visualizerCanvas.getContext('2d');
    resizeCanvas();
    visualize();
    setupMIDI();
    if (synthesiaToggle.checked) createSynthesiaGrid();

    // Initialize DAW core audio infrastructure
    initDAWAudioInfrastructure();
}
```

### Method 2: Inline Integration

If you prefer not to use an external file:

1. Open `index.html`
2. Find the `initAudio()` function
3. Paste the entire contents of `daw-audio-infrastructure.js` **after** the `initAudio()` function
4. Add the initialization call at the end of `initAudio()` (as shown above)

---

## User Interface Controls

The system automatically creates a new control panel section titled **"DAW Audio Infrastructure"** with these controls:

### Track Controls
- **Active Track** - Dropdown to select which track to control (Track 1-16)
- **Track Volume** - Slider (0-1) to control selected track's fader
- **Track Pan** - Slider (-1 to 1) for stereo panning (left/center/right)
- **Mute** - Checkbox to mute the selected track
- **Solo** - Checkbox to solo the selected track

### Aux Sends
- **Aux 1-4 Send** - Sliders (0-1) to control send levels from selected track to each aux bus

### Effects Chain
- **Add Effect** - Dropdown to select effect type:
  - Compressor
  - 3-Band EQ
  - Delay
  - Reverb
  - Gain
- **Add Effect to Track** - Button to add the selected effect
- **Effects List** - Display showing all effects on the selected track with latency info

### Bus Controls
- **Aux 1-2 Return** - Sliders to control how much each aux bus returns to master

### Debug
- **Show Audio Graph Info** - Button to display the current state of all tracks and buses

---

## How to Use the New Features

### Example 1: Basic Track Setup

```javascript
// Set volume for Track 1
trackManager.setTrackVolume(0, 0.8); // 80% volume

// Pan Track 1 to the left
trackManager.setTrackPan(0, -0.5); // 50% left

// Mute Track 2
trackManager.setTrackMute(1, true);
```

### Example 2: Adding Effects to a Track

```javascript
// Add a compressor to Track 1
audioGraphManager.addEffectToTrack(0, 'compressor', {
    threshold: -20,
    ratio: 4,
    attack: 0.005,
    release: 0.25
});

// Add EQ to Track 1
audioGraphManager.addEffectToTrack(0, 'eq3', {
    lowGain: 3,      // +3dB boost on lows
    midGain: -2,     // -2dB cut on mids
    highGain: 2      // +2dB boost on highs
});

// Add delay to Track 1
audioGraphManager.addEffectToTrack(0, 'delay', {
    time: 0.375,     // 375ms delay time
    feedback: 0.4,   // 40% feedback
    mix: 0.3         // 30% wet, 70% dry
});
```

### Example 3: Setting Up Aux Bus for Reverb

```javascript
// Add reverb effect to Aux Bus 1
audioGraphManager.addEffectToAuxBus(0, 'reverb', {
    duration: 3.0,   // 3 second reverb tail
    decay: 2.5,      // Decay rate
    mix: 1.0         // 100% wet (aux buses should be 100% wet)
});

// Send Track 1 to Aux 1 (reverb) at 30%
trackManager.setAuxSend(0, 0, 0.3);

// Send Track 2 to Aux 1 (reverb) at 50%
trackManager.setAuxSend(1, 0, 0.5);

// Control how much reverb returns to master
audioBusSystem.setAuxReturnLevel(0, 0.8); // 80% return level
```

### Example 4: Parallel Compression on Aux Bus

```javascript
// Add compressor to Aux Bus 2 for parallel compression
audioGraphManager.addEffectToAuxBus(1, 'compressor', {
    threshold: -30,
    ratio: 10,       // Heavy compression
    attack: 0.001,
    release: 0.1
});

// Send multiple tracks to the parallel compression bus
trackManager.setAuxSend(0, 1, 0.4); // Track 1 at 40%
trackManager.setAuxSend(1, 1, 0.4); // Track 2 at 40%
trackManager.setAuxSend(2, 1, 0.3); // Track 3 at 30%

// Blend in the parallel compression
audioBusSystem.setAuxReturnLevel(1, 0.5); // 50% blend
```

### Example 5: Solo and Mute Operations

```javascript
// Solo Track 1 (mutes all other tracks)
trackManager.setTrackSolo(0, true);

// Solo Track 2 as well (both Track 1 and 2 are now audible)
trackManager.setTrackSolo(1, true);

// Unsolo Track 1 (only Track 2 remains soloed)
trackManager.setTrackSolo(0, false);

// Unsolo Track 2 (all tracks return to normal)
trackManager.setTrackSolo(1, false);

// Mute Track 3
trackManager.setTrackMute(2, true);
```

### Example 6: Routing Your Synth Notes to a Track

To route the existing synthesizer notes through the track system, you'll need to modify the `playNote()` function. Instead of connecting directly to `filterNode` or `filterBypassGain`, connect to a track's input:

```javascript
// In playNote() function, replace:
// unit.mainNoteGain.connect(filterNode);
// or
// unit.mainNoteGain.connect(filterBypassGain);

// With:
const track = trackManager.getTrack(0); // Use Track 1
if (track) {
    unit.mainNoteGain.connect(track.input);
} else {
    // Fallback to existing routing if tracks aren't initialized
    unit.mainNoteGain.connect(filterBypassGain);
}
```

### Example 7: Inspecting the Audio Graph

```javascript
// Get detailed information about the audio graph
const info = audioGraphManager.getGraphInfo();
console.log(info);

// Output example:
// {
//   tracks: [
//     {
//       id: 0,
//       name: "Track 1",
//       muted: false,
//       soloed: false,
//       volume: 0.75,
//       pan: 0,
//       effects: 2,
//       latency: 640
//     },
//     ...
//   ],
//   buses: {
//     master: { volume: 0.7 },
//     aux: [
//       { id: 0, name: "Aux 1", volume: 0.75, return: 1.0 },
//       ...
//     ]
//   }
// }
```

---

## Signal Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DAW AUDIO INFRASTRUCTURE                       │
└─────────────────────────────────────────────────────────────────────┘

[Audio Source] (playNote, etc.)
    │
    ▼
┌───────────────────┐
│   Track 1 Input   │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│     Pre-Gain      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Effects Chain    │
│  ┌─────────────┐  │
│  │ Compressor  │  │
│  └──────┬──────┘  │
│         ▼         │
│  ┌─────────────┐  │
│  │     EQ      │  │
│  └──────┬──────┘  │
│         ▼         │
│  ┌─────────────┐  │
│  │   Delay     │  │
│  └──────┬──────┘  │
└─────────┼─────────┘
          │
          ▼
┌───────────────────┐
│    Panner         │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│   Track Fader     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Delay Comp (PDC)  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Track Output     │
└────┬─────────┬────┘
     │         │
     │         ├──> Aux Send 1 ──> [Aux Bus 1 (Reverb)] ──┐
     │         ├──> Aux Send 2 ──> [Aux Bus 2 (Delay)]  ──┤
     │         ├──> Aux Send 3 ──> [Aux Bus 3]           ──┤
     │         └──> Aux Send 4 ──> [Aux Bus 4]           ──┤
     │                                                      │
     ▼                                                      │
┌───────────────────┐                                      │
│  Master Bus Input │ <────────────────────────────────────┘
└─────────┬─────────┘          (Aux Returns)
          │
          ▼
┌───────────────────┐
│ Master Bus Fader  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Master Bus Output │
└─────────┬─────────┘
          │
          ▼
[Existing masterGain -> masterLimiter -> analyser -> destination]
```

---

## Code Structure

### Files
- `/home/user/Ultimate-Synthesia-Online/daw-audio-infrastructure.js` - Main implementation
- `/home/user/Ultimate-Synthesia-Online/index.html` - Integration point

### Classes
- `Track` - Individual audio track
- `AudioBusSystem` - Bus management (master + aux)
- `TrackManager` - Multi-track management
- `AudioGraphManager` - Top-level coordinator

### Global Variables
- `audioGraphManager` - Main manager instance
- `audioBusSystem` - Bus system reference
- `trackManager` - Track manager reference

### Functions
- `initDAWAudioInfrastructure()` - Initialize the entire system
- `createDAWInfrastructureUI()` - Create UI controls
- `setupDAWControlEvents()` - Wire up UI event handlers

---

## Limitations and Known Issues

### Current Limitations:
1. **No effect parameter adjustment after creation** - Effects must be removed and re-added with new parameters
2. **No effect reordering** - Effects are processed in the order they're added
3. **Limited effect types** - Only 5 built-in effects (can be extended)
4. **No track recording** - Tracks are set up for playback only (recording infrastructure can be added)
5. **No automation** - No parameter automation over time (can be implemented with AudioParam scheduling)
6. **No track grouping** - No bus groups or folder tracks (can be added)
7. **Simple reverb** - Uses basic convolution, not a sophisticated reverb algorithm

### Performance Considerations:
- Each track creates ~8-10 audio nodes
- 16 tracks = ~160 audio nodes total
- Effects add 2-5 nodes per effect
- Modern browsers can handle hundreds of nodes easily
- Mobile devices may have lower limits

### Browser Compatibility:
- **StereoPanner**: Not supported in older browsers (graceful fallback included)
- **Web Audio API**: Required (Chrome, Firefox, Safari, Edge modern versions)
- **ES6 Classes**: Required (no IE11 support)

---

## Extending the System

### Adding New Effect Types

Add to the `effectsLibrary` in `initializeEffectsLibrary()`:

```javascript
'distortion': (params = {}) => {
    const waveshaper = this.ctx.createWaveShaper();
    waveshaper.curve = makeDistortionCurve(params.amount || 50);
    waveshaper.oversample = '4x';

    return {
        type: 'distortion',
        input: waveshaper,
        output: waveshaper,
        bypassed: false,
        latency: 0,
        params: params,
        node: waveshaper
    };
}
```

### Adding More Aux Buses

Change the initialization parameter:

```javascript
audioGraphManager.initialize(8, 16); // 8 aux buses, 16 tracks
```

And update the UI to add controls for the additional buses.

### Implementing Track Recording

Tracks already have an `armed` property. To implement recording:

1. Create a `MediaRecorder` or use a `ScriptProcessorNode`/`AudioWorkletNode`
2. Connect the track's output to the recorder when armed
3. Store the recorded data
4. Play back through the track's input

---

## Testing the Implementation

### Quick Test Script

Open the browser console and run:

```javascript
// Check if infrastructure is initialized
console.log('Audio Graph Manager:', audioGraphManager);
console.log('Track Manager:', trackManager);
console.log('Bus System:', audioBusSystem);

// Get graph info
console.log(audioGraphManager.getGraphInfo());

// Test track volume
trackManager.setTrackVolume(0, 0.5);
console.log('Track 1 volume set to 0.5');

// Add an effect
audioGraphManager.addEffectToTrack(0, 'compressor', { threshold: -20 });
console.log('Added compressor to Track 1');

// Check updated info
console.log(audioGraphManager.getGraphInfo());
```

---

## Performance Monitoring

To monitor the audio graph performance:

```javascript
// Check current time (should be steadily increasing)
console.log('Audio Context Time:', audioContext.currentTime);

// Check for glitches or underruns
// (Modern browsers don't expose this, but you can monitor CPU usage in dev tools)

// Get track analyser data for level monitoring
const track = trackManager.getTrack(0);
const dataArray = new Uint8Array(track.analyser.frequencyBinCount);
track.analyser.getByteTimeDomainData(dataArray);
console.log('Track 1 audio data:', dataArray);
```

---

## Troubleshooting

### Issue: No audio output after integration
**Solution:** Check that `initDAWAudioInfrastructure()` is being called and that tracks are connected. Use the graph info button to inspect connections.

### Issue: High latency or audio glitches
**Solution:** Reduce the number of effects, especially reverb. Consider increasing browser audio buffer size.

### Issue: Effects not working
**Solution:** Verify effect parameters are valid. Check browser console for errors.

### Issue: UI not appearing
**Solution:** Ensure `createDAWInfrastructureUI()` is called after DOM is loaded. Check for CSS conflicts.

### Issue: Panic button doesn't stop DAW tracks
**Solution:** The DAW infrastructure is separate from the main synth. You may need to add track stopping logic to `emergencyStopAllSounds()`.

---

## Future Enhancements

Possible additions to the infrastructure:

1. **Track recording and playback** - Record audio into tracks
2. **Automation lanes** - Automate volume, pan, effect parameters
3. **Track grouping** - Folder tracks and bus groups
4. **Sidechain compression** - Key input from other tracks
5. **More effects** - Chorus, flanger, phaser, distortion, bitcrusher
6. **Effect preset system** - Save and load effect chains
7. **Track templates** - Pre-configured track setups
8. **VU meters** - Visual feedback for track levels
9. **Track freeze** - Render tracks to audio to save CPU
10. **Send/return routing flexibility** - Pre/post fader sends
11. **Instrument tracks vs. audio tracks** - Different track types
12. **MIDI routing** - Route MIDI to specific tracks

---

## License

This implementation is part of Ultimate Synthesia Online and follows the same license as the main project.

---

## Support

For issues or questions:
1. Check the browser console for error messages
2. Use `audioGraphManager.getGraphInfo()` to inspect state
3. Verify audio context is running: `audioContext.state === 'running'`
4. Test with a simple track setup before adding complex routing

---

**Implementation Date:** 2025-11-08
**Version:** 1.0
**Compatibility:** Modern browsers with Web Audio API support
