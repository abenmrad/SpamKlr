var mongoose = require('mongoose'),
	Schema = mongoose.Schema,
	dbconfig = require('./dbconfig.js');

var User = new Schema({
	usrId: Number,
	screenname: String,
	profileurl: String,
	regDate: {type: Date, default: Date.now},
	lastUpdate: Number,
	access_token: String,
	access_token_secret: String
});

var SpamModel = new Schema({
	usrId: Number,
	reportDate: {type: Date, default: Date.now},
	model: String,
	distance: Number,
	reported: {type: Number, default: 0}
});

var Spammer = new Schema({
	usrId: Number,
	screenname: String,
	reportDate: {type: Date, default: Date.now},
	spamTweet: String,
	blocked: {type: Boolean, default: false},
	blockerId: Number
});

var AuthIssue = new Schema({
	IP: String,
	reportDate: {type: Date, default: Date.now},
	method: String,
	auth: Object,
	message: String
});

if (dbconfig.user === undefined || dbconfig.pass === undefined){
	mongoose.connect('mongodb://' + dbconfig.host + ':' + dbconfig.portNumber + '/' + dbconfig.db, function(err){
		if (err) throw err;
	});
} else {
	mongoose.connect('mongodb://' + dbconfig.user + ':' + dbconfig.pass + '@' + dbconfig.host + ':' + dbconfig.portNumber + '/' + dbconfig.db, function(err){
		if (err) throw err;
	});
}

mongoose.model('User', User);
mongoose.model('SpamModel', SpamModel);
mongoose.model('Spammer', Spammer);
mongoose.model('AuthIssue', AuthIssue);

mongoose.connection.on('error', console.error.bind(console, 'connection error : '));
mongoose.connection.once('open', function callback(){
	console.log('Connection to DB established');
});