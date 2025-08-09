// Game state
let currentInvention = null;
let player1Name = "";
let player2Name = "";
let isMultiplayer = false;
let isHost = false;
let myGuess = null;
let peerGuess = null;
let guessesReceived = 0;

// Utility functions
function getRandomInvention() {
    const randomIndex = Math.floor(Math.random() * inventions.length);
    return inventions[randomIndex];
}

function formatYear(year) {
    if (year < 0) {
        return Math.abs(year) + " BCE";
    } else {
        return year + " CE";
    }
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
    });
    document.getElementById(sectionId).classList.remove('hidden');
}

function generateShareUrl(roomId) {
    const baseUrl = window.location.href.split('#')[0];
    return `${baseUrl}#room-${roomId}`;
}

// Multiplayer game flow
async function createMultiplayerGame() {
    const button = document.getElementById('create-game');
    const originalText = button.textContent;
    
    // Show loading state
    button.innerHTML = '<span class="loading">Creating Game</span>';
    button.disabled = true;
    
    try {
        const roomId = await multiplayer.createGame();
        const shareUrl = generateShareUrl(roomId);
        
        document.getElementById('share-url').value = shareUrl;
        showSection('create-room');
        
        // Set multiplayer flags
        isMultiplayer = true;
        isHost = true;
        
        // Set up multiplayer callbacks
        multiplayer.onConnection(() => {
            document.getElementById('connection-status').textContent = '🎉 Player connected! Enter your name and start playing.';
        });
    } catch (error) {
        console.error('Failed to create game:', error);
        button.textContent = 'Failed - Try Again';
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 2000);
        return;
    }
    
    button.textContent = originalText;
    button.disabled = false;
    
    multiplayer.onMessage((data) => {
        handleMultiplayerMessage(data);
    });
    
    multiplayer.onDisconnect(() => {
        alert('Other player disconnected!');
        showSection('main-menu');
    });
}

function joinMultiplayerGame(roomId) {
    showSection('join-room');
    document.getElementById('join-status').textContent = 'Connecting...';
    
    multiplayer.joinGame(roomId)
        .then(() => {
            document.getElementById('join-status').textContent = 'Connected! Enter your name to join.';
        })
        .catch((error) => {
            document.getElementById('join-status').textContent = 'Failed to connect. Please try again.';
            console.error('Join failed:', error);
        });
    
    // Set up multiplayer callbacks
    multiplayer.onMessage((data) => {
        handleMultiplayerMessage(data);
    });
    
    multiplayer.onDisconnect(() => {
        alert('Host disconnected!');
        showSection('main-menu');
    });
}

function handleMultiplayerMessage(data) {
    console.log('Received message:', data); // Debug log
    switch (data.type) {
        case 'guestJoined':
            console.log('Guest joined:', data.guestName); // Debug log
            if (isHost) {
                player2Name = data.guestName;
                document.getElementById('connection-status').textContent = `${data.guestName} joined! Click start to begin.`;
            }
            break;
            
        case 'gameStart':
            currentInvention = data.invention;
            player1Name = data.player1Name;
            player2Name = data.player2Name;
            startMultiplayerRound();
            break;
            
        case 'guess':
            peerGuess = data.guess;
            peerName = data.playerName;
            guessesReceived++;
            checkIfBothGuessed();
            break;
            
        case 'results':
            displayResults(data.results);
            break;
            
        case 'playAgain':
            resetGame();
            startGame();
            break;
    }
}

function startMultiplayerRound() {
    document.getElementById('invention-name').textContent = currentInvention.name;
    
    if (isHost) {
        document.getElementById('player1-label').textContent = player1Name + ':';
        document.getElementById('player2-label').textContent = player2Name + ':';
        document.getElementById('guess1').disabled = false;
        document.getElementById('guess2').disabled = true;
        document.getElementById('guess2').placeholder = 'Waiting for ' + player2Name + '...';
    } else {
        document.getElementById('player1-label').textContent = player1Name + ':';
        document.getElementById('player2-label').textContent = player2Name + ':';
        document.getElementById('guess1').disabled = true;
        document.getElementById('guess1').placeholder = 'Waiting for ' + player1Name + '...';
        document.getElementById('guess2').disabled = false;
    }
    
    myGuess = null;
    peerGuess = null;
    guessesReceived = 0;
    
    showSection('game-play');
}

function checkIfBothGuessed() {
    if (myGuess !== null && peerGuess !== null) {
        // Both players have guessed, calculate results
        if (isHost) {
            const results = calculateResults(myGuess, peerGuess, player1Name, player2Name);
            multiplayer.sendMessage({
                type: 'results',
                results: results
            });
            displayResults(results);
        }
    }
}

