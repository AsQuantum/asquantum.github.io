import {Sitting, Running, Jumping, Falling, Rolling, Diving, Hit} from './playerStates.js'
import {CollisionAnimation} from './collisionAnimation.js'
import {FloatingMessage} from "./floatingMessages.js";

export default class Player {
    constructor(game) {
        //sprite animation
        this.frameX = 0;
        this.frameY = 0;
        this.maxFrame = 0;
        this.fps = 20;
        this.frameInterval = 1000 / this.fps;
        this.frameTimer = 0;
        //basic
        this.game = game;
        this.width = 100;
        this.height = 91.3;
        this.x = 0;
        this.y = this.game.height - this.height - this.game.groundMargin;
        this.image = document.getElementById('player')
        //state
        this.states = [new Sitting(this.game), new Running(this.game), new Jumping(this.game), new Falling(this.game), new Rolling(this.game), new Diving(this.game), new Hit(this.game)];
        this.vx = 0;
        this.vxleft = 0;
        this.vxright = 0;
        this.vy = 0;
        this.weight = 1;
        this.vxmax = 10;
        this.currentState = null;
        //skill
        this.skillCoolTime = 0;
        this.skillActTime = 0;
        this.isActivated = false;
        this.isCoolDown = false;
        this.maxSkillTime = 5000;
        this.maxCoolTime = 2000;
        //protect
        this.isHited = false;
        this.protectTime = 0;
        this.maxProtect = 2000;
    }

    update(input, deltaTime) {
        this.checkCollision(deltaTime);
        this.currentState.handleInput(input);
        //horizontal movement
        this.vx = this.vxleft + this.vxright
        this.x += this.vx;
        if ((input.includes('ArrowRight') || input.some(e => /^d$/i.test(e))) && this.currentState !== this.states[6]) this.vxright = this.vxmax;
        else this.vxright = 0;
        if ((input.includes('ArrowLeft') || input.some(e => /^a$/i.test(e))) && this.currentState !== this.states[6]) this.vxleft = -this.vxmax;
        else this.vxleft = 0;
        //horizontal boundary
        if (this.x < 0) this.x = 0;
        if (this.x > this.game.width - this.width) this.x = this.game.width - this.width;
        //vertical movement
        this.y += this.vy
        if (!this.onGround()) this.vy += this.weight;
        else this.vy = 0;
        // vertical boundaries
        if (this.y > this.game.height - this.height - this.game.groundMargin) this.y = this.game.height - this.height - this.game.groundMargin
        //sprite animation
        if (this.frameTimer > this.frameInterval) {
            this.frameTimer = 0;
            if (this.frameX < this.maxFrame) this.frameX++;
            else this.frameX = 0;
        } else this.frameTimer += deltaTime;
        //

        if ((this.currentState === this.states[4]) && !this.isActivated && !this.isCoolDown) {
            this.isActivated = true;
        }
        //activate
        if (this.isActivated) {
            if (this.skillActTime > this.maxSkillTime) {
                this.skillActTime = 0;
                this.isActivated = false;
                this.isCoolDown = true;
            } else {
                this.skillActTime += deltaTime
            }
        }
        //cool down
        if (this.isCoolDown) {
            if (this.skillCoolTime > this.maxCoolTime) {
                this.skillCoolTime = 0;
                this.isCoolDown = false;
            } else {
                this.skillCoolTime += deltaTime
                if ((this.currentState === this.states[4] || this.currentState === this.states[5])) {
                    this.setState(1, 1)
                }

            }
        }
        //hit
        if (this.isHited) {
            if (this.protectTime > this.maxProtect) {
                this.protectTime = 0;
                this.isHited = false;
            } else {
                this.protectTime += deltaTime;
            }
        }
    }

    draw(context) {
        if (this.game.debug) context.strokeRect(this.x, this.y, this.width, this.height)
        if (!this.isHited)
            context.drawImage(this.image, this.frameX * this.width, this.frameY * this.height, this.width, this.height, this.x, this.y, this.width, this.height)
        else {
            if ([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19].includes(Math.floor(this.protectTime) % 100)) {
                context.drawImage(this.image, this.frameX * this.width, this.frameY * this.height, this.width, this.height, this.x, this.y, this.width, this.height)
            }
        }
    }


    onGround() {
        return this.y >= this.game.height - this.height - this.game.groundMargin;
    }

    setState(state, speed) {
        this.currentState = this.states[state];
        this.game.speed = this.game.maxSpeed * speed;
        this.currentState.enter();
    }

    checkCollision() {
        this.game.enemies.forEach(enemy => {
            if (
                enemy.x < this.x + this.width &&
                enemy.x + enemy.width > this.x &&
                enemy.y < this.y + this.height &&
                enemy.y + enemy.height > this.y
            ) {
                enemy.markedForDeletion = true;
                this.game.collisions.push(new CollisionAnimation(this.game, enemy.x + enemy.width * 0.5, enemy.y + enemy.height * 0.5))
                if (this.currentState === this.states[4] || this.currentState === this.states[5]) {
                    this.game.score++;
                    this.game.floatingMessages.push(new FloatingMessage('+1', enemy.x, enemy.y, 110, 50));
                } else {
                    if (!this.isHited) {
                        this.setState(6, 0);
                        this.game.lives--;
                        this.game.score -= 5;
                        this.game.floatingMessages.push(new FloatingMessage('-5', enemy.x, enemy.y, 110, 50));
                        if (this.game.lives <= 0) this.game.gameOver = true;
                        this.isHited = true;
                    }
                }
            }
        })
    }
}