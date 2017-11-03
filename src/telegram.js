let bot = null;
let message = "";

async function sendMessage(msg) {
    log.info(msg);
    message += msg + "\n";
}


async function commitMessage(msg) {
    if(message == "") {
        return;
    }
    await sendMessage(msg);
    if(!BOT_TOKEN) {
        return;
    }
    try {
        await bot.sendMessage(CHATID, message, {parse: "Markdown"})
    } catch(e) {
        log.error("unable to send message " + JSON.stringify(e));
    }
    message = "";
}

async function onText(data) {
    const chatid = data.from.id;
    log.info("some data from chat id " + chatid);

}

async function onCancel(data) {
    const chatid = data.from.id;
    log.info("received cancel from chat id " + chatid);
    await closeExistingOrders();
}

async function onPause(data) {
    const chatid = data.from.id;
    log.info("received pause from chat id " + chatid);
    await closeExistingOrders();
    WORKING = false;    
}

async function onRun(data) {
    const chatid = data.from.id;
    log.info("received run from chat id " + chatid);
    WORKING = true;
    PREV_PRICES = null;  
    await updateOrders();
}

async function onStatus(data) {
    const chatid = data.from.id;
    log.info("received status from chat id " + chatid);
    infos = await getInfos();
    orders = await getOpenOrders();
    await sendOrders(orders);
    await sendBalance(infos, orders);
    await commitMessage("-------------------")
}

if(BOT_TOKEN && BOT_TOKEN != "") {
    const TeleBot = require("telebot");

    bot = new TeleBot({
        token: BOT_TOKEN,  
        polling: {  
          interval: 1000, // Optional. How often check updates (in ms). 
          timeout: 60,  
          limit: 100,  //updates
          retryTimeout: 5000 
        },
        usePlugins: ['commandButton']
    });

    bot.on('text', onText);
    bot.on('/cancel', onCancel);
    bot.on('/pause', onPause);
    bot.on('/run', onRun);
    bot.on('/status', onStatus);
    
    bot.connect();
}

async function sendOrders(orders) {
    
        let my_bid = 0;
        let my_ask = 0;
    
        for(let order of orders) {
            const base_name = order.sell_price.base.split(" ")[1];
            const price = parseFloat(parseFloat(order.real_price).toFixed(6));
            if(base_name == BASE) {
                my_bid = price;
            }
            if(base_name == QUOTE) {
                my_ask = price;
            }
        }
    
        let order_book = await golosjs.api.getOrderBook(20);
        log.trace(order_book);
        await sendMessage(`*Bids:*
    \`\`\`
    ${listOrders(order_book.bids, my_bid)}
    \`\`\``);
        await sendMessage(`*Asks:*
    \`\`\`
    ${listOrders(order_book.asks, my_ask)}
    \`\`\``);
}