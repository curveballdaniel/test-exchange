const MetaCoin = artifacts.require("MetaCoin");
const ExchangeToken = artifacts.require("ExchangeToken");
const OurExchange = artifacts.require("OurExchange");

contract("MetaCoin", accounts => {
  it("should put all MetaCoin in the first account", async () => {
    const instance = await MetaCoin.deployed();
    const balance = await instance.balanceOf.call(accounts[0]);
    assert.equal(balance.valueOf(), 1000000 * 10 ** 18, "X wasn't in the first account");
  });

  it("should send coin correctly", async () => {
    const instance = await MetaCoin.deployed();

    const account1 = accounts[0];
    const account2 = accounts[1];

    // get initial balances
    const initBalance1 = await instance.balanceOf.call(account1);
    const initBalance2 = await instance.balanceOf.call(account2);

    // send coins from account 1 to 2
    const amount = 10;
    await instance.transfer(account2, amount, { from: account1 });

    // get final balances
    const finalBalance1 = await instance.balanceOf.call(account1);
    const finalBalance2 = await instance.balanceOf.call(account2);

    assert.equal(
      finalBalance2.toNumber(),
      amount,
      "Amount wasn't correctly sent to the receiver",
    );
  });
});


contract("OurExchange", accounts => {
  it("should ensure the user starts with no funds", async () => {
    const instance = await OurExchange.deployed();

    // console.log(accounts[0]); = "0x7293a4a0ba78529E1355dD2caF811279332947F7"
    const balance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);

    assert.equal(balance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
  });

  it("should ensure the user can correctly deposit ether", async () => {
    const instance = await OurExchange.deployed();

    const deposit = await instance.deposit({value: web3.utils.toWei("0.00000001", 'ether')});
    const balance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);

    assert.equal(balance.valueOf(), 10000000000, "You don't have money in your account, when you should, and this is bad");
  });

  it("should ensure the user can correctly withdraw ether", async () => {
    const instance = await OurExchange.deployed();

    const withdraw = await instance.withdraw(10000000000);
    const balance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);

    assert.equal(balance.valueOf(), 0, "You have money in your account, when you should have withdrawn it");
  });

  it("should ensure the user can correctly deposit tokens", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;

    const amount = 10;
    const allowance = await coinInstance.approve(instance.address, 10); // allow exchange to use funds

    const deposit = await instance.depositToken(coinAddress, amount);
    const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    assert.equal(balance.valueOf(), 10, "You don't have the correct amount of tokens, and this is bad");
  });

  it("should ensure the user can correctly withdraw tokens", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;

    const amount = 10;
    //const allowance = await coinInstance.approve(instance.address, 10); // allow exchange to use funds
    const withdraw = await instance.withdrawToken(coinAddress, amount);
    const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    assert.equal(balance.valueOf(), 0, "You have tokens in your account when you should have withdrawn it");
  });


  // ******************************************************************************************************************
  // trading tests
  // ******************************************************************************************************************
  // global note for trading tests:
  // - address of sender in 'trade' or 'trade-test' must be the person NOT with the order
  it("should ensure user placing orders works", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;

    // fund tokens to account
    const amount = 10;
    const allowance = await coinInstance.approve(instance.address, amount); // allow exchange to use funds
    const deposit = await instance.depositToken(coinAddress, amount);

    // place an order for tokens
    // order - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
    const order = await instance.order("0x0000000000000000000000000000000000000000", 1, coinAddress, 10, 99999999, 0); // math.pow(2,32) used
    //const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    // availableVolume - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s

    //console.log(order);
    //console.log(order.receipt);
    //console.log(order.receipt.v);
    //console.log(order.receipt.r);
    //console.log();

    const checkVol = await instance.availableVolume(
      "0x0000000000000000000000000000000000000000",
      1,
      coinAddress,
      10,
      99999999,
      0,
      accounts[0]);

    assert.equal(checkVol.valueOf(), 1, "The order has not been placed - or its volume is not equal to the placement");
  });

  // ******************************************************************************************************************
  // trading coin for eth
  // ******************************************************************************************************************
  it("should ensure trading between users works (trading coin for eth)", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;

    // fund tokens to account
    const amount = 10;
    const allowance = await coinInstance.approve(instance.address, amount); // allow exchange to use funds
    const deposit = await instance.depositToken(coinAddress, amount);

    // before trade user amounts:
    console.log("-----------");
    const userOneBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneBeginEthBalance.valueOf());
    console.log("Token: " + userOneBeginCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoBeginEthBalance.valueOf());
    console.log("Token: " + userTwoBeginCoinBalance.valueOf());
    console.log("-----------");

    // place an order for tokens
    // order - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
    const order = await instance.order("0x0000000000000000000000000000000000000000", 1, coinAddress, amount, 99999999, 0); // math.pow(2,32) used
    //const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    const checkVol = await instance.availableVolume(
      "0x0000000000000000000000000000000000000000",
      1,
      coinAddress,
      amount,
      99999999,
      0,
      accounts[0]);

    assert.equal(checkVol.valueOf(), 1, "The order has not been placed - or its volume is not equal to the placement");

    // ORDER PLACED ---

    // fill user 2 with ether in account
    console.log("filling user 2 with ether");
    const userTwodeposit = await instance.deposit({from: accounts[1], value: web3.utils.toWei("0.00000001", 'ether')});
    const userTwoBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);

    assert.equal(userTwoBalance.valueOf(), 10000000000, "You don't have money in your account, when you should, and this is bad");

    // place order for user 2 (not necessary)
    //const userTwoOrder = await instance.order(coinAddress, amount, "0x0000000000000000000000000000000000000000", 1, 99999999, 1, {from: accounts[1]}); // math.pow(2,32) used

    // test that it will go through:
    console.log("checking trade validity - must pass this test to trade");
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount, address sender
    const tradeTest = await instance.testTrade("0x0000000000000000000000000000000000000000",
      1,
      coinAddress,
      amount,
      99999999,
      0,
      accounts[0],
      1,
      accounts[1]
    );
    assert.equal(tradeTest.valueOf(), true, "the trade isn't going through");

    // now set up the trade
    console.log("setting up trade");
    //console.log(order);
    // trade - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount
    const completeTrade = await instance.trade(
      "0x0000000000000000000000000000000000000000",
      1,
      coinAddress,
      amount,
      99999999,
      0,
      accounts[0], // [1]
      1, // full purchase - buy the full order
      {from: accounts[1]}
    );

    // check the volume of the order on the coin
    console.log("checking final volume");
    const checkFinalVol = await instance.availableVolume(
      "0x0000000000000000000000000000000000000000",
      1,
      coinAddress,
      amount,
      99999999,
      0,
      accounts[0]);
    assert.equal(checkFinalVol.valueOf(), 0, "The trade did not go through");

    // and finally, check the balances of both to ensure that they each got the coin they expected
    console.log("-----------");
    const userOneFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneFinalEthBalance.valueOf());
    console.log("Token: " + userOneFinalCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoFinalEthBalance.valueOf());
    console.log("Token: " + userTwoFinalCoinBalance.valueOf());
    //assert.equal(userTwoFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    console.log("-----------");
  });


  // ******************************************************************************************************************
  // trading eth for coin
  // ******************************************************************************************************************
  it("should ensure trading between users works (trading eth for coin)", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;

    // fund tokens to account
    const amount = 100;
    const allowance = await coinInstance.approve(instance.address, amount); // allow exchange to use funds
    const deposit = await instance.depositToken(coinAddress, amount);

    // before trade user amounts:
    console.log("-----------");
    const userOneBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneBeginEthBalance.valueOf());
    console.log("Token: " + userOneBeginCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoBeginEthBalance.valueOf());
    console.log("Token: " + userTwoBeginCoinBalance.valueOf());
    console.log("-----------");

    // place an order for tokens
    // order - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
    const order = await instance.order(coinAddress, amount, "0x0000000000000000000000000000000000000000", 100, 99999999, 2, {from: accounts[1]}); // math.pow(2,32) used
    //const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    const checkVol = await instance.availableVolume(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      100,
      99999999,
      2,
      accounts[1]);

    assert.equal(checkVol.toNumber(), amount, "The order has not been placed - or its volume is not equal to the placement");

    // ORDER PLACED ---

    // fill user 2 with ether in account (unneeded - already has in account)
    //console.log("filling user 2 with ether");
    //const userTwodeposit = await instance.deposit({from: accounts[1], value: web3.utils.toWei("0.00000001", 'ether')});
    //const userTwoBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);

    // test that it will go through:
    console.log("checking trade validity - must pass this test to trade");
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount, address sender
    const tradeTest = await instance.testTrade(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      100,
      99999999,
      2,
      accounts[1],
      amount,
      accounts[0]
    );
    assert.equal(tradeTest.valueOf(), true, "the trade isn't going through");

    // now set up the trade
    console.log("setting up trade");
    //console.log(order);
    // trade - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount
    const completeTrade = await instance.trade(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      100,
      99999999,
      2,
      accounts[1],
      amount, // full purchase - buy the full order
      {from: accounts[0]}
    );

    // check the volume of the order on the coin
    console.log("checking final volume");
    const checkFinalVol = await instance.availableVolume(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      100,
      99999999,
      2,
      accounts[1]);

    assert.equal(checkFinalVol.toNumber(), 0, "The trade did not go through");


    // and finally, check the balances of both to ensure that they each got the coin they expected
    console.log("-----------");
    const userOneFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneFinalEthBalance.valueOf());
    console.log("Token: " + userOneFinalCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoFinalEthBalance.valueOf());
    console.log("Token: " + userTwoFinalCoinBalance.valueOf());
    //assert.equal(userTwoFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    console.log("-----------");
  });

  // ******************************************************************************************************************
  // another trading sample (eth for coin)
  // ******************************************************************************************************************
  it("should work both ways - have user 2 buy 1 token from user 1 w/ eth", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;

    // fund tokens to account (already funded)
    const amount = 1;

    // before trade user amounts:
    console.log("-----------");
    const userOneBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneBeginEthBalance.valueOf());
    console.log("Token: " + userOneBeginCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoBeginEthBalance.valueOf());
    console.log("Token: " + userTwoBeginCoinBalance.valueOf());
    console.log("-----------");

    // place an order for tokens
    // order - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
    const order = await instance.order(coinAddress, amount, "0x0000000000000000000000000000000000000000", 1, 99999999, 2, {from: accounts[1]}); // math.pow(2,32) used
    //const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    const checkVol = await instance.availableVolume(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      1,
      99999999,
      2,
      accounts[1]);

    assert.equal(checkVol.toNumber(), amount, "The order has not been placed - or its volume is not equal to the placement");

    // ORDER PLACED ---
    // test that it will go through:
    console.log("checking trade validity - must pass this test to trade");
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount, address sender
    const tradeTest = await instance.testTrade(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      1,
      99999999,
      2,
      accounts[1],
      amount,
      accounts[0]
    );
    assert.equal(tradeTest.valueOf(), true, "the trade isn't going through");

    // now set up the trade
    console.log("setting up trade");
    // trade - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount
    const completeTrade = await instance.trade(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      1,
      99999999,
      2,
      accounts[1],
      amount, // full purchase - buy the full order
      {from: accounts[0]}
    );

    // check the volume of the order on the coin
    console.log("checking final volume");
    const checkFinalVol = await instance.availableVolume(
      coinAddress,
      amount,
      "0x0000000000000000000000000000000000000000",
      1,
      99999999,
      2,
      accounts[0]);

    assert.equal(checkFinalVol.toNumber(), 0, "The trade did not go through");


    // and finally, check the balances of both to ensure that they each got the coin they expected
    console.log("-----------");
    const userOneFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneFinalEthBalance.valueOf());
    console.log("Token: " + userOneFinalCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoFinalEthBalance.valueOf());
    console.log("Token: " + userTwoFinalCoinBalance.valueOf());
    //assert.equal(userTwoFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    console.log("-----------");
  });

  // ******************************************************************************************************************
  // trading exchange coin for another coin
  // ******************************************************************************************************************
  it("should ensure trading exchange coin for coin 2 (metacoin) works (1 exchange -> 1 metacoin)", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;
    const exchangeCoinInstance = await ExchangeToken.deployed();
    const exchangeCoinAddress = exchangeCoinInstance.address;

    // fund exchange tokens to account
    const amount = 1000;
    const allowance = await exchangeCoinInstance.approve(instance.address, amount, {from: accounts[1]}); // allow exchange to use funds
    const deposit = await instance.depositToken(exchangeCoinAddress, amount, {from: accounts[1]});

    // before trade user amounts:
    console.log("-----------");
    const userOneBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    const userOneBeginExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneBeginEthBalance.valueOf());
    console.log("Meta Token: " + userOneBeginCoinBalance.valueOf());
    console.log("Exchange Token: " + userOneBeginExchangeCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    const userTwoBeginExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoBeginEthBalance.valueOf());
    console.log("Meta Token: " + userTwoBeginCoinBalance.valueOf());
    console.log("Exchange Token: " + userTwoBeginExchangeCoinBalance.valueOf());
    console.log("-----------");

    // place an order for tokens
    // order - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
    const order = await instance.order(coinAddress, 1, exchangeCoinAddress, 1, 99999999, 3, {from: accounts[1]}); // math.pow(2,32) used
    //const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    const checkVol = await instance.availableVolume(
      coinAddress, 1, exchangeCoinAddress, 1,
      99999999,
      3,
      accounts[1]);

    assert.equal(checkVol.toNumber(), 1, "The order has not been placed - or its volume is not equal to the placement");

    // ORDER PLACED ---
    // test that it will go through:
    console.log("checking trade validity - must pass this test to trade");
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount, address sender
    const tradeTest = await instance.testTrade(
      coinAddress, 1, exchangeCoinAddress, 1,
      99999999,
      3,
      accounts[1],
      1,
      accounts[0] // sender must be the person NOT with the order
    );
    assert.equal(tradeTest.valueOf(), true, "the trade isn't going through");

    // now set up the trade
    console.log("setting up trade");
    // trade - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount
    const completeTrade = await instance.trade(
      coinAddress, 1, exchangeCoinAddress, 1,
      99999999,
      3,
      accounts[1],
      1, // full purchase - buy the full order
      {from: accounts[0]}
    );

    // check the volume of the order on the coin
    console.log("checking final volume");
    const checkFinalVol = await instance.availableVolume(
      coinAddress, 1, exchangeCoinAddress, 1,
      99999999,
      3,
      accounts[1]);

    assert.equal(checkFinalVol.toNumber(), 0, "The trade did not go through");


    // and finally, check the balances of both to ensure that they each got the coin they expected
    console.log("-----------");
    const userOneFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    const userOneFinalExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneFinalEthBalance.valueOf());
    console.log("Meta Token: " + userOneFinalCoinBalance.valueOf());
    console.log("Exchange Token: " + userOneFinalExchangeCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    const userTwoFinalExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoFinalEthBalance.valueOf());
    console.log("Meta Token: " + userTwoFinalCoinBalance.valueOf());
    console.log("Exchange Token: " + userTwoFinalExchangeCoinBalance.valueOf());
    //assert.equal(userTwoFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    console.log("-----------");
  });

  // ******************************************************************************************************************
  // trading another coin for Main coin
  // ******************************************************************************************************************
  it("should ensure trading coin 2 (metacoin) for exchange coin works (1 metacoin -> 1 exchange)", async () => {
    const instance = await OurExchange.deployed();
    const coinInstance = await MetaCoin.deployed();
    const coinAddress = coinInstance.address;
    const exchangeCoinInstance = await ExchangeToken.deployed();
    const exchangeCoinAddress = exchangeCoinInstance.address;

    // fund exchange tokens to account (unneeded)

    // before trade user amounts:
    console.log("-----------");
    const userOneBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    const userOneBeginExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneBeginEthBalance.valueOf());
    console.log("Meta Token: " + userOneBeginCoinBalance.valueOf());
    console.log("Exchange Token: " + userOneBeginExchangeCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoBeginEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoBeginCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    const userTwoBeginExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoBeginEthBalance.valueOf());
    console.log("Meta Token: " + userTwoBeginCoinBalance.valueOf());
    console.log("Exchange Token: " + userTwoBeginExchangeCoinBalance.valueOf());
    console.log("-----------");

    // place an order for tokens
    // order - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
    const order = await instance.order(exchangeCoinAddress, 1, coinAddress, 1, 99999999, 3, {from: accounts[1]}); // math.pow(2,32) used
    //const balance = await instance.balanceOf.call(coinAddress, accounts[0]);

    const checkVol = await instance.availableVolume(
      exchangeCoinAddress, 1, coinAddress, 1,
      99999999,
      3,
      accounts[1]);

    assert.equal(checkVol.toNumber(), 1, "The order has not been placed - or its volume is not equal to the placement");

    // ORDER PLACED ---
    // test that it will go through:
    console.log("checking trade validity - must pass this test to trade");
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount, address sender
    const tradeTest = await instance.testTrade(
      exchangeCoinAddress, 1, coinAddress, 1,
      99999999,
      3,
      accounts[1],
      1,
      accounts[0] // sender must be the person NOT with the order
    );
    assert.equal(tradeTest.valueOf(), true, "the trade isn't going through");

    // now set up the trade
    console.log("setting up trade");
    // trade - function parameters
    // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount
    const completeTrade = await instance.trade(
      exchangeCoinAddress, 1, coinAddress, 1,
      99999999,
      3,
      accounts[1],
      1, // full purchase - buy the full order
      {from: accounts[0]} // sender must be the person NOT with the order
    );

    // check the volume of the order on the coin
    console.log("checking final volume");
    const checkFinalVol = await instance.availableVolume(
      exchangeCoinAddress, 1, coinAddress, 1,
      99999999,
      3,
      accounts[1]);

    assert.equal(checkFinalVol.toNumber(), 0, "The trade did not go through");


    // and finally, check the balances of both to ensure that they each got the coin they expected
    console.log("-----------");
    const userOneFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[0]);
    const userOneFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[0]);
    const userOneFinalExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[0]);
    console.log("User 1");
    console.log("Eth: " + userOneFinalEthBalance.valueOf());
    console.log("Meta Token: " + userOneFinalCoinBalance.valueOf());
    console.log("Exchange Token: " + userOneFinalExchangeCoinBalance.valueOf());
    //assert.equal(userOneFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    const userTwoFinalEthBalance = await instance.balanceOf.call("0x0000000000000000000000000000000000000000", accounts[1]);
    const userTwoFinalCoinBalance = await instance.balanceOf.call(coinAddress, accounts[1]);
    const userTwoFinalExchangeCoinBalance = await instance.balanceOf.call(exchangeCoinAddress, accounts[1]);
    console.log("User 2");
    console.log("Eth: " + userTwoFinalEthBalance.valueOf());
    console.log("Meta Token: " + userTwoFinalCoinBalance.valueOf());
    console.log("Exchange Token: " + userTwoFinalExchangeCoinBalance.valueOf());
    //assert.equal(userTwoFinalBalance.valueOf(), 0, "Somehow you have money in your account, and this is bad");
    console.log("-----------");
  });
});
