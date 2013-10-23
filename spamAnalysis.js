exports.removeLinks = function(tweet){
	//I don't know how to do this. Mwaaaaaaa3
	//Edit : I finally managed to do it :p
	// 'Inserts [link] placeholder'
	if (tweet.indexOf('http://') > -1 || tweet.indexOf('https://') > -1){
		var linkIndexes = [];
		var lastHttpIndex = tweet.indexOf('http://');
		while (lastHttpIndex != -1){
			linkIndexes.push(lastHttpIndex);
			lastHttpIndex = tweet.indexOf('http://', lastHttpIndex + 1);
		}
		var lastHttpsIndex = tweet.indexOf('https://');
		while (lastHttpsIndex != -1){
			linkIndexes.push(lastHttpsIndex);
			lastHttpsIndex = tweet.indexOf('https://', lastHttpsIndex + 1);
		}
		var lastPicIndex = tweet.indexOf('pic.twitter.com');
		while (lastPicIndex != -1){
			linkIndexes.push(lastPicIndex);
			lastPicIndex = tweet.indexOf('pic.twitter.com', lastPicIndex + 1);
		}
		var links = [];
		for (var i = 0; i < linkIndexes.length; i++){
			var actualIndex = linkIndexes[i];
			var actualLink = "";
			var actualChar = tweet[actualIndex];
			do {
				actualLink += actualChar;
				actualIndex++;
				actualChar = tweet[actualIndex];
			} while(!(actualChar == ' ' || actualChar == '\n' || actualChar == '\r' || actualChar == '#' || actualChar == ',') && actualIndex < tweet.length);
			links.push(actualLink);
		}
		for (var i = 0; i < links.length; i++){
			tweet = tweet.replace(links[i], "[link]");
		}
		return tweet;
	} else {
		return tweet;
	}
};

// Tries to find the "average string" from a set of strings. Used to normalize the randomized tweets in order to find the spam model
exports.drawSpamModel = function(tweets){
	var maxChar = function(chars){
		if (chars && chars.length > 0){
			function charOccurence(char, occurence){
				this.char = char;
				this.occurence = occurence;
			};
			var charOccurences = [];
			for (var i = 0; i < chars.length; i++){
				var actualChar = chars[i];
				var addNewOccurence = true;
				for (var j = 0; j < charOccurences.length; j++){
					if (charOccurences[j].char == actualChar){
						addNewOccurence = false;
						charOccurences[j].occurence++;
						break;
					}
				}
				if (addNewOccurence){
					charOccurences.push(new charOccurence(actualChar, 1));
				}
			}
			var maxValue = 0;
			var maxValueIndex = -1;
			for (var i = 0; i < charOccurences.length; i++){
				if (charOccurences[i].occurence > maxValue){
					maxValue = charOccurences[i].occurence;
					maxValueIndex = i;
				}
			}
			var maxChar = charOccurences[maxValueIndex].char;
			return maxChar;
		} else {
			throw new TypeError('invalid char list');
		}
	};
	if (tweets && tweets.length > 1){
		var refLength = tweets[0].length;
		for (var i = 1; i < tweets.length; i++){
			if (tweets[i].length != refLength){
				return null;
			}
		}
		var resultModel = "";
		for (var i = 0; i < refLength; i++){
			var chars = [];
			for (var j = 0; j < tweets.length; j++){
				chars.push(tweets[j].charAt(i));
			}
			var actualChar = maxChar(chars);
			resultModel += actualChar;
		}
		return resultModel;
	} else {
		return undefined;
	}
};

//Counts how many characters differ from one string to another
exports.strDistance = function(string1, string2){
	var diffCount = 0;
	//Count the length difference as different characters.
	var lengthDiff = Math.max(string1.length, string2.length) - Math.min(string1.length, string2.length);
	diffCount += lengthDiff;
	//Taken the possible string length diffrence into account, counting char differences with the shortest string as length reference
	var scanLength = Math.min(string1.length, string2.length);
	for (var i = 0; i < scanLength; i++){
		if (string1[i] != string2[i]){
			diffCount++;
		}
	}
	return diffCount;
};

exports.findHashtags = function(string){
	var hashtags = [];
	var hashtagsIndexes = [];
	var lastHashtagIndex = string.indexOf('#');
	// With this loop, we look for where hashtags start
	while (lastHashtagIndex != -1){
		hashtagsIndexes.push(lastHashtagIndex);
		lastHashtagIndex = string.indexOf('#', lastHashtagIndex + 1); //Just because :p
	}
	// With this loop, we look for the end of the hashtags. The hashtags are then pushed to the hashtags array
	for (var i = 0; i < hashtagsIndexes.length; i++){
		var actualIndex = hashtagsIndexes[i];
		var actualHashtag = "";
		var actualChar = string[actualIndex];
		do {
			actualHashtag += actualChar;
			actualIndex++;
			actualChar = string[actualIndex];
		} while(!(actualChar == '#' || actualChar == ' ' || actualChar == '-' || actualChar == '_' || actualChar == '|' || actualChar == '\\' || actualChar == '/' || actualChar == ':' || actualChar == ';' || actualChar == '.' || actualChar == ',') && actualIndex < string.length);
		hashtags.push(actualHashtag);
	}
	return hashtags;
};

exports.findDistance = function(spamModel, spamTweets){
	var maxDistance = 0;
	for (var i = 0; i < spamTweets.length; i++){
		var acutalDistance = exports.strDistance(spamModel, spamTweets[i]);
		if (acutalDistance > maxDistance){
			maxDistance = acutalDistance;
		}
	}
	return maxDistance;
};