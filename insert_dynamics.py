#!/usr/bin/env python3
"""
Script to insert Dynamics Effects section into Ultimate Synthesia Online
"""

html_to_insert = '''
                <div class="control-group" id="dynamics-effects-group">
                    <div class="control-title">Dynamics Effects <label class="switch"> <input type="checkbox" id="enableDynamicsEffects" checked> <span class="slider-switch"></span> </label> </div>
                    <div id="dynamics-effects-controls">

                        <!-- Multi-band Compressor -->
                        <div class="dynamics-effect-section">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong>Multi-band Compressor</strong>
                                <button class="std-button" id="mbcBypass" style="font-size: 0.8em; padding: 3px 8px;">Bypass</button>
                            </div>
                            <label>Preset <select id="mbcPreset">
                                <option value="none">None</option>
                                <option value="gentle">Gentle Master</option>
                                <option value="aggressive">Aggressive Pump</option>
                                <option value="broadcast">Broadcast Ready</option>
                            </select></label>
                            <div style="margin-top: 8px; font-size: 0.9em; color: var(--text-muted-color);">Low Band (20-250Hz)</div>
                            <label>Threshold <input type="range" id="mbcLowThreshold" min="-60" max="0" step="1" value="-24" class="horizontal-slider" /></label>
                            <label>Ratio <input type="range" id="mbcLowRatio" min="1" max="20" step="0.5" value="3" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px; font-size: 0.9em; color: var(--text-muted-color);">Mid Band (250Hz-5kHz)</div>
                            <label>Threshold <input type="range" id="mbcMidThreshold" min="-60" max="0" step="1" value="-20" class="horizontal-slider" /></label>
                            <label>Ratio <input type="range" id="mbcMidRatio" min="1" max="20" step="0.5" value="4" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px; font-size: 0.9em; color: var(--text-muted-color);">High Band (5kHz-20kHz)</div>
                            <label>Threshold <input type="range" id="mbcHighThreshold" min="-60" max="0" step="1" value="-18" class="horizontal-slider" /></label>
                            <label>Ratio <input type="range" id="mbcHighRatio" min="1" max="20" step="0.5" value="6" class="horizontal-slider" /></label>
                            <label>Attack (ms) <input type="range" id="mbcAttack" min="0.1" max="100" step="0.1" value="5" class="horizontal-slider" /></label>
                            <label>Release (ms) <input type="range" id="mbcRelease" min="10" max="1000" step="10" value="100" class="horizontal-slider" /></label>
                            <label>Makeup Gain (dB) <input type="range" id="mbcMakeup" min="0" max="24" step="0.5" value="0" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px;">
                                <span style="font-size: 0.85em;">GR: </span>
                                <canvas id="mbcMeter" width="200" height="20" style="border: 1px solid var(--border-color); vertical-align: middle;"></canvas>
                            </div>
                        </div>

                        <hr style="border-color: var(--border-color); margin: 15px 0;" />

                        <!-- Advanced Limiter -->
                        <div class="dynamics-effect-section">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong>Advanced Limiter</strong>
                                <button class="std-button" id="limiterBypass" style="font-size: 0.8em; padding: 3px 8px;">Bypass</button>
                            </div>
                            <label>Preset <select id="limiterPreset">
                                <option value="none">None</option>
                                <option value="transparent">Transparent -0.3dB</option>
                                <option value="loud">Loud Master</option>
                                <option value="brickwall">Brick-wall -0.1dB</option>
                            </select></label>
                            <label>Threshold (dB) <input type="range" id="limiterThreshold" min="-20" max="0" step="0.1" value="-1" class="horizontal-slider" /></label>
                            <label>Release (ms) <input type="range" id="limiterRelease" min="1" max="1000" step="1" value="50" class="horizontal-slider" /></label>
                            <label>Knee (dB) <input type="range" id="limiterKnee" min="0" max="6" step="0.1" value="0" class="horizontal-slider" /></label>
                            <label>Makeup Gain (dB) <input type="range" id="limiterMakeup" min="0" max="12" step="0.5" value="0" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px;">
                                <span style="font-size: 0.85em;">GR: </span>
                                <canvas id="limiterMeter" width="200" height="20" style="border: 1px solid var(--border-color); vertical-align: middle;"></canvas>
                            </div>
                        </div>

                        <hr style="border-color: var(--border-color); margin: 15px 0;" />

                        <!-- Noise Gate -->
                        <div class="dynamics-effect-section">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong>Noise Gate</strong>
                                <button class="std-button" id="gateBypass" style="font-size: 0.8em; padding: 3px 8px;">Bypass</button>
                            </div>
                            <label>Preset <select id="gatePreset">
                                <option value="none">None</option>
                                <option value="subtle">Subtle Cleanup</option>
                                <option value="hard">Hard Gate</option>
                                <option value="synth">Synth Staccato</option>
                            </select></label>
                            <label>Threshold (dB) <input type="range" id="gateThreshold" min="-96" max="0" step="1" value="-60" class="horizontal-slider" /></label>
                            <label>Attack (ms) <input type="range" id="gateAttack" min="0.1" max="100" step="0.1" value="1" class="horizontal-slider" /></label>
                            <label>Release (ms) <input type="range" id="gateRelease" min="1" max="1000" step="1" value="100" class="horizontal-slider" /></label>
                            <label>Hold (ms) <input type="range" id="gateHold" min="0" max="500" step="1" value="10" class="horizontal-slider" /></label>
                            <label>Range (dB) <input type="range" id="gateRange" min="-96" max="0" step="1" value="-96" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px;">
                                <span style="font-size: 0.85em;">Gate: </span>
                                <canvas id="gateMeter" width="200" height="20" style="border: 1px solid var(--border-color); vertical-align: middle;"></canvas>
                            </div>
                        </div>

                        <hr style="border-color: var(--border-color); margin: 15px 0;" />

                        <!-- Transient Shaper -->
                        <div class="dynamics-effect-section">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong>Transient Shaper</strong>
                                <button class="std-button" id="transientBypass" style="font-size: 0.8em; padding: 3px 8px;">Bypass</button>
                            </div>
                            <label>Preset <select id="transientPreset">
                                <option value="none">None</option>
                                <option value="punchier">Punchier Attack</option>
                                <option value="softer">Softer Attack</option>
                                <option value="sustain">More Sustain</option>
                            </select></label>
                            <label>Attack Gain (dB) <input type="range" id="transientAttack" min="-12" max="12" step="0.5" value="0" class="horizontal-slider" /></label>
                            <label>Sustain Gain (dB) <input type="range" id="transientSustain" min="-12" max="12" step="0.5" value="0" class="horizontal-slider" /></label>
                            <label>Fast Time (ms) <input type="range" id="transientFast" min="1" max="50" step="0.5" value="10" class="horizontal-slider" /></label>
                            <label>Slow Time (ms) <input type="range" id="transientSlow" min="10" max="500" step="5" value="100" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px;">
                                <span style="font-size: 0.85em;">Envelope: </span>
                                <canvas id="transientMeter" width="200" height="20" style="border: 1px solid var(--border-color); vertical-align: middle;"></canvas>
                            </div>
                        </div>

                        <hr style="border-color: var(--border-color); margin: 15px 0;" />

                        <!-- De-esser -->
                        <div class="dynamics-effect-section">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong>De-esser</strong>
                                <button class="std-button" id="deesserBypass" style="font-size: 0.8em; padding: 3px 8px;">Bypass</button>
                            </div>
                            <label>Preset <select id="deesserPreset">
                                <option value="none">None</option>
                                <option value="gentle">Gentle</option>
                                <option value="medium">Medium</option>
                                <option value="aggressive">Aggressive</option>
                            </select></label>
                            <label>Frequency (Hz) <input type="range" id="deesserFreq" min="2000" max="16000" step="100" value="7000" class="horizontal-slider" /></label>
                            <label>Q Factor <input type="range" id="deesserQ" min="0.5" max="10" step="0.1" value="2" class="horizontal-slider" /></label>
                            <label>Threshold (dB) <input type="range" id="deesserThreshold" min="-60" max="0" step="1" value="-30" class="horizontal-slider" /></label>
                            <label>Ratio <input type="range" id="deesserRatio" min="1" max="10" step="0.5" value="3" class="horizontal-slider" /></label>
                            <label>Attack (ms) <input type="range" id="deesserAttack" min="0.1" max="20" step="0.1" value="1" class="horizontal-slider" /></label>
                            <label>Release (ms) <input type="range" id="deesserRelease" min="10" max="500" step="5" value="50" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px;">
                                <span style="font-size: 0.85em;">GR: </span>
                                <canvas id="deesserMeter" width="200" height="20" style="border: 1px solid var(--border-color); vertical-align: middle;"></canvas>
                            </div>
                        </div>

                        <hr style="border-color: var(--border-color); margin: 15px 0;" />

                        <!-- Expander -->
                        <div class="dynamics-effect-section">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong>Expander</strong>
                                <button class="std-button" id="expanderBypass" style="font-size: 0.8em; padding: 3px 8px;">Bypass</button>
                            </div>
                            <label>Preset <select id="expanderPreset">
                                <option value="none">None</option>
                                <option value="gentle">Gentle Expansion</option>
                                <option value="dynamic">Dynamic Range</option>
                                <option value="expressive">Expressive</option>
                            </select></label>
                            <label>Threshold (dB) <input type="range" id="expanderThreshold" min="-60" max="0" step="1" value="-40" class="horizontal-slider" /></label>
                            <label>Ratio <input type="range" id="expanderRatio" min="1" max="10" step="0.1" value="2" class="horizontal-slider" /></label>
                            <label>Attack (ms) <input type="range" id="expanderAttack" min="0.1" max="50" step="0.1" value="5" class="horizontal-slider" /></label>
                            <label>Release (ms) <input type="range" id="expanderRelease" min="10" max="1000" step="10" value="200" class="horizontal-slider" /></label>
                            <label>Knee (dB) <input type="range" id="expanderKnee" min="0" max="12" step="1" value="6" class="horizontal-slider" /></label>
                            <div style="margin-top: 8px;">
                                <span style="font-size: 0.85em;">GR: </span>
                                <canvas id="expanderMeter" width="200" height="20" style="border: 1px solid var(--border-color); vertical-align: middle;"></canvas>
                            </div>
                        </div>

                    </div>
                </div>
'''

def main():
    with open('index.html', 'r') as f:
        content = f.read()

    # Find the insertion point (before Master & Settings)
    marker = '                <div class="control-group">\n                    <div class="control-title">Master & Settings</div>'

    if marker in content:
        # Insert before the marker
        content = content.replace(marker, html_to_insert + '\n' + marker)
        with open('index.html', 'w') as f:
            f.write(content)
        print("✓ Dynamics Effects UI section added successfully!")
    else:
        print("✗ Could not find insertion point")
        print("Trying alternative marker...")
        # Try to find filter-group end
        alt_marker = '                </div>\n\n                <div class="control-group">\n                    <div class="control-title">Master & Settings</div>'
        if alt_marker in content:
            content = content.replace(alt_marker, '                </div>\n\n' + html_to_insert + '\n\n                <div class="control-group">\n                    <div class="control-title">Master & Settings</div>')
            with open('index.html', 'w') as f:
                f.write(content)
            print("✓ Dynamics Effects UI section added successfully (alternative method)!")
        else:
            print("✗ Could not find suitable insertion point")

if __name__ == '__main__':
    main()
