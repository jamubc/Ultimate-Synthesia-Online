# Automation System - Quick Start Guide

## Getting Started with Automation

### 1. Opening the Automation Panel

1. Open `/home/user/Ultimate-Synthesia-Online/index.html` in your browser
2. Click the **"Show Automation"** button below the visualizer
3. The automation panel will expand, showing:
   - Transport controls (Play, Stop, Clear All)
   - Automation modes (Off, Read, Write, Touch, Latch)
   - Parameter selector
   - Visual automation lane (canvas)
   - LFO section

---

## Basic Automation Workflow

### Recording Automation (Write Mode)

**Step-by-step:**

1. Select **Write** mode
2. Choose a parameter from the dropdown (e.g., "Master Volume")
3. Click **Play** (▶) to start automation recording
4. Move the parameter slider/control (e.g., adjust master volume)
5. Your movements are recorded as breakpoints
6. Click **Stop** (⏹) to stop recording
7. Switch to **Read** mode
8. Click **Play** again to hear the automation playback

**Example: Creating a Volume Fade**
```
1. Select "Master Volume" from parameter dropdown
2. Set mode to "Write"
3. Click Play
4. Slowly move the Master Volume slider from 0.7 to 0.0 over 5 seconds
5. Click Stop
6. Switch to "Read" mode
7. Click Play - volume will automatically fade!
```

---

### Editing Automation (Visual Editor)

**Adding Points:**
- Set mode to **Write**, **Touch**, or **Latch** (not Off or Read)
- Click anywhere on the automation canvas
- A breakpoint is created at that time/value

**Moving Points:**
- Click and drag an existing breakpoint
- The curve updates in real-time

**Deleting Points:**
- Hold **Shift** and click on a breakpoint
- The point is removed

**Canvas Layout:**
- **X-axis**: Time (0-10 seconds by default, expands automatically)
- **Y-axis**: Parameter value (0% bottom, 100% top)
- **Grid**: 10×4 divisions for reference
- **Playhead**: Red vertical line shows current playback position

---

## Automation Modes Explained

### Off
- No automation recording or playback
- Manual control only
- **Use when**: You don't need automation

### Read
- Plays back existing automation
- Does NOT record new data
- Parameters follow automation curves
- **Use when**: You want to hear your automation without accidentally changing it

### Write
- **Continuously records** all parameter changes while playing
- Overwrites existing automation
- Records from Play until Stop
- **Use when**: Re-recording automation from scratch

### Touch
- Records **only while touching** a parameter
- Stops recording when you release the mouse
- Preserves existing automation between touches
- **Use when**: Making surgical edits to specific sections

### Latch
- Starts recording when you touch a parameter
- **Continues recording** even after you release
- Stops only when playback stops
- **Use when**: You want to set a value and have it hold

---

## Using LFOs (Low-Frequency Oscillators)

### What is an LFO?
An LFO automatically modulates (changes) a parameter rhythmically. Great for:
- Filter sweeps
- Tremolo (volume pulsing)
- Vibrato (pitch wobble)
- Rhythmic effects

### LFO Quick Setup

**Example: Filter Wobble Effect**

1. Locate **LFO 1** in the automation panel
2. Check the **LFO 1** enable checkbox
3. Set **Target** to "Filter Cutoff"
4. Set **Waveform** to "Sine"
5. Adjust **Rate** to ~2.00 Hz (2 cycles per second)
6. Adjust **Depth** to 0.7 (70% modulation)
7. Play some notes - the filter will sweep automatically!

### LFO Parameters

**Target** – Which parameter to modulate
- Options: Master Volume, Filter Cutoff/Resonance, Osc Levels, Detune

**Waveform** – Shape of modulation
- **Sine**: Smooth, round modulation (classic wobble)
- **Triangle**: Linear up/down ramps
- **Square**: Abrupt on/off switching
- **Sawtooth**: Linear ramp with instant reset
- **Random**: Sample-and-hold random values

**Rate** (0.01 - 20 Hz)
- How fast the LFO cycles
- 1 Hz = 1 cycle per second
- Lower = slower modulation
- Higher = faster modulation

**Depth** (0 - 1)
- How much the LFO affects the parameter
- 0 = no modulation
- 1 = full range modulation
- Example: Depth 0.5 on filter = ±50% cutoff range

**Phase** (0-360°)
- Starting position in the waveform cycle
- 0° = start at beginning
- 180° = start at opposite phase
- Useful for offsetting multiple LFOs

### LFO Examples

**Tremolo Effect (Volume Pulsing):**
```
LFO 1:
- Target: Master Volume
- Waveform: Sine
- Rate: 4.00 Hz
- Depth: 0.4
- Phase: 0°
```

**Filter Sweep:**
```
LFO 1:
- Target: Filter Cutoff
- Waveform: Triangle
- Rate: 0.25 Hz (slow)
- Depth: 0.8
- Phase: 0°
```

**Vibrato (Pitch Wobble):**
```
LFO 1:
- Target: Osc 1 Detune
- Waveform: Sine
- Rate: 5.00 Hz
- Depth: 0.3
- Phase: 0°
```

**Random Filter Jumps:**
```
LFO 1:
- Target: Filter Cutoff
- Waveform: Random
- Rate: 8.00 Hz
- Depth: 0.6
- Phase: 0°
```

---

## Automatable Parameters

