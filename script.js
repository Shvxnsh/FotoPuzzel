const video = document.querySelector('#camera');
const canvas = document.querySelector('#handCanvas');
const context = canvas.getContext('2d');
const cameraEmpty = document.querySelector('#cameraEmpty');
const startButton = document.querySelector('#startButton');
const captureButton = document.querySelector('#captureButton');
const flipButton = document.querySelector('#flipButton');
const resetButton = document.querySelector('#resetButton');
const demoButton = document.querySelector('#demoButton');
const cameraStatus = document.querySelector('#cameraStatus');
const trackingStatus = document.querySelector('#trackingStatus');
const instruction = document.querySelector('#instruction');
const gestureHint = document.querySelector('#gestureHint');
const frameGuide = document.querySelector('#frameGuide');
const countdown = document.querySelector('#countdown');
const timer = document.querySelector('#timer');
const helpModal = document.querySelector('#helpModal');

const DEFAULT_FRAME = { left: 20, top: 14, width: 60, height: 72 };
let stream;
let hands;
let camera;
let facingMode = 'user';
let handsDetected = 0;
let fistFrames = 0;
let captureLocked = false;
let lastPinchFrame;
let lastCapturedUrl;

function resizeCanvas() {
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isPinching(landmarks) {
  return distance(landmarks[4], landmarks[8]) < 0.075;
}

function isFist(landmarks) {
  const fingers = [[8, 6], [12, 10], [16, 14], [20, 18]];
  const folded = fingers.filter(([tip, joint]) => distance(landmarks[tip], landmarks[0]) < distance(landmarks[joint], landmarks[0])).length;
  const thumbFolded = distance(landmarks[4], landmarks[0]) < distance(landmarks[3], landmarks[0]);
  return folded >= 3 && thumbFolded;
}

function applyFrame(frame) {
  const safe = {
    left: Math.max(5, Math.min(75, frame.left)),
    top: Math.max(5, Math.min(70, frame.top)),
    width: Math.max(25, Math.min(90, frame.width)),
    height: Math.max(25, Math.min(85, frame.height)),
  };
  safe.left = Math.min(safe.left, 95 - safe.width);
  safe.top = Math.min(safe.top, 95 - safe.height);
  frameGuide.style.left = `${safe.left}%`;
  frameGuide.style.top = `${safe.top}%`;
  frameGuide.style.width = `${safe.width}%`;
  frameGuide.style.height = `${safe.height}%`;
  frameGuide.dataset.frame = JSON.stringify(safe);
}

function getFrame() {
  try { return JSON.parse(frameGuide.dataset.frame); } catch { return DEFAULT_FRAME; }
}

function updateFrameFromPinches(pinches) {
  if (pinches.length < 2) return;
  const [first, second] = pinches;
  const centerX = 1 - ((first.x + second.x) / 2);
  const centerY = (first.y + second.y) / 2;
  const spreadX = Math.abs(first.x - second.x);
  const spreadY = Math.abs(first.y - second.y);
  const width = Math.max(25, Math.min(88, spreadX * 2.25));
  const height = Math.max(28, Math.min(82, Math.max(spreadY * 2.5, width * 0.78)));
  applyFrame({ left: (centerX * 100) - (width / 2), top: (centerY * 100) - (height / 2), width, height });
  frameGuide.classList.add('ready');
}

function setTrackingState(good, pinching) {
  captureButton.disabled = !good || captureLocked;
  frameGuide.classList.toggle('ready', good);
  gestureHint.classList.toggle('good', good);
  if (good && pinching) {
    gestureHint.querySelector('strong').textContent = 'Frame adjusted';
    gestureHint.querySelector('small').textContent = 'Move pinches to position · Make a fist to capture';
    instruction.textContent = 'Your frame follows both pinch points. Spread them apart to enlarge it.';
    trackingStatus.textContent = 'PINCH FRAME ACTIVE';
    timer.textContent = 'MAKE A FIST TO CAPTURE';
  } else if (good) {
    gestureHint.querySelector('strong').textContent = 'Two hands tracked';
    gestureHint.querySelector('small').textContent = 'Pinch both hands to adjust the frame';
    instruction.textContent = 'Pinch with both hands to take control of the yellow frame.';
    trackingStatus.textContent = 'TWO HANDS TRACKED';
    timer.textContent = 'PINCH TO ADJUST';
  } else {
    gestureHint.querySelector('strong').textContent = 'Show both hands';
    gestureHint.querySelector('small').textContent = 'Then pinch to adjust your frame';
    instruction.textContent = 'Place both hands in front of the camera, then pinch with thumb and index finger.';
    trackingStatus.textContent = handsDetected ? 'FINDING YOUR HANDS' : 'WAITING FOR HANDS';
    timer.textContent = 'READY';
  }
}

function onResults(results) {
  resizeCanvas();
  context.clearRect(0, 0, canvas.width, canvas.height);
  const detected = results.multiHandLandmarks || [];
  handsDetected = detected.length;
  const pinching = detected.filter(isPinching);
  const fists = detected.filter(isFist).length;

  detected.forEach((landmarks) => {
    drawConnectors(context, landmarks, HAND_CONNECTIONS, { color: isPinching(landmarks) ? '#f2d329' : '#ffffff', lineWidth: 2 });
    drawLandmarks(context, landmarks, { color: isFist(landmarks) ? '#ff8a65' : '#fff7a8', lineWidth: 1, radius: 3 });
  });

  if (pinching.length >= 2) {
    updateFrameFromPinches(pinching);
    lastPinchFrame = performance.now();
  }

  const frameIsReady = handsDetected >= 2 && (pinching.length >= 2 || lastPinchFrame && performance.now() - lastPinchFrame < 900);
  setTrackingState(Boolean(frameIsReady), pinching.length >= 2);

  if (fists > 0 && frameIsReady && !captureLocked) {
    fistFrames += 1;
    if (fistFrames >= 3) captureMoment();
  } else {
    fistFrames = 0;
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = 'CAMERA NOT SUPPORTED';
    instruction.textContent = 'Use a modern browser with camera access to try hand framing.';
    return;
  }

  try {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    cameraEmpty.classList.add('hidden');
    cameraStatus.textContent = 'CAMERA LIVE · GESTURE CONTROL ON';
    if (!hands) {
      hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
      hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.6 });
      hands.onResults(onResults);
    }
    if (camera) camera.stop();
    camera = new Camera(video, { onFrame: async () => hands.send({ image: video }), width: 1280, height: 720 });
    camera.start();
  } catch (error) {
    cameraStatus.textContent = 'CAMERA ACCESS NEEDED';
    instruction.textContent = 'Camera access was blocked. Tap Enable camera and allow permission to continue.';
    console.error(error);
  }
}

