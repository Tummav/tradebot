const ga = require("golos-addons");
const global = ga.global;
const golos = ga.golos;
const golosjs = golos.golos;

global.initApp("torgobot");

golos.setWebsocket(global.CONFIG.ws);
golos.setChainId(global.CONFIG.chain_id);

const log = global.getLogger("index");

log.debug("websocket =", golosjs.config.get("websocket"));
log.debug("chain_id =", golosjs.config.get("chain_id"));


const CONFIG = global.CONFIG;
const BASE = CONFIG.base;
const QUOTE = CONFIG.quote;
const USERID = CONFIG.userid;
const KEY = CONFIG.key;
const BOT_TOKEN = CONFIG.telegram.token;
const CHATID = CONFIG.telegram.chatid;

const BID = CONFIG.bid;
const ASK = CONFIG.ask;

const MIN_ORDER = 1;

let OID = 1;

class Order {
    constructor(base, quote, orderid) {
        this.base = base;
        this.quote = quote;
        this.orderid = orderid;
    }
}

const OPENORDERS = {
    "bid" : null,
    "ask" : null
};

async function getOpenOrders() {
    return await golosjs.api.getOpenOrdersAsync(USERID);
}

async function closeExistingOrders() {
    const orders = await getOpenOrders();
    log.info("cancel existing orders ", orders);
    if(global.broadcast) {
        for(let o of orders) {
            //log.info("k = " + KEY);
            await golosjs.broadcast.limitOrderCancelAsync(KEY, USERID, parseInt(o.orderid));
        }
    } else {
        log.info("no broadcasting, orders are not canceled!");
    }
}


async function getOrderBook() {
    return golosjs.api.getOrderBook(1);    
}

async function getBalance() {
    let acc = await golos.getAccount(USERID);
    return {
        "GOLOS" : parseFloat(acc.balance.split(" ")[0]),
        "GBG" : parseFloat(acc.sbd_balance.split(" ")[0])
    };
}

async function calculateDesiredPrices() {
    const orderBook = await getOrderBook();

    //bids - покупка - %
    //asks - продажа + %
    
    let bid = parseFloat(orderBook.bids[0].real_price);
    let ask = parseFloat(orderBook.asks[0].real_price);

    log.debug("current bid = " + bid.toFixed(6));
    log.debug("current ask = " + ask.toFixed(6));
    
    return {
        bid : bid / (1 + BID.percent / 100),
        ask : ask * (1 + ASK.percent / 100)
    };
}

async function makeBid(price, balance, expires) {

    if(balance < MIN_ORDER) {
        sendMessage("not enough balance " + BASE);
        return;
    }

    const amount_to_sell = Math.min(balance, BID.max);
    const min_to_receive = amount_to_sell / price;
    
    sendMessage("create bid " + ass(amount_to_sell, BASE) + " > " + ass(min_to_receive, QUOTE));

    if(global.broadcast) {
        await golosjs.broadcast.limitOrderCreateAsync(KEY, USERID, OID++ 
            , ass(amount_to_sell, BASE), ass(min_to_receive, QUOTE), false, new Date(Date.now() + 60 * 60 * 1000));
    } else {
        log.info("no broadcast, order is not created!");
    }
}

function ass(a, n) {
    return a.toFixed(3) + " " + n;
}

async function makeAsk(price, balance, expires) {
    
        if(balance < MIN_ORDER) {
            sendMessage("not enough balance " + QUOTE);
            return;
        }
    
        const amount_to_sell = Math.min(balance, BID.max);
        const min_to_receive = amount_to_sell * price;
        
        sendMessage("create ask " + ass(amount_to_sell, QUOTE) + " > " + ass(min_to_receive, BASE));
        
        if(global.broadcast) {
            await golosjs.broadcast.limitOrderCreateAsync(KEY, USERID, OID++
                , ass(amount_to_sell, QUOTE), ass(min_to_receive, BASE), false, new Date(Date.now() + 60 * 60 * 1000));
        } else {
            log.info("no broadcast, order is not created!");
        }
    }
    
let prev_prices = null;

/**
 * The brain!
 */
