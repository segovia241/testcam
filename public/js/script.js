let ws;
let localStream;
const localVideo = document.getElementById('localVideo');
const cameraSelect = document.getElementById('cameraSelect');
const statusDiv = document.getElementById('status');

const CONFIG = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// ================= UTILIDADES =================
function log(msg) {
    console.log(msg);
    statusDiv.innerHTML += `<p>${new Date().toLocaleTimeString()}: ${msg}</p>`;
    statusDiv.scrollTop = statusDiv.scrollHeight;
}

// ================= CÁMARA =================
async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        cameraSelect.innerHTML = '';
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Cámara ${cameraSelect.length + 1}`;
            cameraSelect.appendChild(option);
        });
        
        return videoDevices;
    } catch (err) {
        console.error('Error al enumerar cámaras:', err);
        return [];
    }
}

async function getCameraStream(deviceId = null) {
    try {
        const constraints = {
            video: { 
                width: 640, 
                height: 480 
            },
            audio: false // Deshabilitar audio si no es necesario
        };

        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        } else {
            // Si no hay deviceId específico, usar facingMode
            constraints.video.facingMode = cameraSelect.value;
        }

        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        log('✅ Cámara activada');
        return localStream;
    } catch (err) {
        console.error('Error al acceder a la cámara:', err);
        log('❌ Error al acceder a la cámara');
        return null;
    }
}

cameraSelect.addEventListener('change', async () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    await getCameraStream(cameraSelect.value);
});

// ================= WEBSOCKET =================
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        log('✅ Conexión WebSocket establecida');
        startProcessing();
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
    };

    ws.onmessage = async (message) => {
        try {
            const data = JSON.parse(message.data);
            
            if (data.type === 'analysis') {
                displayResults(data);
            } else if (data.type === 'error') {
                log('❌ Error: ' + data.message);
                // No detener el procesamiento por errores individuales
            }
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    };

    ws.onerror = (error) => {
        log('❌ Error en WebSocket: ' + error);
    };

    ws.onclose = () => {
        log('🔌 Conexión WebSocket cerrada');
        stopProcessing();
        document.getElementById('connectBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
    };
}

// ================= PROCESAMIENTO DE VIDEO =================
let isProcessing = false;
let fps = 10;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

function startProcessing() {
    if (!localStream) {
        log('❌ Primero activa la cámara');
        return;
    }
    
    isProcessing = true;
    processFrame();
    log('🎬 Iniciando procesamiento de video');
}

function stopProcessing() {
    isProcessing = false;
    log('⏹ Procesamiento detenido');
}

async function processFrame() {
    if (!isProcessing || !ws || ws.readyState !== WebSocket.OPEN) return;

    try {
        // Configurar canvas con las dimensiones del video
        canvas.width = localVideo.videoWidth || 640;
        canvas.height = localVideo.videoHeight || 480;
        
        // Dibujar frame actual en canvas
        ctx.drawImage(localVideo, 0, 0, canvas.width, canvas.height);
        
        // Convertir a JPEG con calidad reducida para optimización
        const imageData = canvas.toDataURL('image/jpeg', 0.7);
        
        // Enviar frame al servidor
        const message = {
            type: 'frame',
            data: imageData,
            timestamp: Date.now(),
            dimensions: {
                width: canvas.width,
                height: canvas.height
            }
        };
        
        ws.send(JSON.stringify(message));
        
        // Programar próximo frame
        setTimeout(() => processFrame(), 1000 / fps);
    } catch (err) {
        console.error('Error processing frame:', err);
    }
}

function displayResults(data) {
    const resultsDiv = document.getElementById('results');
    if (data.type === 'analysis') {
        resultsDiv.innerHTML = `
            <div class="result-item">
                <strong>Análisis del Frame:</strong>
                <pre>${JSON.stringify(data.data, null, 2)}</pre>
            </div>
        `;
        
        // Ejemplo: Cambiar color basado en intensidad si existe
        if (data.data.mean_intensity) {
            const intensity = Math.min(255, data.data.mean_intensity);
            resultsDiv.style.borderLeft = `5px solid rgb(${intensity}, 100, 100)`;
        }
    }
}

// ================= INICIALIZACIÓN =================
async function initialize() {
    // Cargar lista de cámaras disponibles
    await getCameras();
    
    // Iniciar con cámara por defecto
    await getCameraStream();
    
    // Configurar botones
    document.getElementById('connectBtn').addEventListener('click', () => {
        initWebSocket();
    });
    
    document.getElementById('stopBtn').addEventListener('click', () => {
        stopProcessing();
        if (ws) {
            ws.close();
        }
    });
}

// ================= LIMPIEZA =================
window.addEventListener('beforeunload', () => {
    stopProcessing();
    if (ws) ws.close();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
});

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', initialize);