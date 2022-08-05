import Player from "./player.js";
import InputHandler from "./input.js";
import {Background} from "./background.js";
import {FlyingEnemy, GroundEnemy, ClimbingEnemy} from './enemies.js'
import UI from "./UI.js";

window.addEventListener('load', () => {
    const canvas = document.getElementById('canvas1');
    const ctx = canvas.getContext('2d');
    canvas.width = 900;
    canvas.height = 500;
    let lastTime = 0;
    let fixedDeltaTime = 0;


    class Game {
        constructor(width, height) {
            this.scoreboard = [Number.MIN_SAFE_INTEGER]
            this.isHighScore = false;
            this.width = width;
            this.height = height;
            this.groundMargin = 40;
            this.speed = 0;
            this.maxSpeed = 3;
            this.enemies = [];
            this.enemyTimer = 0;
            this.enemyInterval = 1000;
            this.particles = []
            this.maxParticles = 200;
            this.collisions = [];
            this.floatingMessages = [];
            this.debug = false;
            this.score = 0;
            this.time = 0;
            this.maxTime = 120000;
            this.winingScore = 100;
            this.gameOver = true;
            this.lives = 5;
            this.fontColor = 'black'
            this.player = new Player(this);
            this.player.currentState = this.player.states[0];
            this.player.currentState.enter();
            this.background = new Background(this);
            this.input = new InputHandler(this);
            this.UI = new UI(this)
            this.music = new Audio()
            this.musics = ['sounds/music/stone-fortress.ogg', 'sounds/music/dark-forest.mp3'];
            this.music.src = this.musics[Math.floor(Math.random() * this.musics.length)];
            this.music.load();


        }

        update(deltaTime) {
            //
            this.time += deltaTime;
            if (this.time > this.maxTime) this.gameOver = true;
            this.background.update();
            this.player.update(this.input.keys, deltaTime);
            // handle Enemies
            if (this.enemyTimer > this.enemyInterval) {
                this.addEnemy()
                this.enemyTimer = 0;
            } else this.enemyTimer += deltaTime;
            this.enemies.forEach(enemy => {
                enemy.update(deltaTime);
            })
            //handle messages
            this.floatingMessages.forEach((msg, index) => {
                msg.update();
            })
            //handle particles
            this.particles.forEach((particle, index) => {
                particle.update();
            });
            if (this.particles.length > this.maxParticles) {
                this.particles.length = this.maxParticles;
            }
            //handle collision sprites
            this.collisions.forEach((collision, index) => {
                collision.update(deltaTime);
            })
            this.enemies = this.enemies.filter(enemy => !enemy.markedForDeletion);
            this.particles = this.particles.filter(particle => !particle.markedForDeletion);
            this.collisions = this.collisions.filter(collision => !collision.markedForDeletion);
            this.floatingMessages = this.floatingMessages.filter(message => !message.markedForDeletion);
            //game over
            if (this.gameOver === true) {
                this.time = 0;
                this.music.pause();
                this.music.currentTime = 0;
                this.music.src = this.musics[Math.floor(Math.random() * this.musics.length)];
                this.music.load();
                if (this.score > this.scoreboard.sort((a, b) => b - a)[0]) {
                    this.isHighScore = true;
                    this.scoreboard.push(this.score);
                }

            }

        }

        draw(context) {
            this.background.draw(context);
            this.player.draw(context)
            this.enemies.forEach(enemy => {
                enemy.draw(context)
            })
            this.particles.forEach((particle) => {
                particle.draw(context);
            })
            this.collisions.forEach((collision) => {
                collision.draw(context);
            })
            this.floatingMessages.forEach((msg, index) => {
                msg.draw(context);
            })
            this.UI.draw(context)
        }

        addEnemy() {
            if (this.speed > 0 && Math.random() < 0.5) this.enemies.push(new GroundEnemy(this));
            else if (this.speed > 0) this.enemies.push(new ClimbingEnemy(this));
            this.enemies.push(new FlyingEnemy(this));
        }

        restartGame() {
            this.score = 0;
            this.time = 0;
            this.isHighScore = false;
            this.speed = 0;
            this.maxSpeed = 3;
            this.enemies = [];
            this.enemyTimer = 0;
            this.particles = []
            this.collisions = [];
            this.floatingMessages = [];

            this.gameOver = false;
            this.lives = 5;
            this.player.currentState = this.player.states[0];
            this.player.currentState.enter();
            this.music.play()
            fixedDeltaTime = 0;
            animate(0);

        }
    }

    const game = new Game(canvas.width, canvas.height);


    function animate(timeStamp) {
        const deltaTime = fixedDeltaTime < 2 ? (
            fixedDeltaTime++, 0) : timeStamp - lastTime;
        lastTime = timeStamp;
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        game.update(deltaTime);
        game.draw(ctx);
        if (!game.gameOver) requestAnimationFrame(animate)
    }

    //main

    ctx.drawImage(document.getElementById('layer1'), 0, 0, 1667, 500);
    ctx.drawImage(document.getElementById('layer2'), 0, 0, 1667, 500);
    ctx.drawImage(document.getElementById('layer3'), 0, 0, 1667, 500);
    ctx.drawImage(document.getElementById('layer4'), 0, 0, 1667, 500);
    ctx.drawImage(document.getElementById('layer5'), 0, 0, 1667, 500);
    ctx.save();
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.font = `30px Creepster`
    ctx.fillText('Press Enter to Start', canvas.width * 0.5 + 2, canvas.height * 0.75 + 2)
    ctx.restore()

});