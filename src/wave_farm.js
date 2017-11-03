



class Brain {
    constructor(strategy) {
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

        return getOrder(sell, receive, available_amount, min_amount);
    }

    async getOrder(sell, receive, balance, min_amount) {
        const order = await this.getTopOrder(sell.asset);
        
    }
}