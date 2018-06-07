var http = require('http'),
	fs = require('fs'),
	index = fs.readFileSync(__dirname + '/../build/index.html');

var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

var open = require('open');

app.use(express.static(__dirname + '/../build'))
app.get('/', function (req, res) {
	res.sendFile(__dirname + '/../build/index.html');
});

// Socket.io server listens to our app
// var io = require('socket.io').listen(app);
var DEFAULT_TIME = 35;
var DEFAULT_TIME_FOR_VOTE = 15;
var DEFAULT_TIME_SEE_SCORE = 10;
// list current players 
var clients_ids = [];
var players_names = {};
var answers = {};
var numberOfVotesReady = 0;
var scores = {};
var round = 5;
var setMaster = true;
var master_id;
var timer = DEFAULT_TIME;

var question_base = JSON.parse(fs.readFileSync(__dirname + '/questions.json'));
question_base = question_base.normal;
//console.log(question_base);
var ipaddr = require("ip");
//console.log(ipaddr.address());
var ip = ipaddr.address();

// Send current time to all connected clients
function sendClientsList() {
	io.emit('client list', { time: clients_ids });
}

function select_5questions() {
	var selected_questions = [];

	for (var i = 0; i < 5; ++i) {
		var idx = getRandomArbitrary(0, question_base.length);
		selected_questions.push(question_base[idx]);
	}

	return selected_questions;
}

var questions = select_5questions();
var question;

/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
function getRandomArbitrary(min, max) {
	return Math.floor(Math.random() * (max - min) + min);
}

function maxim() {
	var max = 0;
	var id_castigator = "";
	for (var i = 0; i < clients_ids.length; ++i) {
		if (scores[clients_ids[i]] > max) {
			max = scores[clients_ids[i]];
			id_castigator = clients_ids[i];
		}
	}
	return id_castigator;
}


var amount = 0;

function async_timer_update() {
	//console.log(timer);
	timer += amount;
	if (timer < 0)
		return;
	io.sockets.emit('update clock', { time: timer });
	//setTimeout(async_timer_update, 1000);
}


io.on('connection', function (socket) {
	socket.emit('your role', { isMaster: setMaster });
	setMaster = false;

	socket.emit('welcome', { id: socket.id, ip: ip });

	// see what socket has disconnected ... I also remove from the current client list	
	socket.on('disconnect', function () {
		var index = clients_ids.indexOf(socket.id);
		clients_ids.splice(index, 1);
		console.log('user disconnected: ' + players_names[socket.id] + "..." + socket.id);
	});

	socket.on('i am client', function (data) {
		clients_ids.push(data.id);

		//console.log(The client "+ data.id +" has confirmed the connection ");
		io.to(clients_ids[0]).emit('player numbers update',
			{ connectedPlayers: clients_ids.length - 1, readyPlayers: Object.keys(players_names).length });
	});

	socket.on('start', function (data) {
		players_names[data.id] = data.name;
		scores[data.id] = 0;
		console.log("Client id#" + data.id + " name#" + data.name + " is ready");
		console.log("ids#" + clients_ids.length + " names#" + Object.keys(players_names).length);

		io.to(clients_ids[0]).emit('player numbers update',
			{ connectedPlayers: clients_ids.length - 1, readyPlayers: Object.keys(players_names).length });

		if (Object.keys(players_names).length == clients_ids.length - 1 && clients_ids.length >= 3) {
			choose_domain();
			amount = -1;
			//async_timer_update();
		}
	});

	function choose_domain() {
		var randomIndex = getRandomArbitrary(1, clients_ids.length);
		timer = DEFAULT_TIME;
		//console.log(" Now select the domain by "+ players_names [clients_ids [randomIndex]]);

		//domains = question_base.normal.category;
		domains = questions.map(function (argument) {
			return argument.category;
		});
		io.to(clients_ids[randomIndex]).emit('chose a domain', { message: domains });
		io.to(clients_ids[0]).emit('chose a domain', { time: timer, message: domains, currentPlayer: players_names[clients_ids[randomIndex]] });
	}

	socket.on('Field picked', function (data) {
		for (var q of questions) {
			if (q.category === data.category) {
				question = q;
				question.question = question.question.replace('<BLANK>', '______');
				break;
			}
		}

		timer = DEFAULT_TIME;
		io.sockets.emit('Answer the question', { time: timer, message: question.question });
		//for (client_id of clients_ids)
		//	answers[client_id] = question.suggestions[getRandomArbitrary(0, question.suggestions.length)];

		//question = "";
	});

	socket.on('given answer', function (data) {
		if (data.answer === null)
			data.answer = question.suggestions[getRandomArbitrary(0, question.suggestions.length)];
		answers[socket.id] = data.answer;

		if (Object.keys(answers).length == clients_ids.length - 1) {
			timer = DEFAULT_TIME_FOR_VOTE;
			for (var i = 0; i < clients_ids.length; i++) {
				var list = [];
				for (var key in answers) {
					if (key != clients_ids[i]) {
						if (list.indexOf(answers[key]) === -1)
							list.push(answers[key]);
					}
				}
				list.push(question.answer);
				io.to(clients_ids[i]).emit('vote', { time: timer, answers: list });
			}
		}
	});

	socket.on('vote', function (data) {
		numberOfVotesReady = numberOfVotesReady + 1;
		for (var key in answers) {
			if (answers[key] == data.answer) {
				scores[key] = scores[key] + 1;
			}
		}
		if (numberOfVotesReady == clients_ids.length - 1) {
			answers = {};
			timer = DEFAULT_TIME;

			var scores = [];
			for (var idx = 1; idx < clients_ids.length; idx++) {
				var client_id = clients_ids[idx];
				scores.push({ player_name: players_names[client_id], player_score: scores[client_id] });
			}
			scores.sort(function (a, b) {
				return b.player_score - a.player_score;
			});
			console.log(scores);

			io.to(clients_ids[0]).emit('score', { score: scores });

			numberOfVotesReady = 0;
			round = round - 1;
			if (round > 0) {

				setTimeout(function () {
					questions = select_5questions();
					choose_domain();
				}, DEFAULT_TIME_SEE_SCORE * 1000);
			}
		}
	});

});

server.listen(3000);
open('http://localhost:3000/');
setInterval(async_timer_update, 1000);