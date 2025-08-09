class MultiplayerGame {
    constructor() {
        this.isHost = false;
        this.isGuest = false;
        this.roomId = null;
        this.onMessageCallback = null;
        this.onConnectionCallback = null;
        this.onDisconnectCallback = null;
        this.connected = false;
        this.gameRef = null;
        this.messagesRef = null;
        this.listeners = [];
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async createGame() {
        this.isHost = true;
        this.roomId = this.generateRoomId();
        
        console.log('Creating Firebase game room:', this.roomId);
        
        try {
            // Reference to this game in Firebase
            this.gameRef = window.firebaseDB.ref('games/' + this.roomId);
            
            const roomData = {
                roomId: this.roomId,
                host: 'waiting',
                guest: null,
                hostName: '',
                guestName: '',
                gameState: 'waiting',
                created: firebase.database.ServerValue.TIMESTAMP,
                lastActivity: firebase.database.ServerValue.TIMESTAMP
            };
            
            // Create the room
            await this.gameRef.set(roomData);
            console.log('Firebase room created successfully');
            
            // Start listening for changes
            this.startFirebaseListeners();
            
            return this.roomId;
            
        } catch (error) {
            console.error('Failed to create Firebase room:', error);
            
            // Fallback to localStorage
            console.log('Using localStorage fallback');
            this.fallbackMode = true;
            this.startFallbackHostPolling();
            
            return this.roomId;
        }
    }

    async joinGame(roomId) {
        this.isGuest = true;
        this.roomId = roomId;
        
        console.log('Joining Firebase game room:', roomId);
        
        try {
            // Reference to this game in Firebase
            this.gameRef = window.firebaseDB.ref('games/' + roomId);
            
            // Check if room exists
            const snapshot = await this.gameRef.once('value');
            if (!snapshot.exists()) {
                throw new Error('Room does not exist');
            }
            
            console.log('Room found, joining...');
            
            // Mark guest as connected
            await this.gameRef.child('guest').set('connected');
            await this.gameRef.child('lastActivity').set(firebase.database.ServerValue.TIMESTAMP);
            
            // Start listening for changes
            this.startFirebaseListeners();
            
            // Simulate connection for immediate feedback
            setTimeout(() => {
                this.connected = true;
                if (this.onConnectionCallback) {
                    this.onConnectionCallback();
                }
            }, 1000);
            
            return Promise.resolve();
            
        } catch (error) {
            console.error('Failed to join Firebase room:', error);
            
            // Fallback to localStorage
            console.log('Using localStorage fallback');
            this.fallbackMode = true;
            this.startFallbackGuestPolling();
            
            return Promise.resolve();
        }
    }

    startFirebaseListeners() {
        if (!this.gameRef) return;
        
        console.log('Starting Firebase listeners...');
        
        // Listen for game state changes
        const gameListener = this.gameRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;
            
            console.log('Firebase game state update:', data);
            
            // Check for guest connection (host only)
            if (this.isHost && data.guest && data.guest === 'connected' && !this.connected) {
                this.connected = true;
                console.log('Guest connected via Firebase!');
                if (this.onConnectionCallback) {
                    this.onConnectionCallback();
                }
            }
        });
        
        this.listeners.push({ ref: this.gameRef, listener: gameListener });
        
        // Listen for messages
        this.messagesRef = window.firebaseDB.ref('messages/' + this.roomId);
        const messagesListener = this.messagesRef.on('child_added', (snapshot) => {
            const message = snapshot.val();
            if (!message) return;
            
            console.log('Firebase message received:', message);
            
            // Only process messages for the other player
            if ((this.isHost && message.from === 'guest') || 
                (this.isGuest && message.from === 'host')) {
                
                if (this.onMessageCallback) {
                    this.onMessageCallback(message.data);
                }
                
                // Remove processed message
                snapshot.ref.remove();
            }
        });
        
        this.listeners.push({ ref: this.messagesRef, listener: messagesListener });
    }

    async sendMessage(data) {
        console.log('Sending Firebase message:', data);
        
        if (this.fallbackMode) {
            // Use localStorage fallback
            const targetKey = this.isHost ? `messages_to_guest_${this.roomId}` : `messages_to_host_${this.roomId}`;
            const messages = JSON.parse(localStorage.getItem(targetKey) || '[]');
            messages.push(data);
            localStorage.setItem(targetKey, JSON.stringify(messages));
            
            // Also broadcast for cross-tab communication
            localStorage.setItem(`broadcast_${this.roomId}`, JSON.stringify(data));
            setTimeout(() => {
                localStorage.removeItem(`broadcast_${this.roomId}`);
            }, 100);
            
            return true;
        }
        
        if (!this.messagesRef) {
            console.error('No Firebase messages reference');
            return false;
        }
        
        try {
            const message = {
                from: this.isHost ? 'host' : 'guest',
                data: data,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            
            await this.messagesRef.push(message);
            
            // Update last activity
            if (this.gameRef) {
                await this.gameRef.child('lastActivity').set(firebase.database.ServerValue.TIMESTAMP);
            }
            
            return true;
            
        } catch (error) {
            console.error('Failed to send Firebase message:', error);
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
        console.log('Disconnecting from Firebase...');
        
        // Remove all Firebase listeners
        this.listeners.forEach(({ ref, listener }) => {
            ref.off('value', listener);
            ref.off('child_added', listener);
        });
        this.listeners = [];
        
        // Clean up localStorage
        if (this.roomId) {
            localStorage.removeItem(`guest_${this.roomId}`);
            localStorage.removeItem(`messages_to_host_${this.roomId}`);
            localStorage.removeItem(`messages_to_guest_${this.roomId}`);
        }
        
        this.connected = false;
        this.gameRef = null;
        this.messagesRef = null;
    }

    isConnected() {
        return this.connected;
    }

    // Fallback methods for localStorage (same as before)
    startFallbackHostPolling() {
        console.log('Host using localStorage fallback...');
        
        // Update URL to include room info for sharing
        const newUrl = `${window.location.pathname}#room-${this.roomId}`;
        window.history.replaceState({}, '', newUrl);
        
        // Set up cross-tab communication
        this.setupCrossTabCommunication();
        
        this.pollInterval = setInterval(() => {
            // Check localStorage for guest connection 
            const guestData = localStorage.getItem(`guest_${this.roomId}`);
            if (guestData && !this.connected) {
                this.connected = true;
                console.log('Guest connected via localStorage!');
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
        console.log('Guest using localStorage fallback...');
        
        // Mark guest as connected in localStorage
        localStorage.setItem(`guest_${this.roomId}`, JSON.stringify({
            connected: true,
            timestamp: Date.now()
        }));
        
        // Set up cross-tab communication
        this.setupCrossTabCommunication();
        
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

    setupCrossTabCommunication() {
        // Use storage events to communicate across tabs/devices on same domain
        window.addEventListener('storage', (event) => {
            if (event.key === `broadcast_${this.roomId}`) {
                const data = JSON.parse(event.newValue || '{}');
                if (data.type && this.onMessageCallback) {
                    console.log('Received cross-tab message:', data);
                    this.onMessageCallback(data);
                }
            }
        });
    }
}

// Global multiplayer instance
window.multiplayer = new MultiplayerGame();

// Debug helper - expose debugging info globally
window.debugMultiplayer = () => {
    console.log('=== MULTIPLAYER DEBUG INFO ===');
    console.log('Firebase available:', !!window.firebaseDB);
    console.log('isHost:', window.multiplayer.isHost);
    console.log('isGuest:', window.multiplayer.isGuest);
    console.log('roomId:', window.multiplayer.roomId);
    console.log('connected:', window.multiplayer.connected);
    console.log('fallbackMode:', window.multiplayer.fallbackMode);
    console.log('gameRef:', window.multiplayer.gameRef);
    console.log('Current URL:', window.location.href);
    console.log('URL Hash:', window.location.hash);
};