// Local game flow
function startLocalGame() {
    isMultiplayer = false;
    showSection('game-setup');
}

function startGame() {
    if (isMultiplayer && isHost) {
        // Host starts the multiplayer game
        const hostName = document.getElementById('host-name').value.trim();
        if (!hostName) {
            alert('Please enter your name!');
            return;
        }
        
        // Check if guest has joined
        if (!player2Name || player2Name === "Player 2") {
            alert('Waiting for another player to join first!');
            return;
        }
        
        player1Name = hostName;
        
        currentInvention = getRandomInvention();
        
        // Send game start to peer
        multiplayer.sendMessage({
            type: 'gameStart',
            invention: currentInvention,
            player1Name: player1Name,
            player2Name: player2Name
        });
        startMultiplayerRound();
        
    } else if (!isMultiplayer) {
        // Local game
        player1Name = document.getElementById('player1').value.trim();
        player2Name = document.getElementById('player2').value.trim();
        
        if (!player1Name || !player2Name) {
            alert('Please enter names for both players!');
            return;
        }
        
        currentInvention = getRandomInvention();
        document.getElementById('invention-name').textContent = currentInvention.name;
        document.getElementById('player1-label').textContent = player1Name + ':';
        document.getElementById('player2-label').textContent = player2Name + ':';
        
        document.getElementById('guess1').value = '';
        document.getElementById('guess2').value = '';
        
        showSection('game-play');
    }
}

function joinGameAsGuest() {
    const guestName = document.getElementById('guest-name').value.trim();
    const button = document.getElementById('join-game');
    
    if (!guestName) {
        // Add shake animation for empty name
        const input = document.getElementById('guest-name');
        input.style.animation = 'shake 0.5s ease-in-out';
        input.focus();
        setTimeout(() => {
            input.style.animation = '';
        }, 500);
        return;
    }
    
    // Show loading state
    button.innerHTML = '<span class="loading">Joining</span>';
    button.disabled = true;
    
    isMultiplayer = true;
    isHost = false;
    player2Name = guestName;
    
    // Notify host that we're ready
    multiplayer.sendMessage({
        type: 'guestJoined',
        guestName: guestName
    });
    
    // Update status and wait for host to start game
    document.getElementById('join-status').textContent = '🎮 Connected! Waiting for host to start the game...';
    button.style.display = 'none';
    
    // Haptic feedback
    if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
    }
}

function submitGuesses() {
    if (isMultiplayer) {
        let guess;
        if (isHost) {
            guess = parseInt(document.getElementById('guess1').value);
            if (isNaN(guess)) {
                alert('Please enter a valid year!');
                return;
            }
        } else {
            guess = parseInt(document.getElementById('guess2').value);
            if (isNaN(guess)) {
                alert('Please enter a valid year!');
                return;
            }
        }
        
        myGuess = guess;
        
        // Send guess to peer
        multiplayer.sendMessage({
            type: 'guess',
            guess: guess,
            playerName: isHost ? player1Name : player2Name
        });
        
        // Update UI to show waiting
        const myInput = isHost ? document.getElementById('guess1') : document.getElementById('guess2');
        myInput.disabled = true;
        myInput.style.background = '#e8f5e8';
        
        document.getElementById('submit-guesses').textContent = 'Waiting for other player...';
        document.getElementById('submit-guesses').disabled = true;
        
        checkIfBothGuessed();
    } else {
        // Local game
        const guess1 = parseInt(document.getElementById('guess1').value);
        const guess2 = parseInt(document.getElementById('guess2').value);
        
        if (isNaN(guess1) || isNaN(guess2)) {
            alert('Please enter valid years for both players!');
            return;
        }
        
        const results = calculateResults(guess1, guess2, player1Name, player2Name);
        displayResults(results);
    }
}

function calculateResults(guess1, guess2, p1Name, p2Name) {
    const correctYear = currentInvention.year;
    const wheelYear = -3500;
    
    const diff1 = Math.abs(guess1 - correctYear);
    const diff2 = Math.abs(guess2 - correctYear);
    
    let resultsHTML = `
        <div class="correct-answer">
            <strong>${currentInvention.name}</strong> was invented in <strong>${formatYear(correctYear)}</strong>
            <br>
            The wheel was invented around <strong>${formatYear(wheelYear)}</strong>
        </div>
    `;
    
    if (diff1 < diff2) {
        resultsHTML += `
            <div class="result-item winner">
                🎉 <strong>${p1Name} wins!</strong><br>
                Guessed: ${formatYear(guess1)} (off by ${diff1} years)
            </div>
            <div class="result-item">
                ${p2Name}: ${formatYear(guess2)} (off by ${diff2} years)
            </div>
        `;
    } else if (diff2 < diff1) {
        resultsHTML += `
            <div class="result-item winner">
                🎉 <strong>${p2Name} wins!</strong><br>
                Guessed: ${formatYear(guess2)} (off by ${diff2} years)
            </div>
            <div class="result-item">
                ${p1Name}: ${formatYear(guess1)} (off by ${diff1} years)
            </div>
        `;
    } else {
        resultsHTML += `
            <div class="result-item winner">
                🤝 <strong>It's a tie!</strong><br>
                Both players were off by ${diff1} years
            </div>
            <div class="result-item">
                ${p1Name}: ${formatYear(guess1)}
            </div>
            <div class="result-item">
                ${p2Name}: ${formatYear(guess2)}
            </div>
        `;
    }
    
    const beforeWheel = correctYear < wheelYear;
    resultsHTML += `
        <div class="result-item">
            ${currentInvention.name} was invented <strong>${beforeWheel ? 'BEFORE' : 'AFTER'}</strong> the wheel!
        </div>
    `;
    
    return resultsHTML;
}

