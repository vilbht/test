// pose.js — thin wrapper around MediaPipe Tasks Vision PoseLandmarker,
// loaded from CDN as an ES module.

import {
  PoseLandmarker,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarker = null;

export async function initPose() {
  if (landmarker) return landmarker;
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  return landmarker;
}

// Detect on a single video frame. Returns the first pose's landmark array
// ([{x,y,z,visibility}, ...]) or null.
export function detect(video, timestampMs) {
  if (!landmarker) return null;
  const result = landmarker.detectForVideo(video, timestampMs);
  if (result && result.landmarks && result.landmarks.length > 0) {
    return result.landmarks[0];
  }
  return null;
}