async function updateOrders() {
    const balance = await getBalance();
    
    const prices = await calculateDesiredPrices();

    if(prev_prices && prev_prices.bid == prices.bid && prev_prices.ask == prices.ask) {
        //nothing changed
        return;
    }
    prev_prices = prices;
    log.info("balance" 
        + "\t" + prices.bid.toFixed(6)
        + "\t" + prices.ask.toFixed(6)
        + "\t" + ass(balance[BASE] / prices.ask + balance[QUOTE], QUOTE) 
        + "\t" +  ass(balance[QUOTE] * prices.bid + balance[BASE], BASE));

    const b_base = balance[BASE];
    const b_quote = balance[QUOTE];
    const b_quote_base = balance[QUOTE] * prices.bid + balance[BASE];
    const b_sum_base = b_base + b_quote_base;
    sendMessage(
        "Bid: " + prices.bid.toFixed(6)
        + ", Ask: " + prices.ask.toFixed(6)
        + "\nBalance:" 
        + "\n"+  ass(b_base, BASE) 
        + "\n" + ass(b_quote, QUOTE) + " (" + ass(b_quote_base, BASE) + ")"
        + "\nSum: " + ass(b_sum_base, BASE));

    const orders = await getOpenOrders();

    //log.info("desired prices", JSON.stringify(prices));

    let createBid = true;
    let createAsk = true;
    

    //iterate through orders, expected max 2
    for(let order of orders) {
        const base = order.sell_price.base.split(" ")[1];
        const price = parseFloat(order.real_price);

        if(base == BASE) {
            log.debug("found bid for price " + price + " vs " + prices.bid);
            //bid. Check if bid < desired bid price
            if(price + 0.001 < prices.bid) {
                //cancel order and create new one
                sendMessage("bid is less then desired, increase " + price.toFixed(6) + " / " + prices.bid.toFixed(6));
                if(global.broadcast) {
                    await golosjs.broadcast.limitOrderCancelAsync(KEY, USERID, parseInt(order.orderid));
                } else {
                    log.info("no broadcasting, bid not canceled");
                }
            } else {
                createBid = false;
            }
        }
        if(base == QUOTE) {
            log.debug("found ask for price " + price + " vs " + prices.ask);
            //bid. Check if bid < desired bid price
            if(price - 0.001 > prices.ask) {
                //cancel order and create new one
                sendMessage("ask is greather then desired, decrease " + price + "/" + prices.ask.toFixed(6));
                if(global.broadcast) {
                    await golosjs.broadcast.limitOrderCancelAsync(KEY, USERID, parseInt(order.orderid));
                } else {
                    log.info("no broadcasting, ask not canceled");
                }
            } else {
                createAsk = false;
            }
        }
    }

    if(createBid || createAsk) {
        let props = await golos.getCurrentServerTimeAndBlock();
        const expires = props.time - 1000 * 60 * 60;

        if(createBid) {
            await makeBid(prices.bid, balance[BASE], expires);
        }
    
        if(createAsk) {
            await makeAsk(prices.ask, balance[QUOTE], expires);
        }
    }
}

async function processBlock(bn) {
    log.debug("processing block " + bn);
    let transactions = await golosjs.api.getOpsInBlockAsync(bn, false);
    //log.debug(JSON.stringify(transactions));
    let found_order_changes = false;
    for(let tr of transactions) {
        let op = tr.op[0];
        let opBody = tr.op[1];
        if(op.match(/order/)) {
            found_order_changes = true;
        }
        switch(op) {
            case "fill_order":
                if(opBody.open_owner == USERID) {
                    const base = opBody.open_pays.split(" ")[1];
                    if(BASE == base) {
                        await sendMessage("bought " + opBody.current_pays + " for " +  opBody.open_pays);
                    } else {
                        await sendMessage("sold " + opBody.current_pays + " for " +  opBody.open_pays);
                    }
                }
                break;
        }
    }             
    if(found_order_changes)  {
        await updateOrders();
    }
}

async function run() {

    let props = await golos.getCurrentServerTimeAndBlock();
    let currentBlock = props.block;

    //Start clean
    await closeExistingOrders();
    //start working
    await updateOrders();

    while(true) {
        try {

            props = await golos.getCurrentServerTimeAndBlock();

            if(props.block < currentBlock) {
                //log.info(`no new blocks, skip round`);
                await global.sleep(1000*6);
                continue;
            }

            await processBlock(currentBlock++);

        } catch(e) {
            log.error("Error catched in main loop!");
            log.error(golos.getExceptionCause(e));
        }  
    } 
    process.exit(1);
}

let bot = null;

async function sendMessage(msg) {
    log.info(msg);
    if(!BOT_TOKEN) {
        return;
    }
    try {
        await bot.sendMessage(CHATID, msg, {parse: "Markdown"})
    } catch(e) {
        log.error("unable to send message " + JSON.stringify(e));
    }    
}

async function onText(data) {
    const chatid = data.from.id;
    log.info("some data from chat id " + chatid);

}

if(BOT_TOKEN) {
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
}

run();
