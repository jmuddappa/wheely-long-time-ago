class MultiplayerGame {
    constructor() {
        this.isHost = false;
        this.isGuest = false;
        this.roomId = null;
        this.peerId = null;
        this.peer = null;
        this.connection = null;
        this.onMessageCallback = null;
        this.onConnectionCallback = null;
        this.onDisconnectCallback = null;
        this.connected = false;
        this.fallbackMode = false;
    }

    generateRoomId() {
        return 'wheely-' + Math.random().toString(36).substring(2, 8).toLowerCase();
    }

    async createGame() {
        this.isHost = true;
        this.roomId = this.generateRoomId();
        
        console.log('Creating PeerJS game room:', this.roomId);
        
        try {
            // Create a PeerJS peer with our room ID using a reliable free server
            this.peer = new Peer(this.roomId, {
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                debug: 1
            });

            return new Promise((resolve, reject) => {
                this.peer.on('open', (id) => {
                    console.log('PeerJS host peer opened with ID:', id);
                    this.peerId = id;
                    this.setupHostListeners();
                    resolve(this.roomId);
                });

                this.peer.on('error', (err) => {
                    console.error('PeerJS peer error:', err);
                    
                    // Fallback to localStorage
                    console.log('Using localStorage fallback');
                    this.fallbackMode = true;
                    this.startFallbackHostPolling();
                    resolve(this.roomId);
                });

                // Timeout after 5 seconds for faster fallback
                setTimeout(() => {
                    if (!this.peerId) {
                        console.log('PeerJS connection timeout, using fallback');
                        this.fallbackMode = true;
                        this.startFallbackHostPolling();
                        resolve(this.roomId);
                    }
                }, 5000);
            });

        } catch (error) {
            console.error('Failed to create PeerJS room:', error);
            
            // Fallback to localStorage
            console.log('Using localStorage fallback');
            this.fallbackMode = true;
            this.startFallbackHostPolling();
            
            return this.roomId;
        }
    }

    setupHostListeners() {
        // Listen for incoming connections
        this.peer.on('connection', (conn) => {
            console.log('Guest connected via PeerJS!');
            this.connection = conn;
            this.connected = true;

            // Set up connection event handlers
            conn.on('data', (data) => {
                console.log('PeerJS message received:', data);
                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
            });

            conn.on('close', () => {
                console.log('Guest disconnected');
                this.connected = false;
                if (this.onDisconnectCallback) {
                    this.onDisconnectCallback();
                }
            });

            // Notify that connection is established
            if (this.onConnectionCallback) {
                this.onConnectionCallback();
            }
        });

        this.peer.on('disconnected', () => {
            console.log('PeerJS peer disconnected');
            this.connected = false;
        });
    }

    async joinGame(roomId) {
        this.isGuest = true;
        this.roomId = roomId;

        console.log('Joining PeerJS game room:', roomId);

        try {
            // Create a guest peer using the same reliable server
            this.peer = new Peer({
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                debug: 1
            });

            return new Promise((resolve, reject) => {
                this.peer.on('open', (id) => {
                    console.log('PeerJS guest peer opened with ID:', id);
                    this.peerId = id;
                    
                    // Connect to the host
                    this.connection = this.peer.connect(roomId);
                    
                    this.connection.on('open', () => {
                        console.log('Connected to host via PeerJS!');
                        this.connected = true;
                        this.setupGuestListeners();
                        
                        if (this.onConnectionCallback) {
                            this.onConnectionCallback();
                        }
                        
                        resolve();
                    });

                    this.connection.on('error', (err) => {
                        console.error('PeerJS connection error:', err);
                        this.fallbackMode = true;
                        this.startFallbackGuestPolling();
                        resolve();
                    });
                });

                this.peer.on('error', (err) => {
                    console.error('PeerJS guest peer error:', err);
                    this.fallbackMode = true;
                    this.startFallbackGuestPolling();
                    resolve();
                });

                // Timeout after 5 seconds for faster fallback
                setTimeout(() => {
                    if (!this.connected) {
                        console.log('PeerJS join timeout, using fallback');
                        this.fallbackMode = true;
                        this.startFallbackGuestPolling();
                        resolve();
                    }
                }, 5000);
            });

        } catch (error) {
            console.error('Failed to join PeerJS room:', error);
            
            // Fallback to localStorage
            console.log('Using localStorage fallback');
            this.fallbackMode = true;
            this.startFallbackGuestPolling();
            
            return Promise.resolve();
        }
    }

    setupGuestListeners() {
        this.connection.on('data', (data) => {
            console.log('PeerJS message received:', data);
            if (this.onMessageCallback) {
                this.onMessageCallback(data);
            }
        });

        this.connection.on('close', () => {
            console.log('Host disconnected');
            this.connected = false;
            if (this.onDisconnectCallback) {
                this.onDisconnectCallback();
            }
        });
    }

    async sendMessage(data) {
        console.log('Sending message:', data);

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

        if (!this.connection || !this.connected) {
            console.error('No PeerJS connection available');
            return false;
        }

        try {
            this.connection.send(data);
            return true;
        } catch (error) {
            console.error('Failed to send PeerJS message:', error);
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
        console.log('Disconnecting from PeerJS...');

        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }

        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        // Clean up localStorage
        if (this.roomId) {
            localStorage.removeItem(`guest_${this.roomId}`);
            localStorage.removeItem(`messages_to_host_${this.roomId}`);
            localStorage.removeItem(`messages_to_guest_${this.roomId}`);
        }

        this.connected = false;
        this.peerId = null;
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
    console.log('PeerJS available:', !!window.Peer);
    console.log('isHost:', window.multiplayer.isHost);
    console.log('isGuest:', window.multiplayer.isGuest);
    console.log('roomId:', window.multiplayer.roomId);
    console.log('peerId:', window.multiplayer.peerId);
    console.log('connected:', window.multiplayer.connected);
    console.log('fallbackMode:', window.multiplayer.fallbackMode);
    console.log('peer:', window.multiplayer.peer);
    console.log('connection:', window.multiplayer.connection);
    console.log('Current URL:', window.location.href);
    console.log('URL Hash:', window.location.hash);
};