/**
 * Notifications - In-Game Event Notifications
 * 
 * Shows floating text notifications for:
 * - Score events (2pts, 3pts, swish!)
 * - Miss notifications
 * - Period changes
 * - Special events
 */

class Notifications {
  constructor() {
    this.container = document.getElementById('notification-container');
    this._queue = [];
    this._active = [];
  }

  /**
   * Show a score notification
   */
  showScore(points, isSwish = false) {
    if (isSwish) {
      this.show('SWISH! 🏀', 'score-3', 2500);
      setTimeout(() => this.show(`+${points} PTS`, `score-${points}`, 2000), 300);
    } else {
      this.show(`+${points} PTS`, `score-${points}`, 2000);
    }
  }

  /**
   * Show three-pointer notification
   */
  showThreePointer() {
    this.show('THREE POINTER!', 'score-3', 2500);
  }

  /**
   * Show miss notification
   */
  showMiss(type = 'miss') {
    const messages = {
      miss: 'MISS',
      airball: 'AIR BALL!',
      rimout: 'RIM OUT'
    };
    this.show(messages[type] || 'MISS', 'miss', 1500);
  }

  /**
   * Show period change
   */
  showPeriodChange(period) {
    const names = ['FIRST QUARTER', 'SECOND QUARTER', 'THIRD QUARTER', 'FOURTH QUARTER', 'OVERTIME'];
    this.show(names[period - 1] || `PERIOD ${period}`, 'buzzer', 3000);
  }

  /**
   * Show buzzer beater
   */
  showBuzzerBeater() {
    this.show('BUZZER BEATER! 🔥', 'score-3', 3000);
  }

  /**
   * Show game over
   */
  showGameOver() {
    this.show('GAME OVER', 'buzzer', 3000);
  }

  /**
   * Show a custom notification
   */
  show(text, className = '', duration = 2000) {
    if (!this.container) return;
    
    const el = document.createElement('div');
    el.className = `notification ${className}`;
    el.textContent = text;
    
    this.container.appendChild(el);
    
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, duration + 500);
    
    return el;
  }

  /**
   * Clear all notifications
   */
  clear() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
