const log = require("golos-addons").global.getLogger("brain");

const WaveFarm = require("./wave_farm");

module.exports.brainFactory = (strategy) => {
    switch(strategy.name) {
        case "wave-farm":
            return new WaveFarm(strategy);
        default:
            log.error("unknown strategy [" + strategy.name + "]");
            process.exit(1);
    }
} 