const SPEED = 50;
const SEND_INTERVAL = 100; // 100ms
let throttle = 0;
let steering = 0;
let lastSendTime = 0;

let recognizedName = 'unknown';

// UDP setup through WebRTC
const socket = new WebSocket('ws://localhost:8080');
socket.onmessage = (event) => {
    if (event.data.startsWith('V:')) {
        const voltage = parseFloat(event.data.substring(2));
        document.getElementById('voltage').textContent = `Battery: ${voltage.toFixed(2)}V`;
    }
};

function sendControl() {
    const now = Date.now();
    if (now - lastSendTime >= SEND_INTERVAL) {
        const command = `1,${Math.round(throttle)},${Math.round(steering)}`;
        socket.send(command);
        lastSendTime = now;
    }
}

// Keyboard controls
const keyActions = {
    'ArrowUp': () => throttle = SPEED,
    'ArrowDown': () => throttle = -SPEED,
    'ArrowLeft': () => {
        // Đảo steering khi đang lùi
        steering = (throttle > 0) ? SPEED : -SPEED;
    },
    'ArrowRight': () => {
        // Đảo steering khi đang lùi
        steering = (throttle > 0) ? -SPEED : SPEED;
    },
    'Space': () => { throttle = 0; steering = 0; }
};

document.addEventListener('keydown', (e) => {
    const action = keyActions[e.code];
    if (action) {
        action();
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowUp' && throttle === SPEED) throttle = 0;
    if (e.code === 'ArrowDown' && throttle === -SPEED) throttle = 0;
    if (e.code === 'ArrowLeft' && steering === ((throttle > 0) ? SPEED : -SPEED)) steering = 0;
    if (e.code === 'ArrowRight' && steering === ((throttle > 0) ? -SPEED : SPEED)) steering = 0;
});

// Device state management
const deviceStates = {
    servo: 90,
    fan: false,
    laze: false
};


// Add Voice Control
const voiceBtn = document.getElementById('voice-control-btn');
const voiceOutput = document.getElementById('voice-output');
let recognition = null;
let isListening = false;
let rotationCount = 0;  // Thêm biến đếm xoay
let lastRotationTime = 0;  // Thêm biến thời gian xoay

// Thêm biến cho Text-to-Speech
const synth = window.speechSynthesis;
let speaking = false;

function speakByBrowser(text) {

    text = text.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]/g, ''); // Remove emojis
    text = text.replace(/"/g, ''); // Remove quotes
    
    if (speaking) {
        synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.onend = () => { speaking = false; };
    speaking = true;
    synth.speak(utterance);
}

// Replace the old speak function with new implementation
async function speak(text) {
    if (speaking) {
        const audio = document.getElementById('audio');
        audio.pause();
        audio.currentTime = 0;
    }

    text = text.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]/g, ''); // Remove emojis
    text = text.replace(/"/g, ''); // Remove quotes

    try {
        const apiKey = '';

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: {
                    stability: 0.44,
                    similarity_boost: 0.8
                }
            })
        });

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = document.getElementById('audio');
        
        speaking = true;
        audio.src = audioUrl;
        audio.onended = () => {
            speaking = false;
            URL.revokeObjectURL(audioUrl);
        };
        await audio.play();

    } catch (error) {
        console.error('TTS API error:', error);
        speaking = false;
    }
}

