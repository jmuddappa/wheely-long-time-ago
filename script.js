// Game state
let currentInvention = null;
let player1Name = "";
let player2Name = "";
let isMultiplayer = false;
let isHost = false;
let myGuess = null;
let peerGuess = null;
let guessesReceived = 0;

// Multi-round game state
let currentRound = 1;
let totalRounds = 5;
let player1Score = 0;
let player2Score = 0;
let usedInventions = new Set();
let gameHistory = [];

// Utility functions
function getRandomInvention() {
    // Get unused inventions
    const unusedInventions = inventions.filter(inv => !usedInventions.has(inv.name));
    
    // If we've used all inventions, reset for new game
    if (unusedInventions.length === 0) {
        usedInventions.clear();
        return inventions[Math.floor(Math.random() * inventions.length)];
    }
    
    const randomIndex = Math.floor(Math.random() * unusedInventions.length);
    const invention = unusedInventions[randomIndex];
    usedInventions.add(invention.name);
    
    return invention;
}

function calculateScore(guess, correctYear) {
    const difference = Math.abs(guess - correctYear);
    
    // Perfect guess: 1000 points
    if (difference === 0) return 1000;
    
    // Very close (within 100 years): 500-800 points
    if (difference <= 100) return Math.max(500, 800 - difference * 3);
    
    // Close (within 500 years): 200-500 points
    if (difference <= 500) return Math.max(200, 500 - difference);
    
    // Within 1000 years: 100-200 points
    if (difference <= 1000) return Math.max(100, 200 - Math.floor(difference / 10));
    
    // Within 2000 years: 50-100 points
    if (difference <= 2000) return Math.max(50, 100 - Math.floor(difference / 20));
    
    // Very far: 10-50 points
    return Math.max(10, 50 - Math.floor(difference / 100));
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
    
    // Calculate scores
    const score1 = calculateScore(guess1, correctYear);
    const score2 = calculateScore(guess2, correctYear);
    
    // Update total scores
    player1Score += score1;
    player2Score += score2;
    
    // Save round to history
    gameHistory.push({
        round: currentRound,
        invention: currentInvention.name,
        correctYear: correctYear,
        player1: { name: p1Name, guess: guess1, score: score1 },
        player2: { name: p2Name, guess: guess2, score: score2 }
    });
    
    let resultsHTML = `
        <div class="round-header">
            <h3>Round ${currentRound} of ${totalRounds}</h3>
            <div class="score-display">
                <span class="score-item">${p1Name}: ${player1Score}</span>
                <span class="score-item">${p2Name}: ${player2Score}</span>
            </div>
        </div>
        
        <div class="correct-answer">
            <strong>${currentInvention.name}</strong> was invented in <strong>${formatYear(correctYear)}</strong>
        </div>
        
        <div class="fun-fact">
            💡 <strong>Fun Fact:</strong> ${currentInvention.funFact}
        </div>
    `;
    
    if (score1 > score2) {
        resultsHTML += `
            <div class="result-item winner">
                🎉 <strong>${p1Name} wins this round!</strong><br>
                Guessed: ${formatYear(guess1)} (${score1} points)
            </div>
            <div class="result-item">
                ${p2Name}: ${formatYear(guess2)} (${score2} points)
            </div>
        `;
    } else if (score2 > score1) {
        resultsHTML += `
            <div class="result-item winner">
                🎉 <strong>${p2Name} wins this round!</strong><br>
                Guessed: ${formatYear(guess2)} (${score2} points)
            </div>
            <div class="result-item">
                ${p1Name}: ${formatYear(guess1)} (${score1} points)
            </div>
        `;
    } else {
        resultsHTML += `
            <div class="result-item winner">
                🤝 <strong>It's a tie this round!</strong><br>
                Both players earned ${score1} points
            </div>
            <div class="result-item">
                ${p1Name}: ${formatYear(guess1)} (${score1} points)
            </div>
            <div class="result-item">
                ${p2Name}: ${formatYear(guess2)} (${score2} points)
            </div>
        `;
    }
    
    const beforeWheel = correctYear < wheelYear;
    resultsHTML += `
        <div class="result-item wheel-comparison">
            ${currentInvention.name} was invented <strong>${beforeWheel ? 'BEFORE' : 'AFTER'}</strong> the wheel! (${formatYear(wheelYear)})
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
    currentRound++;
    
    if (currentRound > totalRounds) {
        // Game over - show final results
        showFinalResults();
        return;
    }
    
    // Continue to next round
    if (isMultiplayer) {
        if (isHost) {
            multiplayer.sendMessage({ 
                type: 'nextRound',
                round: currentRound,
                scores: { player1Score, player2Score }
            });
        }
        resetRound();
        startNextRound();
    } else {
        resetRound();
        startNextRound();
    }
}

function showFinalResults() {
    const winner = player1Score > player2Score ? player1Name : 
                   player2Score > player1Score ? player2Name : null;
    
    let finalHTML = `
        <div class="final-results">
            <h2>🏆 Game Complete!</h2>
            <div class="final-scores">
                <div class="final-score ${winner === player1Name ? 'winner' : ''}">
                    <span class="player-name">${player1Name}</span>
                    <span class="score">${player1Score}</span>
                </div>
                <div class="final-score ${winner === player2Name ? 'winner' : ''}">
                    <span class="player-name">${player2Name}</span>
                    <span class="score">${player2Score}</span>
                </div>
            </div>
            
            ${winner ? `<div class="final-winner">🎉 ${winner} wins the game!</div>` : '<div class="final-winner">🤝 It\'s a tie game!</div>'}
            
            <div class="game-summary">
                <h3>Game Summary</h3>
                ${gameHistory.map(round => `
                    <div class="round-summary">
                        <strong>Round ${round.round}:</strong> ${round.invention}
                        <br>
                        <small>${round.player1.name}: ${round.player1.score} pts | ${round.player2.name}: ${round.player2.score} pts</small>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.getElementById('results-content').innerHTML = finalHTML;
    
    // Update button text
    document.getElementById('play-again').textContent = 'New Game';
    
    // Add extra celebration for game winner
    if (winner) {
        setTimeout(() => createConfetti(), 500);
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 400]);
        }
    }
}

function resetGame() {
    // Reset everything for a completely new game
    currentRound = 1;
    player1Score = 0;
    player2Score = 0;
    usedInventions.clear();
    gameHistory = [];
    resetRound();
}

function resetRound() {
    // Reset for next round
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
    document.getElementById('play-again').textContent = 'Next Round';
    
    myGuess = null;
    peerGuess = null;
    guessesReceived = 0;
}

function startNextRound() {
    currentInvention = getRandomInvention();
    document.getElementById('invention-name').textContent = currentInvention.name;
    
    // Update round counter if there's a display for it
    const gameInstruction = document.querySelector('.game-instruction');
    if (gameInstruction) {
        gameInstruction.textContent = `Round ${currentRound} of ${totalRounds}: When do you think this was invented? (Enter year, use negative numbers for BCE)`;
    }
    
    showSection('game-play');
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
document.getElementById('play-again').addEventListener('click', () => {
    const buttonText = document.getElementById('play-again').textContent;
    
    if (buttonText === 'New Game') {
        // Start completely new game
        resetGame();
        if (isMultiplayer) {
            showSection('create-room');
        } else {
            showSection('game-setup');
        }
    } else {
        // Continue to next round
        playAgain();
    }
});

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