// Store all photos and their associated chats
const photos = [];
let currentPhotoIndex = -1;
const ws = new WebSocket(`ws://${window.location.host}`);

/**
 * Compress image to reduce file size
 */
async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Reduce dimensions
                const maxWidth = 800;
                const maxHeight = 600;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress to JPEG with quality 0.6
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                resolve(compressedDataUrl);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Trigger the photo input dialog
 */
function triggerPhotoUpload() {
    document.getElementById('photoInput').click();
}

/**
 * Handle photo selection/capture
 */
document.getElementById('photoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        // Compress the image
        const compressedSrc = await compressImage(file);
        
        // Add photo object with unique ID and empty messages array
        const photoObj = {
            id: 'photo_' + Date.now(),
            src: compressedSrc,
            uploadDate: new Date().toLocaleString(),
            messages: []
        };
        
        photos.push(photoObj);

        // Auto-select the newly uploaded photo
        currentPhotoIndex = photos.length - 1;
        displayPhoto();
        displayMessages();

        // Send photo to server so other users see it
        ws.send(JSON.stringify({
            type: 'photo',
            photo: photoObj
        }));
    } catch (error) {
        alert('Error compressing image: ' + error.message);
    }

    // Reset input
    e.target.value = '';
});

/**
 * Move to the next photo
 */
function nextPhoto() {
    if (photos.length === 0) return;
    currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
    displayPhoto();
    displayMessages();
}

/**
 * Move to the previous photo
 */
function prevPhoto() {
    if (photos.length === 0) return;
    currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length;
    displayPhoto();
    displayMessages();
}

/**
 * Display the current photo
 */
function displayPhoto() {
    if (currentPhotoIndex < 0 || currentPhotoIndex >= photos.length) {
        document.getElementById('mainImage').src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ddd' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3ENo photo%3C/text%3E%3C/svg%3E";
        document.getElementById('chatHeader').textContent = 'No photos uploaded';
        document.getElementById('photoDate').textContent = '';
        return;
    }

    const photo = photos[currentPhotoIndex];
    document.getElementById('mainImage').src = photo.src;
    document.getElementById('chatHeader').textContent = `Photo ${currentPhotoIndex + 1} of ${photos.length}`;
    document.getElementById('photoDate').textContent = photo.uploadDate;
}

/**
 * Send a message for the currently selected photo
 */
function sendMessage() {
    if (currentPhotoIndex < 0) {
        alert('Please upload or select a photo first');
        return;
    }

    const input = document.getElementById('messageInput');
    const messageText = input.value.trim();
    
    if (!messageText) return;

    // Create message object
    const message = {
        date: new Date().toLocaleString(),
        text: messageText
    };

    // Add to current photo's messages
    photos[currentPhotoIndex].messages.push(message);

    // Send to server with photo ID
    ws.send(JSON.stringify({
        type: 'message',
        photoId: photos[currentPhotoIndex].id,
        message: message
    }));

    input.value = '';
    displayMessages();
}

/**
 * Display messages for the currently selected photo
 */
function displayMessages() {
    if (currentPhotoIndex < 0 || currentPhotoIndex >= photos.length) {
        document.getElementById('chatMessages').innerHTML = '<div class="empty-state">Upload a photo to start chatting</div>';
        return;
    }

    const messages = photos[currentPhotoIndex].messages;
    const chatDiv = document.getElementById('chatMessages');
    
    if (messages.length === 0) {
        chatDiv.innerHTML = '<div class="empty-state">No messages yet</div>';
        return;
    }

    chatDiv.innerHTML = messages.map(m => `
        <div class="message">
            <div class="message-date">${m.date}</div>
            <div class="message-text">${m.text}</div>
        </div>
    `).join('');
    
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

let isSiteClosed = false;

/**
 * Show action menu
 */
function showWipeMenu() {
    const password = prompt('ENTER PASSWORD:');
    if (!password) return;
    
    const choice = prompt('1. Wipe Data\n2. Close Site\n\nEnter choice (1 or 2):');
    
    if (choice === '1') {
        wipeAllData(password);
    } else if (choice === '2') {
        closeSite(password);
    }
}

/**
 * Wipe all data
 */
async function wipeAllData(password) {
    try {
        const response = await fetch('/api/wipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('✓ All data wiped!');
            photos.length = 0;
            currentPhotoIndex = -1;
            displayPhoto();
            displayMessages();
        } else {
            alert('✗ WRONG PASSWORD');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Close the site (hide all content)
 */
async function closeSite(password) {
    try {
        const response = await fetch('/api/close-site', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isSiteClosed = true;
            document.body.style.backgroundColor = 'white';
            document.body.style.margin = '0';
            document.body.style.padding = '0';
            
            // Hide all elements except the button
            const allElements = document.querySelectorAll('body > *');
            allElements.forEach(el => {
                if (el.id !== 'wipeBtn') {
                    el.style.display = 'none';
                }
            });
        } else {
            alert('✗ WRONG PASSWORD');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Reopen the site
 */
function reopenSite() {
    const password = prompt('ENTER PASSWORD:');
    if (!password) return;
    
    fetch('/api/open-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            isSiteClosed = false;
            document.body.style.backgroundColor = '';
            
            // Show all elements
            const allElements = document.querySelectorAll('body > *');
            allElements.forEach(el => {
                if (el.id !== 'wipeBtn') {
                    el.style.display = '';
                }
            });
        } else {
            alert('✗ WRONG PASSWORD');
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

/**
 * Handle Enter key to send message
 */
document.getElementById('messageInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
});

/**
 * Handle WebSocket messages from server
 */
ws.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.type === 'history') {
        // Load initial photo history from server
        photos.length = 0; // Clear existing
        photos.push(...data.photos);
        
        if (photos.length > 0) {
            currentPhotoIndex = 0;
            displayPhoto();
            displayMessages();
        }
    }
    else if (data.type === 'message') {
        // Message from another user
        const photo = photos.find(p => p.id === data.photoId);
        if (photo) {
            // Check if message already exists (deduplication)
            const msgExists = photo.messages.some(m => m.date === data.message.date && m.text === data.message.text);
            
            if (!msgExists) {
                photo.messages.push(data.message);
            }
            
            // Refresh display if this photo is currently selected
            if (photos.indexOf(photo) === currentPhotoIndex) {
                displayMessages();
            }
        }
    } 
    else if (data.type === 'photo') {
        // New photo uploaded by another user
        const existingPhoto = photos.find(p => p.id === data.photo.id);
        if (!existingPhoto) {
            photos.push(data.photo);
            // Auto-select new photo
            currentPhotoIndex = photos.length - 1;
            displayPhoto();
            displayMessages();
        }
    }
    else if (data.type === 'wipe') {
        // Data was wiped
        photos.length = 0;
        currentPhotoIndex = -1;
        displayPhoto();
        displayMessages();
    }
    else if (data.type === 'site-closed') {
        // Site was closed by someone
        isSiteClosed = true;
        document.body.style.backgroundColor = 'white';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        const allElements = document.querySelectorAll('body > *');
        allElements.forEach(el => {
            if (el.id !== 'wipeBtn') {
                el.style.display = 'none';
            }
        });
    }
    else if (data.type === 'site-opened') {
        // Site was opened by someone
        isSiteClosed = false;
        document.body.style.backgroundColor = '';
        const allElements = document.querySelectorAll('body > *');
        allElements.forEach(el => {
            if (el.id !== 'wipeBtn') {
                el.style.display = '';
            }
        });
    }
};