if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'vi-VN';
    recognition.interimResults = true; // Enable interim results

    recognition.onstart = () => {
        isListening = true;
        voiceBtn.classList.add('listening');
        voiceBtn.textContent = 'Listening...';
        voiceOutput.textContent = 'Đang lắng nghe...';
    };

    recognition.onend = () => {
        isListening = false;
        voiceBtn.classList.remove('listening');
        voiceBtn.textContent = 'Start Voice Control';
        voiceOutput.textContent = 'Voice commands ready...';
    };

    recognition.onresult = async (event) => {
        const result = event.results[event.results.length - 1];
        const command = result[0].transcript.toLowerCase();
        
        if (!result.isFinal) {
            voiceOutput.textContent = `Đang nói: "${command}"`;
            return;
        }

        voiceOutput.textContent = `Câu lệnh: "${command}"`;

        // Check for rotation command
        if (command.includes('xoay một vòng')) {
            rotationCount++;

            // Execute rotation
            steering = -SPEED;
            setTimeout(() => steering = 0, 3000); // 3 seconds for full rotation

            // Check if this is the third rotation
            if (rotationCount >= 2) {
                speakByBrowser("ê, chóng mặt nha");
                rotationCount = 0; // Reset count
            }
        }
        // Rest of the existing command handlers
        else if (command.includes('đi xuống') || command.includes('lùi')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh đi xuống");
            throttle = -SPEED;
            setTimeout(() => throttle = 0, 2000);
        }
        else if (command.includes('đi lên') || command.includes('tiến lên')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh đi lên");
            throttle = SPEED;
            setTimeout(() => throttle = 0, 2000);
        }
        else if (command.includes('sang trái')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh xoay sang trái");
            steering = -SPEED;
            setTimeout(() => steering = 0, 800);
        }
        else if (command.includes('sang phải')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh xoay sang phải");
            steering = SPEED;
            setTimeout(() => steering = 0, 800);
        }
        else if (command.includes('dừng lại')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh dừng lại");
            throttle = 0;
            steering = 0;
        }

        // Device control commands
        else if (command.includes('bật quạt')) {
            speakByBrowser("Đã nhận lệnh bật quạt");
            deviceStates.fan = true;
            socket.send('ESP2:FAN:1');
        }
        else if (command.includes('tắt quạt')) {
            speakByBrowser("Đã nhận lệnh tắt quạt");
            deviceStates.fan = false;
            socket.send('ESP2:FAN:0');
        }
        else if (command.includes('bật đèn')) {
            speakByBrowser("Đã nhận lệnh bật đèn");
            deviceStates.laze = true;
            socket.send('ESP2:LAZE:1');
        }
        else if (command.includes('tắt đèn')) {
            speakByBrowser("Đã nhận lệnh tắt đèn");
            deviceStates.laze = false;
            socket.send('ESP2:LAZE:0');
        }
        // Servo control
        else if (command.includes('cánh tay')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh xoay cánh tay");
            const waveSequence = [
                { angle: 30, duration: 300 },
                { angle: 150, duration: 300 },
                { angle: 30, duration: 300 },
                { angle: 150, duration: 300 }
            ];

            let time = 0;
            waveSequence.forEach(move => {
                setTimeout(() => {
                    deviceStates.servo = move.angle;
                    socket.send(`ESP2:SERVO1:${move.angle}`);
                }, time);
                time += move.duration;
            });
        }
        else if (command.includes('vẫy tay')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh vẫy tay");
            const waveSequence = [
                { angle: 170, duration: 300 },
                { angle: 10, duration: 300 },
                { angle: 170, duration: 300 },
                { angle: 10, duration: 300 }
            ];

            let time = 0;
            waveSequence.forEach(move => {
                setTimeout(() => {
                    deviceStates.servo = move.angle;
                    socket.send(`ESP2:SERVO2:${move.angle}`);
                }, time);
                time += move.duration;
            });
        }
        else if (command.includes('lắc đầu')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh lắc đầu");
            // Implement head shaking movement (left-right-left-right)
            const shakeSequence = [
                { steering: SPEED, duration: 200 },
                { steering: -SPEED, duration: 200 },
                { steering: SPEED, duration: 200 },
                { steering: -SPEED, duration: 200 },
                { steering: 0, duration: 0 }
            ];

            let time = 0;
            shakeSequence.forEach(move => {
                setTimeout(() => {
                    steering = move.steering;
                }, time);
                time += move.duration;
            });
        }
        else if (command.includes('gật đầu')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Đã nhận lệnh gật đầu");
            throttle = SPEED;
            setTimeout(() => throttle = 0, 500);
        }
        else if (command.includes('chào tôi')) {
            // Wave hand with servo and say hello
            if (recognizedName == 'unknown') {
                speakByBrowser("xin chào bạn! Tôi là Chill Bot, Robot 2 bánh tự cân bằng thông minh. Bạn là người lạ chưa đăng ký khuôn mặt.");
            } else {
                speakByBrowser(`xin chào ${recognizedName}! Tôi có thể giúp gì cho bạn ${recognizedName} không?`);
            }
            
            const waveSequence = [
                { angle: 10, duration: 300 },
                { angle: 170, duration: 300 },
                { angle: 10, duration: 300 },
                { angle: 170, duration: 300 }
            ];

            let time = 0;
            waveSequence.forEach(move => {
                setTimeout(() => {
                    deviceStates.servo = move.angle;
                    socket.send(`ESP2:SERVO2:${move.angle}`);
                }, time);
                time += move.duration;
            });
        }
        else if (command.includes('nhảy đi')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Lên nhạc!");
            const audio = document.getElementById('audio');
            audio.src = `./audio/dance.mp3`;
            audio.play();
            // Complex dance sequence combining movement, rotation and servo
            const danceSequence = [
                // Spin move
                { throttle: 0, steering: SPEED, servo: 90, duration: 300 },
                { throttle: 0, steering: -SPEED, servo: 30, duration: 300 },
                // Forward and backward with arm waves
                { throttle: -SPEED, steering: 0, servo: 120, duration: 200 },
                { throttle: SPEED, steering: 0, servo: 60, duration: 200 },
                { throttle: -SPEED, steering: 0, servo: 120, duration: 200 },
                { throttle: SPEED, steering: 0, servo: 60, duration: 200 },
                // Zigzag pattern
                { throttle: -SPEED, steering: SPEED, servo2: 90, duration: 200 },
                { throttle: -SPEED, steering: -SPEED, servo2: 30, duration: 200 },
                { throttle: SPEED, steering: SPEED, servo2: 90, duration: 200 },
                { throttle: SPEED, steering: -SPEED, servo2: 30, duration: 200 },
                // Final spin with arm wave
                { throttle: 0, steering: SPEED, servo: 120, duration: 300 },
                { throttle: 0, steering: -SPEED, servo: 30, duration: 300 },
                // Return to neutral
                { throttle: 0, steering: 0, servo: 90, duration: 0 },
                // Spin move
                { throttle: 0, steering: SPEED, servo: 90, duration: 300 },
                { throttle: 0, steering: -SPEED, servo: 30, duration: 300 },
                // Forward and backward with arm waves
                { throttle: -SPEED, steering: 0, servo: 120, duration: 200 },
                { throttle: SPEED, steering: 0, servo: 60, duration: 200 },
                { throttle: -SPEED, steering: 0, servo: 120, duration: 200 },
                { throttle: SPEED, steering: 0, servo: 60, duration: 200 },
                // Zigzag pattern
                { throttle: -SPEED, steering: SPEED, servo: 90, duration: 200 },
                { throttle: -SPEED, steering: -SPEED, servo: 30, duration: 200 },
                { throttle: SPEED, steering: SPEED, servo: 90, duration: 200 },
                { throttle: SPEED, steering: -SPEED, servo: 30, duration: 200 },
                // Final spin with arm wave
                { throttle: 0, steering: SPEED, servo: 120, duration: 300 },
                { throttle: 0, steering: -SPEED, servo: 30, duration: 300 },
                // Return to neutral
                { throttle: 0, steering: 0, servo: 90, duration: 0 },
                // Spin move
                { throttle: 0, steering: SPEED, servo: 90, duration: 300 },
                { throttle: 0, steering: -SPEED, servo: 30, duration: 300 },
                // Forward and backward with arm waves
                { throttle: -SPEED, steering: 0, servo: 120, duration: 200 },
                { throttle: SPEED, steering: 0, servo: 60, duration: 200 },
                { throttle: -SPEED, steering: 0, servo: 120, duration: 200 },
                { throttle: SPEED, steering: 0, servo: 60, duration: 200 },
                // Zigzag pattern
                { throttle: -SPEED, steering: SPEED, servo2: 90, duration: 200 },
                { throttle: -SPEED, steering: -SPEED, servo2: 30, duration: 200 },
                { throttle: SPEED, steering: SPEED, servo2: 90, duration: 200 },
                { throttle: SPEED, steering: -SPEED, servo2: 30, duration: 200 },
                // Final spin with arm wave
                { throttle: 0, steering: SPEED, servo: 120, duration: 300 },
                { throttle: 0, steering: -SPEED, servo: 30, duration: 300 },
                // Return to neutral
                { throttle: 0, steering: 0, servo: 90, duration: 0 }
            ];

            let time = 0;
            danceSequence.forEach(move => {
                setTimeout(() => {
                    throttle = move.throttle;
                    steering = move.steering;
                    deviceStates.servo = move.servo | 90;
                    deviceStates.servo2 = move.servo2 | 90;
                    socket.send(`ESP2:SERVO1:${move.servo2}`);
                    socket.send(`ESP2:SERVO2:${move.servo}`);
                }, time);
                time += move.duration;
            });
        } else if (command.includes('nhảy điệu khác')) {
            if (recognizedName != 'Bảo') {
                speakByBrowser("Xin lỗi, tôi chỉ nghe lệnh điều khiển của Bảo thôi. Nhưng tôi có thể trò chuyện nếu bạn muốn");
                return;
            }
            speakByBrowser("Lên nhạc!");
            const audio = document.getElementById('audio');
            audio.src = `./audio/dance.mp3`;
            audio.play();
            
            // Baby shark dance sequence
            const babySharkSequence = [
                // Verse 1
                { throttle: 0, steering: SPEED, servo: 30, duration: 500 },  // Baby
                { throttle: 0, steering: -SPEED, servo: 150, duration: 500 }, // shark
                { throttle: SPEED, steering: 0, servo: 30, duration: 500 },  // do
                { throttle: -SPEED, steering: 0, servo: 150, duration: 500 }, // do
                { throttle: 0, steering: 0, servo: 90, duration: 250 },      // do
                
                // Verse 2 - faster
                { throttle: 0, steering: SPEED, servo: 30, duration: 400 },   
                { throttle: 0, steering: -SPEED, servo: 150, duration: 400 },
                { throttle: SPEED, steering: 0, servo: 30, duration: 400 },
                { throttle: -SPEED, steering: 0, servo: 150, duration: 400 },
                { throttle: 0, steering: 0, servo: 90, duration: 200 },
                
                // Chorus - even faster with spins
                { throttle: -SPEED, steering: SPEED, servo2: 30, duration: 300 },
                { throttle: SPEED, steering: -SPEED, servo2: 150, duration: 300 },
                { throttle: -SPEED, steering: SPEED, servo2: 30, duration: 300 },
                { throttle: SPEED, steering: -SPEED, servo2: 150, duration: 300 },
                { throttle: 0, steering: SPEED, servo: 90, duration: 500 },  // Full spin finale
                
                // Dance finale
                { throttle: -SPEED/2, steering: SPEED, servo: 180, duration: 400 },
                { throttle: SPEED/2, steering: -SPEED, servo: 0, duration: 400 },
                { throttle: 0, steering: 0, servo: 90, duration: 200 },
                
                // Victory pose
                { throttle: 0, steering: 0, servo: 180, duration: 500 },
                { throttle: 0, steering: 0, servo: 0, duration: 500 },
                { throttle: 0, steering: 0, servo: 90, duration: 500 }
            ];

            // Repeat sequence 3 times
            const fullSequence = [...babySharkSequence, ...babySharkSequence, ...babySharkSequence];
            
            let time = 0;
            fullSequence.forEach(move => {
                setTimeout(() => {
                    throttle = move.throttle;
                    steering = move.steering;
                    deviceStates.servo = move.servo2 | 90;
                    deviceStates.servo2 = move.servo | 90;
                    socket.send(`ESP2:SERVO1:${move.servo2}`);
                    socket.send(`ESP2:SERVO2:${move.servo}`);
                }, time);
                time += move.duration;
            });
        } else if (command.includes('có thể dạy cho trẻ em không')) {
            voiceId = 'foH7s9fX31wFFH2yqrFa'; // voice nữ
            speak('Có, tôi có thể dạy trẻ em nếu được lập trình đúng cách. Hãy thử lập trình một số hành động cho tôi!');
        } else if (command.includes('thất nghiệp cho con người')) {
            voiceId = 'FTYCiQT21H9XQvhRu0ch'; // voice nam
            speak('Làm cho con người bị thất nghiệp? Điều đó quá tệ, tôi có nhiều ý tưởng tốt hơn như thế nhiều. Hãy nghĩ tích cực hơn!');
        } else {
            // Treat as chat message
            document.getElementById('chat-response').textContent = 'Đang suy nghĩ...';
            const response = await askGemini(command);
            document.getElementById('chat-response').textContent = response;
            
            // Choose voice based on personality mode
            switch(currentMode) {
                case 'sassy':
                    speakByBrowser(response);
                    break;
                case 'cute':
                    voiceId = 'foH7s9fX31wFFH2yqrFa'; // voice nữ
                    speakByBrowser(response);
                    break;
                case 'serious':
                    voiceId = 'JxmKvRaNYFidf0N27Vng'; // voice nam
                    voiceId = 'FTYCiQT21H9XQvhRu0ch'; // voice nam
                    speakByBrowser(response);
                    break;
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        voiceOutput.textContent = `Error: ${event.error}`;
    };

    voiceBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });
} else {
    voiceBtn.style.display = 'none';
    voiceOutput.textContent = 'Speech recognition not supported in this browser.';
}

