#!/usr/bin/env python3
"""
Add JavaScript variables for dynamics effects
"""

import re

js_vars_to_insert = '''
            // Dynamics Effects Nodes
            let dynamicsEffectsEnabled = true;
            let dynamicsEffectsChain = {
                // Multi-band Compressor
                mbc: {
                    enabled: true,
                    bypassed: false,
                    lowSplit: null, lowComp: null, lowGain: null,
                    midSplit: null, midComp: null, midGain: null,
                    highSplit: null, highComp: null, highGain: null,
                    merger: null, makeupGain: null,
                    grLow: 0, grMid: 0, grHigh: 0
                },
                // Advanced Limiter
                limiter: {
                    enabled: true,
                    bypassed: false,
                    compressor: null,
                    makeupGain: null,
                    gr: 0
                },
                // Noise Gate
                gate: {
                    enabled: true,
                    bypassed: false,
                    analyser: null,
                    gateGain: null,
                    envelopeFollower: null,
                    isOpen: false,
                    currentGain: 0,
                    holdTimer: 0,
                    params: {threshold: -60, attack: 0.001, release: 0.100, hold: 0.010, range: -96}
                },
                // Transient Shaper
                transient: {
                    enabled: true,
                    bypassed: false,
                    analyser: null,
                    fastEnvGain: null,
                    slowEnvGain: null,
                    envelope: 0,
                    fastEnv: 0,
                    slowEnv: 0,
                    params: {attackGain: 0, sustainGain: 0, fastTime: 0.010, slowTime: 0.100}
                },
                // De-esser
                deesser: {
                    enabled: true,
                    bypassed: false,
                    filter: null,
                    compressor: null,
                    splitter: null,
                    merger: null,
                    gr: 0
                },
                // Expander
                expander: {
                    enabled: true,
                    bypassed: false,
                    analyser: null,
                    expanderGain: null,
                    envelope: 0,
                    currentGain: 1,
                    params: {threshold: -40, ratio: 2, attack: 0.005, release: 0.200, knee: 6}
                }
            };
'''

def main():
    with open('index.html', 'r') as f:
        content = f.read()

    # Find insertion point after summingGainOsc1, summingGainOsc2
    marker = '            let summingGainOsc1, summingGainOsc2;\n            let visualizerCanvas, visualizerContext;'

    if marker in content:
        content = content.replace(marker, '            let summingGainOsc1, summingGainOsc2;\n' + js_vars_to_insert + '\n            let visualizerCanvas, visualizerContext;')
        with open('index.html', 'w') as f:
            f.write(content)
        print("✓ Dynamics Effects JavaScript variables added!")
    else:
        print("✗ Could not find insertion point for JS variables")

if __name__ == '__main__':
    main()
