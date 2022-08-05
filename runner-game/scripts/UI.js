export default class UI {
    constructor(game) {
        this.game = game;
        this.fontSize = 30;
        this.fontFamily = 'Creepster';
        this.livesImage = document.getElementById('lives');
        this.sound = new Audio();

    }

    draw(context) {
        context.save();
        context.shadowOffsetX = 2;
        context.shadowOffsetY = 2;
        context.shadowColor = 'white';
        context.shadowBlur = 0;
        context.font = `${this.fontSize}px ${this.fontFamily}`
        context.textAlign = 'left';
        context.fillStyle = this.game.fontColor;
        //score
        context.fillText('Score: ' + this.game.score, 20, 50);
        //timer
        context.font = `${this.fontSize * 0.8}px ${this.fontFamily}`
        context.fillText('Time-left: ' + ((this.game.maxTime - this.game.time) * 0.001).toFixed(1), 20, 80)
        //lives
        for (let i = 0; i < this.game.lives; i++) {
            context.drawImage(this.livesImage, 25 * i + 20, 95, 25, 25)
        }
        //player skill message
        context.textAlign = 'center';
        if (this.game.player.isActivated) {
            context.font = `${this.fontSize}px ${this.fontFamily}`
            context.fillText('Skill Activated: ' + ((this.game.player.maxSkillTime - this.game.player.skillActTime) * 0.001).toFixed(1), this.game.width * 0.5, this.game.height * 0.1);
        } else if (this.game.player.isCoolDown) {
            context.font = `${this.fontSize}px ${this.fontFamily}`
            context.fillText('Skill Cooling: ' + ((this.game.player.maxCoolTime - this.game.player.skillCoolTime) * 0.001).toFixed(1), this.game.width * 0.5, this.game.height * 0.1);
        }
        // protection
         if (this.game.player.isHited) {
            context.font = `${this.fontSize}px ${this.fontFamily}`
            context.fillText('Protection: ' + ((this.game.player.maxProtect - this.game.player.protectTime) * 0.001).toFixed(1), this.game.width * 0.5, this.game.height * 0.1 + 25);
         }
        //game over message
        if (this.game.gameOver) {

            context.textAlign = 'center';
            context.font = `${(this.fontSize)}px ${this.fontFamily}`
            context.fillText('Press Enter to Restart', this.game.width * 0.5, this.game.height * 0.75)
            context.font = `${this.fontSize * 2}px ${this.fontFamily}`;
            if (this.game.score >= this.game.winingScore) {
                if (this.game.isHighScore) {
                    this.sound = new Audio()
                    this.sound.src = 'sounds/game-over-excellent.ogg'
                    this.sound.play()
                    this.sound = new Audio()
                    this.sound.src = 'sounds/well-done.ogg'
                    this.sound.play()
                    context.fillText('Boo-yah', this.game.width * 0.5, this.game.height * 0.5 - 20);
                    context.font = `${this.fontSize * 0.7}px ${this.fontFamily}`
                    context.fillText('What are creatures of the night afraid of? YOU!!!', this.game.width * 0.5, this.game.height * 0.5 + 20);
                    context.font = `${this.fontSize * 1.25}px ${this.fontFamily}`
                    context.fillText('New High Score: ' + this.game.score, this.game.width * 0.5, this.game.height * 0.9);
                } else {
                    this.sound = new Audio()
                    this.sound.src = 'sounds/game-over-good.mp3'
                    this.sound.play()
                    context.fillText('Good Job', this.game.width * 0.5, this.game.height * 0.5 - 20);
                    context.font = `${this.fontSize * 0.7}px ${this.fontFamily}`
                    context.fillText('You clear this game once again!', this.game.width * 0.5, this.game.height * 0.5 + 20);
                }


            } else {
                this.sound = new Audio()
                this.sound.src = 'sounds/game-over-bad.wav'
                this.sound.play()
                context.fillText('Love at first bite?', this.game.width * 0.5, this.game.height * 0.5 - 20);
                context.font = `${this.fontSize * 0.7}px ${this.fontFamily}`
                context.fillText('Nope, Better luck next time!', this.game.width * 0.5, this.game.height * 0.5 + 20);
            }


        }
        context.restore()
    }
}