function captureMoment() {
  if (captureLocked || !video.videoWidth) return;
  captureLocked = true;
  countdown.textContent = '●';
  timer.textContent = 'CAPTURED';
  const frame = getFrame();
  const source = document.createElement('canvas');
  source.width = video.videoWidth;
  source.height = video.videoHeight;
  const sourceContext = source.getContext('2d');
  sourceContext.translate(source.width, 0);
  sourceContext.scale(-1, 1);
  sourceContext.drawImage(video, 0, 0, source.width, source.height);

  const crop = document.createElement('canvas');
  const cropWidth = Math.round(source.width * frame.width / 100);
  const cropHeight = Math.round(source.height * frame.height / 100);
  crop.width = cropWidth;
  crop.height = cropHeight;
  crop.getContext('2d').drawImage(source, source.width * frame.left / 100, source.height * frame.top / 100, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  if (lastCapturedUrl) URL.revokeObjectURL(lastCapturedUrl);
  lastCapturedUrl = crop.toDataURL('image/jpeg', 0.92);

  document.body.classList.add('captured');
  gestureHint.querySelector('strong').textContent = 'Moment captured';
  gestureHint.querySelector('small').textContent = 'Your framed photo is ready';
  instruction.textContent = 'Captured! Your hand-framed image is ready to become a puzzle.';
  const download = document.createElement('a');
  download.href = lastCapturedUrl;
  download.download = 'fotopuzzel-capture.jpg';
  download.click();

  setTimeout(() => {
    document.body.classList.remove('captured');
    captureLocked = false;
    fistFrames = 0;
    countdown.textContent = '';
    setTrackingState(handsDetected >= 2, false);
  }, 1600);
}

startButton.addEventListener('click', startCamera);
captureButton.addEventListener('click', captureMoment);
flipButton.addEventListener('click', () => { facingMode = facingMode === 'user' ? 'environment' : 'user'; startCamera(); });
resetButton.addEventListener('click', () => { applyFrame(DEFAULT_FRAME); countdown.textContent = ''; lastPinchFrame = 0; setTrackingState(false, false); });
demoButton.addEventListener('click', () => { cameraEmpty.classList.add('hidden'); cameraStatus.textContent = 'DEMO MODE · GESTURE CONTROL ON'; instruction.textContent = 'Demo mode is ready. Enable your camera to control the frame with your hands.'; captureButton.disabled = false; frameGuide.classList.add('ready'); });

document.querySelector('#helpButton').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.querySelector('#closeHelp').addEventListener('click', () => helpModal.classList.add('hidden'));
document.querySelector('#modalStart').addEventListener('click', () => { helpModal.classList.add('hidden'); startCamera(); });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') { helpModal.classList.add('hidden'); resetButton.click(); } if (event.key === '?') helpModal.classList.toggle('hidden'); });
window.addEventListener('resize', resizeCanvas);
applyFrame(DEFAULT_FRAME);
