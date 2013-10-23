var mongoose = require('mongoose');
var twit = require('twit');
var config = require('../config/config.js');
var hostconfig = require('../config/hostconfig.js');
var spamAnalysis = require('../spamAnalysis.js');
var User = mongoose.model('User');
var SpamModel = mongoose.model('SpamModel');
var Spammer = mongoose.model('Spammer');
var AuthIssue = mongoose.model('AuthIssue');
/*
 * GET home page.
 */

exports.index = function(req, res){
	var renderIndex = function(pageParams){
		Spammer.count({blocked: true}, function(err, count){
			if (err){
				pageParams.spammersBlocked = 0;
			}else{
				pageParams.spammersBlocked = count;
			}
			res.render('index', pageParams);
		})
	};
	if (req.session.oauth && req.session.oauth.access_token && req.session.oauth.access_token_secret){
		//Reload avatar each 15 minutes at most
		User.findOne({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}).exec(function(err, result){
			if (err){
				throw err;
				renderIndex({title: 'SpamKlr'});
				return;
			}
			if (!result){
				var newIssue = new AuthIssue({
					IP: req.ip,
					method: '/',
					message: 'User doesn\'t exist',
					auth: req.session.oauth
				});
				newIssue.save();
				renderIndex({title: 'SpamKlr'});
				return;
			}
			// 900000ms = 15min
			if (!result.lastUpdate || (result.lastUpdate && result.lastUpdate < Date.now - 900000)){
				var userconfig = config;
				userconfig.access_token = req.session.oauth.access_token;
				userconfig.access_token_secret = req.session.oauth.access_token_secret;
				var twitClient = new twit(userconfig);
				if (!result.usrId){
					twitClient.get('account/settings', function(err, reply){
						if (err){
							renderIndex({ title: 'SpamKlr'});
							console.log('Error when loading screenname (missing usrId)\n' + err);
						}  else {
							var screenname = reply.screen_name;
							User.update({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, {screenname: screenname}).exec();
							twitClient.get('account/settings', function(err, reply){
								if (err){
									renderIndex({ title: 'SpamKlr', screenname: screenname });
									console.log('Error when loading profile_image_url (missing usrId)\n' + err);
								} else {
									User.update({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, {profileurl: reply.profile_image_url, lastUpdate: Date.now()}).exec();
									console.log('DB update with unknown usrId');
									renderIndex({ title: 'SpamKlr', screenname: screenname, profileurl: reply.profile_image_url });
								}
							});
						}
					});
				} else {
					twitClient.get('users/show', {user_id: result.usrId}, function(err, reply){
						if (err){
							renderIndex({ title: 'SpamKlr'});
							console.log('Error when loading screenname and profile_image_url\n' + err);
						} else {
							User.update({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, {screenname: reply.screen_name, profileurl: reply.profile_image_url, lastUpdate: Date.now()}).exec();
							console.log('DB update with known usrId');
							renderIndex({title: 'SpamKlr', screenname: reply.screen_name, profileurl: reply.profile_image_url});
						}
					});
				}
			} else {
				console.log('Rendering page with cached data');
				renderIndex({title: 'SpamKlr', screenname: result.screenname, profileurl: result.profileurl});
			}
		});
	} else {
		renderIndex({ title: 'SpamKlr' });
	}
};

exports.newModel = function(req, res){
	if (req.session.oauth){
		var resultFound = false
		var result;
		User.count({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, function(err, count){
			if (err){
				res.render('message', {title: 'Error', header: 'Sorry :(', message: 'Error while contacting our database. Please retry.'});
				throw err;
				return;
			}
			if (count == 0){
				var newIssue = new AuthIssue({
					IP: req.ip,
					method: "/models/new",
					message: 'User doesn\'t exist',
					auth: req.session.oauth
				});
				newIssue.save();
				req.session = null;
				res.redirect('/');
			} else if (count == 1) {
				//Rendering page. Inject username and profile image
				User.findOne({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, function(err, result){
					if (err){
						console.log('Error when retrieving cached screenname and profileurl:\n'+ err);
						res.render('message', {title: 'Error', header: 'Sorry :(', message: 'Error while contacting our database. Please retry'});
						return;
					}
					SpamModel.find().sort({reportDate: -1}).exec(function(err, results){
						if (err){
							console.log('Error when retrieving spammodels:\n'+ err);
							res.render('message', {title: 'Error', header: 'Sorry :(', message: 'Error while contacting our database. Please retry'});
							return;
						}
						res.render('newmodel', {title: 'Report spam attack', screenname: result.screenname, profileurl: result.profileurl, models: results});
					});
				});
			} else {
				res.render('message', {title: 'Error', header: 'Sorry :(', message: 'There are inconsistencies in our database. Sorry for that.'});
			}
		});
	} else {
		res.redirect('/signin');
	}
};

exports.onnewmodel = function(model, distance){};

//Preview spam model
exports.previewModel = function(req, res){
	res.set('Content-Type', 'text/plain');
	var response = {};
	response.isValid = false
	if (req.body.spamexamples && JSON.parse(req.body.spamexamples) instanceof Array){
		if (req.session.oauth && req.session.oauth.access_token && req.session.oauth.access_token_secret){
			User.findOne({ access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, function(err, result){
				if (err) {
					response.message = 'DB error';
					res.send(500, response);
					return;
				}
				if (!result){
					response.message = 'Invalid authentication';
					var newIssue = new AuthIssue({
						IP: req.ip,
						method: '/models/new/preview',
						auth: req.session.oauth,
						message: 'Invalid tokens'
					});
					newIssue.save();
					res.send(401, response);
				} else {
					var spamTweets = JSON.parse(req.body.spamexamples);
					for (var i = 0; i < spamTweets.length; i++){
						spamTweets[i] = spamAnalysis.removeLinks(spamTweets[i]);
					}
					var spamModel = spamAnalysis.drawSpamModel(spamTweets);
					spamModel = spamModel.toString();
					if (spamModel){
						response.spamModel = spamModel;
						response.distance = spamAnalysis.findDistance(spamModel, spamTweets);
						if (spamAnalysis.findHashtags(spamModel).length > 0){
							response.isValid = true;
						}
					}
					res.send(200, response);
				}
			});
		} else {
			response.message = 'Invalid authentication';
			var newIssue = new AuthIssue({
				IP: req.ip,
				method: '/models/new/preview',
				message: 'No tokens found',
				auth: req.session.oauth
			});
			newIssue.save();
			res.send(401, response);
		}
	} else {
		response.message = 'Missing operands';
		var newIssue = new AuthIssue({
			IP: req.ip,
			method: '/models/new/preview',
			message: 'No Spam examples recieved'
		});
		newIssue.save();
		res.send(400, response);
	}
};

//AJAX call
exports.postModel = function(req, res){
	res.set('Content-Type', 'text/plain');
	var response = {};
	response.isValid = false;
	if (req.session.oauth && req.session.oauth.access_token && req.session.oauth.access_token_secret){
		User.findOne({ access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, function(err, result){
			if (err) {
				response.message = 'DB error';
				res.send(500, response);
				return;
			}
			if (!result){
				response.message = 'Invalid authentication';
				var newIssue = new AuthIssue({
					IP: req.ip,
					method: '/models/new/post',
					auth: req.session.oauth,
					message: 'Invalid tokens'
				});
				newIssue.save();
				res.send(401, response);
			} else {
				if (req.body.spammodel && req.body.distance){
					if (req.body.spammodel.toString().length > 140 || isNaN(new Number(req.body.distance))){
						response.message = 'Invalid format';
						var newIssue = new AuthIssue({
							IP: req.ip,
							method: '/models/new/post',
							auth: req.session.oauth,
							message: response.message
						});
						newIssue.save();
						res.send(400, response);
						return;
					}
					SpamModel.count({model: req.body.spammodel, distance: req.body.distance}, function(err, count){
						if (err){
						}
						if (count >= 1){
							response.message = 'Succes';
							response.isValid = true;
							res.send(200, response);
						} else if (count == 0){
							if (spamAnalysis.findHashtags(req.body.spammodel)){
								var newSpamModel = new SpamModel({
									usrId: result.usrId,
									model: req.body.spammodel,
									distance: req.body.distance
								});
								newSpamModel.save();
								response.message = 'Succes';
								response.isValid = true;
								res.send(200, response);
								exports.onnewmodel(req.body.spammodel, req.body.distance);
							} else {
								response.message = 'No hashtags found';
								var newIssue = new AuthIssue({
									IP: req.ip,
									method: '/models/new/post',
									auth: req.session.oauth,
									message: response.message
								});
								newIssue.save();
								res.send(400, response);
							}
						}
					});
				} else {
					response.message = 'Missing operands';
					var newIssue = new AuthIssue({
						IP: req.ip,
						method: '/models/new/post',
						auth: req.session.oauth,
						message: response.message
					});
					newIssue.save();
					res.send(400, response);
				}
			}
		});
	} else {
		response.message = 'Invalid authentication';
		var newIssue = new AuthIssue({
			IP: req.ip,
			method: '/models/new/post',
			message: 'No tokens found'
		});
		newIssue.save();
		res.send(401, response);
	}
};

exports.models = function(req, res){
	SpamModel.find().sort({reportDate: -1}).exec(function(err, results){
		if (err){
			res.render('message', {title: 'Error', header: 'Sorry :(', message: 'Error while contacting our database. Please retry.'});
			throw err;
			return;
		}
		var models = [];
		for (var i = 0; i < results.length; i++){
			models.push(results[i].model);
		}
		if (req.session.oauth){
			var resultFound = false
			var result;
			User.count({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, function(err, count){
				if (err){
					res.render('models', {title: 'Reported spam attacks', models: models});
					throw err;
					return;
				}
				if (count == 1) {
					//Rendering page. Inject username and profile image
					User.findOne({access_token: req.session.oauth.access_token, access_token_secret: req.session.oauth.access_token_secret}, function(err, result){
						if (err){
							/*console.log('Error when retrieving cached screenname and profileurl:\n'+ err);
							res.render('message', {title: 'Error', header: 'Sorry :(', message: 'Error while contacting our database. Please retry'});
							return;*/
							res.render('models', {title: 'Reported spam attacks', models: models});
							return;
						}
						res.render('models', {title: 'Reported spam models', screenname: result.screenname, profileurl: result.profileurl, models: models});
						console.log('Rendered models page with cached info')
					});
				} else {
					res.render('models', {title: 'Reported spam attacks', models: models});
				}
			});
		} else {
			res.render('models', {title: 'Reported spam attacks', models: models});
		}
	});
};