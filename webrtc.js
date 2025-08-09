class MultiplayerGame {
    constructor() {
        this.isHost = false;
        this.isGuest = false;
        this.roomId = null;
        this.onMessageCallback = null;
        this.onConnectionCallback = null;
        this.onDisconnectCallback = null;
        this.connected = false;
    }

    // Generate a random room ID
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Create a game as host (simplified for testing)
    async createGame() {
        this.isHost = true;
        this.roomId = this.generateRoomId();
        
        // For testing, we'll use a simplified connection via localStorage and polling
        this.startHostPolling();
        
        return this.roomId;
    }

    // Join a game as guest (simplified for testing)  
    async joinGame(roomId) {
        this.isGuest = true;
        this.roomId = roomId;
        
        console.log('Guest trying to join room:', roomId); // Debug log
        
        // Check if host is available
        const hostData = localStorage.getItem(`host_${roomId}`);
        if (!hostData) {
            console.log('Host not found for room:', roomId); // Debug log
            throw new Error('Host not found');
        }
        
        console.log('Host found, guest connecting'); // Debug log
        
        // Set guest as connected
        localStorage.setItem(`guest_${roomId}`, JSON.stringify({
            connected: true,
            timestamp: Date.now()
        }));
        
        this.startGuestPolling();
        
        // Simulate connection delay
        setTimeout(() => {
            console.log('Guest connection established'); // Debug log
            this.connected = true;
            if (this.onConnectionCallback) {
                this.onConnectionCallback();
            }
        }, 1000);
        
        return Promise.resolve();
    }

    startHostPolling() {
        // Mark host as available
        localStorage.setItem(`host_${this.roomId}`, JSON.stringify({
            connected: true,
            timestamp: Date.now()
        }));
        
        console.log('Host started polling for room:', this.roomId); // Debug log
        
        // Poll for guest connection and messages
        this.pollInterval = setInterval(() => {
            // Check for guest connection
            const guestData = localStorage.getItem(`guest_${this.roomId}`);
            if (guestData && !this.connected) {
                console.log('Host detected guest connection'); // Debug log
                this.connected = true;
                if (this.onConnectionCallback) {
                    this.onConnectionCallback();
                }
            }
            
            // Check for messages from guest
            const messages = JSON.parse(localStorage.getItem(`messages_to_host_${this.roomId}`) || '[]');
            if (messages.length > 0) {
                console.log('Host received messages:', messages); // Debug log
                messages.forEach(msg => {
                    if (this.onMessageCallback) {
                        this.onMessageCallback(msg);
                    }
                });
                // Clear processed messages
                localStorage.setItem(`messages_to_host_${this.roomId}`, '[]');
            }
        }, 500);
    }

    startGuestPolling() {
        // Poll for messages from host
        this.pollInterval = setInterval(() => {
            const messages = JSON.parse(localStorage.getItem(`messages_to_guest_${this.roomId}`) || '[]');
            if (messages.length > 0) {
                messages.forEach(msg => {
                    if (this.onMessageCallback) {
                        this.onMessageCallback(msg);
                    }
                });
                // Clear processed messages
                localStorage.setItem(`messages_to_guest_${this.roomId}`, '[]');
            }
        }, 500);
    }

    // Send message to peer
    sendMessage(data) {
        if (!this.connected) {
            return false;
        }
        
        if (this.isHost) {
            // Send to guest
            const messages = JSON.parse(localStorage.getItem(`messages_to_guest_${this.roomId}`) || '[]');
            messages.push(data);
            localStorage.setItem(`messages_to_guest_${this.roomId}`, JSON.stringify(messages));
        } else if (this.isGuest) {
            // Send to host
            const messages = JSON.parse(localStorage.getItem(`messages_to_host_${this.roomId}`) || '[]');
            messages.push(data);
            localStorage.setItem(`messages_to_host_${this.roomId}`, JSON.stringify(messages));
        }
        
        return true;
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
        
        // Clean up localStorage
        if (this.roomId) {
            localStorage.removeItem(`host_${this.roomId}`);
            localStorage.removeItem(`guest_${this.roomId}`);
            localStorage.removeItem(`messages_to_host_${this.roomId}`);
            localStorage.removeItem(`messages_to_guest_${this.roomId}`);
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