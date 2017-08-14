var restify = require('restify');
var builder = require('botbuilder');
var searchMgr = require('./search_manager');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
const ScoreThreshold = 0.01; // The maximum score difference needed for a clear top result


// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Receive messages from the user and respond by echoing each message back (prefixed with 'You said:')
var bot = new builder.UniversalBot(connector, '/');

bot.dialog('/', [
    (session,args) => {
        searchMgr.performSearch(session, session.message.text, function (results) {
            // Process search results
            if (results.length == 1)
            {
                session.privateConversationData.searchLog.hasClearResult = true;
                console.log(results[0])
                // If there is one clear definite result from search
                session.send(results[0].answer);
                session.endDialog("Visit this link for more info:" + results[0].url);
            } else if (results.length > 1) 
            {
                if (results[0]['@search.score'] - results[1]['@search.score'] < ScoreThreshold)
                {
                    // Multiple articles might be the answer
                    session.send("I've found these articles that may help: ");
                    session.beginDialog('/displaySearchResults', results);
                } else 
                {
                    session.privateConversationData.searchLog.hasClearResult = true;
                    // The top result has high confidence even though multiple results were returned
                    session.send(results[0].answer);
                    session.endDialog("Visit this link for more info: " + results[0].url);
                    session.beginDialog('/getFeedback');
                }
            } else 
            {
                // no results
                session.endDialog("Sorry, I didn't find anything. Could you rephrase your issue?");
            }
        });
    }
])

bot.dialog('/displaySearchResults', [
    function (session, args, next){
        // Extract the articles to be displayed
        var articlesToDisplay = session.privateConversationData.searchResults.slice(session.privateConversationData.searchIndexes.start, session.privateConversationData.searchIndexes.end);
        searchMgr.displayArticles(session, articlesToDisplay, function (){
            // Increment page and indexes
            searchMgr.incrementPageIndex(session);
            session.beginDialog('/getFeedback');
        });
    }
]);


bot.dialog('/getFeedback', [
    function (session,args,next) {
        builder.Prompts.choice(session, "Did any of these answer your question?", "Yes|No");
    }, function (session, results){
        if (results.response.entity === 'Yes')
        {
            // Marked as solved
            session.privateConversationData.searchLog.solved = true;
            // save to db
            session.endDialog("Thanks for the feedback.");
        } else 
        {
            // Check that max specified pages not exceeded and we have not yet shown all the results
            if ((!session.privateConversationData.searchLog.hasClearResult) && session.privateConversationData.currentPageNumber <= searchMgr.maxNumberOfPages && session.privateConversationData.searchIndexes.start < session.privateConversationData.searchResults.length)
            {
                session.send("Alright, what about these?");
                session.replaceDialog('/displaySearchResults');
            } else 
            {
                session.sendTyping();
                var msg = new builder.Message(session)
                    .textFormat(builder.TextFormat.xml)
                    .attachmentLayout(builder.AttachmentLayout.carousel)
                    .attachments([
                        new builder.HeroCard(session)
                        .title('')
                        .buttons([
                            builder.CardAction.openUrl(session, "http://microsoft.com", "Log ticket")
                        ])
                    ]);
                session.send("Sorry I wasn't able to get useful results for you. You may log a ticket with the support team.");
                session.endDialog(msg);
            }
        }
    }
]);
