
module.exports.canceOrders = (user) => {return `*Cancel existing all orders*`;}

module.exports.notEnoughBalance = (user, asset) => {return `* User ${user.userid} has not enough balance* ${user.base.asset}
`;}