| Parameter | Range | Use Case | Log Scale |
|-----------|-------|----------|-----------|
| **Master Volume** | 0-1 | Fades, ducking | No |
| **Filter Cutoff** | 20-20000 Hz | Filter sweeps, wah effects | Yes |
| **Filter Resonance** | 0.001-30 | Resonance modulation | No |
| **Oscillator 1 Level** | 0-1 | Oscillator balance | No |
| **Oscillator 2 Level** | 0-1 | Oscillator balance | No |
| **Sub Oscillator Level** | 0-1 | Sub bass amount | No |
| **Oscillator 1 Detune** | -100 to +100 cents | Vibrato, pitch bends | No |
| **ADSR Attack** | 0.001-2 s | Envelope shaping | No |
| **ADSR Decay** | 0.001-2 s | Envelope shaping | No |
| **ADSR Sustain** | 0-1 | Envelope shaping | No |
| **ADSR Release** | 0.001-5 s | Envelope shaping | No |

**Note:** Filter Cutoff uses logarithmic scaling for natural-sounding frequency sweeps.

---

## Tips & Tricks

### 1. Smooth Automation
- Use **Read** mode to play back automation without accidental edits
- Use **Touch** mode for precise, localized edits

### 2. Complex Modulation
- Use LFO 1 on filter cutoff
- Use LFO 2 on filter resonance
- Creates evolving, complex timbres

### 3. Rhythmic Effects
- Set LFO rate to match your BPM
- Example: 120 BPM = 2 Hz (120÷60)
- Creates tempo-synced modulation

### 4. Phase Offset
- If using 2 LFOs on related parameters
- Offset Phase by 90° or 180°
- Creates more interesting movement

### 5. Saving Your Work
- Currently, automation is session-based only
- Record/export audio to preserve automation
- Future: Export/import automation data

### 6. Visual Editing Workflow
- Click **Show Automation** to expand panel
- Switch parameter dropdown to see different automation lanes
- Use visual editor for precise, detailed control
- Use **Shift+Click** to delete unwanted points

### 7. Combining Automation & LFO
- Record automation on one parameter (e.g., volume)
- Enable LFO on another parameter (e.g., filter)
- Creates layered, professional-sounding modulation

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Delete automation point | Shift + Click on point |
| Toggle automation panel | Click "Show/Hide Automation" button |

---

## Troubleshooting

**Q: Automation not recording?**
- Check that mode is set to **Write**, **Touch**, or **Latch** (not Off or Read)
- Ensure **Play** button is active during parameter changes
- Verify the correct parameter is selected in dropdown

**Q: LFO not working?**
- Check that **LFO Enable** checkbox is checked
- Ensure a **Target** parameter is selected (not "None")
- Verify **Depth** is above 0
- Make sure audio context is initialized (play a note first)

**Q: Automation playback sounds choppy?**
- This shouldn't happen with AudioParam scheduling
- Try clearing browser cache
- Check browser console for errors

**Q: Can't see automation curve?**
- Make sure automation panel is expanded (click "Show Automation")
- Verify you're viewing the correct parameter in dropdown
- Check that breakpoints exist for that parameter

**Q: LFO too extreme?**
- Reduce **Depth** slider
- Try a smoother waveform (Sine instead of Square)
- Lower the **Rate** for slower modulation

---

## Advanced Techniques

### Creating a Filter Sweep Build-Up

1. Select **Filter Cutoff** parameter
2. Set mode to **Write**
3. Click **Play**
4. Slowly move filter cutoff from low (500 Hz) to high (10000 Hz) over 8 seconds
5. Click **Stop**
6. Add **LFO 1**:
   - Target: Filter Resonance
   - Waveform: Sine
   - Rate: 0.5 Hz
   - Depth: 0.4
7. Result: Dramatic filter sweep with evolving resonance!

### Creating Rhythmic Gating

1. Select **Master Volume** parameter
2. Enable **LFO 1**:
   - Target: Master Volume
   - Waveform: Square
   - Rate: 4.00 Hz (matches 16th notes at 120 BPM)
   - Depth: 1.0
3. Result: Rhythmic gating effect!

### Creating Evolving Pads

1. **LFO 1** on Filter Cutoff:
   - Waveform: Triangle
   - Rate: 0.1 Hz (very slow)
   - Depth: 0.6

2. **LFO 2** on Oscillator 1 Detune:
   - Waveform: Sine
   - Rate: 0.25 Hz
   - Depth: 0.3

3. Set long **ADSR** attack (1.0s) and release (2.0s)
4. Result: Lush, evolving pad sound!

---

## Next Steps

1. **Experiment with different waveforms** in LFOs
2. **Combine automation and LFOs** on different parameters
3. **Try extreme settings** to understand parameter ranges
4. **Record your automation** and play it back in Read mode
5. **Use visual editing** to fine-tune automation curves
6. **Create presets** by documenting your favorite LFO settings

---

## Summary

The automation system provides:
- ✅ **5 automation modes** for flexible workflow
- ✅ **Visual editing** with click-to-add breakpoints
- ✅ **11 automatable parameters** covering all synthesis controls
- ✅ **2 independent LFOs** with 5 waveforms each
- ✅ **Sample-accurate playback** using Web Audio API
- ✅ **Real-time modulation** for expressive performances

Happy automating! 🎛️🎵