// Add personality mode state
let currentMode = 'serious';

let voiceId = 'foH7s9fX31wFFH2yqrFa'; // Default

// Add personality mode selection - Update selector to match new button class
document.querySelectorAll('[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
    });
});

// Face Detection Setup
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const expressionDiv = document.getElementById('expression');
let isModelLoaded = false;

// Add startVideo function
function startVideo() {
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            isModelLoaded = true;
            cameraToggle.classList.add('active');
        })
        .catch(err => {
            console.error("Error accessing camera:", err);
            isCameraOn = false;
            cameraToggle.textContent = 'Turn Camera On';
            cameraToggle.classList.remove('active');
        });
}

// Load face-api models
Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
    faceapi.nets.faceExpressionNet.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
    faceapi.nets.faceLandmark68Net.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
    faceapi.nets.faceRecognitionNet.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights')
]).then(startVideo);

// Store labeled face descriptors
let labeledFaceDescriptors = [];

// Face registration
document.getElementById('register-face').addEventListener('click', async () => {
    const name = document.getElementById('face-name').value.trim();
    if (!name) {
        alert('Please enter a name');
        return;
    }

    // Get current face detection
    const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();

    if (detections.length === 0) {
        alert('No face detected! Please face the camera.');
        return;
    }

    if (detections.length > 1) {
        alert('Please ensure only one face is visible.');
        return;
    }

    // Create labeled descriptor
    const descriptor = detections[0].descriptor;
    labeledFaceDescriptors.push(new faceapi.LabeledFaceDescriptors(name, [descriptor]));

    // Update faces list
    updateFacesList();
    document.getElementById('face-name').value = '';
});

