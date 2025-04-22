const startStopBtn = document.getElementById('startStopBtn');
const timerDisplay = document.getElementById('timerDisplay');
const durationSelect = document.getElementById('duration');
const inhaleInput = document.getElementById('inhaleDuration');
const exhaleInput = document.getElementById('exhaleDuration');
const holdInput = document.getElementById('holdDuration');
const inhaleSoundToggle = document.getElementById('inhaleSoundToggle');
const exhaleSoundToggle = document.getElementById('exhaleSoundToggle');
const bgSoundSelect = document.getElementById('bgSound');
const circle = document.getElementById('breatheCircle');
const breathState = document.getElementById('breathState');
const bgVolume = document.getElementById('bgVolume');
const bgVolumeValue = document.getElementById('bgVolumeValue');

let sessionTimer = null;
let breathTimer = null;
let remainingTime = parseInt(durationSelect.value);
let isRunning = false;
let bgSound = null;
let inhaleSound = null;
let exhaleSound = null;

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    timerDisplay.textContent = formatTime(remainingTime);
}

function saveSettings(key, value) {
    localStorage.setItem(key, value);
}

function loadSettings(key, defaultValue) {
    return localStorage.getItem(key) || defaultValue;
}

async function ensureAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume().catch(error => {
            console.error('Error resuming audio context:', error);
        });
    }
}

// seamless bg sound using Web Audio API
const audioContext = new AudioContext();
const gainNode = audioContext.createGain();
gainNode.connect(audioContext.destination);

async function loadAudioBuffer(src) {
    if (!src) return null;

    try {
        const response = await fetch(src, {mode: 'cors'});
        const buffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(buffer);
    } catch (error) {
        console.error(`Error loading audio buffer from ${src}:`, error);
        return null;
    }
}

async function playBuffer(buffer) {
    if (!buffer) return;

    await ensureAudioContext()
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

    source.onended = () => {
        source.disconnect();
    };
}

async function loadBgSound(src) {
    if (bgSound) {
        bgSound.stop();
        bgSound.disconnect();
        bgSound = null;
    }

    if (!src) return;

    const buffer = await loadAudioBuffer(src);
    if (!buffer) return;

    bgSound = audioContext.createBufferSource();
    bgSound.buffer = buffer;
    bgSound.connect(gainNode);
    bgSound.loop = true;

    await ensureAudioContext();

    bgSound.start(0);
    gainNode.gain.value = bgVolume.value / 200;
}


/**
 * Transforms a list of duration entries, each including a property and a duration,
 * and assembles that into a transition string with ease-in-out timing.
 * If only a single number is given, outputs a transition string for `all`.
 *
 * @param {Array|number} durations - A list of arrays containing a property name and a duration,
 *                                    or a single number representing the duration for all properties.
 * @returns {string} A transition string formatted for CSS transitions.
 */
function easeInOut(durations) {
    if (typeof durations === 'number') {
        return `all ${durations}s ease-in-out`;
    }
    let transitionStrings = [];
    durations.forEach(durationEntry => {
        const transitionSection = `${durationEntry[0]} ${durationEntry[1]}s ease-in-out`;
        transitionStrings.push(transitionSection);
    });
    return transitionStrings.join(', ');
}

async function breathingCycle() {
    /**
     * Updates the breath state label and handles its fade-in and fade-out transitions.
     *
     * @param {string} label - The text to display for the current breath state.
     * @param {number} duration - The duration for the fade-out transition.
     */
    function setBreathState(label, duration) {
        breathState.textContent = label;
        breathState.style.transition = easeInOut(0.3);
        breathState.style.opacity = `1`;
        setTimeout(() => {
            breathState.style.transition = easeInOut(duration);
            breathState.style.opacity = `0`;
        }, 500);
    }

    if (!isRunning || remainingTime <= 0) {
        breathState.style.transition = easeInOut(0.3);
        breathState.style.opacity = '0'; // Hide state text
        circle.style.transition = easeInOut(0.3);
        circle.style.transform = 'scale(0.75)'; // Reset circle size
        return;
    }

    const inhale = parseInt(inhaleInput.value);
    const hold = parseInt(holdInput.value);
    const exhale = parseInt(exhaleInput.value);

    await ensureAudioContext();

    setBreathState('Inhale', inhale);
    circle.style.transition = easeInOut(inhale);
    circle.style.transform = 'scale(1)';
    if (inhaleSoundToggle.checked) {
        playBuffer(inhaleSound);
    }

    breathTimer = setTimeout(() => {
        if (!isRunning || remainingTime <= 0) return;

        setBreathState('Hold', hold);
        breathTimer = setTimeout(() => {
            if (!isRunning || remainingTime <= 0) return;

            setBreathState('Exhale', exhale);
            circle.style.transition = easeInOut(exhale);
            circle.style.transform = 'scale(0.75)';
            if (exhaleSoundToggle.checked) {
                playBuffer(exhaleSound);
            }

            breathTimer = setTimeout(() => {
                if (isRunning && remainingTime > 0) breathingCycle(); // repeat
            }, exhale * 1000);
        }, hold * 1000);
    }, inhale * 1000);
}

