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

let WORKING = true;
let PREV_PRICES = null;



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

async function getOrderBook() {
    return golosjs.api.getOrderBook(1);    
}



async function calculateDesiredPrices(bid, ask) {
    
    return {
        bid : bid / (1 + BID.percent / 100),
        ask : ask * (1 + ASK.percent / 100)
    };
}






    
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

/**
 * The brain!
 */
async function updateOrders(filled) {

    log.debug("run updateOrders " + WORKING);

    if(WORKING) {
    

        let infos = await getInfos();
        const prices = infos.prices;
        const balance = infos.balance;

        if(PREV_PRICES && Math.abs(PREV_PRICES.bid - infos.top_prices.bid) > 0.01 && Math.abs(PREV_PRICES.ask - infos.top_prices.ask) > 0.01) {
            //nothing changed
            return;
        }
        PREV_PRICES = infos.top_prices;

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

        log.debug("filled", filled);
        log.debug("createBid", createBid);
        log.debug("createAsk", createAsk);
        if(createBid || createAsk) {
            let props = await golos.getCurrentServerTimeAndBlock();
            const expires = props.time - 1000 * 60 * 60;
        
            if(createBid) {
                createBid = await makeBid(prices.bid, balance[BASE], expires);
            }
        
            if(createAsk) {
                createAsk = await makeAsk(prices.ask, balance[QUOTE], expires);
            }
        }
        log.debug("filled", filled);
        log.debug("createBid", createBid);
        log.debug("createAsk", createAsk);
        const mess = filled || createAsk || createBid;
        
        infos = await getInfos();
        orders = await getOpenOrders();

        if(mess) {
            if(MESS.open_orders) {
                await sendOrders(orders);
            }

            if(MESS.balance) {
                await sendBalance(infos, orders);
            }
        }
    }

    let verbose = false;
    for(let f of Object.keys(MESS)) {
        if(MESS[f]) {
            verbose = true;
            break;
        }
    }
    if(verbose) {
        await commitMessage("☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰☰");
    }
}

async function processBlock(bn) {
    log.debug("processing block " + bn);
    let transactions = await golosjs.api.getOpsInBlockAsync(bn, false);
    //log.debug(JSON.stringify(transactions));
    let found_order_changes = false;
    let filled = false;
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
                        filled = true;
                        
                        const base = opBody.open_pays.split(" ")[1];
                        const cp = parseFloat(opBody.current_pays.split(" ")[0]);
                        const op = parseFloat(opBody.open_pays.split(" ")[0]);
                        if(BASE == base) {
                            const price =  (op / cp).toFixed(6);
                            await sendMessage("← *Bought* " + opBody.current_pays + " for " +  opBody.open_pays + "(" + price + ")\n");
                        } else {
                            const price =  (cp / op).toFixed(6);
                            await sendMessage("→ *Sold* " + opBody.open_pays + " for " +  opBody.current_pays + "(" + price + ")\n");
                        }
                        await commitMessage("");
                    }
                }
                break;
        }
    }             
    if(found_order_changes)  {
        await updateOrders(filled);
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


run();
