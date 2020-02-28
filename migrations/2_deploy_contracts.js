const MetaCoin = artifacts.require("MetaCoin");
const ExchangeToken = artifacts.require("ExchangeToken");
const OurExchange = artifacts.require("OurExchange");

module.exports = function(deployer) {
  deployer.deploy(MetaCoin);
  deployer.deploy(ExchangeToken, "0xcd0FF3eA0b0aA07d351b0ab287fCb4a2853D2304"); // duplicate of metacoin, but sends all to admin, place in accounts[1]
  // added for exchange backend
  deployer.deploy(OurExchange,
    "0x7293a4a0ba78529E1355dD2caF811279332947F7", // accounts[0]
    "0x7293a4a0ba78529E1355dD2caF811279332947F7",
    1,
    "0x0000000000000000000000000000000000000000");
};
