export default class InputHandler {
    constructor(game) {
        this.game = game;
        this.keys = [];
        window.addEventListener('keydown', e => {

            if (this.keys.indexOf(e.key) === -1 && (
                e.key === 'ArrowDown' ||
                e.key === 'ArrowUp' ||
                e.key === 'ArrowLeft' ||
                e.key === 'ArrowRight' ||
                /^[wasd]$/i.test(e.key) ||
                e.key === 'Enter'
            )) {
                this.keys.push(e.key);
            }
            else if(e.key === 'b') this.game.debug = !this.game.debug;
            if (e.key === 'Enter' && this.game.gameOver) this.game.restartGame();
        });
        window.addEventListener('keyup', e => {
            if (e.key === 'ArrowDown' ||
                e.key === 'ArrowUp' ||
                e.key === 'ArrowLeft' ||
                e.key === 'ArrowRight' ||
                /^[wasd]$/i.test(e.key) ||
                e.key === 'Enter') {
                this.keys.splice(this.keys.indexOf(e.key), 1);
            }
        });

    }
}