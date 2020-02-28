// import libraries
import Web3 from "web3";
import 'jquery';
import 'truffle-contract';
//import 'async';
//import { default as contract } from 'truffle-contract';

// import contract artifacts
import ourExchangeArtifact from '../../build/contracts/OurExchange.json';
import exchangeTokenArtifact from '../../build/contracts/ExchangeToken.json';
import metaCoinArtifact from '../../build/contracts/MetaCoin.json';

const BigNumber = require('bignumber.js');

// import firebase in order to keep track of order book
// Firebase App (the core Firebase SDK) is always required and must be listed before other Firebase SDKs
import * as firebase from "firebase/app";

// Add the Firebase services that you want to use
import "firebase/database";
//import "firebase/firestore";

const ethereumZeroAddress = "0x0000000000000000000000000000000000000000";

// if trying to add a new coin, ctrl + f ('%%'), then edit functions

const App = {
  web3: null,
  account: null, // stores the user's current account logged in
  meta: null,
  metaCoinContract: null,

  start: async function() {
    const { web3 } = this;

    try {
      // get contract instance
      const networkId = await web3.eth.net.getId();
      console.log(networkId);
      const metaDeployedNetwork = metaCoinArtifact.networks[networkId]; // if error here - truffle migrate --reset
      console.log(metaDeployedNetwork);
      this.metaCoinContract = new web3.eth.Contract(
        metaCoinArtifact.abi,
        metaDeployedNetwork.address,
      );

      // get accounts
      const accounts = await web3.eth.getAccounts();
      this.account = accounts[0]; // main currently used user account

      // attach exchange to app
      const exchangeDeployedNetwork = ourExchangeArtifact.networks[networkId];
      this.meta = new web3.eth.Contract(
        ourExchangeArtifact.abi,
        exchangeDeployedNetwork.address,
      );
      // think about this:
      // https://web3js.readthedocs.io/en/1.0/web3-eth-contract.html
      // defaultGasPrice: '20000000000' // default gas price in wei, 20 gwei in this case

      // start firebase to load orderbooks
      this.startFirebase();

      // start all necessary functions to interact with exchange
      this.startExchange();

      // log everything of the app
      console.log(this);

    } catch (error) {
      console.error("Could not connect to contract or chain.");
    }

  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// building firebase function which connects to firebase db to obtain current orderbooks
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////

  startFirebase: function() {
    var firebaseConfig = {
      apiKey: "AIzaSyBFd3BrWlEiz7aHagpOXYt_tYAiKgl0PkU",
      authDomain: "decentralized-exchange-0x.firebaseapp.com",
      databaseURL: "https://decentralized-exchange-0x.firebaseio.com",
      projectId: "decentralized-exchange-0x",
      storageBucket: "",
      messagingSenderId: "824191408439",
      appId: "1:824191408439:web:c28d294734d1eeea"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);

    App.displayOrders("0x0000000000000000000000000000000000000000", "0x06B0fB8359fFFeaE977f80FcA72942CB2bdD340d", "buyOrderBook");
    App.displayOrders("0x06B0fB8359fFFeaE977f80FcA72942CB2bdD340d", "0x0000000000000000000000000000000000000000", "sellOrderBook");

    App.displayUserOpenOrders(App.account, "userOpenOrders");
    App.displayUserFulfilledOrders(App.account, "userFulfilledOrders");

  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// refresh user balances, then start trading events
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  startExchange: function () {
  	  // obtain balance of this account's tokens
      this.refreshUserWalletBalance();
      this.refreshUserExchangeBalance();

      // start logging all contract events to update website
      this.listenToTradingEvents();
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// obtain user's ether/token balances
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  refreshUserWalletBalance: async function() {
    const { balanceOf } = this.metaCoinContract.methods;
    const tokenBalance = await balanceOf(this.account).call();

    web3.eth.getAccounts(function (err, accs) {
        web3.eth.getBalance(accs[0], function (err1, balance) {
        	// update user wallet address
        	var addressElements = document.querySelectorAll('.user-wallet-address');
			Array.from(addressElements).forEach((element, index) => {
				element.innerHTML = accs[0];
			});

			// update user eth holdings
			var ethBalanceElements = document.querySelectorAll('.user-wallet-eth-balance');
			Array.from(ethBalanceElements).forEach((element, index) => {
				element.innerHTML = web3.fromWei(balance, "ether");
			});

			// update user token amount
		    var tokenBalanceElements = document.querySelectorAll('.user-wallet-token-balance');
		    Array.from(tokenBalanceElements).forEach((element, index) => {
				element.innerHTML = new BigNumber(tokenBalance).dividedBy(10 ** App.convertAddressToDecimalAmount(App.metaCoinContract.options.address));
			});
        });
    });
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// send META to another wallet - normal transaction, not exchange method
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////

  sendCoin: async function() {
    const amount = parseInt(document.getElementById("amount").value);
    const receiver = document.getElementById("receiver").value;

    this.setStatus("Initiating transaction... (please wait)");

    const { transfer } = this.metaCoinContract.methods;
    await transfer(receiver, amount).send({ from: this.account });

    this.setStatus("Transaction complete!");
    this.refreshBalance();
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// refresh user's exchange balance
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  refreshUserExchangeBalance: async function () {
      try {
        // obtain exchange method
        const { balanceOf } = this.meta.methods;

        //refresh your ETH balance
        const obtainedUserEthBalance = await balanceOf(ethereumZeroAddress, this.account).call();

        var ethExchangeBalanceElements = document.querySelectorAll('.user-exchange-eth-balance');
	    Array.from(ethExchangeBalanceElements).forEach((element, index) => {
			element.innerHTML = new BigNumber(obtainedUserEthBalance).dividedBy(10 ** App.convertAddressToDecimalAmount(ethereumZeroAddress));
		});

        //refresh your Token balance
        const metaTokenAddress = this.metaCoinContract.options.address;

        const obtainedUserMetaBalance = await balanceOf(metaTokenAddress, this.account).call();

        var tokenExchangeBalanceElements = document.querySelectorAll('.user-exchange-token-balance');
	    Array.from(tokenExchangeBalanceElements).forEach((element, index) => {
			element.innerHTML = new BigNumber(obtainedUserMetaBalance).dividedBy(10 ** App.convertAddressToDecimalAmount(metaTokenAddress));
		});

        // refresh your in-orders balance
        var userOrderBalance = document.getElementById("balanceOrdersInExchange");

        var dbOrder = firebase.database().ref('users/' + this.account);
        dbOrder.on("value", function(snapshot) {
          //var orders = snapshot.val();

          var stringOfAllOrders = "";

          // go through using a for loop - for each 'order object'
          snapshot.forEach(function(orders) {
            if (orders.key === "open-orders") {
              // not user amount in orders
            } else if (orders.key === "fulfilled-orders") {
              // not user amount in orders
            } else { // we are searching through tokens...inOrder
              var coinAddressString = orders.key + "";

              if (coinAddressString.length < 7) {
                alert("problem found - a string less than 7 is under the user orders");
              }

              // obtain the string from the database value (which will be coin contract 0x..inOrder)
              coinAddressString = coinAddressString.substring(0, coinAddressString.length - 7);

              var currentAmountInOrder = orders.val();

              // convert to string exchange name
              var tokenName = App.convertAddressToTokenName(coinAddressString);

              // print out amount of select token in orders and
              var amountOfToken = new BigNumber(currentAmountInOrder).dividedBy(10 ** App.convertAddressToDecimalAmount(coinAddressString));
              stringOfAllOrders += amountOfToken + " " + tokenName + ", ";
            }
          });

          userOrderBalance.innerHTML = stringOfAllOrders;

        }, function (errorObject) {
          console.log("Unable to obtain user open orders: " + errorObject.code);
        });

      } catch (e) {
        console.log("Error refreshing user exchange balances " + e);
      }
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// deposit/withdraw user ether/tokens ********************** check on etherscan
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  depositEther: async function () {
      try {
        const { deposit } = this.meta.methods;

        // obtain user's input ether
        var amountEther = document.getElementById("inputAmountDepositEther").value;

        // deposit ether into exchange
        const depositUserEther = await deposit.send(
          {from: this.account, value: web3.toWei(amountEther, "Ether")}).on('transactionHash', (hash) => {
              console.log(hash);
          })
          .on('receipt', (receipt) => {
              console.log(receipt);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
              console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
              console.log(receipt);
              // refresh to show user's eth balance
              App.refreshUserExchangeBalance();
          })
          .on('error', console.error);

        // remove input ether into input box
        document.getElementById("inputAmountDepositEther").value = "";
      } catch (e) {
        console.log("Error depositing user Eth into exchange " + e);
      }
  },

  withdrawEther: async function () {
      //withdraw ether function
      try {
        const { withdraw } = this.meta.methods;

        // obtain user's input ether
        var amountEther = document.getElementById("inputAmountWithdrawalEther").value;

        // deposit ether into exchange
        const withdrawUserEther = await withdraw(web3.toWei(amountEther, "Ether")).send(
          {from: this.account}).on('transactionHash', (hash) => {
              console.log(hash);
          })
          .on('receipt', (receipt) => {
              console.log(receipt);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
              console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
              console.log(receipt);
              // refresh to show user's eth balance
              App.refreshUserExchangeBalance();
          })
          .on('error', console.error);

        // remove input ether into input box
        document.getElementById("inputAmountWithdrawalEther").value = "";
      } catch (e) {
        console.log("Error withdrawing user Eth from exchange " + e);
        App.setStatus("Error; see log.");
      }
  },


  ///////////////////////////////////
  ///// method which approves token usage of user tokens - tied together w/ depositToken
  ///////////////////////////////////

  approveTokenDeposit: async function () {
    try {
      // approving token storage by the exchange
      const { approve } = this.metaCoinContract.methods;

      var amountToken = document.getElementById("inputAmountDepositToken").value;
      var convertedAmountToken = amountToken * 10 ** this.convertAddressToDecimalAmount(this.metaCoinContract.options.address);

      //******************************************************************************************************************************************************************
      // need to call a check - ensure whether approval already exists or not
      // need to create a 'event watcher' method which watches when the approval goes through

      // first, allow the exchange to transfer the user's funds (to the user's account)
      // - no ownership ever changes on these coins, they are still completely controlled by the user
      const approveExchangeTokenUsage = approve(App.meta.options.address, convertedAmountToken).send(
        {from: App.account}).on('transactionHash', (hash) => {
            console.log(hash);
        })
        .on('receipt', (receipt) => {
            console.log(receipt);
        })
        .on('confirmation', (confirmationNumber, receipt) => {
            console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
            console.log(receipt);
            console.log("Approved! Now deposit the tokens into the exchange.");
        })
        .on('error', console.error);

    } catch (e) {
      console.log("Error approving coin for exchange " + e);
      App.setStatus("Error; see log.");
    }
  },

  depositToken: async function () {
      //deposit token function
      // make sure to pass in variable w/ correct address

      try {
        const { depositToken } = this.meta.methods;

        // obtain user's input token
        var amountToken = document.getElementById("inputAmountDepositToken").value;
        var convertedAmountToken = amountToken * 10 ** this.convertAddressToDecimalAmount(this.metaCoinContract.options.address);

        // *********************************************************************************************************************************************************************
        //var nameToken = document.getElementById("inputNameDepositToken").value;
        // convert the name of the token to the address of the token (make this a scrolldown pickable w/ tokens in the exchange)

        console.log(this.metaCoinContract.options.address);
        console.log(web3.toWei(amountToken, "Ether"));

        // notable errors found: nonce doesn't match transaction sometimes
        // transactions aren't sent in UI in time - first one seen is deposit, only afterwords is approval seen (appears wrong to user)
        // sometimes: VM Exception while processing transaction: out of gas (on deposit)

        // todo: figure out how to get correct gas amount to not fail out-of-gas transaction
        // fix UI appearance of which trans to send first
        // change to two buttons for now - one which gives allowance, other which sends the tokens after allowance.

        // *****in order to avoid needless call, first, check if it can move with allowance.call()

        const depositUserToken = depositToken(this.metaCoinContract.options.address, convertedAmountToken).send(
          {from: App.account}).on('transactionHash', (hash) => {
              console.log(hash);
          })
          .on('receipt', (receipt) => {
              console.log(receipt);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
              console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
              console.log(receipt);
          })
          .on('error', console.error);

        // remove input from box
        document.getElementById("inputAmountDepositToken").value = "";
      } catch (e) {
        console.log("Error depositing user coin into exchange " + e);
        App.setStatus("Error; see log.");
      }
  },

  withdrawToken: async function () {
      //The Withdraw Token function
      try {
        const { withdrawToken } = this.meta.methods;

        // obtain user's input ether
        var tokenAddress = this.metaCoinContract.options.address; // change to scrolldown
        var amountToken = document.getElementById("inputAmountWithdrawalToken").value;

        var convertedAmountToken = amountToken * 10 ** this.convertAddressToDecimalAmount(tokenAddress);

        // TODO: need to get the actual address of the token selected
        // withdraw user tokens
        const withdrawUserTokens = await withdrawToken(this.metaCoinContract.options.address, convertedAmountToken).send(
          {from: this.account}).on('transactionHash', (hash) => {
              console.log(hash);
          })
          .on('receipt', (receipt) => {
              console.log(receipt);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
            console.log(receipt);
          })
          .on('error', console.error);

        // remove input ether into input box
        document.getElementById("inputAmountWithdrawalEther").value = "";
      } catch (e) {
        console.log("Error withdrawing user Eth from exchange " + e);
        App.setStatus("Error; see log.");
      }

  },

  ///***********>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  // needs to be done: if the buy order is greater than the lowest 'current buy order', initiate a trade w/ the top trade
  // same needs to be done with sell order - except for smaller
  // in this case - a 'market' order buy needs to be set up as well, so that someone can buy the closest to the top order eimmediately
  // (or as much as their buy order can hold)
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// buy and sell token functions
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////

  placeTokenBuyOrder: async function () {
      //buy X token with Eth
      // note: "0x0000000000000000000000000000000000000000" means ether

      const { balanceOf, order } = this.meta.methods;

      //const {  } = this.metaCoinContract.methods; // CHANGE TO THE COIN NECESSARY - obtain from tokenAddress (passed in)
      var tokenAddressToBuy = this.metaCoinContract.options.address; // change to tokenAddress
      var buyTokenDecimalAmount = 10 ** this.convertAddressToDecimalAmount(tokenAddressToBuy);
      var tokenAmountToBuy = new BigNumber(document.getElementById("inputAmountBuyToken").value); // amount of token you are buying

      var tokenAddressToSell = "0x0000000000000000000000000000000000000000"; // token you are selling
      var sellTokenDecimalAmount = 10 ** this.convertAddressToDecimalAmount(tokenAddressToSell);
      var buyPriceInToken = new BigNumber(document.getElementById("inputPriceBuyToken").value); // buy price for the token you want

      var expireTime = 2 ** 32; // used for expire block time
      var orderNonce = this.obtainRandomNumber();
      console.log(orderNonce);

      // check order total
      var orderTotal = buyPriceInToken.multipliedBy(tokenAmountToBuy);
      // fix tokenAmountToBuy format for solidity
      tokenAmountToBuy = tokenAmountToBuy.multipliedBy(buyTokenDecimalAmount);

      const currentUserBalance = new BigNumber(await balanceOf(tokenAddressToSell, this.account).call());
      var convertedCurrentUserBalance = currentUserBalance.dividedBy(sellTokenDecimalAmount);

      // check both inputs for improper value
      if (tokenAmountToBuy.length === 0 || tokenAmountToBuy == null || isNaN(parseFloat(tokenAmountToBuy)) || parseFloat(tokenAmountToBuy) <= 0 ||
            buyPriceInToken.length === 0 || buyPriceInToken == null || isNaN(parseFloat(buyPriceInToken)) || parseFloat(buyPriceInToken) <= 0) {
        console.log("Invalid amount for trade! (you input " + tokenAmountToBuy + ", " + buyPriceInToken + ")");
        return;
      }

      /// *********************************************************************************************************************8 change to normal vars from here *****
      // amount of token you are buying (done after checking for improper value)
      tokenAmountToBuy = tokenAmountToBuy.multipliedBy(buyTokenDecimalAmount);

      // test that the decimal value of selling/buying is within the span of normal values (to not throw an overflow error in solidity)
      var minimumInputDecimalValue = new BigNumber(1).dividedBy(sellTokenDecimalAmount);
      var maximumInputDecimalValue = new BigNumber(1).multipliedBy(sellTokenDecimalAmount);
      var minimumOutputDecimalValue = new BigNumber(1).dividedBy(buyTokenDecimalAmount);
      var maximumOutputDecimalValue = new BigNumber(1).multipliedBy(buyTokenDecimalAmount);

      // compare values are between the two decimal values
      if ((minimumInputDecimalValue.comparedTo(buyPriceInToken) == 1) || (maximumInputDecimalValue.comparedTo(buyPriceInToken) == -1) ||
      (minimumOutputDecimalValue.comparedTo(buyPriceInToken) == 1) || (maximumOutputDecimalValue.comparedTo(buyPriceInToken) == -1)) {
        console.log("ERRORRRRRR");
        return;
      }

      // obtain balance in orders
      var dbCoinAddressString = tokenAddressToSell + "inOrder";
      var amountOfToken = new BigNumber(0);

      // find in db if exists
      var dbOrder = firebase.database().ref('users/' + this.account + '/' + dbCoinAddressString);
      dbOrder.on("value", function(snapshot) {
        if (snapshot.exists()){
          var orderAmounts = snapshot.val();
          amountOfToken = new BigNumber(orderAmounts).dividedBy(10 ** App.convertAddressToDecimalAmount(tokenAddressToSell));
        }
      });

      var totalUserBalance = convertedCurrentUserBalance.minus(amountOfToken);
      console.log("order total, convertedCurrentUserBalance, amountOfTokenInOrder, totalUserBalance: "
        + orderTotal.toNumber(), convertedCurrentUserBalance.toNumber(), amountOfToken.toNumber(), totalUserBalance.toNumber());

      // check order total w/ current balance, balance in orders
      if (orderTotal.toNumber() > totalUserBalance.toNumber()) {
        console.log("You are offering more than you have! (you have " + convertedCurrentUserBalance + ", "
          + amountOfToken.toNumber() + " in orders, (with " + totalUserBalance.toNumber() + " left) and wanted to buy "
          + orderTotal + " " + this.convertAddressToTokenName(tokenAddressToSell) + " worth). \nYou would need "
          + (new BigNumber(orderTotal).minus(totalUserBalance.toNumber())).toNumber() + "more.");
        return;
      }

      // format and run order() from contract
      // format errors
      tokenAmountToBuy = parseInt(tokenAmountToBuy.toNumber()).toString();
      buyPriceInToken = parseInt(buyPriceInToken.multipliedBy(sellTokenDecimalAmount).toNumber()).toString();

      console.log(tokenAddressToBuy, tokenAmountToBuy,
        tokenAddressToSell, buyPriceInToken,
        expireTime, orderNonce);

      // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
      var placeOrder = await order(
        tokenAddressToBuy, tokenAmountToBuy, // buy token at X buy price
        tokenAddressToSell, buyPriceInToken, // sell eth at X buy price
        expireTime, orderNonce).send(
          {from: this.account}).on('transactionHash', (hash) => {
              console.log(hash);
          })
          .on('receipt', (receipt) => {
              console.log(receipt);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
            console.log(receipt);

            // rest added on to event method which will announce everything
            // [App.meta.options.address, tokenGet, amountGet, tokenGive, amountGive, expires, orderNonce]
            // COULD - make a person sign this using eth.sign, - then check that they have it correct
            //App.refreshUserExchangeBalance();

            // add order in the database as existing for all to see in orderbook
            //App.createOrderInDatabase(this.account, tokenAddressToBuy, tokenAmountToBuy, tokenAddressToSell, buyPriceInToken, expireTime, orderNonce, "buy");

          }).on('error', console.error);

  },

  placeTokenSellOrder: async function () {
      //sell X token for Eth
      // note: "0x0000000000000000000000000000000000000000" means ether

      const { balanceOf, order } = this.meta.methods;
      //const {  } = this.metaCoinContract.methods; // CHANGE TO THE COIN NECESSARY - obtain from tokenAddress (passed in)

      var tokenAddressToBuy = "0x0000000000000000000000000000000000000000"; // change to tokenAddress
      var buyTokenDecimalAmount = 10 ** this.convertAddressToDecimalAmount(tokenAddressToBuy);
      var tokenAmountToBuy = new BigNumber(document.getElementById("inputPriceSellToken").value); // amount of token you are buying

      var tokenAddressToSell = this.metaCoinContract.options.address; // token you are selling
      var sellTokenDecimalAmount = 10 ** this.convertAddressToDecimalAmount(tokenAddressToSell);
      var sellTokenAmount = new BigNumber(document.getElementById("inputAmountSellToken").value); // amount of token you are selling

      var expireTime = 2 ** 32; // used for expire block time
      var orderNonce = this.obtainRandomNumber();
      console.log(orderNonce);

      // convert all inputs
      const currentUserBalance = new BigNumber(await balanceOf(tokenAddressToSell, this.account).call());
      var convertedCurrentUserBalance = currentUserBalance.dividedBy(sellTokenDecimalAmount);

      // check both inputs for improper values
      if (sellTokenAmount.length === 0 || sellTokenAmount == null || isNaN(parseFloat(sellTokenAmount)) || parseFloat(sellTokenAmount) <= 0
        || tokenAmountToBuy.length === 0 || tokenAmountToBuy == null || isNaN(parseFloat(tokenAmountToBuy)) || parseFloat(tokenAmountToBuy) <= 0) {
        console.log("Invalid amount for trade! (you input " + sellTokenAmount + ", " + tokenAmountToBuy + ")");
        return;
      }

      // amount of token you are buying (done after checking for improper value)
      tokenAmountToBuy = tokenAmountToBuy.multipliedBy(buyTokenDecimalAmount);

      // test that the decimal value of selling/buying is within the span of normal values (to not throw an overflow error in solidity)
      var minimumInputDecimalValue = new BigNumber(1).dividedBy(sellTokenDecimalAmount);
      var maximumInputDecimalValue = new BigNumber(1).multipliedBy(sellTokenDecimalAmount);
      var minimumOutputDecimalValue = new BigNumber(1).dividedBy(buyTokenDecimalAmount);
      var maximumOutputDecimalValue = new BigNumber(1).multipliedBy(buyTokenDecimalAmount);

      //console.log((minimumInputDecimalValue > sellTokenAmount) + ", for " + minimumInputDecimalValue + " " + sellTokenAmount + "\n" + (maximumInputDecimalValue < sellTokenAmount) + ", for " + maximumInputDecimalValue + " " + sellTokenAmount + "\n" +
      //(minimumOutputDecimalValue < sellTokenAmount) + ", for " + minimumOutputDecimalValue + " " + sellTokenAmount + "\n" + (maximumOutputDecimalValue > sellTokenAmount) + ", for " + maximumOutputDecimalValue + " " + sellTokenAmount + "\n");
      //console.log(minimumInputDecimalValue.comparedTo(sellTokenAmount), maximumInputDecimalValue.comparedTo(sellTokenAmount), minimumOutputDecimalValue.comparedTo(sellTokenAmount), maximumOutputDecimalValue.comparedTo(sellTokenAmount));

      // compare values are between the two decimal values
      if ((minimumInputDecimalValue.comparedTo(sellTokenAmount) == 1) || (maximumInputDecimalValue.comparedTo(sellTokenAmount) == -1) ||
      (minimumOutputDecimalValue.comparedTo(sellTokenAmount) == 1) || (maximumOutputDecimalValue.comparedTo(sellTokenAmount) == -1)) {
        console.log("ERRORRRRRR");
        return;
      }

      // when checking for allowing an order to be placed/go through, account for funds that are ALREADY in the order itself to not allow users to spam orders
      // done by adding a new branch in the db called "user-orders" and sort by user address
      var dbCoinAddressString = tokenAddressToSell + "inOrder";
      var amountOfToken = new BigNumber(0);

      // find in db if exists
      var dbOrder = firebase.database().ref('users/' + this.account + '/' + dbCoinAddressString);
      dbOrder.on("value", function(snapshot) {
        if (snapshot.exists()) {
          var orderAmounts = snapshot.val();
          amountOfToken = new BigNumber(orderAmounts).dividedBy(10 ** App.convertAddressToDecimalAmount(tokenAddressToSell));
        }
      });

      var totalUserBalance = convertedCurrentUserBalance.minus(amountOfToken);
      console.log("order total, convertedCurrentUserBalance, amountOfTokenInOrder, totalUserBalance: "
        + sellTokenAmount.toNumber(), convertedCurrentUserBalance.toNumber(), amountOfToken.toNumber(), totalUserBalance.toNumber());

      if (sellTokenAmount.toNumber() > totalUserBalance.toNumber()) {
        console.log("You are offering more than you have! (you have " + totalUserBalance.toNumber() + ")");
        return;
      }

      // trigger order() w/ input variables
      // fix format errors
      tokenAmountToBuy = parseInt(tokenAmountToBuy.toNumber()).toString();
      sellTokenAmount = parseInt(sellTokenAmount.multipliedBy(sellTokenDecimalAmount).toNumber()).toString();

      console.log(tokenAddressToBuy, tokenAmountToBuy, // buy token at X buy price
        tokenAddressToSell, sellTokenAmount, // sell eth at X buy price
        expireTime, orderNonce);

      // address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce
      var placeOrder = await order(
        tokenAddressToBuy, tokenAmountToBuy, // buy token at X buy price
        tokenAddressToSell, sellTokenAmount, // sell eth at X buy price
        expireTime, orderNonce).send(
          {from: this.account}).on('transactionHash', (hash) => {
              console.log(hash);
          })
          .on('receipt', (receipt) => {
              console.log(receipt);
          })
          .on('confirmation', (confirmationNumber, receipt) => {
            console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
            console.log(receipt);

            // rest in event method
          }).on('error', console.error);
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function which constantly checks which trading events are emitted by the exchange
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////

  listenToTradingEvents: function () {
    //try {
      // listen to all events:
      //**************************************************************************************************************************************************************************************
      this.meta.events.allEvents({fromBlock: 'latest'}, (error, result) => {
        if (error) {
          console.log(error);
        } else {
          console.log(result);
          console.log(result.event);
          console.log(result.returnValues);
          console.log(result.event + " event at: " + App.getImmediateTime());

          if (result.event === "Order") {
            // event Order(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user);
            console.log("THIS IS AN ORDER");

            var tokenAddressToBuy = result.returnValues.tokenGet;
            var tokenAmountToBuy = result.returnValues.amountGet;
            var tokenAddressToSell = result.returnValues.tokenGive;
            var sellTokenAmount = result.returnValues.amountGive;
            var expireTime = result.returnValues.expires;
            var orderNonce = result.returnValues.nonce;
            var ordersUser = result.returnValues.user;

            var amountGetConversion = tokenAmountToBuy / 10 ** this.convertAddressToDecimalAmount(tokenAddressToBuy);
            var amountGiveConversion = sellTokenAmount / 10 ** this.convertAddressToDecimalAmount(tokenAddressToSell);

            console.log("Amount get: " + amountGetConversion + " " + this.convertAddressToTokenName(tokenAddressToBuy) +
              " \nAmount give: " + amountGiveConversion + " " + this.convertAddressToTokenName(tokenAddressToSell));
            console.log("user: " + ordersUser + ", expires: " + expireTime + ", random nonce: " + orderNonce);

            // add order in the database as existing for all to see in orderbook
            App.createOrderInDatabase(ordersUser, tokenAddressToBuy, amountGetConversion, tokenAddressToSell, amountGiveConversion, parseInt(expireTime.toString()), parseInt(orderNonce.toString()));

            // [App.meta.options.address, tokenGet, amountGet, tokenGive, amountGive, expires, orderNonce]
            App.refreshUserExchangeBalance();

          } else if (result.event === "Trade") {
            // event Trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address get, address give);
            console.log("THIS IS A TRADE");

            var amountGetConversion = result.returnValues.amountGet / 10 ** this.convertAddressToDecimalAmount(result.returnValues.tokenGet);
            var amountGiveConversion = result.returnValues.amountGive / 10 ** this.convertAddressToDecimalAmount(result.returnValues.tokenGive);

            console.log("Amount get: " + amountGetConversion + " " + this.convertAddressToTokenName(result.returnValues.tokenGet) +
              " \nAmount give: " + amountGiveConversion + " " + this.convertAddressToTokenName(result.returnValues.tokenGive));
            console.log("user who placed the order: " + result.returnValues.get + ", user who initiated the trade: " + result.returnValues.give);

            //************************************************************************************************************************************************************************


          } else if (result.event === "Cancel") {
            // event Cancel(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user);
            console.log("THIS IS A CANCEL");

            // *********************************************************************************************************************************************************************

          } else if (result.event === "Deposit") {
            // event Deposit(address token, address user, uint amount, uint balance);
            console.log("THIS IS A DEPOSIT");

            // refresh to show user's eth balance
            App.refreshUserExchangeBalance();

          } else if (result.event === "Withdraw") {
            // event Withdraw(address token, address user, uint amount, uint balance);
            console.log("THIS IS A WITHDRAW");

            // refresh to show user's eth balance
            document.getElementById("inputNameWithdrawalToken").value = "";
            document.getElementById("inputAmountWithdrawalToken").value = "";

            App.refreshUserExchangeBalance();
          }

          // approveTokenDeposit (do we need an event handler for each single coin to obtain when the 'approval' has been emitted to the user)

          /*
          var alertbox = document.createElement("div");
          alertbox.setAttribute("class", "alert alert-info  alert-dismissible");
          var closeBtn = document.createElement("button");
          closeBtn.setAttribute("type", "button");
          closeBtn.setAttribute("class", "close");
          closeBtn.setAttribute("data-dismiss", "alert");
          closeBtn.innerHTML = "<span>&times;</span>";
          alertbox.appendChild(closeBtn);

          var eventTitle = document.createElement("div");
          eventTitle.innerHTML = '<strong> New ' + result.event + ' Event: by ' + result.returnValues.user + '</strong>';
          alertbox.appendChild(eventTitle);

          var argsBox = document.createElement("div");
          argsBox.setAttribute("class", "alert alert-info  alert-dismissible");
          argsBox.innerText = 'Trading: ' + result.returnValues.amountGive + ' ' + this.convertAddressToTokenName(result.returnValues.tokenGive) + ' for: ' + result.returnValues.amountGet + ' '+ this.convertAddressToTokenName(result.returnValues.tokenGet);
          alertbox.appendChild(argsBox);
          document.getElementById("sellOrderBook").appendChild(alertbox);
          */
        }
      });

    //} catch (e) {
    //  console.log("Error obtaining method: " + e);
    //}
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to display all open orders for an address of two coins
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  displayOrders: function(sellPairAddress, buyPairAddress, htmlID) {
      // firebase db
      // database is structured as follows:
      // orders -> coin trading pair(address of coin/address) -> buy orders -> order -> (user, buy price for token, amount)
      var coinTradingPair = sellPairAddress + "-" + buyPairAddress;

      var htmlOrderBook = document.getElementById(htmlID);

      // test to see if the data is written on the website - if it is, delete the existing object and repaste existing orders
      //.orderByChild('starCount')
      var dbOrder = firebase.database().ref('orders/' + coinTradingPair);
      dbOrder.on("value", function(snapshot) {
        if (htmlOrderBook.children.length > 0) {
          while (htmlOrderBook.lastChild) {
            htmlOrderBook.removeChild(htmlOrderBook.lastChild);
          }
        }

        var orders = snapshot.val();
        // go through using a for loop - for each 'order object'
        // - options: user, tokenAddressToBuy, tokenAmountToBuy, tokenAddressToSell, buyPriceInToken, expireTime, orderNonce

        var weight = 0;
        var sellCoin = App.convertAddressToTokenName(sellPairAddress);

        snapshot.forEach(function(orders) {
          if (orders.key === "last-trade-price") {
            var savedOrder = document.createElement("div");
            savedOrder.innerHTML = orders.key + " for 1 " + sellCoin + " is " + orders.val() + " " + App.convertAddressToTokenName(buyPairAddress);
            // ensure this is correct - we want the actual last PRICE depending on the amount (i.e. we want x divided by x)

            htmlOrderBook.appendChild(savedOrder);
          } else if (orders.key !== "completed-orders") {
            weight += parseFloat(orders.child("buyPriceInToken").val());
            var savedOrder = document.createElement("div");

            var buyPrice = new BigNumber(orders.child("buyPriceInToken").val().toString());
            var amountToBuy = new BigNumber(orders.child("tokenAmountToBuy").val());

            savedOrder.innerHTML = "(" + orders.key + ") " + buyPrice.toNumber() + " <strong>" + sellCoin
              + "</strong> at " + amountToBuy.toNumber() + " <strong>" + App.convertAddressToTokenName(buyPairAddress)
              + "</strong> - Total order: " + (buyPrice.multipliedBy(amountToBuy)) + ".";

            // check if the order has been placed by the user viewing the orderbook
            if (App.account != orders.child("user").val()) {
              var placeTradeOrderButton = document.createElement("button"); // instant order button
              placeTradeOrderButton.innerHTML = "Trade";

              placeTradeOrderButton.onclick = function() {
                App.completeOrderFromDatabase(sellPairAddress, buyPairAddress, orders.child("user").val(), orders.child("orderNonce").val(), orders.child("tokenAmountToBuy").val(), orders.child("buyPriceInToken").val());
              };

              savedOrder.appendChild(placeTradeOrderButton); // add the 'immediate' trade button to the orderbook
            } else {
              var placeTradeOrderButton = document.createElement("button"); // instant order button
              placeTradeOrderButton.innerHTML = "This is your order!";

              savedOrder.appendChild(placeTradeOrderButton); // add the 'immediate' trade button to the orderbook
            }

            htmlOrderBook.appendChild(savedOrder);
          }
        });
      }, function (errorObject) {
        console.log("Unable to obtain orderbook: " + errorObject.code);
      });

      /*
      // ******************************************************************************************************************************************************************************
      TODO IN ORDER:
      (this should help amend the double adding of things into db)

      ** important **
      - fix trade to allow storage of all trades to be 0.1/1 (unconverted, and converted on blockchain)
      - *add 'buy order/sell order' fill ins like idex + mercatox (afterwords, remove 'immediate trade' buttons)
      - *add 'cancel order' option to each order - this must go through the blockchain and invoke cancel()
      - add if statement under buy order and sell order to make sure the account[0] == current user account (and then test placing an order using someone elses account)

      ** to fix **
      - ponder usage of signature in order to not allow other users to game the method from the bchain
      - check for security! (security database rules, etc.)

      ** UI work **
      - develop front end for user exchange - orderbooks, front page, current price of pair, etc.
      - develop front end for specific charts of previous/current data
      - add specific 'dynamic multiplier' which shows the 'total' order amount payment (amount of coin * price in eth) as it is input into the text field (i.e. as entering 0.01 and 0.01, show total: 0.0001)

      ** final fixes **
      - fix App.getImmediateTime() method, fix App.hash() function
      - allow people to log in w/ other possibile entries, like PK entry, file, etc.
      - port to testnet!! work on using already existing coins in the testnet ecosystem and add/trade

      // UI ideas:
      // just like idex, allowed to click on an order in the orderbook and get the 'inputs' for the exact amount and price in order to buy up until that order
      // have 'latest trade price' show up on UI on both sides (it pops up in green on the buy side if the last was a buy, if last was a sell, it swaps to the right side and stays alongside the sell orders)

      TODO LATER:
      // //.orderByChild('starCount') FOR ORDERING ORDERS
      // should database orders be input w/ order number (amount in order to have them sorted by db auto) THEN everything else?
      // also - make sure to sort orders in the db so that they are ordered by the LOWEST buy/sell order first
      // change all input/withdraw/trade coins to scrolldowns
      // under 'cancelOrder' - make sure to subtract the amount of the order from the 'userAmountInOrder' of the coin in the db
      // fix weird bug where a person's orders go up (1 tr hash, 2 tr hash, 3, etc.) +1 time every single time they order (buy and sell)
      // take into account what will happen if a number is input with greater decimal value than 0xbtc or eth can handle (i.e. 9 decimals - should the number be truncated?)

      // please get rid of this error:
      // Uncaught Error: insufficient data for uint256 type (arg="expires", coderType="uint256", value="0x", version=4.0.27)

      // FOR DEPOSIT METHOD:
      // notable errors found: nonce doesn't match transaction sometimes
      // transactions aren't sent in UI in time - first one seen is deposit, only afterwords is approval seen (appears wrong to user)
      // sometimes: VM Exception while processing transaction: out of gas (on deposit)

      // todo: figure out how to get correct gas amount to not fail out-of-gas transaction
      // fix UI appearance of which trans to send first
      // change to two buttons for now - one which gives allowance, other which sends the tokens after allowance.
      // *****in order to avoid needless call, first, check if it can move with allowance.call()

      // FOR TRADE METHOD:
      // ponder whether the order hash itself should be random or deterministic - if it is random it is more secure, if it is not it is much quicker to be accessed w/o o(n) search
      // TODO: or, random hash becomes the actual 'number' at the order, + the user name, in order to make orders look in order from database
      // * ADD try/catch to check if the order exists in the db in order to 'alert' the user on edge cases

      // EVENTS OR ON CONFIRMATION?
      // check whether it is better to wait for something to be recieved 'on confirmation' of the actual method, or to wait for the exact event to be emitted (or is it the exact same?)
      ?// (if done through .on(), would it not work if the window was closed or something? would event watching be better in each way?)
      ?// for example, would .on() work if the window was closed or if anything else happened? would it work on orders submitted straight to the blockchain by contract?
      ?// will events be 'listened to' after the website is closed on everyone? will some orders be left out of db because of premature closing of window?

      // think about adding this to all transactions (web3.eth.gasPrice * 1.1) just to make sure it goes through as planned
      // gasPrice: web3.eth.gasPrice;,
      // gasLimit: web3.eth.getBlock("latest").gasLimit,

      web3socket = new Web3(new Web3.providers.WebsocketProvider("your websocket conn"));
      socketInstance =new web3socket.eth.Contract(ABI,ConAd);
      socketInstance.events.LogNewOrder((err, events)=>{
      console.log(err, events)})
      // var socketProvider = 'wss://ropsten.infura.io/ws';
      // for mainnet

      */
  },


  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to obtain user's open unfulfilled orders
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  displayUserOpenOrders: function(userAddress, htmlID) {
      // firebase db
      // database is structured as follows:
      // users -> (address) -> open-orders -> coin trading pair(address of coin/address) -> order (number/hash) -> (user, buy price for token, amount)
      var htmlOrderOutput = document.getElementById(htmlID);

      // test to see if the data is written on the website - if it is, delete the existing object and repaste existing orders
      //.orderByChild('starCount')
      var dbOrder = firebase.database().ref('users/' + userAddress + '/open-orders');
      dbOrder.on("value", function(snapshot) {
        if (htmlOrderOutput.children.length > 0) {
          while (htmlOrderOutput.lastChild) {
            htmlOrderOutput.removeChild(htmlOrderOutput.lastChild);
          }
        }

        var orders = snapshot.val();

        // go through using a for loop - for each 'order object'
        snapshot.forEach(function(orders) {
          var savedOrder = document.createElement("div");

          // - options: user, tokenAddressToBuy, tokenAmountToBuy, tokenAddressToSell, buyPriceInToken, expireTime, orderNonce
          savedOrder.innerHTML = "ORDER: (" + orders.key + "), order: "
            + "\nBuy Token: " + App.convertAddressToTokenName(orders.val().tokenAddressToBuy.toString())
            + " at price: " + orders.val().tokenAmountToBuy
            + "\nSell Token: " + App.convertAddressToTokenName(orders.val().tokenAddressToSell.toString())
            + " at price: " + orders.val().buyPriceInToken
            + "\n Order placed at: " + orders.val().timePlaced;

          htmlOrderOutput.appendChild(savedOrder);

        });
      }, function (errorObject) {
        console.log("Unable to obtain user open orders: " + errorObject.code);
      });
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to obtain user's closed, fulfilled orders
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  displayUserFulfilledOrders: function(userAddress, htmlID) {
      // firebase db
      // database is structured as follows:
      // users -> (address) -> open-orders -> coin trading pair(address of coin/address) -> order (number/hash) -> (user, buy price for token, amount)
      var htmlOrderOutput = document.getElementById(htmlID);

      // test to see if the data is written on the website - if it is, delete the existing object and repaste existing orders
      //.orderByChild('starCount')
      var dbOrder = firebase.database().ref('users/' + userAddress + '/fulfilled-orders');
      dbOrder.on("value", function(snapshot) {
        if (htmlOrderOutput.children.length > 0) {
          while (htmlOrderOutput.lastChild) {
            htmlOrderOutput.removeChild(htmlOrderOutput.lastChild);
          }
        }

        var orders = snapshot.val();

        // go through using a for loop - for each 'order object'
        snapshot.forEach(function(orders) {
          var savedOrder = document.createElement("div");

          // - options: user, tokenAddressToBuy, tokenAmountToBuy, tokenAddressToSell, buyPriceInToken, expireTime, orderNonce
          savedOrder.innerHTML = "ORDER: (" + orders.key + "), order: "
            + "\nBuy Token: " + App.convertAddressToTokenName(orders.val().tokenAddressToBuy.toString())
            + " at price: " + orders.val().tokenAmountToBuy
            + "\nSell Token: " + App.convertAddressToTokenName(orders.val().tokenAddressToSell.toString())
            + " at price: " + orders.val().buyPriceInToken
            + "\n Order completed at: " + orders.val().timePlaced;

          htmlOrderOutput.appendChild(savedOrder);

        });
      }, function (errorObject) {
        console.log("Unable to obtain user fulfilled orders: " + errorObject.code);
      });
  },

  createOrderInDatabase: function(user, tokenAddressToBuy, tokenAmountToBuy, tokenAddressToSell, buyPriceInToken, expireTime, orderNonce) {
    // coinTradingPair appears in the db as the main 0xa8..../0x00... child of orders - should be same for all similar order types (i.e. 0xbtc/ETH)
    var coinTradingPair = tokenAddressToSell + "-" + tokenAddressToBuy;

    // have an array which uses if statements to include the correct 'cointradingpair' for db?
    var orderJSON = {
      "user": user,
      "tokenAddressToBuy": tokenAddressToBuy,
      "tokenAmountToBuy": tokenAmountToBuy,
      "tokenAddressToSell": tokenAddressToSell,
      "buyPriceInToken": buyPriceInToken,
      "expireTime": expireTime,
      "orderNonce": orderNonce,
      "timePlaced": App.getImmediateTime()
    };

    var createdString = user + orderNonce; // + Math.floor(Math.random() * (2 ** 32)); // get rid of randomness to be able to access order w/ input
    var orderHash = App.quickStringHash(createdString); // create hash of randomized string to exemplify order

    // add the order under the coin
    var dbOrder = firebase.database().ref('orders/' + coinTradingPair + '/' + orderHash);
    dbOrder.update(orderJSON, function(error) {
      if (error) {
        alert("Order data could not be saved." + error);
      } else {
        //console.log("Order data saved successfully.");
      }
    });

    // and add the order under the user 'open orders'
    var dbUserOrder = firebase.database().ref('users/' + user + '/open-orders/' + orderHash);
    dbUserOrder.update(orderJSON, function(error) {
      if (error) {
        alert("User order data could not be saved." + error);
      } else {
        //console.log("Order data saved successfully.");
      }
    });

    // add the order amount under the user's 'amountOfTokenInOrder'
    var stringCoin = tokenAddressToSell + 'inOrder';
    var dbUserAmountInOrder = firebase.database().ref('users/' + user);
    var dbUserAmountInOrderOfCoin = firebase.database().ref('users/' + user + '/' + stringCoin);

    dbUserAmountInOrder.once("value", snapshot => {
      var newAmount = buyPriceInToken;
      var amountInOrderExists = false;

      dbUserAmountInOrderOfCoin.once("value", snapshot => {
        if (snapshot.exists()){
          console.log("exists!");
          amountInOrderExists = true;
        } else {
          console.log("doesn't exist yet!");
        }
      });

      // if there exists another amount in order, add on to the previous value
      if (amountInOrderExists) {
        console.log("Already had a set amount in orders - adding onto it");
        var prevAmount = new BigNumber(snapshot.child(stringCoin).val());
        console.log(prevAmount.toNumber());
        console.log("bef " + newAmount);
        newAmount = new BigNumber(buyPriceInToken).plus(prevAmount).toNumber();
        console.log("af " + newAmount);
      }

      // write the new amount to the db
      var userAmountInOrderJSON = {};
      userAmountInOrderJSON[stringCoin] = newAmount;

      dbUserAmountInOrder.update(userAmountInOrderJSON, function(error) {
        if (error) {
          console.log("User order amount could not be saved." + error);
        } else {
          //console.log("Order data saved successfully.");
        }
      });
    });

    console.log("created order in database");

  },

  completeOrderFromDatabase: async function(inputTokenAddressToSell, inputTokenAddressToBuy, user, orderNonce, orderPurchaseAmount, inputBuyPriceInToken) {
      // checks to ensure trade completion is possible
      const { balanceOf, trade } = this.meta.methods;

      var dbCoinTradingPair = inputTokenAddressToSell + "-" + inputTokenAddressToBuy;

      const currentUserBalance = await balanceOf(inputTokenAddressToBuy, this.account).call();
      var convertedCurrentUserBalance = new BigNumber(currentUserBalance).dividedBy(10 ** this.convertAddressToDecimalAmount(inputTokenAddressToBuy));

      console.log("user's balance: " + convertedCurrentUserBalance.toNumber());

      // *************************************************************************************************************************************************************************** overflows)
      //console.log(inputBuyPriceInToken);
      //console.log(parseFloat(inputBuyPriceInToken) / 10 ** this.convertAddressToDecimalAmount(inputTokenAddressToSell));
      //console.log(orderPurchaseAmount);
      var oldOrderPurchaseAmount = orderPurchaseAmount;
      //console.log(orderPurchaseAmount / 10 ** this.convertAddressToDecimalAmount(inputTokenAddressToSell));

      // amount to purchase
      var totalOrderPurchaseAmount = new BigNumber(orderPurchaseAmount);

      // cost of the total purchase
      var totalOrderPurchaseCost = new BigNumber(inputBuyPriceInToken).multipliedBy(totalOrderPurchaseAmount);

      console.log("toNumber method " + totalOrderPurchaseAmount.toNumber(), convertedCurrentUserBalance.toNumber());

      // - check user has enough to cause the order to occur
      if (totalOrderPurchaseCost.toNumber() > convertedCurrentUserBalance.toNumber()) {
        // !!**!! is a signature necessary to ensure the user's order cannot be tracked?/forced?
        console.log("You do not have enough to complete this trade! (you only have " + convertedCurrentUserBalance + " worth)");
        return;
      }

      // format numbers into strings in order to obtain valid string to turn toWei
      var stringTotalOrderPurchaseAmount = totalOrderPurchaseAmount.toNumber().toFixed(18);
      var stringConvertedCurrentUserBalance = convertedCurrentUserBalance.toNumber().toFixed(18);

      console.log("parsedFloats " + parseFloat(stringTotalOrderPurchaseAmount), parseFloat(stringConvertedCurrentUserBalance));

      if (parseFloat(stringTotalOrderPurchaseAmount) == 0 || parseFloat(stringConvertedCurrentUserBalance) == 0){
        console.log("either purchace amount or converted user balance amount was 0");
        return;
      }

      console.log("order purchase amount: " + App.web3.utils.toWei(stringTotalOrderPurchaseAmount));
      console.log("converted user balance: " + App.web3.utils.toWei(stringConvertedCurrentUserBalance));

      //orderPurchaseAmount = App.web3.utils.toWei(stringTotalOrderPurchaseAmount);

      // find the order in the database and complete trade
      var createdString = user + orderNonce; // + Math.floor(Math.random() * (2 ** 32)); // get rid of randomness to be able to access order w/ input
      var orderHash = App.quickStringHash(createdString); // create hash of randomized string to exemplify order
      // TODO: or, random hash becomes the actual 'number' at the order, + the user name, in order to make orders look in order from database

      var dbOrder = firebase.database().ref('orders/' + dbCoinTradingPair);
      dbOrder.once("value", function(snapshot) {
        //var orders = snapshot.val();

        var thisOrder = snapshot.child(orderHash);

        // check if the order exists in the db (if it doesn't, don't force the 'trade' call)
        if (!thisOrder.exists()){
          console.log("This order does not exist - please try again.");
          return;
        }

        var tradeTakerAddress = App.account; // or this.account? (this.account cannot be reached by button method)
        var tradeMakerAddress = thisOrder.child("user").val(); // person who created the order (not the person who clicked 'trade')
        var sellPairAddress = thisOrder.child("tokenAddressToSell").val();
        var buyPairAddress = thisOrder.child("tokenAddressToBuy").val();
        var tokenAmountToBuy = thisOrder.child("tokenAmountToBuy").val();
        var buyPriceInToken = thisOrder.child("buyPriceInToken").val();
        var expireTime = thisOrder.child("expireTime").val();
        var orderNonce = thisOrder.child("orderNonce").val();

        console.log("Trading... " + buyPriceInToken + " <strong>" +
          App.convertAddressToTokenName(sellPairAddress) + "</strong> at " + tokenAmountToBuy +
          " <strong>" + App.convertAddressToTokenName(buyPairAddress) + "</strong>, for a total of " + totalOrderPurchaseCost);

        // convert tokenAmountToBuy, buyPriceInToken, and orderPurchaseAmount to the correct amount of decimals for solidity compiler
        var solTokenAmountToBuy = new BigNumber(tokenAmountToBuy).multipliedBy(10 ** App.convertAddressToDecimalAmount(buyPairAddress));
        var solBuyPriceInToken = new BigNumber(buyPriceInToken).multipliedBy(10 ** App.convertAddressToDecimalAmount(sellPairAddress));
        var solOrderPurchaseAmount = new BigNumber(parseFloat(stringTotalOrderPurchaseAmount)).multipliedBy(10 ** App.convertAddressToDecimalAmount(buyPairAddress));

        var solTokenAmountToBuy = solTokenAmountToBuy.toString();
        var solBuyPriceInToken = solBuyPriceInToken.toString();
        var solOrderPurchaseAmount = solOrderPurchaseAmount.toString();

        console.log(buyPairAddress, solTokenAmountToBuy, // obtain values from DB order
          sellPairAddress, solBuyPriceInToken,
          expireTime, orderNonce,
          tradeMakerAddress, solOrderPurchaseAmount);


        // place the order calling trade() w/ web3
        var placeOrder = trade(
          buyPairAddress, solTokenAmountToBuy, // obtain values from DB order
          sellPairAddress, solBuyPriceInToken,
          expireTime, orderNonce,
          tradeMakerAddress, solOrderPurchaseAmount).send(
            {from: tradeTakerAddress}).on('transactionHash', (hash) => {
                console.log(hash);
            })
            .on('receipt', (receipt) => {
                console.log(receipt);
            })
            .on('confirmation', (confirmationNumber, receipt) => {
              console.log("Transaction Completed! Confirmation Number: " + confirmationNumber);
              console.log(receipt);

              console.log("Trade complete! Traded " + buyPriceInToken + " <strong>" +
                App.convertAddressToTokenName(sellPairAddress) + "</strong> at " + tokenAmountToBuy +
                " <strong>" + App.convertAddressToTokenName(buyPairAddress) + "</strong> , for a total of " + totalOrderPurchaseCost);
              console.log("You have acquired - " + buyPriceInToken + " " + App.convertAddressToTokenName(sellPairAddress));

              // refresh user balance to show included coins
              App.refreshUserExchangeBalance();

              console.log("you bought: " + orderPurchaseAmount + " amount in order: " + tokenAmountToBuy);
              console.log("the old one was: " + oldOrderPurchaseAmount);

              var amountLeftInOrder = (new BigNumber(tokenAmountToBuy).minus(new BigNumber(orderPurchaseAmount))).toNumber();

              console.log(amountLeftInOrder);

              // AFTER ORDER IS DONE:
              // completed trades must:
              // - (store) allocate amount of trade in currency to add as volume
              // - (store) have a complete and accurate time attached to them in order to store for candlestick charts (zoom in/out)

              var currentTime = App.getImmediateTime();
              var tradePrice = tokenAmountToBuy / buyPriceInToken;

              var dbOrderDataRef = firebase.database().ref('orders/' + dbCoinTradingPair + '/completed-orders/' + orderHash);
              var completedOrderData = {
                "tokenAddressToBuy": buyPairAddress,
                "tokenAmountToBuy": tokenAmountToBuy, // add one of these to volume - and make sure to parse through and get daily vol w/ this
                "tokenAddressToSell": sellPairAddress,
                "buyPriceInToken": buyPriceInToken,
                "tradePrice": tradePrice,
                "timeOfTrade": currentTime
              };

              dbOrderDataRef.update(completedOrderData, function(error) {
                if (error) {
                  alert("Order data could not be saved." + error);
                } else {
                  console.log("Order data saved successfully.");
                }
              });

              // - update the coin trading pair's current price
              var lastUsedPrice = {"last-trade-price": tradePrice};
              console.log("The last used price is now: " + tradePrice);

              var dbOrderLastPrice = firebase.database().ref('orders/' + dbCoinTradingPair);
              dbOrderLastPrice.update(lastUsedPrice, function(error) {
                if (error) {
                  console.log("Price was NOT updated." + error);
                } else {
                  console.log("Current trading price was updated successfully.");
                }
              });

              // finally, remove the order from the database if the entirity was fulfilled
              if (amountLeftInOrder <= 0){
                var toDeleteOrderRef = firebase.database().ref('orders/' + dbCoinTradingPair + '/' + orderHash);
                toDeleteOrderRef.remove()
                  .then(function() {
                    console.log("Trade has been removed from database. Remove succeeded.")
                  })
                  .catch(function(error) {
                    console.log("Trade has NOT been removed from database. Remove failed: " + error.message)
                  });

                // then, remove the order from the user's 'open orders'
                var toDeleteUserOpenOrderRef = firebase.database().ref('users/' + tradeMakerAddress + '/open-orders/' + orderHash);
                toDeleteUserOpenOrderRef.remove()
                  .then(function() {
                    console.log("Trade has been removed from user's open orders. Remove succeeded.")
                  })
                  .catch(function(error) {
                    console.log("Trade has NOT been removed from user's open orders. Remove failed: " + error.message)
                  });

              } else {
                // if the order was not completely fulfilled, edit the amount left in the order
                App.createOrderInDatabase(tradeMakerAddress, buyPairAddress, amountLeftInOrder, sellPairAddress, buyPriceInToken, expireTime, orderNonce);

              }

              // update the order to both user's 'order history'
              var completedOrderJSONForMakerHistory = {
                "tokenAddressToBuy": buyPairAddress,
                "tokenAmountToBuy": amountLeftInOrder,
                "tokenAddressToSell": sellPairAddress,
                "buyPriceInToken": buyPriceInToken,
                "expireTime": expireTime,
                "orderNonce": orderNonce,
                "timePlaced": App.getImmediateTime()
              };

              // update for trade maker
              var dbUserOrderHistory = firebase.database().ref('users/' + tradeMakerAddress + '/fulfilled-orders/' + orderHash);
              dbUserOrderHistory.update(completedOrderJSONForMakerHistory, function(error) {
                if (error) {
                  console.log("Price was NOT updated." + error);
                } else {
                  console.log("Current trading price was updated successfully for maker.");
                }
              });

              var completedOrderJSONForTakerHistory = {
                "tokenAddressToBuy": buyPairAddress,
                "tokenAmountToBuy": amountLeftInOrder,
                "tokenAddressToSell": sellPairAddress,
                "buyPriceInToken": buyPriceInToken,
                "expireTime": expireTime,
                "orderNonce": orderNonce,
                "timePlaced": App.getImmediateTime()
              };

              // update for trade taker
              var dbUserOrderHistory = firebase.database().ref('users/' + tradeTakerAddress + '/fulfilled-orders/' + orderHash);
              dbUserOrderHistory.update(completedOrderJSONForTakerHistory, function(error) {
                if (error) {
                  console.log("Price was NOT updated." + error);
                } else {
                  console.log("Current trading price was updated successfully for taker.");
                }
              });

            }).on('error', console.error);
      }, function (errorObject) {
        console.log("Unable to complete trade: " + errorObject.code);
      });
  },

  //%% functions to edit when new coins are added %%//
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to obtain a string hash of the input
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  convertAddressToDecimalAmount: function (tokenAddress) {
    if (tokenAddress === App.metaCoinContract.options.address) {
      return 8; // same for 0xbtc
    } else if (tokenAddress === ethereumZeroAddress) {
      return 18;
    }

    return "Unknown Token";
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to convert the token address to a readable name format for the token
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  convertAddressToTokenName: function (tokenAddress) {
    if (tokenAddress === App.metaCoinContract.options.address) {
      return "META Token";
    } else if (tokenAddress === ethereumZeroAddress) {
      return "ETH";
    }

    return "Unknown Token";
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to obtain a string hash of the input
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  quickStringHash: function(input) {
    var hash = 0;
    if (input.length == 0) {
        return hash;
    }
    for (var i = 0; i < input.length; i++) {
        var char = input.charCodeAt(i);
        hash = ((hash<<5)-hash)+char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to obtain a random number between 0 and 2 ** 32
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  obtainRandomNumber: function() {
    // TODO: needs fixing
    return Math.floor(Math.random() * (2 ** 32));
  },

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  ///// function used to obtain the exact date and time
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////
  getImmediateTime: function() {
    var today = new Date();
    var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
    var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
    return date+' '+time;
  },

};

window.App = App;

window.addEventListener("load", function() {
  if (window.ethereum) {
    // use MetaMask's provider
    App.web3 = new Web3(window.ethereum);
    window.ethereum.enable(); // get permission to access accounts
  } else {
    console.warn(
      "No web3 detected. Falling back to http://127.0.0.1:7545. You should remove this fallback when you deploy live",
    );
    // fallback - use your fallback strategy (local node / hosted node + in-dapp id mgmt / fail)
    App.web3 = new Web3(
      new Web3.providers.HttpProvider("http://127.0.0.1:7545"),
    );
  }

  App.start();
});
