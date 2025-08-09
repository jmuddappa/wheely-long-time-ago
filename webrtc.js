class MultiplayerGame {
    constructor() {
        this.isHost = false;
        this.isGuest = false;
        this.connection = null;
        this.dataChannel = null;
        this.roomId = null;
        this.onMessageCallback = null;
        this.onConnectionCallback = null;
        this.onDisconnectCallback = null;
        this.connected = false;
        this.iceCandidates = [];
        this.offer = null;
        this.answer = null;
    }

    // Generate a random room ID
    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // Create a game as host
    async createGame() {
        this.isHost = true;
        this.roomId = this.generateRoomId();
        
        // Create peer connection with STUN servers
        this.connection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        });

        // Create data channel
        this.dataChannel = this.connection.createDataChannel('gameData', {
            ordered: true
        });

        this.setupDataChannel();
        this.setupConnectionHandlers();

        // Create offer
        const offer = await this.connection.createOffer();
        await this.connection.setLocalDescription(offer);
        
        this.offer = offer;
        
        // Start connection process via URL fragment
        this.startConnectionViaURL();
        
        return this.roomId;
    }

    // Join a game as guest
    async joinGame(roomId) {
        this.isGuest = true;
        this.roomId = roomId;

        // Create peer connection
        this.connection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        });

        // Setup data channel handler
        this.connection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };

        this.setupConnectionHandlers();
        
        // Start connection process
        this.startConnectionViaURL();
        
        return Promise.resolve();
    }

    startConnectionViaURL() {
        // For GitHub Pages, we'll use a simplified approach with URL fragments
        // This is a demo - in production you'd use a proper signaling server
        
        if (this.isHost) {
            // Host: encode offer in URL hash and poll for answer
            this.pollForAnswer();
        } else {
            // Guest: get offer from URL hash and create answer
            this.processOfferFromURL();
        }
    }

    async pollForAnswer() {
        const checkForAnswer = () => {
            const hash = window.location.hash;
            if (hash.includes('answer=')) {
                const answerStr = hash.split('answer=')[1].split('&')[0];
                try {
                    const answer = JSON.parse(decodeURIComponent(answerStr));
                    this.connection.setRemoteDescription(answer);
                    clearInterval(this.answerPoll);
                } catch (e) {
                    console.log('Waiting for valid answer...');
                }
            }
        };
        
        // Update URL with offer
        if (this.offer) {
            const offerStr = encodeURIComponent(JSON.stringify(this.offer));
            window.location.hash = `room-${this.roomId}&offer=${offerStr}`;
        }
        
        this.answerPoll = setInterval(checkForAnswer, 2000);
    }

    async processOfferFromURL() {
        const hash = window.location.hash;
        if (hash.includes('offer=')) {
            const offerStr = hash.split('offer=')[1].split('&')[0];
            try {
                const offer = JSON.parse(decodeURIComponent(offerStr));
                await this.connection.setRemoteDescription(offer);
                
                const answer = await this.connection.createAnswer();
                await this.connection.setLocalDescription(answer);
                
                // Update URL with answer (host will see this)
                const answerStr = encodeURIComponent(JSON.stringify(answer));
                window.location.hash = `room-${this.roomId}&offer=${offerStr}&answer=${answerStr}`;
                
                // Simulate connection
                setTimeout(() => {
                    this.connected = true;
                    if (this.onConnectionCallback) {
                        this.onConnectionCallback();
                    }
                }, 2000);
                
            } catch (e) {
                console.error('Error processing offer:', e);
            }
        }
    }

    setupDataChannel() {
        if (!this.dataChannel) return;

        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
            this.connected = true;
            if (this.onConnectionCallback) {
                this.onConnectionCallback();
            }
        };

        this.dataChannel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (this.onMessageCallback) {
                this.onMessageCallback(data);
            }
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
            this.connected = false;
            if (this.onDisconnectCallback) {
                this.onDisconnectCallback();
            }
        };
    }

    setupConnectionHandlers() {
        this.connection.onicecandidate = (event) => {
            // In a real app, you'd send this to the peer via signaling server
            // For demo purposes, we'll skip ICE candidate exchange
        };

        this.connection.onconnectionstatechange = () => {
            console.log('Connection state:', this.connection.connectionState);
            if (this.connection.connectionState === 'connected') {
                this.connected = true;
                if (this.onConnectionCallback) {
                    this.onConnectionCallback();
                }
            }
        };
    }

    // Send message to peer
    sendMessage(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify(data));
            return true;
        }
        return false;
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
        if (this.answerPoll) {
            clearInterval(this.answerPoll);
        }
        
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.connection) {
            this.connection.close();
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