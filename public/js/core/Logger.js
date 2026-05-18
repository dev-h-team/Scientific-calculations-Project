/**
 * Logger - Global Diagnostic System for Basketball 3D Pro
 * 
 * Captures initialization steps, errors, and warnings to help debug
 * environment-specific issues like the "Black Screen" race condition.
 */
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.startTime = Date.now();
        this.isVerbose = true;
        
        // Auto-capture global errors
        window.onerror = (msg, url, lineNo, columnNo, error) => {
            this.error(`GLOBAL ERROR: ${msg} at ${lineNo}:${columnNo}`, error);
            return false;
        };

        window.onunhandledrejection = (event) => {
            this.error(`UNHANDLED PROMISE REJECTION: ${event.reason}`);
        };
    }

    _log(level, message, data = null) {
        const timestamp = ((Date.now() - this.startTime) / 1000).toFixed(3);
        const logEntry = {
            timestamp,
            level,
            message,
            data: data ? JSON.stringify(data) : null
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) this.logs.shift();

        const formattedMsg = `[${timestamp}s] [${level}] ${message}`;
        
        // Output to browser console
        if (level === 'ERROR') console.error(formattedMsg, data || '');
        else if (level === 'WARN') console.warn(formattedMsg, data || '');
        else console.log(formattedMsg, data || '');

        // Update HUD if it exists
        this._updateHUD(formattedMsg, level);
    }

    info(msg, data) { this._log('INFO', msg, data); }
    warn(msg, data) { this._log('WARN', msg, data); }
    error(msg, data) { this._log('ERROR', msg, data); }

    _updateHUD(msg, level) {
        // Optional: Create a hidden debug overlay that can be toggled with 'L' key
        let debugOverlay = document.getElementById('debug-overlay');
        if (!debugOverlay) {
            debugOverlay = document.createElement('div');
            debugOverlay.id = 'debug-overlay';
            debugOverlay.style.cssText = `
                position: fixed; bottom: 10px; left: 10px; 
                width: 400px; max-height: 200px; 
                background: rgba(0,0,0,0.8); color: #0f0; 
                font-family: monospace; font-size: 10px; 
                padding: 10px; overflow-y: auto; z-index: 9999;
                display: none; pointer-events: none;
                border: 1px solid #333;
            `;
            document.body.appendChild(debugOverlay);
            
            window.addEventListener('keydown', (e) => {
                if (e.key.toLowerCase() === 'l') {
                    debugOverlay.style.display = debugOverlay.style.display === 'none' ? 'block' : 'none';
                }
            });
        }

        const line = document.createElement('div');
        line.style.color = level === 'ERROR' ? '#ff4444' : (level === 'WARN' ? '#ffaa00' : '#00ff00');
        line.textContent = msg;
        debugOverlay.appendChild(line);
        debugOverlay.scrollTop = debugOverlay.scrollHeight;
    }

    exportLogs() {
        const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `basketball_pro_logs_${Date.now()}.json`;
        a.click();
    }
}

// Global instance
window.gameLogger = new Logger();