async function startSession() {
    if (isRunning) return;
    isRunning = true;
    startStopBtn.textContent = 'Stop';

    await ensureAudioContext();

    if (!inhaleSound) {
        inhaleSound = await loadAudioBuffer('sounds/inhale.mp3');
    }

    if (!exhaleSound) {
        exhaleSound = await loadAudioBuffer('sounds/exhale.mp3');
    }

    if (bgSoundSelect.value && !bgSound) {
        await loadBgSound(bgSoundSelect.value);
    }

    setTimeout(() => {
        if (isRunning) {
            breathingCycle();
        }
    }, 0);

    sessionTimer = setInterval(() => {
        if (remainingTime > 0) {
            remainingTime--;
            updateDisplay();
        } else {
            clearInterval(sessionTimer);
            clearTimeout(breathTimer);
            stopSession();

            startStopBtn.textContent = 'Start';
            breathState.textContent = 'Done';
            isRunning = false;
            setTimeout(() => {
                if (!isRunning) breathState.textContent = 'Ready';
            }, 2000);
        }
    }, 1000);
}

function stopSession() {
    clearInterval(sessionTimer);
    clearTimeout(breathTimer);
    isRunning = false;
    startStopBtn.textContent = 'Start';

    breathState.textContent = 'Ready';
    breathState.style.transition = easeInOut(0.3);
    breathState.style.opacity = `1`;
    remainingTime = parseInt(durationSelect.value);
    circle.style.transition = easeInOut(0.3);
    circle.style.transform = 'scale(0.75)';
    updateDisplay();
}

startStopBtn.addEventListener('click', async () => {
    await ensureAudioContext();
    isRunning ? stopSession() : await startSession();
});

durationSelect.addEventListener('change', () => {
    stopSession();
    remainingTime = parseInt(durationSelect.value);
    updateDisplay();
});

bgSoundSelect.addEventListener('change', async () => {
    saveSettings('bgSound', bgSoundSelect.value);
    await loadBgSound(bgSoundSelect.value);
});

bgVolume.addEventListener('input', () => {
    saveSettings('bgVolume', bgVolume.value);
    bgVolumeValue.textContent = `${bgVolume.value}%`;
    if (gainNode) {
        gainNode.gain.value = bgVolume.value / 200;
    }
});

inhaleInput.addEventListener('change', () => {
    saveSettings('inhaleDuration', inhaleInput.value);
});
exhaleInput.addEventListener('change', () => {
    saveSettings('exhaleDuration', exhaleInput.value);
});
holdInput.addEventListener('change', () => {
    saveSettings('holdDuration', holdInput.value);
});
inhaleSoundToggle.addEventListener('change', () => {
    saveSettings('inhaleSoundToggle', inhaleSoundToggle.checked);
});
exhaleSoundToggle.addEventListener('change', () => {
    saveSettings('exhaleSoundToggle', exhaleSoundToggle.checked);
});

updateDisplay();
bgVolumeValue.textContent = `${bgVolume.value}%`;

document.addEventListener('DOMContentLoaded', async () => {
    // load settings
    inhaleInput.value = loadSettings('inhaleDuration', inhaleInput.value);
    exhaleInput.value = loadSettings('exhaleDuration', exhaleInput.value);
    holdInput.value = loadSettings('holdDuration', holdInput.value);
    inhaleSoundToggle.checked = loadSettings('inhaleSoundToggle', inhaleSoundToggle.checked) === 'true';
    exhaleSoundToggle.checked = loadSettings('exhaleSoundToggle', exhaleSoundToggle.checked) === 'true';
    bgSoundSelect.value = loadSettings('bgSound', bgSoundSelect.value);
    bgVolume.value = loadSettings('bgVolume', bgVolume.value);

    if (gainNode) {
        gainNode.gain.value = bgVolume.value / 200;
    }
    bgVolumeValue.textContent = `${bgVolume.value}%`;

    inhaleSound = await loadAudioBuffer('sounds/inhale.mp3');
    exhaleSound = await loadAudioBuffer('sounds/exhale.mp3');
});