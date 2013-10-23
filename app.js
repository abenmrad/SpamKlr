
/**
 * Module dependencies.
 */

var express = require('express')
  , http = require('http')
  , path = require('path')
  , mongoose = require('mongoose')
  , models = require('./config/dbmodels.js')
  , routes = require('./routes')
  , auth = require('./routes/auth.js')
  , io = require('socket.io')
  , config = require('./config/config.js')
  , hostconfig = require('./config/hostconfig.js')
  , twit = require('twit')
  , spamAnalysis = require('./spamAnalysis.js');

var app = express();

// all environments
app.set('port', hostconfig.portNumber);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.cookieSession({secret: hostconfig.cookieSecret, cookie: hostconfig.cookieOptions}));
app.use(app.router);
app.use(require('stylus').middleware(__dirname + '/public'));
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/signin', auth.signin);
app.get('/signin/callback', auth.signinCallback);
app.post('/welcome/callback', auth.welcomeCallback);
app.get('/logout', auth.logout);
app.get('/models', routes.models);
app.get('/models/new', routes.newModel);
app.post('/models/new/post', routes.postModel);
app.post('/models/new/preview', routes.previewModel);

var server = http.createServer(app);
io = io.listen(server);
server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var clientSockets = [];

io.sockets.on('connection', function(socket){
	clientSockets.push(socket);
	socket.on('disconnect', function(){
		for (var i = 0; i < clientSockets.length; i++){
			if (clientSockets[i] == socket){
				clientSockets.splice(i, 1);
				break;
			}
		}
	})
});

var broadcastMessage = function(message){
	console.log(message + ' blocked');
	for (var i = 0; i < clientSockets.length; i++){
		clientSockets[i].emit('data', message);
	}
}

var SpamModel = mongoose.model('SpamModel')
  , User = mongoose.model('User')
  , Spammer = mongoose.model('Spammer');

var usersList;
var actualUserIndex = 0;
var numBlocks;
var maxBlocks;
var limitedAccounts = 0;
var blockUser = function(screenname){
	var blockFn = function(screenname, blocker){
		var blockerConf = config;
		blockerConf.access_token = blocker.access_token;
		blockerConf.access_token_secret = blocker.access_token_secret;
		var twitClient = new twit(blockerConf);
		twitClient.post('users/report_spam', {screen_name: screenname}, function(err, reply){
			if (err){
				console.log(err);
				var errData = JSON.parse(err.data)
				if (errData.errors[0].code == 205){
					limitedAccounts++;
					if (usersList && limitedAccounts == usersList.length){
						setTimeout(blockUser(screenname), 300000);
					} else {
						blockUser(screenname);
					}
				}
			} else {
				limitedAccounts = 0;
				Spammer.update({screenname: screenname}, {blocked: true, blockerId: blocker.usrId}).exec();
				broadcastMessage('@' + screenname);
			}
		});
	}
	if (!usersList){
		User.find().exec(function(err, users){
			if (err){
				throw err;
			}
			usersList = users;
			maxBlocks = usersList.length * 10; // 10 blocks per user before reloading the user list
			numBlocks = 0;
			blockFn(screenname, usersList[0]);
			actualUserIndex = (actualUserIndex + 1) % usersList.length ;
		});
	} else {
		blockFn(screenname, usersList[actualUserIndex]);
		actualUserIndex = (actualUserIndex + 1) % usersList.length;
		if (numBlocks <= maxBlocks) usersList = undefined;
	}
};

var SpamModels = [];
var Streams = [];

function SpamModelType(model, distance){
	this.model = model;
	this.distance = distance;
}

var addModel = function(model, maxDistance){
	User.count(function(err, count){
		var elemNum = Math.floor(Math.random() * count);
		User.findOne().skip(elemNum).exec(function(err, selectedUser){
			if (err){
				throw err;
				return;
			}
			var streamConf = config;
			streamConf.access_token = selectedUser.access_token;
			streamConf.access_token_secret = selectedUser.access_token_secret;
			var twitClient = new twit(streamConf);
			var target = spamAnalysis.findHashtags(model).join(" ");
			var stream = twitClient.stream('statuses/filter', {track: target});
			stream.on('tweet', function(tweet){
				var rlTweet = spamAnalysis.removeLinks(tweet.text);
				if (spamAnalysis.strDistance(rlTweet, model) <= maxDistance && !(tweet.retweeted_status)){
					SpamModel.update({model: model}, {$inc: {reported: 1}}).exec();
					console.log('New spammer found @' + tweet.user.screen_name);
					var newSpammer = new Spammer({usrId: tweet.user.userId, screenname: tweet.user.screen_name, spamTweet: tweet});
					newSpammer.save();
					blockUser(tweet.user.screen_name);
				}
			});
		});
	});
};

SpamModel.find(function(err, result){
	if (err){
		throw err;
		process.exit(0);
	}
	if (result){
		for (var i = 0; i < result.length; i++){
			addModel(result[i].model, result[i].distance);
		}
	}
});

routes.onnewmodel = function(message, distance){
	addModel(message, distance);
};