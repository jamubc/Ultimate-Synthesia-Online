#!/usr/bin/env python3
"""
Complete insertion of dynamics effects implementation
"""

import re

# Read the implementation
with open('dynamics_implementation.js', 'r') as f:
    implementation_code = f.read()

# Event handlers and initialization code
event_handlers = '''
            // ============================================================================
            // DYNAMICS EFFECTS EVENT HANDLERS
            // ============================================================================

            function setupDynamicsEventHandlers() {
                // Enable/Disable toggle
                const enableDynamicsToggle = document.getElementById('enableDynamicsEffects');
                if (enableDynamicsToggle) {
                    enableDynamicsToggle.addEventListener('change', (e) => {
                        dynamicsEffectsEnabled = e.target.checked;
                        const controls = document.getElementById('dynamics-effects-controls');
                        if (controls) controls.style.display = e.target.checked ? 'block' : 'none';
                    });
                }

                // Multi-band Compressor
                ['mbcLowThreshold', 'mbcLowRatio', 'mbcMidThreshold', 'mbcMidRatio',
                 'mbcHighThreshold', 'mbcHighRatio', 'mbcAttack', 'mbcRelease', 'mbcMakeup'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', updateMBCParams);
                });

                const mbcPresetSelect = document.getElementById('mbcPreset');
                if (mbcPresetSelect) {
                    mbcPresetSelect.addEventListener('change', (e) => {
                        if (e.target.value !== 'none') {
                            applyDynamicsPreset('mbc', e.target.value);
                        }
                    });
                }

                const mbcBypassBtn = document.getElementById('mbcBypass');
                if (mbcBypassBtn) {
                    mbcBypassBtn.addEventListener('click', () => toggleEffectBypass('mbc'));
                }

                // Advanced Limiter
                ['limiterThreshold', 'limiterRelease', 'limiterKnee', 'limiterMakeup'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', updateLimiterParams);
                });

                const limiterPresetSelect = document.getElementById('limiterPreset');
                if (limiterPresetSelect) {
                    limiterPresetSelect.addEventListener('change', (e) => {
                        if (e.target.value !== 'none') {
                            applyDynamicsPreset('limiter', e.target.value);
                        }
                    });
                }

                const limiterBypassBtn = document.getElementById('limiterBypass');
                if (limiterBypassBtn) {
                    limiterBypassBtn.addEventListener('click', () => toggleEffectBypass('limiter'));
                }

                // Noise Gate
                ['gateThreshold', 'gateAttack', 'gateRelease', 'gateHold', 'gateRange'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', updateGateParams);
                });

                const gatePresetSelect = document.getElementById('gatePreset');
                if (gatePresetSelect) {
                    gatePresetSelect.addEventListener('change', (e) => {
                        if (e.target.value !== 'none') {
                            applyDynamicsPreset('gate', e.target.value);
                        }
                    });
                }

                const gateBypassBtn = document.getElementById('gateBypass');
                if (gateBypassBtn) {
                    gateBypassBtn.addEventListener('click', () => toggleEffectBypass('gate'));
                }

                // Transient Shaper
                ['transientAttack', 'transientSustain', 'transientFast', 'transientSlow'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', updateTransientParams);
                });

                const transientPresetSelect = document.getElementById('transientPreset');
                if (transientPresetSelect) {
                    transientPresetSelect.addEventListener('change', (e) => {
                        if (e.target.value !== 'none') {
                            applyDynamicsPreset('transient', e.target.value);
                        }
                    });
                }

                const transientBypassBtn = document.getElementById('transientBypass');
                if (transientBypassBtn) {
                    transientBypassBtn.addEventListener('click', () => toggleEffectBypass('transient'));
                }

                // De-esser
                ['deesserFreq', 'deesserQ', 'deesserThreshold', 'deesserRatio',
                 'deesserAttack', 'deesserRelease'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', updateDeesserParams);
                });

                const deesserPresetSelect = document.getElementById('deesserPreset');
                if (deesserPresetSelect) {
                    deesserPresetSelect.addEventListener('change', (e) => {
                        if (e.target.value !== 'none') {
                            applyDynamicsPreset('deesser', e.target.value);
                        }
                    });
                }

                const deesserBypassBtn = document.getElementById('deesserBypass');
                if (deesserBypassBtn) {
                    deesserBypassBtn.addEventListener('click', () => toggleEffectBypass('deesser'));
                }

                // Expander
                ['expanderThreshold', 'expanderRatio', 'expanderAttack',
                 'expanderRelease', 'expanderKnee'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.addEventListener('input', updateExpanderParams);
                });

                const expanderPresetSelect = document.getElementById('expanderPreset');
                if (expanderPresetSelect) {
                    expanderPresetSelect.addEventListener('change', (e) => {
                        if (e.target.value !== 'none') {
                            applyDynamicsPreset('expander', e.target.value);
                        }
                    });
                }

                const expanderBypassBtn = document.getElementById('expanderBypass');
                if (expanderBypassBtn) {
                    expanderBypassBtn.addEventListener('click', () => toggleEffectBypass('expander'));
                }
            }
'''

def main():
    with open('index.html', 'r') as f:
        content = f.read()

    # Find the initAudio function and add initDynamicsEffects() call
    # Look for the end of initAudio function where it calls initMixer();
    init_audio_marker = '                initMixer();\n            }'

    if init_audio_marker in content:
        new_init_audio = '                initMixer();\n                initDynamicsEffects();\n            }'
        content = content.replace(init_audio_marker, new_init_audio)
        print("✓ Added initDynamicsEffects() to initAudio()")
    else:
        print("⚠ Could not find initMixer() call in initAudio()")

    # Find DOMContentLoaded and add setupDynamicsEventHandlers() call
    # Look for where other setup functions are called
    dom_loaded_pattern = r"(document\.addEventListener\('DOMContentLoaded'.*?{)(.*?)(}\);)"

    # Find the setupUIEventHandlers or similar function call pattern
    setup_marker = "setupUIEventHandlers();"
    if setup_marker in content:
        content = content.replace(setup_marker, setup_marker + '\n                setupDynamicsEventHandlers();')
        print("✓ Added setupDynamicsEventHandlers() to DOMContentLoaded")
    else:
        # Alternative: look for end of DOMContentLoaded
        alt_marker = "            });\n        </script>"
        if alt_marker in content:
            # Insert event handler setup before the end of script
            insert_point = content.rfind("        </script>")
            if insert_point != -1:
                # Insert setupDynamicsEventHandlers call and the function definition
                insertion = '''
            // Setup dynamics effects event handlers on load
            if (typeof setupDynamicsEventHandlers === 'function') {
                document.addEventListener('DOMContentLoaded', setupDynamicsEventHandlers);
            }
'''
                content = content[:insert_point] + insertion + content[insert_point:]
                print("✓ Added setupDynamicsEventHandlers() call (alternative method)")

    # Insert the implementation code and event handlers before closing script tag
    script_end = content.rfind('        </script>')
    if script_end != -1:
        full_code = '\n' + implementation_code + '\n' + event_handlers + '\n'
        content = content[:script_end] + full_code + '        ' + content[script_end:]
        print("✓ Inserted dynamics implementation code")

        with open('index.html', 'w') as f:
            f.write(content)
        print("✓ All dynamics effects code successfully integrated!")
    else:
        print("✗ Could not find closing script tag")

if __name__ == '__main__':
    main()
