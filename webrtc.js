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
        this.baseUrl = 'https://api.jsonstorage.net/v1/json';
    }

    // Generate a random room ID
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Create a game as host
    async createGame() {
        this.isHost = true;
        this.roomId = this.generateRoomId();
        
        const roomData = {
            id: this.roomId,
            host: 'waiting',
            guest: null,
            hostMessages: [],
            guestMessages: [],
            lastUpdate: Date.now()
        };
        
        try {
            // Create the room
            const response = await fetch(`${this.baseUrl}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(roomData)
            });
            
            if (!response.ok) {
                throw new Error('Failed to create room');
            }
            
            const result = await response.json();
            this.binId = result.uri.split('/').pop();
            
            console.log('Room created with ID:', this.binId);
            
            // Start polling for guest
            this.startHostPolling();
            
            return this.roomId;
        } catch (error) {
            console.error('Failed to create room:', error);
            // Fallback to localStorage for local testing
            localStorage.setItem(`room_${this.roomId}`, JSON.stringify(roomData));
            this.startLocalHostPolling();
            return this.roomId;
        }
    }

    // Join a game as guest
    async joinGame(roomId) {
        this.isGuest = true;
        this.roomId = roomId;
        
        // For now, simulate joining since we need the bin ID to connect
        // In a real app, you'd encode this in the URL
        console.log('Guest attempting to join room:', roomId);
        
        // Simulate connection for demo
        setTimeout(() => {
            this.connected = true;
            if (this.onConnectionCallback) {
                this.onConnectionCallback();
            }
        }, 2000);
        
        this.startLocalGuestPolling();
        
        return Promise.resolve();
    }

    // Polling with external service (when available)
    startHostPolling() {
        if (!this.binId) return;
        
        console.log('Host polling with bin ID:', this.binId);
        
        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.baseUrl}/${this.binId}`, {
                    method: 'GET'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.guest && !this.connected) {
                        this.connected = true;
                        if (this.onConnectionCallback) {
                            this.onConnectionCallback();
                        }
                    }
                    
                    if (data.guestMessages && data.guestMessages.length > 0) {
                        data.guestMessages.forEach(msg => {
                            if (this.onMessageCallback) {
                                this.onMessageCallback(msg);
                            }
                        });
                        
                        // Clear messages
                        data.guestMessages = [];
                        await this.updateRoom(data);
                    }
                }
            } catch (error) {
                console.error('Host polling error:', error);
            }
        }, 2000);
    }

    // Local polling fallback
    startLocalHostPolling() {
        console.log('Host using local polling for room:', this.roomId);
        
        this.pollInterval = setInterval(() => {
            try {
                const stored = localStorage.getItem(`room_${this.roomId}`);
                if (stored) {
                    const data = JSON.parse(stored);
                    
                    if (data.guest && !this.connected) {
                        this.connected = true;
                        if (this.onConnectionCallback) {
                            this.onConnectionCallback();
                        }
                    }
                    
                    if (data.guestMessages && data.guestMessages.length > 0) {
                        data.guestMessages.forEach(msg => {
                            if (this.onMessageCallback) {
                                this.onMessageCallback(msg);
                            }
                        });
                        
                        data.guestMessages = [];
                        localStorage.setItem(`room_${this.roomId}`, JSON.stringify(data));
                    }
                }
            } catch (error) {
                console.error('Local host polling error:', error);
            }
        }, 1000);
    }

    startLocalGuestPolling() {
        console.log('Guest using local polling for room:', this.roomId);
        
        this.pollInterval = setInterval(() => {
            try {
                const stored = localStorage.getItem(`room_${this.roomId}`);
                if (stored) {
                    const data = JSON.parse(stored);
                    
                    if (data.hostMessages && data.hostMessages.length > 0) {
                        data.hostMessages.forEach(msg => {
                            if (this.onMessageCallback) {
                                this.onMessageCallback(msg);
                            }
                        });
                        
                        data.hostMessages = [];
                        localStorage.setItem(`room_${this.roomId}`, JSON.stringify(data));
                    }
                }
            } catch (error) {
                console.error('Local guest polling error:', error);
            }
        }, 1000);
    }

    async updateRoom(data) {
        if (this.binId) {
            try {
                await fetch(`${this.baseUrl}/${this.binId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
            } catch (error) {
                console.error('Failed to update room:', error);
            }
        }
    }

    // Send message to peer
    sendMessage(data) {
        try {
            if (this.binId) {
                // Use external service
                this.sendMessageExternal(data);
            } else {
                // Use localStorage fallback
                this.sendMessageLocal(data);
            }
            return true;
        } catch (error) {
            console.error('Failed to send message:', error);
            return false;
        }
    }

    async sendMessageExternal(data) {
        // Implementation for external service
        console.log('Sending message via external service:', data);
    }

    sendMessageLocal(data) {
        const stored = localStorage.getItem(`room_${this.roomId}`) || '{}';
        const roomData = JSON.parse(stored);
        
        if (this.isHost) {
            if (!roomData.hostMessages) roomData.hostMessages = [];
            roomData.hostMessages.push(data);
        } else {
            if (!roomData.guestMessages) roomData.guestMessages = [];
            roomData.guestMessages.push(data);
            roomData.guest = 'connected';
        }
        
        roomData.lastUpdate = Date.now();
        localStorage.setItem(`room_${this.roomId}`, JSON.stringify(roomData));
    }

    // Set callbacks
    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    onConnection(callback) {
        this.onConnectionCallback = callback;
    }

    onDisconnect(callback) {
        this.onDisconnectCallback = callback;
    }

    // Clean up
    disconnect() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
        
        if (this.roomId) {
            localStorage.removeItem(`room_${this.roomId}`);
        }
        
        this.connected = false;
    }

    // Get connection state
    isConnected() {
        return this.connected;
    }
}

// Global multiplayer instance
window.multiplayer = new MultiplayerGame();