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
const MESS = CONFIG.telegram.send_messages;

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

async function calculateDesiredPrices(bid, ask) {
    
    return {
        bid : bid / (1 + BID.percent / 100),
        ask : ask * (1 + ASK.percent / 100)
    };
}

async function makeBid(price, balance, expires) {

    if(balance < MIN_ORDER) {
        if(MESS.empty_balance) {
            await sendMessage("not enough balance " + BASE);
        }
        return;
    }

    const amount_to_sell = Math.min(balance, BID.max);
    const min_to_receive = amount_to_sell / price;
    
    if(MESS.create_order) {
        await sendMessage(`*Create bid-order:*
\`\`\`
${listOrders([{
            sell_price : {
                base : ass(amount_to_sell, BASE),
                quote : ass(min_to_receive, QUOTE)
            },
            real_price : price
        }])}\`\`\``);
    }

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
        if(MESS.empty_balance) {
            await sendMessage("not enough balance " + QUOTE);
        }
        return;
    }

    const amount_to_sell = Math.min(balance, BID.max);
    const min_to_receive = amount_to_sell * price;
    
    if(MESS.create_order) {
        await sendMessage(`*Create ask-order:*
\`\`\`
${listOrders([{
                    sell_price : {
                        base : ass(amount_to_sell, QUOTE),
                        quote : ass(min_to_receive, BASE)
                    },
                    real_price : price
                }])}\`\`\``);
    }

    if(global.broadcast) {
        await golosjs.broadcast.limitOrderCreateAsync(KEY, USERID, OID++
            , ass(amount_to_sell, QUOTE), ass(min_to_receive, BASE), false, new Date(Date.now() + 60 * 60 * 1000));
    } else {
        log.info("no broadcast, order is not created!");
    }
}   
    
let prev_prices = null;

async function getInfos() {

    const balance = await getBalance();
    const orderBook = await getOrderBook();
    let bid = parseFloat(orderBook.bids[0].real_price);
    let ask = parseFloat(orderBook.asks[0].real_price);    
    
    log.debug("current bid = " + bid.toFixed(6));
    log.debug("current ask = " + ask.toFixed(6));

    const prices = await calculateDesiredPrices(bid, ask);    

    return {
        balance : balance,
        top_prices : { bid : bid, ask : ask },
        prices : prices
    };
}

async function sendBalance(infos, orders) {
    let b_o_base = 0;
    let b_o_quote = 0;

    for(let order of orders) {
        const base_amount = parseFloat(order.sell_price.base.split(" ")[0]);
        const base_name = order.sell_price.base.split(" ")[1];
        if(base_name == BASE) {
            b_o_base += base_amount;
        }
        if(base_name == QUOTE) {
            b_o_quote += base_amount;
        }
    }

    const b_base = infos.balance[BASE];
    const b_quote = infos.balance[QUOTE];
    const b_quote_base = b_quote * infos.top_prices.ask;
    const b_o_quote_base = b_o_quote * infos.top_prices.ask;
    const b_sum_base = b_base + b_quote_base + b_o_base + b_o_quote_base;

    await sendMessage(`*Balance:*
${ass(b_base, BASE)} (${ass(b_o_base, BASE)})
${ass(b_quote, QUOTE)} (${ass(b_o_quote, QUOTE)})
*Sum:* ${ass(b_sum_base, BASE)}`);
}

function listOrders(orders) {
    let ret = "";
    let comma = "";
    for(let o of orders) {
        ret += comma + `${parseFloat(o.real_price).toFixed(6)} | ${o.sell_price.base} | ${o.sell_price.quote}`;
        comma = "\n";
    }
    return ret;
}

async function sendOrders(orders) {
    let bids = [];
    let asks = [];
    for(let order of orders) {
        const base_amount = parseFloat(order.sell_price.base.split(" ")[0]);
        const base_name = order.sell_price.base.split(" ")[1];
        if(base_name == BASE) {
            bids.push(order);
        }
        if(base_name == QUOTE) {
            asks.push(order);
        }
    }

    await sendMessage(`*Bids:*
\`\`\`
${listOrders(bids)}
\`\`\``);
    await sendMessage(`*Asks:*
\`\`\`
${listOrders(asks)}
\`\`\``);

}

/**
 * The brain!
 */
async function updateOrders() {

    let infos = await getInfos();
    const prices = infos.prices;
    const balance = infos.balance;

    if(prev_prices && prev_prices.bid == infos.top_prices.bid && prev_prices.ask == infos.top_prices.ask) {
        //nothing changed
        return;
    }
    prev_prices = infos.top_prices;

    if(MESS.top_prices) {
        await sendMessage(`*Max. bid:* ${infos.top_prices.bid.toFixed(6)} *Min. ask:* ${infos.top_prices.ask.toFixed(6)}
`);
    }

    if(MESS.desired_prices) {
        await sendMessage(`*Des. bid:* ${infos.prices.bid.toFixed(6)} *Des. ask:* ${infos.prices.ask.toFixed(6)}
`);
    }

    let orders = await getOpenOrders();

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
                if(MESS.changed_desired) {
                    await sendMessage("bid is less then desired, increase " + price.toFixed(6) + " / " + prices.bid.toFixed(6));
                }
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
                if(MESS.changed_desired) {
                    await sendMessage("ask is greather then desired, decrease " + price + "/" + prices.ask.toFixed(6));
                }
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

    infos = await getInfos();
    orders = await getOpenOrders();

    if(MESS.open_orders) {
        await sendOrders(orders);
    }

    if(MESS.balance) {
        await sendBalance(infos, orders);
    }
    
    let verbose = false;
    for(let f of Object.keys(MESS)) {
        if(MESS[f]) {
            verbose = true;
            break;
        }
    }
    if(verbose) {
        await commitMessage("☰");
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
                if(MESS.filled) {
                    if(opBody.open_owner == USERID) {
                        const base = opBody.open_pays.split(" ")[1];
                        if(BASE == base) {
                            await sendMessage("bought " + opBody.current_pays + " for " +  opBody.open_pays);
                        } else {
                            await sendMessage("sold " + opBody.current_pays + " for " +  opBody.open_pays);
                        }
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
let message = "";

async function sendMessage(msg) {
    log.info(msg);
    message += msg + "\n";
}


async function commitMessage(msg) {
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
