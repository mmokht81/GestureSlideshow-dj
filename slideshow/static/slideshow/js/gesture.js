
import {
    FilesetResolver,
    GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/+esm";

const video = document.getElementById("camera");
const statusText = document.getElementById("status-text");
const statusDot = document.getElementById("status-dot");
const cameraMessage = document.getElementById("camera-message");
const gestureText = document.getElementById("gesture-text");
const cameraPanel = document.querySelector(".camera-panel");

const MODEL_URL = "/static/slideshow/models/gesture_recognizer.task";
const WASM_URL = "/static/slideshow/mediapipe/wasm/";

let recognizer;
let lastVideoTime = -1;
let previousY = null;
let previousTime = 0;
let isActive = false;

let lastProcessTime = 0;
let smoothX = null;
let smoothY = null;

const TARGET_FPS = 24;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
const SMOOTHING = 0.35;

// محدوده‌ی ورود و خروج متفاوت است تا تشخیص مدام قطع و وصل نشود.
const ZONE_ENTER_MIN = 0.40;
const ZONE_ENTER_MAX = 0.60;
const ZONE_EXIT_MIN = 0.37;
const ZONE_EXIT_MAX = 0.63;

const setStatus = (message, color) => {
    statusText.textContent = message;
    statusDot.style.background = color;
};


function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}


function isIndexFingerExtended(landmarks) {
    const wrist = landmarks[0];

    const indexMcp = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];

    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];

    // بررسی باز بودن اشاره با مقایسه فاصله‌ها
    const indexExtended =
        distance(wrist, indexTip) >
        distance(wrist, indexPip) * 1.05;

    // برای شروع، جمع بودن بقیه انگشت‌ها را سخت‌گیرانه بررسی نمی‌کنیم.
    const otherFingersMostlyCurled =
        middleTip.y > landmarks[10].y - 0.02 &&
        ringTip.y > landmarks[14].y - 0.02 &&
        pinkyTip.y > landmarks[18].y - 0.02;

    return indexExtended && otherFingersMostlyCurled;
}



function stopScrolling() {
    isActive = false;
    previousY = null;
    previousTime = 0;
    smoothX = null;
    smoothY = null;

    cameraPanel.classList.remove("active");
    gestureText.textContent = "انگشت را بین دو خط قرار بده";
}


function processFrame() {
    if (!recognizer || video.readyState < 2) {
        requestAnimationFrame(processFrame);
        return;
    }

    const now = performance.now();

    if (now - lastProcessTime < FRAME_INTERVAL) {
        requestAnimationFrame(processFrame);
        return;
    }

    lastProcessTime = now;

    if (video.currentTime === lastVideoTime) {
        requestAnimationFrame(processFrame);
        return;
    }

    lastVideoTime = video.currentTime;

    try {
        const result = recognizer.recognizeForVideo(video, now);
        const landmarks = result.landmarks?.[0];

        if (!landmarks) {
            stopScrolling();
            requestAnimationFrame(processFrame);
            return;
        }

        const indexTip = landmarks[8];

        // تصویر دوربین آینه‌ای است.
        const mirroredX = 1 - indexTip.x;

        smoothX = smoothX === null
            ? mirroredX
            : smoothX + SMOOTHING * (mirroredX - smoothX);

        smoothY = smoothY === null
            ? indexTip.y
            : smoothY + SMOOTHING * (indexTip.y - smoothY);

        const fingerExtended = isIndexFingerExtended(landmarks);

        const insideZone = isActive
            ? smoothX >= ZONE_EXIT_MIN && smoothX <= ZONE_EXIT_MAX
            : smoothX >= ZONE_ENTER_MIN && smoothX <= ZONE_ENTER_MAX;

        if (!fingerExtended || !insideZone) {
            stopScrolling();
            requestAnimationFrame(processFrame);
            return;
        }

        isActive = true;
        cameraPanel.classList.add("active");
        cameraMessage.style.display = "none";
        gestureText.textContent = "انگشت شناسایی شد؛ در حال اسکرول";

        if (previousY !== null && previousTime > 0) {
            const deltaY = smoothY - previousY;
            const elapsed = Math.max(now - previousTime, 1);

            // سرعت حرکت انگشت برحسب تغییر مختصات در هر ثانیه
            const velocity = (deltaY / elapsed) * 1000;

            // محدودکردن جهش‌ها در تشخیص
            const limitedVelocity = Math.max(-1.2, Math.min(1.2, velocity));

            if (Math.abs(deltaY) > 0.001) {
                window.scrollBy({
//****************************
                    top: limitedVelocity * window.innerHeight * 0.08,
                    behavior: "auto",
                });
            }
        }

        previousY = smoothY;
        previousTime = now;
    } catch (error) {
        console.error("Gesture detection error:", error);
    }

    requestAnimationFrame(processFrame);
}

async function start() {
    try {
        setStatus("در حال بارگذاری مدل...", "#f59e0b");

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);

        recognizer = await GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: MODEL_URL,
                delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
        });

        setStatus("در حال اتصال به دوربین...", "#f59e0b");

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 },
            },
        });

        video.srcObject = stream;
        await video.play();

        cameraMessage.style.display = "none";
        setStatus("دوربین فعال است", "#22c55e");
        gestureText.textContent = "انگشت اشاره را بین دو خط قرار بده";

        requestAnimationFrame(processFrame);
    } catch (error) {
        console.error("Camera / MediaPipe initialization error:", error);

        setStatus("راه‌اندازی ناموفق بود", "#ef4444");
        cameraMessage.style.display = "grid";
        cameraMessage.textContent =
            "دوربین یا مدل بارگذاری نشد. اجازه دسترسی دوربین و Console را بررسی کن.";
        gestureText.textContent = error.message || "خطای ناشناخته";
    }
}

start();
