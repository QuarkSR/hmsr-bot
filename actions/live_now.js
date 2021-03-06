require('dotenv').config();
const fetch = require('node-fetch');
const models = require('./models');
const games = require('./games.json');

const authOptions = {
  method: 'POST',
  headers: {
    "Content-Type": "application/json"
  }
};
const authQueryString = `?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`;
const twitchAuthEndpoint = `https://id.twitch.tv/oauth2/token${authQueryString}`
const streamsAPIEndpoint = game => `https://api.twitch.tv/helix/streams?game_id=${game}`;
const usersAPIEndpoint = userId => `https://api.twitch.tv/helix/users?id=${userId}`;
const discordWebhookEndpoint = process.env.DISCORD_WEBHOOK;
const webhookOptions = (stream, user) => ({
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
      embeds: [
        {
          title: games[stream.game_id],
          description: `${stream.title}\n\n[Go to Stream](https://twitch.tv/${stream.user_name})`,
          url: `https://twitch.tv/${stream.user_name}`,
          color: 6908265,
          timestamp: new Date(stream.started_at).toISOString(),
          footer: { text: "Live" },
          author: {
            name: `[Twitch Stream] ${user.display_name}`
          },
          thumbnail: {
            url: user.profile_image_url
          }
        }
      ]
    })
});

const searchWords = ['%', 'il', 'runs', 'run', 'speedrun', 'speedruns', 'routing', 'race', 'tas', 'tasing', 'marriage%', 'any%', '100%', '98%', '101', 'hmsr'];

function getUserProfilePicture(userId) {
  const options = { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID } };
  return fetch(usersAPIEndpoint(userId), options).then(res => res.json());
}

function newStreamCreater(stream, previous) {
  if (!previous) { // not already published
    return getUserProfilePicture(stream.user_id).then((res) => {
      if (!res || !res.data || res.data.length === 0) { // twitch error
        console.log('No User found:', res);
        return Promise.resolve();
      }
      const [user] = res.data;
      const newStream = new models.Stream({
        streamId: stream.id,
        gameId: stream.game_id,
        userId: stream.user_id,
        userName: stream.user_name,
        staredAt: stream.started_at,
        title: stream.title,
      });
      return newStream.save().then(() => {
        const debugMessage = `${stream.user_name} | ${games[stream.game_id]} [${stream.game_id}]`;
        console.log(debugMessage);
        return fetch(discordWebhookEndpoint, webhookOptions(stream, user));
      });
    });
  }
}

function checkStreamIsPublished(stream) {
  const sanitizedTitleWords = stream.title.toLowerCase().replace(/[^%\w]/g, ' ').trim().split(' ');
  if (sanitizedTitleWords.includes('nohmsr')) { // does not wish to notify the discord, just return
	return;
  }
  else if (sanitizedTitleWords.filter(w => searchWords.includes(w)).length > 0) { // is speedrunner
    return models.Stream.findOne({ streamId: stream.id }).then((prev) => {
      return newStreamCreater(stream, prev);
    });
  }
  return Promise.resolve();
}

function getStream(streams) {
  if (!streams || !streams.data) { // twitch error
    console.log('Error reaching Twitch:', streams);
    return Promise.resolve();
  }

  return Promise.all(streams.data.map(checkStreamIsPublished));
}

function handler(event, context) {
  console.log(`Running ${process.env.SERVERLESS_VERSION} on ${process.env.SERVERLESS_STAGE} at ${Date.now()}`);
  // return fetch(twitchAuthEndpoint, authOptions).then(res => res.json()).then((auth) => {
  //   if (!auth.access_token) return Promise.resolve();
    return Promise.all(Object.keys(games).map((gameId) => {
      const options = { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID } };
      return fetch(streamsAPIEndpoint(gameId), options).then(res => res.json()).then(getStream);
    }));
  // });
}

function testDiscordWebhook() {
  const stream = {
    game_id: 1,
    user_id: 1,
    user_name: 'test',
    title: 'groteworlds test webhook',
    started_at: new Date().toISOString(),
  };
  const user = {
    display_name: 'Test',
    profile_image_url: 'https://placekitten.com/300/300'
  }
  const options = webhookOptions(stream, user);
  console.log(options);
  return fetch(discordWebhookEndpoint, options).then(res => res.json()).then(body => console.log(body));
}

function testTwitchUsersEndpoint() {
  const options = { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID } };
  return fetch(usersAPIEndpoint(133031053), options).then(res => res.json()).then(body => console.log(body));
}

function testTwitchAuth() {
  fetch(twitchAuthEndpoint, authOptions).then(res=>res.json()).then(b => console.log(b))
}

module.exports = { handler, testDiscordWebhook, testTwitchUsersEndpoint, testTwitchAuth };
