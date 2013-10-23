//The twitter signin page and it's callback
var mongoose = require('mongoose');
var config = require('../config/config.js');
var hostconfig = require('../config/hostconfig.js');
var twit = require('twit');
var OAuth = require('oauth').OAuth;
var connection = new OAuth(
	'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    config.consumer_key,
    config.consumer_secret,
    '1.0',
    (hostconfig.useSsl ? 'https://' : 'http://') + hostconfig.hostname + ':' + hostconfig.portNumber + '/signin/callback',
    'HMAC-SHA1');

exports.signin = function(req, res){
	connection.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results){
		if (error){
			console.log(error);
			res.render('message', {title: 'Error', header: 'Sorry :(', message: 'An error occured while contacting Twitter. Please retry.'});
		} else {
			req.session.oauth = {};
			req.session.oauth.token = oauth_token;
			req.session.oauth.token_secret = oauth_token_secret;
			res.redirect('https://twitter.com/oauth/authenticate?oauth_token=' + oauth_token);
		}
	})
};

exports.signinCallback = function(req, res){
	if (req.session.oauth){
		req.session.oauth.verifier = req.query.oauth_verifier;
		var oauth = req.session.oauth;
		connection.getOAuthAccessToken(oauth.token, oauth.token_secret, oauth.verifier, function(error, oauth_access_token, oauth_access_token_secret, results){
			if (error){
				console.log(error);
				res.render('message', {title: 'Error', header: 'Sorry. :(', message: 'An error occured while authenticating. Please retry.'});
			} else {
				var User = mongoose.model('User');
				req.session.oauth.access_token = oauth_access_token;
				req.session.oauth.access_token_secret = oauth_access_token_secret;
				User.count({access_token: oauth_access_token, access_token_secret: oauth_access_token_secret}, function(err, count){
					if (err){
						res.render('message', {title: 'Error', header: 'Sorry :(', message: 'We were not able to register you. Please retry.'});
						return;
					}
					if (count == 0){
						//New user. Save it in DB and show him welcome page
						var userconfig = config;
						userconfig.access_token = oauth_access_token;
						userconfig.access_token_secret = oauth_access_token_secret;
						var twitClient = new twit(userconfig);
						twitClient.get('account/settings', function(err, reply){
							var newUser;
							var screenname;
							if (err){
								newUser = new User({
									access_token: oauth_access_token,
									access_token_secret: oauth_access_token_secret
								});
								newUser.save();
								console.log(err);
								res.render('welcome', {title: 'Welcome', screenname: screenname});
							} else {
								newUser = new User({
									access_token: oauth_access_token,
									access_token_secret: oauth_access_token_secret,
									screenname: reply.screen_name,
								});
								screenname = reply.screen_name
								twitClient.get('users/show', {screen_name: screenname}, function(err, reply){
									if (!err){
										newUser.usrId = reply.id;
										newUser.profileurl = reply.profile_image_url;
										console.log('Actual time : ' + Date.now());
										newUser.lastUpdate = Date.now();
									}
									newUser.save();
									res.render('welcome', {title: 'Welcome', screenname: screenname, profileurl: reply.profile_image_url});
								});
							}
						});
					} else {
						//Already registered user. Direct him to home page
						res.redirect('/');
					}
				});
			}
		});
	} else {
		res.redirect('/');
	}
};

exports.welcomeCallback = function(req, res){
	if (req.session.oauth && req.session.oauth.access_token && req.session.oauth.access_token_secret){
		/*if (req.body.tweet){
			var tweetMessage = req.body.tweetMessage;
			tweetMessage += " https://tweetkiller.net";
			var userconfig = config;
			userconfig.access_token = req.session.oauth.access_token;
			userconfig.access_token_secret = req.session.oauth.access_token_secret;
			var twitClient = new twit(userconfig);
			twitClient.post('statuses/update', {status: tweetMessage}, function(err, result){
				if (err) throw err;
			});
		}*/
		if (req.body.newModel){
			res.redirect('/models/new');
		} else {
			res.redirect('/');
		}
	} else {
		res.redirect('/');
	}
};

exports.logout = function(req, res){
	req.session = null;
	res.redirect('/');
}