(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const video = $('#camera');
  const handCanvas = $('#handCanvas');
  const handContext = handCanvas.getContext('2d');
  const cameraStage = $('#cameraStage');
  const viewfinder = $('#viewfinder');
  const cameraEmpty = $('#cameraEmpty');
  const startButton = $('#startButton');
  const captureButton = $('#captureButton');
  const flipButton = $('#flipButton');
  const resetButton = $('#resetButton');
  const demoButton = $('#demoButton');
  const cameraStatus = $('#cameraStatus');
  const trackingStatus = $('#trackingStatus');
  const instruction = $('#instruction');
  const gesturePill = $('#gesturePill');
  const timer = $('#timer');
  const helpButton = $('#helpButton');
  const helpModal = $('#helpModal');
  const closeHelp = $('#closeHelp');
  const modalStart = $('#modalStart');

  const DEFAULT_FRAME = Object.freeze({ left: 18, top: 12, width: 64, height: 72 });
  const MIN_FRAME_WIDTH = 25;
  const MAX_FRAME_WIDTH = 88;
  const MIN_FRAME_HEIGHT = 28;
  const MAX_FRAME_HEIGHT = 84;

  let stream = null;
  let hands = null;
  let facingMode = 'user';
  let animationId = 0;
  let processing = false;
  let handsDetected = 0;
  let lastPinchAt = 0;
  let fistFrames = 0;
  let captureLocked = false;
  let demoMode = false;
  let demoCanvas = null;

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function isPinching(landmarks) {
    return distance(landmarks[4], landmarks[8]) < 0.075;
  }

  function isFist(landmarks) {
    const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
    const folded = fingers.filter(([tip, joint]) => {
      return distance(landmarks[tip], landmarks[0]) < distance(landmarks[joint], landmarks[0]);
    }).length;
    return folded >= 3 && distance(landmarks[4], landmarks[0]) < distance(landmarks[3], landmarks[0]);
  }

  function normalizeFrame(frame = DEFAULT_FRAME) {
    const width = Math.max(MIN_FRAME_WIDTH, Math.min(MAX_FRAME_WIDTH, Number(frame.width) || DEFAULT_FRAME.width));
    const height = Math.max(MIN_FRAME_HEIGHT, Math.min(MAX_FRAME_HEIGHT, Number(frame.height) || DEFAULT_FRAME.height));
    const left = Math.max(2, Math.min(98 - width, Number(frame.left) || DEFAULT_FRAME.left));
    const top = Math.max(2, Math.min(98 - height, Number(frame.top) || DEFAULT_FRAME.top));
    return { left, top, width, height };
  }

  function applyFrame(frame) {
    const safe = normalizeFrame(frame);
    viewfinder.style.left = `${safe.left}%`;
    viewfinder.style.top = `${safe.top}%`;
    viewfinder.style.width = `${safe.width}%`;
    viewfinder.style.height = `${safe.height}%`;
    viewfinder.dataset.frame = JSON.stringify(safe);
  }

  function getFrame() {
    try {
      return normalizeFrame(JSON.parse(viewfinder.dataset.frame || '{}'));
    } catch {
      return { ...DEFAULT_FRAME };
    }
  }

  function resizeHandCanvas() {
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    if (handCanvas.width !== width || handCanvas.height !== height) {
      handCanvas.width = width;
      handCanvas.height = height;
    }
  }

  function updateFrameFromPinches(pinches) {
    if (pinches.length < 2) return;

    const [first, second] = pinches;
    const centerX = 1 - ((first.x + second.x) / 2);
    const centerY = (first.y + second.y) / 2;
    const spreadX = Math.abs(first.x - second.x);
    const spreadY = Math.abs(first.y - second.y);
    const width = Math.max(MIN_FRAME_WIDTH, Math.min(MAX_FRAME_WIDTH, spreadX * 220));
    const height = Math.max(MIN_FRAME_HEIGHT, Math.min(MAX_FRAME_HEIGHT, Math.max(spreadY * 220, width * 0.78)));

    applyFrame({
      left: centerX * 100 - width / 2,
      top: centerY * 100 - height / 2,
      width,
      height,
    });
    viewfinder.classList.add('ready');
  }

  function updateInterface(ready, pinching) {
    viewfinder.classList.toggle('ready', ready || demoMode);
    captureButton.disabled = demoMode || !ready || captureLocked;

    if (demoMode) {
      setText(cameraStatus, 'DEMO MODE');
      setText(trackingStatus, 'DEMO READY');
      setText(timer, 'CLICK CAPTURE');
      return;
    }

    if (ready && pinching) {
      setText(trackingStatus, 'FRAME ACTIVE');
      setText(timer, 'MAKE A FIST TO CAPTURE');
      setText(gesturePill.querySelector('strong'), 'Frame adjusted');
      setText(gesturePill.querySelector('small'), 'Move your pinches · Make a fist to capture');
      setText(instruction, 'Your digital frame follows both pinch points.');
    } else if (ready) {
      setText(trackingStatus, 'TWO HANDS TRACKED');
      setText(timer, 'PINCH TO ADJUST');
      setText(gesturePill.querySelector('strong'), 'Two hands tracked');
      setText(gesturePill.querySelector('small'), 'Pinch both hands to adjust the frame');
      setText(instruction, 'Pinch with both hands to take control of the digital frame.');
    } else {
      setText(trackingStatus, handsDetected ? 'LOOKING FOR HANDS' : 'WAITING FOR HANDS');
      setText(timer, 'READY');
      setText(gesturePill.querySelector('strong'), 'Show both hands');
      setText(gesturePill.querySelector('small'), 'Then pinch to adjust your frame');
      setText(instruction, 'Place both hands in front of the camera, then pinch with your thumb and index finger.');
    }
  }

  function handleResults(results) {
    resizeHandCanvas();
    handContext.clearRect(0, 0, handCanvas.width, handCanvas.height);

    const detected = results.multiHandLandmarks || [];
    handsDetected = detected.length;
    const pinches = detected.filter(isPinching);
    const fists = detected.filter(isFist).length;

    detected.forEach((landmarks) => {
      drawConnectors(handContext, landmarks, HAND_CONNECTIONS, {
        color: isPinching(landmarks) ? '#47e7ff' : '#ffffff',
        lineWidth: 2,
      });
      drawLandmarks(handContext, landmarks, {
        color: isFist(landmarks) ? '#ff8a65' : '#b9f7ff',
        lineWidth: 1,
        radius: 3,
      });
    });

    if (pinches.length >= 2) {
      updateFrameFromPinches(pinches);
      lastPinchAt = performance.now();
    }

    const ready = handsDetected >= 2 && (pinches.length >= 2 || performance.now() - lastPinchAt < 900);
    updateInterface(Boolean(ready), pinches.length >= 2);

    if (ready && fists > 0 && !captureLocked) {
      fistFrames += 1;
      if (fistFrames >= 4) capturePhoto();
    } else if (fists === 0) {
      fistFrames = 0;
    }
  }

  async function processCameraFrame() {
    if (hands && !demoMode && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !processing) {
      processing = true;
      try {
        await hands.send({ image: video });
      } catch (error) {
        console.warn('Hand tracking frame skipped:', error);
      } finally {
        processing = false;
      }
    }
    animationId = requestAnimationFrame(processCameraFrame);
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setText(cameraStatus, 'CAMERA NOT SUPPORTED');
      setText(instruction, 'Camera access requires HTTPS or localhost in a modern browser.');
      return;
    }

    try {
      demoMode = false;
      stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      cameraEmpty.classList.add('hidden');
      setText(cameraStatus, 'CAMERA LIVE');
      setText(trackingStatus, 'LOOKING FOR HANDS');

      if (!hands) {
        hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.6 });
        hands.onResults(handleResults);
      }

      if (!animationId) animationId = requestAnimationFrame(processCameraFrame);
    } catch (error) {
      stopCamera();
      setText(cameraStatus, error.name === 'NotAllowedError' ? 'CAMERA PERMISSION DENIED' : 'CAMERA FAILED');
      setText(instruction, 'Allow camera access and try again. Camera access requires HTTPS or localhost.');
      console.error(error);
    }
  }

  function createDemoImage() {
    if (demoCanvas) return demoCanvas;
    demoCanvas = document.createElement('canvas');
    demoCanvas.width = 1280;
    demoCanvas.height = 720;
    const demoContext = demoCanvas.getContext('2d');
    const gradient = demoContext.createLinearGradient(0, 0, 1280, 720);
    gradient.addColorStop(0, '#081c35');
    gradient.addColorStop(0.55, '#0b7180');
    gradient.addColorStop(1, '#f0a35b');
    demoContext.fillStyle = gradient;
    demoContext.fillRect(0, 0, 1280, 720);
    demoContext.fillStyle = 'rgba(255,255,255,.2)';
    for (let index = 0; index < 14; index += 1) {
      demoContext.beginPath();
      demoContext.arc(80 + index * 100, 130 + (index % 4) * 100, 30 + index * 2, 0, Math.PI * 2);
      demoContext.fill();
    }
    demoContext.fillStyle = '#ffffff';
    demoContext.font = '700 58px sans-serif';
    demoContext.fillText('DIGITAL FRAME', 420, 620);
    return demoCanvas;
  }

  function getSourceCanvas() {
    if (demoMode) return createDemoImage();
    if (!video.videoWidth || !video.videoHeight) return null;
    const source = document.createElement('canvas');
    source.width = video.videoWidth;
    source.height = video.videoHeight;
    const sourceContext = source.getContext('2d');
    sourceContext.translate(source.width, 0);
    sourceContext.scale(-1, 1);
    sourceContext.drawImage(video, 0, 0, source.width, source.height);
    return source;
  }

  function capturePhoto() {
    if (captureLocked) return;
    const source = getSourceCanvas();
    if (!source) return;

    const frame = getFrame();
    const stageWidth = Math.max(1, cameraStage.clientWidth);
    const stageHeight = Math.max(1, cameraStage.clientHeight);
    const scale = Math.max(stageWidth / source.width, stageHeight / source.height);
    const renderedWidth = source.width * scale;
    const renderedHeight = source.height * scale;
    const offsetX = (stageWidth - renderedWidth) / 2;
    const offsetY = (stageHeight - renderedHeight) / 2;
    const frameX = stageWidth * frame.left / 100;
    const frameY = stageHeight * frame.top / 100;
    const frameWidth = stageWidth * frame.width / 100;
    const frameHeight = stageHeight * frame.height / 100;
    const sx = Math.max(0, Math.min(source.width - 1, (frameX - offsetX) / scale));
    const sy = Math.max(0, Math.min(source.height - 1, (frameY - offsetY) / scale));
    const sw = Math.max(1, Math.min(source.width - sx, frameWidth / scale));
    const sh = Math.max(1, Math.min(source.height - sy, frameHeight / scale));

    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(sw));
    output.height = Math.max(1, Math.round(sh));
    output.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, output.width, output.height);

    captureLocked = true;
    document.body.classList.add('captured');
    setText(timer, 'CAPTURED');
    setText(instruction, 'Captured! Your digital-frame photo is downloading.');
    setText(gesturePill.querySelector('strong'), 'Moment captured');
    setText(gesturePill.querySelector('small'), 'Your photo is ready');

    const download = document.createElement('a');
    download.href = output.toDataURL('image/jpeg', 0.94);
    download.download = `fotopuzzel-${Date.now()}.jpg`;
    document.body.appendChild(download);
    download.click();
    download.remove();

    window.setTimeout(() => {
      captureLocked = false;
      fistFrames = 0;
      document.body.classList.remove('captured');
      updateInterface(handsDetected >= 2, false);
    }, 1400);
  }

  function resetFrame() {
    applyFrame(DEFAULT_FRAME);
    lastPinchAt = 0;
    fistFrames = 0;
    if (!demoMode) updateInterface(false, false);
  }

  startButton.addEventListener('click', startCamera);
  captureButton.addEventListener('click', capturePhoto);
  flipButton.addEventListener('click', () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    startCamera();
  });
  resetButton.addEventListener('click', resetFrame);
  demoButton.addEventListener('click', () => {
    stopCamera();
    demoMode = true;
    cameraEmpty.classList.add('hidden');
    setText(cameraStatus, 'DEMO MODE');
    setText(trackingStatus, 'DEMO READY');
    setText(timer, 'CLICK CAPTURE');
    setText(instruction, 'Demo mode is ready. Click capture to test the digital frame.');
    viewfinder.classList.add('ready');
    captureButton.disabled = false;
  });

  helpButton.addEventListener('click', () => helpModal.classList.remove('hidden'));
  closeHelp.addEventListener('click', () => helpModal.classList.add('hidden'));
  modalStart.addEventListener('click', () => {
    helpModal.classList.add('hidden');
    startCamera();
  });
  helpModal.addEventListener('click', (event) => {
    if (event.target === helpModal) helpModal.classList.add('hidden');
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      helpModal.classList.add('hidden');
      resetFrame();
    }
    if (event.key === '?' || (event.key === '/' && event.shiftKey)) helpModal.classList.toggle('hidden');
    if (event.code === 'Space' && !captureButton.disabled) {
      event.preventDefault();
      capturePhoto();
    }
  });
  window.addEventListener('beforeunload', stopCamera);
  window.addEventListener('resize', resizeHandCanvas);

  applyFrame(DEFAULT_FRAME);
  updateInterface(false, false);
})();
