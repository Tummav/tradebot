const ga = require("golos-addons");
const global = ga.global;
const golos = ga.golos;
const golosjs = golos.golos;
const m = require("./messages");

const log = global.getLogger("market");

const CONFIG = global.CONFIG;
const MESS = CONFIG.telegram.send_messages;

function ass(a, n) {
    return a.toFixed(3) + " " + n;
}

class Market {

    constructor(user) {
        this.OID = 1;
        this.user = user;
        this.brain = brain.getBrain(user.strategy);
    }

    async getOpenOrders() {
        return await golosjs.api.getOpenOrdersAsync(this.user.userid);
    }

    async closeExistingOrders() {
        const orders = await this.getOpenOrders();
        tg.sendOrders(orders);
        for(let o of orders) {
            await golosjs.broadcast.limitOrderCancelAsync(this.user.key, this.user.userid, parseInt(o.orderid));
        }
    }

    //TODO: adapt to 0.17 version
    async getBalance() {
        let acc = await golos.getAccount(this.user.userid);
        return {
            "GOLOS" : parseFloat(acc.balance.split(" ")[0]),
            "GBG" : parseFloat(acc.sbd_balance.split(" ")[0])
        };
    }

    async createOrder(sell, receive) {
        await golosjs.broadcast.limitOrderCreateAsync(this.user.key, this.user.userid, this.OID++ 
            , ass(amount_to_sell, this.user.base.asset), ass(min_to_receive, this.user.quote.asset),
            false, new Date(Date.now() + 60 * 60 * 1000));
        
    }

    async makeOrder(sell, receive) {
        const newOrder = this.brain.getOrderProposal(sell, receive, await this.getBalance());

        await this.createOrder(
            ass(newOrder.amount_to_sell, sell.asset), 
            ass(newOrder.min_to_receive, receive.asset));
    
        return true;
    }

    async process() {
        await this.makeOrder(this.user.base, this.user.quote);
        await this.makeOrder(this.user.quote, this.user.base);
    }

}