function updateFacesList() {
    const list = document.getElementById('faces-list');
    list.innerHTML = 'Registered Faces:<br>' + 
        labeledFaceDescriptors.map(lfd => `- ${lfd.label}`).join('<br>');
}

video.addEventListener('play', () => {
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);
    let lastExpression = '';
    
    const expressionResponses = {
        happy: [
            { text: "Cười tươi thế, ông đang nghĩ gì vui vậy?", audio: "happy1.mp3" },
            { text: "Có gì mà vui thế, kể tôi nghe ông ơi", audio: "happy2.mp3" }
        ],
        angry: [
            { text: "Haha, nhìn mặt cay cú trông buồn cười ghê", audio: "angry1.mp3" },
            { text: "Haha, nhìn mặt cay cú trông buồn cười ghê", audio: "angry2.mp3" }
        ],
        surprised: [
            { text: "Chưa thấy robot cân bằng hay sao mà ngạc nhiên dữ vậy ba", audio: "surprised1.mp3" },
            { text: "Đang diễn nét ngạc nhiên à, ông đi casting Lật mặt 9 đi", audio: "surprised2.mp3" }
        ],
        sad: [
            { text: "Tôi thấy ông cười nãy giờ, ông tính diễn ai coi", audio: "sad1.mp3" },
            { text: "Ơ, buồn thật à. Kệ ông! Ahihihi", audio: "sad2.mp3" }
        ]
    };

    // Add function to handle background changes

    function updateBackground(expression, recognizedName) {
        document.body.classList.remove(
            'bg-happy', 'bg-angry', 'bg-surprised', 
            'bg-sad', 'bg-stranger', 'bg-known'
        );

        if (recognizedName === 'unknown') {
            document.body.classList.add('bg-stranger');
        } else if (expression) {
            document.body.classList.add(`bg-${expression.toLowerCase()}`);
        } else {
            document.body.classList.add('bg-known');
        }
    }

    // Add this function to play local audio files
    function playLocalAudio(audioFile) {
        const audio = document.getElementById('audio');
        audio.src = `./audio/${audioFile}`;
        audio.play();
    }

    setInterval(async () => {
        if (!isModelLoaded || !isCameraOn || !isDetectionOn || speaking) return; // Skip if already speaking

        const detections = await faceapi
            .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceExpressions()
            .withFaceDescriptors();

        if (detections && detections.length > 0) {
            const detection = detections[0];
            const expressions = detection.expressions;
            const dominantExpression = Object.keys(expressions).reduce((a, b) => 
                expressions[a] > expressions[b] ? a : b
            );

            expressionDiv.textContent = `Expression: ${dominantExpression}`;

            // Perform face recognition if we have registered faces
            if (labeledFaceDescriptors.length > 0) {
                const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors);
                const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
                recognizedName = bestMatch.label;

                // Update recognition display
                const recognitionDisplay = document.getElementById('recognition-display');
                recognitionDisplay.style.display = 'block';
                recognitionDisplay.textContent = recognizedName;
            }

            // Update background
            updateBackground(dominantExpression, recognizedName);

            // Control robot and speak if expression changes
            if (dominantExpression !== lastExpression) {
                lastExpression = dominantExpression;

                // Play local audio for expression
                if (isEmotionOn) {
                    const responses = expressionResponses[dominantExpression] || expressionResponses.neutral;
                    const response = responses[Math.floor(Math.random() * responses.length)];
                    speaking = true; // Set speaking flag
                    const audio = document.getElementById('audio');
                    audio.src = `./audio/${response.audio}`;
                    audio.onended = () => {
                        speaking = false; // Reset speaking flag when audio ends
                    };
                    audio.play();
                }
                
            }

        }
    }, 100);
});

