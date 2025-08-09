class MultiplayerGame {
    constructor() {
        this.isHost = false;
        this.isGuest = false;
        this.roomId = null;
        this.onMessageCallback = null;
        this.onConnectionCallback = null;
        this.onDisconnectCallback = null;
        this.connected = false;
        this.gameSubscription = null;
        this.messageSubscription = null;
        this.fallbackMode = false;
    }

    generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async createGame() {
        this.isHost = true;
        this.roomId = this.generateRoomId();
        
        console.log('Creating Supabase game room:', this.roomId);
        
        try {
            // Create room in Supabase
            const { data, error } = await window.supabase
                .from('game_rooms')
                .insert([
                    {
                        room_id: this.roomId,
                        host_connected: true,
                        guest_connected: false,
                        host_name: '',
                        guest_name: '',
                        game_state: 'waiting',
                        created_at: new Date().toISOString(),
                        last_activity: new Date().toISOString()
                    }
                ])
                .select();

            if (error) {
                console.error('Supabase create error:', error);
                throw error;
            }

            console.log('Supabase room created successfully:', data);

            // Start listening for changes
            this.startSupabaseListeners();

            return this.roomId;

        } catch (error) {
            console.error('Failed to create Supabase room:', error);

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

        console.log('Joining Supabase game room:', roomId);

        try {
            // Check if room exists and join it
            const { data, error } = await window.supabase
                .from('game_rooms')
                .update({ 
                    guest_connected: true,
                    last_activity: new Date().toISOString()
                })
                .eq('room_id', roomId)
                .select();

            if (error) {
                console.error('Supabase join error:', error);
                throw error;
            }

            if (!data || data.length === 0) {
                throw new Error('Room not found');
            }

            console.log('Successfully joined room:', data);

            // Start listening for changes
            this.startSupabaseListeners();

            // Simulate connection for immediate feedback
            setTimeout(() => {
                this.connected = true;
                if (this.onConnectionCallback) {
                    this.onConnectionCallback();
                }
            }, 1000);

            return Promise.resolve();

        } catch (error) {
            console.error('Failed to join Supabase room:', error);

            // Fallback to localStorage
            console.log('Using localStorage fallback');
            this.fallbackMode = true;
            this.startFallbackGuestPolling();

            return Promise.resolve();
        }
    }

    startSupabaseListeners() {
        console.log('Starting Supabase listeners...');

        // Listen for game room changes
        this.gameSubscription = window.supabase
            .channel(`game-${this.roomId}`)
            .on('postgres_changes', 
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'game_rooms',
                    filter: `room_id=eq.${this.roomId}`
                }, 
                (payload) => {
                    console.log('Supabase game update:', payload);

                    // Check for guest connection (host only)
                    if (this.isHost && payload.new.guest_connected && !this.connected) {
                        this.connected = true;
                        console.log('Guest connected via Supabase!');
                        if (this.onConnectionCallback) {
                            this.onConnectionCallback();
                        }
                    }
                })
            .subscribe();

        // Listen for messages
        this.messageSubscription = window.supabase
            .channel(`messages-${this.roomId}`)
            .on('postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'game_messages',
                    filter: `room_id=eq.${this.roomId}`
                }, 
                (payload) => {
                    console.log('Supabase message received:', payload);

                    const message = payload.new;
                    // Only process messages for the other player
                    if ((this.isHost && message.from_player === 'guest') || 
                        (this.isGuest && message.from_player === 'host')) {
                        
                        if (this.onMessageCallback) {
                            this.onMessageCallback(JSON.parse(message.message_data));
                        }

                        // Remove processed message
                        this.removeMessage(message.id);
                    }
                })
            .subscribe();
    }

    async removeMessage(messageId) {
        try {
            await window.supabase
                .from('game_messages')
                .delete()
                .eq('id', messageId);
        } catch (error) {
            console.error('Failed to remove message:', error);
        }
    }

    async sendMessage(data) {
        console.log('Sending Supabase message:', data);

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

        try {
            const { error } = await window.supabase
                .from('game_messages')
                .insert([
                    {
                        room_id: this.roomId,
                        from_player: this.isHost ? 'host' : 'guest',
                        message_data: JSON.stringify(data),
                        created_at: new Date().toISOString()
                    }
                ]);

            if (error) {
                console.error('Failed to send Supabase message:', error);
                return false;
            }

            // Update last activity
            await window.supabase
                .from('game_rooms')
                .update({ last_activity: new Date().toISOString() })
                .eq('room_id', this.roomId);

            return true;

        } catch (error) {
            console.error('Failed to send Supabase message:', error);
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
        console.log('Disconnecting from Supabase...');

        // Unsubscribe from Supabase channels
        if (this.gameSubscription) {
            window.supabase.removeChannel(this.gameSubscription);
            this.gameSubscription = null;
        }

        if (this.messageSubscription) {
            window.supabase.removeChannel(this.messageSubscription);
            this.messageSubscription = null;
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
    console.log('Supabase available:', !!window.supabase);
    console.log('isHost:', window.multiplayer.isHost);
    console.log('isGuest:', window.multiplayer.isGuest);
    console.log('roomId:', window.multiplayer.roomId);
    console.log('connected:', window.multiplayer.connected);
    console.log('fallbackMode:', window.multiplayer.fallbackMode);
    console.log('gameSubscription:', window.multiplayer.gameSubscription);
    console.log('Current URL:', window.location.href);
    console.log('URL Hash:', window.location.hash);
};