const ga = require("golos-addons");
const global = ga.global;
const golos = ga.golos;
const golosjs = golos.golos;
const m = require("./messages");

const log = global.getLogger("wave_farm");


class Brain {
    constructor(strategy) {
        this.bid_percent = strategy.bid_percent;
        this.ask_percent = strategy.ask_percent;
        this.bid_max_amount = strategy.bid_max_amount;
        this.ask_max_amount = strategy.ask_max_amount;
        this.validate();
    }

    validate() {
    }

    async getOrderProposal(sell, receive, balance) {
        const min_amount = sell.min_amount;
        if(!min_amount || min_amount <= 0) {
            log.error("invalid min_amount [" + min_amount + "]");
            process.exit(1);
        }
        const available_amount = balance[sell.asset] - sell.reserve;

        if(available_amount < min_amount) {
            log.debug("not enough balance " + sell.asset);
            return;
        }

        return await this.makeOrder(sell, receive, available_amount);
    }

    async getTopOrder(sell, receive) {
        const orderBook = await golosjs.api.getOrderBook(1);
        let bid = orderBook.bids[0]; bid.otype = "bid";
        let ask = orderBook.asks[0]; ask.otype = "ask";

        if(bid && bid.order_price.base.split(" ")[1] == sell.asset) {
            return bid;
        }
        return ask;
    }

    async makeOrder(sell, receive, balance) {
        const order = await this.getTopOrder(sell, receive);
        if(!order) {
            return null;
        }
        const current_price = parseFloat(order.real_price);

        switch(order.otype) {
            case "bid":
                const desired_price = current_price / (1 + this.bid_percent / 100);
                
                return {
                    amount_to_sell : Math.min(balance, this.bid_max_amount),
                    min_to_receive : amount_to_sell / desired_price
                };
                        
            case "ask":
                const desired_price = current_price * (1 + this.ask_percent / 100);
                return {
                    amount_to_sell : Math.min(balance, this.ask_max_amount),
                    min_to_receive : amount_to_sell / desired_price
                };
        }

    }

}

module.exports = Brain;