// Add these variables at the top of your script
let isCameraOn = true;
let isDetectionOn = true;
let isEmotionOn = true;
const cameraToggle = document.getElementById('camera-toggle');
const detectionToggle = document.getElementById('detection-toggle');
const emotionToggle = document.getElementById('emotion-toggle');
const objectToggle = document.getElementById('object-toggle');

// Add camera toggle functionality
cameraToggle.addEventListener('click', () => {
    if (isCameraOn) {
        // Stop the camera
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
        cameraToggle.textContent = 'Turn Camera Off';
        cameraToggle.classList.remove('active');
    } else {
        // Start the camera
        startVideo();
        cameraToggle.textContent = 'Turn Camera On';
        cameraToggle.classList.add('active');
    }
    isCameraOn = !isCameraOn;
});

// Add detection toggle functionality
detectionToggle.addEventListener('click', () => {
    isDetectionOn = !isDetectionOn;
    detectionToggle.textContent = isDetectionOn ? 'Turn Detection On' : 'Turn Detection Off';
    detectionToggle.classList.toggle('active', isDetectionOn);
    
    if (!isDetectionOn) {
        // Clear the canvas and reset expression
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        expressionDiv.textContent = 'Expression: Disabled';
        // Reset robot controls
        throttle = 0;
        steering = 0;
    }
});

emotionToggle.addEventListener('click', () => {
    isEmotionOn = !isEmotionOn;
    emotionToggle.textContent = isEmotionOn ? 'Turn Emotion On' : 'Turn Emotion Off';
    emotionToggle.classList.toggle('active', isEmotionOn);
});

// Thêm object detection toggle
objectToggle.addEventListener('click', () => {
    window.open('./coco.html', '_blank');
});

setInterval(sendControl, 10);

// Add this CSS to fix button styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    .button.active {
        background: var(--success) !important;
    }
    .button-listening {
        background: var(--success) !important;
    }
`;
document.head.appendChild(styleSheet);

// Add text command functionality
document.getElementById('submit-command').addEventListener('click', async () => {
    const command = document.getElementById('text-command').value.toLowerCase();
    if (!command) return;
    
    // Use the same command handler as voice recognition
    voiceOutput.textContent = `Câu lệnh: "${command}"`;
    
    // Process the command using the same logic as voice commands
    const result = {
        results: [{
            0: { transcript: command },
            isFinal: true
        }]
    };
    
    await recognition.onresult({ results: result.results });
    
    // Clear the input after processing
    document.getElementById('text-command').value = '';
});