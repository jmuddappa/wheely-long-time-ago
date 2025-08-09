class MultiplayerGame {
    constructor() {
        this.isHost = false;
        this.isGuest = false;
        this.roomId = null;
        this.onMessageCallback = null;
        this.onConnectionCallback = null;
        this.onDisconnectCallback = null;
        this.connected = false;
        this.pollInterval = null;
        // Using a simple, free Firebase-like service
        this.baseUrl = 'https://api.jsonstorage.net/v1/json';
        this.binId = null;
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async createGame() {
        this.isHost = true;
        this.roomId = this.generateRoomId();
        
        const roomData = {
            roomId: this.roomId,
            host: 'waiting',
            guest: null,
            hostMessages: [],
            guestMessages: [],
            hostName: '',
            guestName: '',
            gameState: 'waiting',
            created: Date.now()
        };
        
        try {
            // Create room in cloud storage
            console.log('Creating room on server...');
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(roomData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            
            // Extract the bin ID from the response
            if (result.uri) {
                this.binId = result.uri.split('/').pop();
            } else if (result.url) {
                this.binId = result.url.split('/').pop();
            } else if (result.id) {
                this.binId = result.id;
            } else {
                throw new Error('No ID returned from server');
            }
            
            console.log('Room created with bin ID:', this.binId);
            
            // Start polling for guest
            this.startHostPolling();
            
            return this.roomId;
        } catch (error) {
            console.error('Failed to create online room:', error);
            
            // Fallback: Use room ID in URL hash for simple connection
            console.log('Using URL-based fallback connection');
            this.fallbackMode = true;
            this.startFallbackHostPolling();
            
            return this.roomId;
        }
    }

    async joinGame(roomId) {
        this.isGuest = true;
        this.roomId = roomId;
        
        // Try to find the room by checking URL parameters
        // In fallback mode, we'll extract the bin ID from the URL
        try {
            // First try to extract bin ID from URL hash if it exists
            const hash = window.location.hash;
            if (hash.includes('bin=')) {
                this.binId = hash.split('bin=')[1].split('&')[0];
                console.log('Found bin ID in URL:', this.binId);
            }
            
            if (this.binId) {
                await this.joinExistingRoom();
            } else {
                throw new Error('No bin ID found');
            }
            
            this.startGuestPolling();
            
        } catch (error) {
            console.log('Using fallback connection method');
            this.fallbackMode = true;
            this.startFallbackGuestPolling();
        }
        
        // Simulate connection for immediate feedback
        setTimeout(() => {
            this.connected = true;
            if (this.onConnectionCallback) {
                this.onConnectionCallback();
            }
        }, 2000);
        
        return Promise.resolve();
    }

    async joinExistingRoom() {
        try {
            const response = await fetch(`${this.baseUrl}/${this.binId}`);
            if (response.ok) {
                const roomData = await response.json();
                // Mark guest as connected
                roomData.guest = 'connected';
                roomData.guestName = 'Guest'; // Will be updated later
                
                await this.updateRoom(roomData);
                console.log('Successfully joined room');
            }
        } catch (error) {
            console.error('Failed to join existing room:', error);
            throw error;
        }
    }

    startHostPolling() {
        console.log('Host starting server polling...');
        
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.baseUrl}/${this.binId}`);
                if (response.ok) {
                    const roomData = await response.json();
                    
                    // Check if guest joined
                    if (roomData.guest && !this.connected) {
                        this.connected = true;
                        console.log('Guest connected!');
                        if (this.onConnectionCallback) {
                            this.onConnectionCallback();
                        }
                    }
                    
                    // Process guest messages
                    if (roomData.guestMessages && roomData.guestMessages.length > 0) {
                        roomData.guestMessages.forEach(msg => {
                            if (this.onMessageCallback) {
                                this.onMessageCallback(msg);
                            }
                        });
                        
                        // Clear processed messages
                        roomData.guestMessages = [];
                        await this.updateRoom(roomData);
                    }
                }
            } catch (error) {
                console.error('Host polling error:', error);
            }
        }, 2000);
    }

    startGuestPolling() {
        console.log('Guest starting server polling...');
        
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.baseUrl}/${this.binId}`);
                if (response.ok) {
                    const roomData = await response.json();
                    
                    // Process host messages
                    if (roomData.hostMessages && roomData.hostMessages.length > 0) {
                        roomData.hostMessages.forEach(msg => {
                            if (this.onMessageCallback) {
                                this.onMessageCallback(msg);
                            }
                        });
                        
                        // Clear processed messages
                        roomData.hostMessages = [];
                        await this.updateRoom(roomData);
                    }
                }
            } catch (error) {
                console.error('Guest polling error:', error);
            }
        }, 2000);
    }

    // Fallback methods for when server is unavailable
    startFallbackHostPolling() {
        console.log('Host using fallback polling...');
        
        // Update URL to include room info for sharing
        const newUrl = `${window.location.pathname}#room-${this.roomId}`;
        window.history.replaceState({}, '', newUrl);
        
        this.pollInterval = setInterval(() => {
            // Check localStorage for guest connection (same device testing)
            const guestData = localStorage.getItem(`guest_${this.roomId}`);
            if (guestData && !this.connected) {
                this.connected = true;
                if (this.onConnectionCallback) {
                    this.onConnectionCallback();
                }
            }
            
            // Process messages
            const messages = JSON.parse(localStorage.getItem(`messages_to_host_${this.roomId}`) || '[]');
            if (messages.length > 0) {
                messages.forEach(msg => {
                    if (this.onMessageCallback) {
                        this.onMessageCallback(msg);
                    }
                });
                localStorage.setItem(`messages_to_host_${this.roomId}`, '[]');
            }
        }, 1000);
    }

    startFallbackGuestPolling() {
        console.log('Guest using fallback polling...');
        
        // Mark guest as connected in localStorage
        localStorage.setItem(`guest_${this.roomId}`, JSON.stringify({
            connected: true,
            timestamp: Date.now()
        }));
        
        this.pollInterval = setInterval(() => {
            const messages = JSON.parse(localStorage.getItem(`messages_to_guest_${this.roomId}`) || '[]');
            if (messages.length > 0) {
                messages.forEach(msg => {
                    if (this.onMessageCallback) {
                        this.onMessageCallback(msg);
                    }
                });
                localStorage.setItem(`messages_to_guest_${this.roomId}`, '[]');
            }
        }, 1000);
    }

    async updateRoom(data) {
        if (!this.binId || this.fallbackMode) return;
        
        try {
            await fetch(`${this.baseUrl}/${this.binId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error('Failed to update room:', error);
        }
    }

    async sendMessage(data) {
        console.log('Sending message:', data);
        
        if (this.fallbackMode) {
            // Use localStorage fallback
            const targetKey = this.isHost ? `messages_to_guest_${this.roomId}` : `messages_to_host_${this.roomId}`;
            const messages = JSON.parse(localStorage.getItem(targetKey) || '[]');
            messages.push(data);
            localStorage.setItem(targetKey, JSON.stringify(messages));
            return true;
        }
        
        if (!this.binId) {
            console.error('No bin ID available for sending message');
            return false;
        }
        
        try {
            // Get current room data
            const response = await fetch(`${this.baseUrl}/${this.binId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch room data');
            }
            
            const roomData = await response.json();
            
            // Add message to appropriate queue
            if (this.isHost) {
                if (!roomData.hostMessages) roomData.hostMessages = [];
                roomData.hostMessages.push(data);
            } else {
                if (!roomData.guestMessages) roomData.guestMessages = [];
                roomData.guestMessages.push(data);
            }
            
            // Update room
            await this.updateRoom(roomData);
            return true;
            
        } catch (error) {
            console.error('Failed to send message:', error);
            return false;
        }
    }

    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    onConnection(callback) {
        this.onConnectionCallback = callback;
    }

    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }

    disconnect() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        
        // Clean up localStorage
        if (this.roomId) {
            localStorage.removeItem(`guest_${this.roomId}`);
            localStorage.removeItem(`messages_to_host_${this.roomId}`);
            localStorage.removeItem(`messages_to_guest_${this.roomId}`);
        }
        
        this.connected = false;
    }

    isConnected() {
        return this.connected;
    }
}

// Global multiplayer instance
window.multiplayer = new MultiplayerGame();