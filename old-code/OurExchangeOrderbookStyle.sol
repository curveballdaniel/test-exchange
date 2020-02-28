pragma solidity 0.5.0;

import "./IToken.sol";
import "./LSafeMath.sol";

/*
// function interface:

// other
constructor (address admin_, address feeAccount_, uint feeTake_, uint freeUntilDate_, address predecessor_)
changeAdmin(address admin_)
changeFeeAccount(address feeAccount_)
changeFeeTake(uint feeTake_)
setSuccessor(address successor_)

// depoits, withdrawls, balances
deposit()
withdraw(uint amount)
depositToken(address token, uint amount)
tokenFallback(address sender, uint amount, bytes memory data)
withdrawToken(address token, uint amount)
balanceOf(address token, address user)

// trading
order(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce)
trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount)

(This is a private function and is only being called from trade().
  * Handles the movement of funds when a trade occurs.)
tradeBalances(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address user, uint amount)

testTrade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s, uint amount, address sender)
availableVolume(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s)
amountFilled(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint8 v, bytes32 r, bytes32 s)
cancelOrder(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, uint8 v, bytes32 r, bytes32 s)

// contract versioning/Migration
migrateFunds(address newContract, address[] memory tokens_)
depositForUser(address user)
depositTokenForUser(address token, uint amount, address user)

*/
contract OurExchange {

  using SafeMath for uint;

  /*
  etherdelta vars
  address public admin; //the admin address
address public feeAccount; //the account that will receive fees
address public accountLevelsAddr; //the address of the AccountLevels contract
uint public feeMake; //percentage times (1 ether)
uint public feeTake; //percentage times (1 ether)
uint public feeRebate; //percentage times (1 ether)
mapping (address => mapping (address => uint)) public tokens; //mapping of token addresses to mapping of account balances (token=0 means Ether)
mapping (address => mapping (bytes32 => bool)) public orders; //mapping of user accounts to mapping of order hashes to booleans (true = submitted by user, equivalent to offchain signature)
mapping (address => mapping (bytes32 => uint)) public orderFills; //mapping of user accounts to mapping of order hashes to uints (amount of order that has been filled)

  */
  // user Order struct
  struct UserOrder {
    address user;
    uint amountGet;
    uint amountGive;
    uint intTokenAddressLocation;
    uint expires;
    uint nonce;
  }

  /// Variables
  address public admin; // the admin address
  address public feeAccount; // the account that will receive fees
  uint public feeTake; // percentage times (1 ether)
  bool private depositingTokenFlag; // True when Token.transferFrom is being called from depositToken
  mapping (address => mapping (address => uint)) public tokens; // mapping of token addresses to mapping of account balances (address(0) means Ether)
  mapping (address => mapping (bytes32 => bool)) public orders; // mapping of user accounts to mapping of order hashes to booleans (true = submitted by user, equivalent to offchain signature)
  mapping (address => mapping (bytes32 => uint)) public orderFills; // mapping of user accounts to mapping of order hashes to uints (amount of order that has been filled)
  mapping (address => UserOrder[]) public orderbook; // mapping of coin -> userorder struct
  mapping (address => uint) public tokenOrderAmount;
  address public predecessor; // Address of the previous version of this contract. If address(0), this is the first version
  address public successor; // Address of the next version of this contract. If address(0), this is the most up to date version.
  uint16 public version; // This is the version # of the contract
  address[] public tokenList; // array which contains all addresses of coins added to the exchange - address(0) is first, which relates to ETH

  // created variable to simulate an unreachable contract for ethereum base address
  address private ethAddress = address(0);

  /// Logging Events
  event Order(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user);
  event Cancel(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user);
  event Trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address get, address give);
  event Deposit(address token, address user, uint amount, uint balance);
  event Withdraw(address token, address user, uint amount, uint balance);
  event FundsMigrated(address user, address newContract);

  /// This is a modifier for functions to check if the sending user address is the same as the admin user address.
  modifier isAdmin() {
      require(msg.sender == admin);
      _;
  }

  /// Constructor function. This is only called on contract creation.
  constructor (address admin_, address feeAccount_, uint feeTake_, address predecessor_) public {
    admin = admin_;
    feeAccount = feeAccount_;
    feeTake = feeTake_;
    depositingTokenFlag = false;
    predecessor = predecessor_;

    if (predecessor != address(0)) {
      version = OurExchange(predecessor).version() + 1;
    } else {
      version = 1;
    }

    addToken(ethAddress);
  }

  /// The fallback function. Ether transfered into the contract is not accepted.
  function() external {
    revert();
  }

  /// Changes the official admin user address. Accepts Ethereum address.
  function changeAdmin(address admin_) public isAdmin {
    require(admin_ != address(0));
    admin = admin_;
  }

  /// Changes the account address that receives trading fees. Accepts Ethereum address.
  function changeFeeAccount(address feeAccount_) public isAdmin {
    feeAccount = feeAccount_;
  }

  /// Changes the fee on takes. Can only be changed to a value less than it is currently set at.
  function changeFeeTake(uint feeTake_) public isAdmin {
    require(feeTake_ <= feeTake);
    feeTake = feeTake_;
  }

  /// Changes the successor. Used in updating the contract.
  function setSuccessor(address successor_) public isAdmin {
    require(successor_ != address(0));
    successor = successor_;
  }

  ////////////////////////////////////////////////////////////////////////////////
  // Deposits, Withdrawals, Balances
  ////////////////////////////////////////////////////////////////////////////////

  /**
  * This function handles deposits of Ether into the contract.
  * Emits a Deposit event.
  * Note: With the payable modifier, this function accepts Ether.
  */
  function deposit() public payable {
    tokens[ethAddress][msg.sender] = tokens[ethAddress][msg.sender].add(msg.value);
    emit Deposit(ethAddress, msg.sender, msg.value, tokens[ethAddress][msg.sender]);
  }

  /**
  * This function handles withdrawals of Ether from the contract.
  * Verifies that the user has enough funds to cover the withdrawal.
  * Emits a Withdraw event.
  * @param amount uint of the amount of Ether the user wishes to withdraw
  */
  function withdraw(uint amount) public {
    require(tokens[ethAddress][msg.sender] >= amount);
    tokens[ethAddress][msg.sender] = tokens[ethAddress][msg.sender].sub(amount);
    msg.sender.transfer(amount);
    emit Withdraw(ethAddress, msg.sender, amount, tokens[ethAddress][msg.sender]);
  }

  /**
  * This function handles deposits of Ethereum based tokens to the contract.
  * Does not allow Ether.
  * If token transfer fails, transaction is reverted and remaining gas is refunded.
  * Emits a Deposit event.
  * Note: Remember to call Token(address).approve(this, amount) or this contract will not be able to do the transfer on your behalf.
  * @param token Ethereum contract address of the token or 0 for Ether
  * @param amount uint of the amount of the token the user wishes to deposit
  */
  function depositToken(address token, uint amount) public {
    require(token != ethAddress);
    depositingTokenFlag = true;
    require(IToken(token).transferFrom(msg.sender, address(this), amount));
    depositingTokenFlag = false;
    tokens[token][msg.sender] = tokens[token][msg.sender].add(amount);
    emit Deposit(token, msg.sender, amount, tokens[token][msg.sender]);
 }

  // for accessibility w/ erc223
  function tokenFallback(address sender, uint amount, bytes memory data) public returns (bool ok) {
      if (depositingTokenFlag) {
        return true;
      } else {
        revert();
      }
  }

  /**
  * This function handles withdrawals of Ethereum based tokens from the contract.
  * Does not allow Ether.
  * If token transfer fails, transaction is reverted and remaining gas is refunded.
  * Emits a Withdraw event.
  * @param token Ethereum contract address of the token or 0 for Ether
  * @param amount uint of the amount of the token the user wishes to withdraw
  */
  function withdrawToken(address token, uint amount) public {
    require(token != ethAddress);
    require(tokens[token][msg.sender] >= amount);
    tokens[token][msg.sender] = tokens[token][msg.sender].sub(amount);
    require(IToken(token).transfer(msg.sender, amount));
    emit Withdraw(token, msg.sender, amount, tokens[token][msg.sender]);
  }

  /**
  * Retrieves the balance of a token based on a user address and token address.
  * @param token Ethereum contract address of the token or 0 for Ether
  * @param user Ethereum address of the user
  * @return the amount of tokens on the exchange for a given user address
  */
  function balanceOf(address token, address user) public view returns (uint) {
    return tokens[token][user];
  }

  ////////////////////////////////////////////////////////////////////////////////
  // Trading
  ////////////////////////////////////////////////////////////////////////////////

  // adds token to tokenList array
  function addToken(address newTokenAddress) public {
    tokenList.push(newTokenAddress);
  }

  // function which converts the address of a token in tokenList to its int location
  function convertTokenAddressToInt(address tokenAddress) public returns (uint) {
    uint length = tokenList.length;

    for (uint i = 0; i < length; i++) {
        if(tokenList[i] == tokenAddress){
            return i;
        }
    }

    return tokenList.length; // return unreachable number because -1 cannot be returned
  }

  // function which returns the total orderbook for a certain coin
  function returnTokenOrderbook(address tokenAddress) public returns (address[] memory, uint[] memory) {
    address[] memory userAddresses;
    uint[] memory userOrders;

    for (uint i = 0; i < tokenOrderAmount[tokenAddress]; i++) {
      userAddresses[i] = orderbook[tokenAddress][i].user;
      userOrders[i] = orderbook[tokenAddress][i].amountGet;
      userOrders[i+1] = orderbook[tokenAddress][i].amountGive;
      userOrders[i+2] = orderbook[tokenAddress][i].intTokenAddressLocation;
      userOrders[i+3] = orderbook[tokenAddress][i].expires;
      userOrders[i+4] = orderbook[tokenAddress][i].nonce;
    }

    return (userAddresses, userOrders);
  }

  /**
  * Stores the active order inside of the contract.
  * Emits an Order event.
  * Note: tokenGet & tokenGive can be the Ethereum contract address.
  * @param tokenGet Ethereum contract address of the token to receive
  * @param amountGet uint amount of tokens being received
  * @param tokenGive Ethereum contract address of the token to give
  * @param amountGive uint amount of tokens being given
  * @param expires uint of block number when this order should expire
  * @param nonce arbitrary random number
  */
  function order(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce) public {
    bytes32 hash = sha256(abi.encodePacked(address(this), tokenGet, amountGet, tokenGive, amountGive, expires, nonce));
    orders[msg.sender][hash] = true;
    // add to the orderbook
    UserOrder memory newOrder = UserOrder(msg.sender, amountGet, amountGive, convertTokenAddressToInt(tokenGive), expires, nonce);
    orderbook[tokenGet].push(newOrder);
    tokenOrderAmount[tokenGet] = tokenOrderAmount[tokenGet] + 1;

    emit Order(tokenGet, amountGet, tokenGive, amountGive, expires, nonce, msg.sender);
  }

  /**
  * Facilitates a trade from one user to another.
  * Requires that the transaction is signed properly, the trade isn't past its expiration, and all funds are present to fill the trade.
  * Calls tradeBalances().
  * Updates orderFills with the amount traded.
  * Emits a Trade event.
  * Note: tokenGet & tokenGive can be the Ethereum contract address.
  * Note: amount is in amountGet / tokenGet terms.
  * @param tokenGet Ethereum contract address of the token to receive
  * @param amountGet uint amount of tokens being received
  * @param tokenGive Ethereum contract address of the token to give
  * @param amountGive uint amount of tokens being given
  * @param expires uint of block number when this order should expire
  * @param nonce arbitrary random number
  * @param user Ethereum address of the user who placed the order (other person)
  * @param amount uint amount in terms of tokenGet that will be "buy" in the trade
  */
  function trade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint amount) public {
    bytes32 hash = sha256(abi.encodePacked(address(this), tokenGet, amountGet, tokenGive, amountGive, expires, nonce));
    require(orders[user][hash] && (block.number <= expires) && (orderFills[user][hash].add(amount) <= amountGet));
    tradeBalances(tokenGet, amountGet, tokenGive, amountGive, user, amount);
    orderFills[user][hash] = orderFills[user][hash].add(amount);
    emit Trade(tokenGet, amount, tokenGive, amountGive.mul(amount) / amountGet, user, msg.sender);
  }

  /**
  * This is a private function and is only being called from trade().
  * Handles the movement of funds when a trade occurs.
  * Takes fees.
  * Updates token balances for both buyer and seller.
  * Note: tokenGet & tokenGive can be the Ethereum contract address.
  * Note: amount is in amountGet / tokenGet terms.
  * @param tokenGet Ethereum contract address of the token to receive
  * @param amountGet uint amount of tokens being received
  * @param tokenGive Ethereum contract address of the token to give
  * @param amountGive uint amount of tokens being given
  * @param user Ethereum address of the user who placed the order
  * @param amount uint amount in terms of tokenGet that will be "buy" in the trade
  */
  function tradeBalances(address tokenGet, uint amountGet, address tokenGive, uint amountGive, address user, uint amount) private {
    uint feeTakeXfer = amount.mul(feeTake).div(1 ether);

    // note - no maker fee!
    tokens[tokenGet][msg.sender] = tokens[tokenGet][msg.sender].sub(amount.add(feeTakeXfer));
    tokens[tokenGet][user] = tokens[tokenGet][user].add(amount);
    tokens[tokenGet][feeAccount] = tokens[tokenGet][feeAccount].add(feeTakeXfer);
    tokens[tokenGive][user] = tokens[tokenGive][user].sub(amountGive.mul(amount).div(amountGet));
    tokens[tokenGive][msg.sender] = tokens[tokenGive][msg.sender].add(amountGive.mul(amount).div(amountGet));

    //delete orderbook[tokenGet][msg.sender][amountGet, amountGive, convertTokenAddressToInt(tokenGive), expires, nonce];
  }

  /**
  * This function is to test if a trade would go through.
  * Note: tokenGet & tokenGive can be the Ethereum contract address.
  * Note: amount is in amountGet / tokenGet terms.
  * @param tokenGet Ethereum contract address of the token to receive
  * @param amountGet uint amount of tokens being received
  * @param tokenGive Ethereum contract address of the token to give
  * @param amountGive uint amount of tokens being given
  * @param expires uint of block number when this order should expire
  * @param nonce arbitrary random number
  * @param user Ethereum address of the user who placed the order
  * @param amount uint amount in terms of tokenGet that will be "buy" in the trade
  * @param sender Ethereum address of the user taking the order
  * @return bool: true if the trade would be successful, false otherwise
  */
  function testTrade(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user, uint amount, address sender) public view returns(bool) {
    if (!(tokens[tokenGet][sender] >= amount && availableVolume(tokenGet, amountGet, tokenGive, amountGive, expires, nonce, user) >= amount)) {
      return false;
    } else {
      return true;
    }
  }

  /**
  * This function checks the available volume for a given order.
  * Note: tokenGet & tokenGive can be the Ethereum contract address.
  * @param tokenGet Ethereum contract address of the token to receive
  * @param amountGet uint amount of tokens being received
  * @param tokenGive Ethereum contract address of the token to give
  * @param amountGive uint amount of tokens being given
  * @param expires uint of block number when this order should expire
  * @param nonce arbitrary random number
  * @param user Ethereum address of the user who placed the order
  * @return uint: amount of volume available for the given order in terms of amountGet / tokenGet
  */
  function availableVolume(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user) public view returns(uint) {
    bytes32 hash = sha256(abi.encodePacked(address(this), tokenGet, amountGet, tokenGive, amountGive, expires, nonce));
    if (!(orders[user][hash] && block.number <= expires)) {
      return 0;
    }
    uint[2] memory volume;
    volume[0] = amountGet.sub(orderFills[user][hash]);
    volume[1] = tokens[tokenGive][user].mul(amountGet) / amountGive;
    if (volume[0] < volume[1]) {
      return volume[0];
    } else {
      return volume[1];
    }
  }

  /**
  * This function checks the amount of an order that has already been filled.
  * Note: tokenGet & tokenGive can be the Ethereum contract address.
  * @param tokenGet Ethereum contract address of the token to receive
  * @param amountGet uint amount of tokens being received
  * @param tokenGive Ethereum contract address of the token to give
  * @param amountGive uint amount of tokens being given
  * @param expires uint of block number when this order should expire
  * @param nonce arbitrary random number
  * @param user Ethereum address of the user who placed the order
  * @return uint: amount of the given order that has already been filled in terms of amountGet / tokenGet
  */
  function amountFilled(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce, address user) public view returns(uint) {
    bytes32 hash = sha256(abi.encodePacked(address(this), tokenGet, amountGet, tokenGive, amountGive, expires, nonce));
    return orderFills[user][hash];
  }

  /**
  * This function cancels a given order by editing its fill data to the full amount.
  * Requires that the transaction is signed properly.
  * Updates orderFills to the full amountGet
  * Emits a Cancel event.
  * Note: tokenGet & tokenGive can be the Ethereum contract address.
  * @param tokenGet Ethereum contract address of the token to receive
  * @param amountGet uint amount of tokens being received
  * @param tokenGive Ethereum contract address of the token to give
  * @param amountGive uint amount of tokens being given
  * @param expires uint of block number when this order should expire
  * @param nonce arbitrary random number
  * @return uint: amount of the given order that has already been filled in terms of amountGet / tokenGet
  */
  function cancelOrder(address tokenGet, uint amountGet, address tokenGive, uint amountGive, uint expires, uint nonce) public {
    bytes32 hash = sha256(abi.encodePacked(address(this), tokenGet, amountGet, tokenGive, amountGive, expires, nonce));
    require (orders[msg.sender][hash]);
    orderFills[msg.sender][hash] = amountGet;
    //orderbook[tokenGet][msg.sender] = [amountGet, amountGive, convertTokenAddressToInt(tokenGive), expires, nonce];
    emit Cancel(tokenGet, amountGet, tokenGive, amountGive, expires, nonce, msg.sender);
  }



  ////////////////////////////////////////////////////////////////////////////////
  // Contract Versioning / Migration
  ////////////////////////////////////////////////////////////////////////////////

  /**
  * User triggered function to migrate funds into a new contract to ease updates.
  * Emits a FundsMigrated event.
  * @param newContract Contract address of the new contract we are migrating funds to
  * @param tokens_ Array of token addresses that we will be migrating to the new contract
  */
  function migrateFunds(address newContract, address[] memory tokens_) public {

    require(newContract != address(0));

    OurExchange newExchange = OurExchange(newContract);

    // Move Ether into new exchange.
    uint etherAmount = tokens[ethAddress][msg.sender];
    if (etherAmount > 0) {
      tokens[ethAddress][msg.sender] = 0;
      newExchange.depositForUser.value(etherAmount)(msg.sender);
    }

    // Move Tokens into new exchange.
    for (uint16 n = 0; n < tokens_.length; n++) {
      address token = tokens_[n];
      require(token != address(0)); // Ether is handled above.
      uint tokenAmount = tokens[token][msg.sender];

      if (tokenAmount != 0) {
      	require(IToken(token).approve(address(newExchange), tokenAmount));
      	tokens[token][msg.sender] = 0;
      	newExchange.depositTokenForUser(token, tokenAmount, msg.sender);
      }
    }

    emit FundsMigrated(msg.sender, newContract);
  }

  /**
  * This function handles deposits of Ether into the contract, but allows specification of a user.
  * Note: This is generally used in migration of funds.
  * Note: With the payable modifier, this function accepts Ether.
  */
  function depositForUser(address user) public payable {
    require(user != address(0));
    require(msg.value > 0);
    tokens[ethAddress][user] = tokens[ethAddress][user].add(msg.value);
  }

  /**
  * This function handles deposits of Ethereum based tokens into the contract, but allows specification of a user.
  * Does not allow Ether.
  * If token transfer fails, transaction is reverted and remaining gas is refunded.
  * Note: This is generally used in migration of funds.
  * Note: Remember to call Token(address).approve(this, amount) or this contract will not be able to do the transfer on your behalf.
  * @param token Ethereum contract address of the token
  * @param amount uint of the amount of the token the user wishes to deposit
  */
  function depositTokenForUser(address token, uint amount, address user) public {
    require(token != address(0));
    require(user != address(0));
    require(amount > 0);
    depositingTokenFlag = true;
    require(IToken(token).transferFrom(msg.sender, address(this), amount));
    depositingTokenFlag = false;
    tokens[token][user] = tokens[token][user].add(amount);
  }

}
