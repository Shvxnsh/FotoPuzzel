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

let stream;
let hands;
let camera;
let facingMode = 'user';
let handsDetected = 0;
let lastResults;

function resizeCanvas() {
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
}

function setTrackingState(good) {
  captureButton.disabled = !good;
  frameGuide.classList.toggle('ready', good);
  gestureHint.classList.toggle('good', good);
  if (good) {
    gestureHint.querySelector('strong').textContent = 'Perfect frame';
    gestureHint.querySelector('small').textContent = 'Press capture to freeze the moment';
    instruction.textContent = 'Great! Your hands are framing the shot. Capture when it feels right.';
    trackingStatus.textContent = 'TWO HANDS TRACKED';
    timer.textContent = 'CAPTURE READY';
  } else {
    gestureHint.querySelector('strong').textContent = 'Show both hands';
    gestureHint.querySelector('small').textContent = 'Move them apart to frame your shot';
    instruction.textContent = 'Place both hands in front of the camera. Your hands become the frame.';
    trackingStatus.textContent = handsDetected ? 'FINDING YOUR FRAME' : 'WAITING FOR HANDS';
    timer.textContent = 'READY';
  }
}

function onResults(results) {
  lastResults = results;
  resizeCanvas();
  context.clearRect(0, 0, canvas.width, canvas.height);
  handsDetected = results.multiHandLandmarks?.length || 0;

  if (results.multiHandLandmarks) {
    results.multiHandLandmarks.forEach((landmarks) => {
      drawConnectors(context, landmarks, HAND_CONNECTIONS, { color: '#f2d329', lineWidth: 2 });
      drawLandmarks(context, landmarks, { color: '#fff7a8', lineWidth: 1, radius: 3 });
    });
  }
  setTrackingState(handsDetected >= 2);
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
    cameraStatus.textContent = 'CAMERA LIVE · HAND TRACKING ON';
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

function runCountdown() {
  if (captureButton.disabled) return;
  captureButton.disabled = true;
  let value = 3;
  countdown.textContent = value;
  timer.textContent = 'CAPTURING IN 3…';
  const interval = setInterval(() => {
    value -= 1;
    countdown.textContent = value > 0 ? value : '';
    timer.textContent = value > 0 ? `CAPTURING IN ${value}…` : 'CAPTURED';
    if (value <= 0) {
      clearInterval(interval);
      captureMoment();
    }
  }, 650);
}

function captureMoment() {
  const snapshot = document.createElement('canvas');
  snapshot.width = video.videoWidth;
  snapshot.height = video.videoHeight;
  const snapshotContext = snapshot.getContext('2d');
  snapshotContext.translate(snapshot.width, 0);
  snapshotContext.scale(-1, 1);
  snapshotContext.drawImage(video, 0, 0, snapshot.width, snapshot.height);
  document.body.classList.add('captured');
  instruction.textContent = 'Captured! Your photo is ready to become a puzzle.';
  gestureHint.querySelector('strong').textContent = 'Moment captured';
  gestureHint.querySelector('small').textContent = 'Your puzzle is being prepared';
  setTimeout(() => { document.body.classList.remove('captured'); setTrackingState(handsDetected >= 2); }, 1800);
}

startButton.addEventListener('click', startCamera);
captureButton.addEventListener('click', runCountdown);
flipButton.addEventListener('click', () => { facingMode = facingMode === 'user' ? 'environment' : 'user'; startCamera(); });
resetButton.addEventListener('click', () => { countdown.textContent = ''; setTrackingState(handsDetected >= 2); });
demoButton.addEventListener('click', () => { cameraEmpty.classList.add('hidden'); cameraStatus.textContent = 'DEMO MODE · HAND TRACKING ON'; instruction.textContent = 'Demo mode is ready. Enable your camera when you want to frame a real photo.'; captureButton.disabled = false; frameGuide.classList.add('ready'); });

document.querySelector('#helpButton').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.querySelector('#closeHelp').addEventListener('click', () => helpModal.classList.add('hidden'));
document.querySelector('#modalStart').addEventListener('click', () => { helpModal.classList.add('hidden'); startCamera(); });
window.addEventListener('keydown', (event) => { if (event.key === 'Escape') { helpModal.classList.add('hidden'); resetButton.click(); } if (event.key === '?') helpModal.classList.toggle('hidden'); });
window.addEventListener('resize', resizeCanvas);
