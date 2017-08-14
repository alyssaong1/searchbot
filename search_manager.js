// Top level object
var searchMgr = {};

var builder = require('botbuilder');

//=========================================================
// Azure search setup
//=========================================================

var AzureSearch = require('azure-search');
var client = AzureSearch({
    url: "INSERT AZURE SEARCH URL",
    key:"INSERT AZURE SEARCH KEY"
});

// Max number of results to display at one time
searchMgr.numberOfDisplayedResults = 3;
// Max number of pages to display before asking to log ticket
searchMgr.maxNumberOfPages = 3;

searchMgr.resetSearch = function (session) 
{
    // Reset current page and search index
    session.privateConversationData.currentPageNumber = 1;
    session.privateConversationData.searchIndexes = {
        "start": 0,
        "end": this.numberOfDisplayedResults
    }
    // Reset search log
    session.privateConversationData.searchLog = {
        "query": '',
        "intent": '',
        "solved": false,
        "hasClearResult": false, // is there one clear result from search
        "articles": []
    };
    // Reset search results
    session.privateConversationData.searchResults = {};
}

searchMgr.storeSearchResults = function (session, results) 
{
    session.privateConversationData.searchResults = results;
}

searchMgr.incrementPageIndex = function (session) 
{
    // Increment page number
    session.privateConversationData.currentPageNumber += 1;
    // Increment offset of start index for displaying results
    session.privateConversationData.searchIndexes.start += this.numberOfDisplayedResults;

    //Update index range
    var results = session.privateConversationData.searchResults;
    var currStartIndex = session.privateConversationData.searchIndexes.start; //get current start index from private convo data/state
    var currEndIndex;
    // Loop through 3 times (no of articles)
    for (var i = currStartIndex; i < currStartIndex + this.numberOfDisplayedResults; i++){
        if (results[i] && (typeof results !== 'undefined'))
        {
            currEndIndex = i+1;
        }
    }
    //Save end index to session data
    session.privateConversationData.searchIndexes.end = currEndIndex;
}

searchMgr.performSearch = function (session, userQuery, callback) {
    // Reset search indexes and pages
    this.resetSearch(session);
    
    // Save query and intent into log
    session.privateConversationData.searchLog.query = userQuery;
    session.privateConversationData.searchLog.intent = 'search';
    // Pass to azure search
    client.search('qna-index', {search: userQuery, top: 10 }, function(err, results, raw){
        // Store results
        searchMgr.storeSearchResults(session,results);
        callback(results);
    });
}

searchMgr.displayArticles = function (session, articles, callback){
    var cards = [];
    for (var i = 0; i < articles.length; i++){
        var article = articles[i];
        // save article to session
        session.privateConversationData.searchLog.articles.push(article.id);
        // Create a card for the article
        cards.push(new builder.HeroCard(session)
            .title(article.question)
            .subtitle(article.answer)
            .buttons([
                builder.CardAction.openUrl(session, article.url, "View solution")
            ]));
        console.log(cards);
    }
    var msg = new builder.Message(session)
        .textFormat(builder.TextFormat.xml)
        .attachmentLayout(builder.AttachmentLayout.carousel)
        .attachments(cards);
    session.send(msg);
    callback();
}

module.exports = searchMgr;