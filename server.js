const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.use(express.json());

// JSONBin configuration
const JSONBIN_API_URL = 'https://api.jsonbin.io/v3';
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '$2a$10$wNtf26TFWfeWQ3EJuL6BpOkTJXiWRNl9jZV3Uci/R6Q3mCx.kg52S';
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '696c060eae596e708fe35f94';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'BRENDAN-IS-KING';

// Hash password for verification
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Verify password
function verifyPassword(inputPassword) {
    return hashPassword(inputPassword) === hashPassword(ADMIN_PASSWORD);
}

// Store all photos in memory
let photos = [];
let isSiteClosed = false;

// Load initial data from JSONBin on startup
async function loadPhotosFromBin() {
    try {
        const response = await axios.get(`${JSONBIN_API_URL}/b/${JSONBIN_BIN_ID}`, {
            headers: {
                'X-Master-Key': JSONBIN_API_KEY
            }
        });
        photos = response.data.record.photos || [];
        isSiteClosed = response.data.record.isSiteClosed || false;
        console.log('✓ Loaded photos from JSONBin');
    } catch (error) {
        console.log('First time setup or error loading from JSONBin:', error.message);
        photos = [];
        isSiteClosed = false;
    }
}

// Save photos to JSONBin
async function savePhotosToBin() {
    try {
        await axios.put(`${JSONBIN_API_URL}/b/${JSONBIN_BIN_ID}`, 
            { photos: photos, isSiteClosed: isSiteClosed },
            {
                headers: {
                    'X-Master-Key': JSONBIN_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('✓ Data saved to JSONBin');
    } catch (error) {
        console.error('✗ Error saving to JSONBin:');
        console.error('Status:', error.response?.status);
        console.error('Message:', error.response?.data || error.message);
    }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    // Send existing photos and site status to newly connected client
    ws.send(JSON.stringify({ 
        type: 'history', 
        photos: photos,
        isSiteClosed: isSiteClosed
    }));
    
    // If site is already closed, immediately tell this client
    if (isSiteClosed) {
        ws.send(JSON.stringify({ type: 'site-closed' }));
    }
    
    ws.on('message', async (data) => {
        try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'photo') {
                // New photo uploaded
                const photo = parsed.photo;
                photos.push(photo);
                
                // Save to JSONBin
                await savePhotosToBin();
                
                // Broadcast to all clients
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'photo',
                            photo: photo
                        }));
                    }
                });
            } 
            else if (parsed.type === 'message') {
                // New message for a photo
                const photoId = parsed.photoId;
                const message = parsed.message;
                
                // Find and update the photo
                const photo = photos.find(p => p.id === photoId);
                if (photo) {
                    photo.messages.push(message);
                    
                    // Save to JSONBin
                    await savePhotosToBin();
                    
                    // Broadcast to all clients
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'message',
                                photoId: photoId,
                                message: message
                            }));
                        }
                    });
                }
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
});

// API endpoint to wipe all data
app.post('/api/wipe', async (req, res) => {
    const { password } = req.body;
    
    if (!verifyPassword(password)) {
        return res.json({ success: false, message: 'Invalid password' });
    }
    
    // Clear all photos
    photos = [];
    isSiteClosed = false;
    
    // Save to JSONBin
    await savePhotosToBin();
    
    // Broadcast wipe event to all connected clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'wipe' }));
        }
    });
    
    console.log('✓ All data wiped');
    res.json({ success: true, message: 'All data wiped' });
});

// API endpoint to close site
app.post('/api/close-site', async (req, res) => {
    const { password } = req.body;
    
    if (!verifyPassword(password)) {
        return res.json({ success: false, message: 'Invalid password' });
    }
    
    isSiteClosed = true;
    
    // Save to JSONBin
    await savePhotosToBin();
    
    // Broadcast site closed event to all connected clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'site-closed' }));
        }
    });
    
    console.log('✓ Site closed');
    res.json({ success: true, message: 'Site closed' });
});

// API endpoint to open site
app.post('/api/open-site', async (req, res) => {
    const { password } = req.body;
    
    if (!verifyPassword(password)) {
        return res.json({ success: false, message: 'Invalid password' });
    }
    
    isSiteClosed = false;
    
    // Save to JSONBin
    await savePhotosToBin();
    
    // Broadcast site opened event to all connected clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'site-opened' }));
        }
    });
    
    console.log('✓ Site opened');
    res.json({ success: true, message: 'Site opened' });
});

// Load photos on startup and start server
loadPhotosFromBin().then(() => {
    server.listen(3000, () => console.log('✓ Server running on http://localhost:3000'));
});

module.exports = { server, wss, app };