function displayResults(resultsHTML) {
    document.getElementById('results-content').innerHTML = resultsHTML;
    showSection('game-results');
    
    // Add celebration effect
    setTimeout(() => {
        const winnerElement = document.querySelector('.winner');
        if (winnerElement) {
            // Haptic feedback for winner
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100, 50, 200]);
            }
            
            // Add confetti effect (simplified)
            createConfetti();
        }
    }, 500);
}

function createConfetti() {
    // Simple confetti effect using CSS animations
    const confettiColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7'];
    
    for (let i = 0; i < 20; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: fixed;
            width: 6px;
            height: 6px;
            background: ${confettiColors[Math.floor(Math.random() * confettiColors.length)]};
            top: -10px;
            left: ${Math.random() * 100}vw;
            z-index: 1000;
            pointer-events: none;
            animation: confettiFall 2s ease-out forwards;
            border-radius: 50%;
        `;
        
        document.body.appendChild(confetti);
        
        // Remove confetti after animation
        setTimeout(() => {
            confetti.remove();
        }, 2000);
    }
}

function playAgain() {
    if (isMultiplayer) {
        if (isHost) {
            multiplayer.sendMessage({ type: 'playAgain' });
        }
        resetGame();
        startGame();
    } else {
        showSection('game-setup');
    }
}

function resetGame() {
    // Reset input fields
    document.getElementById('guess1').disabled = false;
    document.getElementById('guess2').disabled = false;
    document.getElementById('guess1').style.background = '';
    document.getElementById('guess2').style.background = '';
    document.getElementById('guess1').placeholder = 'Year (e.g. -2000 for 2000 BCE)';
    document.getElementById('guess2').placeholder = 'Year (e.g. -2000 for 2000 BCE)';
    document.getElementById('guess1').value = '';
    document.getElementById('guess2').value = '';
    
    document.getElementById('submit-guesses').textContent = 'Submit Guesses';
    document.getElementById('submit-guesses').disabled = false;
    
    myGuess = null;
    peerGuess = null;
    guessesReceived = 0;
}

function copyShareLink() {
    const shareUrl = document.getElementById('share-url');
    const button = document.getElementById('copy-link');
    
    shareUrl.select();
    shareUrl.setSelectionRange(0, 99999);
    
    navigator.clipboard.writeText(shareUrl.value).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('copy-btn', 'copied');
        
        // Haptic feedback on mobile
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        const originalText = button.textContent;
        button.textContent = 'Press Ctrl+C';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    });
}

// Event listeners
document.getElementById('create-game').addEventListener('click', createMultiplayerGame);
document.getElementById('local-game').addEventListener('click', startLocalGame);
document.getElementById('copy-link').addEventListener('click', copyShareLink);
document.getElementById('join-game').addEventListener('click', joinGameAsGuest);
document.getElementById('start-game').addEventListener('click', startGame);
document.getElementById('submit-guesses').addEventListener('click', submitGuesses);
document.getElementById('play-again').addEventListener('click', playAgain);

// Keyboard shortcuts
document.getElementById('guess1').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !isMultiplayer) {
        document.getElementById('guess2').focus();
    } else if (e.key === 'Enter' && isMultiplayer) {
        submitGuesses();
    }
});

document.getElementById('guess2').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        submitGuesses();
    }
});

document.getElementById('player1').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('player2').focus();
    }
});

document.getElementById('player2').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        startGame();
    }
});

document.getElementById('host-name').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        startGame();
    }
});

document.getElementById('guest-name').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        joinGameAsGuest();
    }
});

// Check for room ID in URL on page load
window.addEventListener('load', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#room-')) {
        const roomId = hash.substring(6); // Remove '#room-'
        isMultiplayer = true;
        joinMultiplayerGame(roomId);
    }
});