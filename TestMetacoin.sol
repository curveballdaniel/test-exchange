pragma solidity >=0.4.21 <0.6.0;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/MetaCoin.sol";

// import "../contracts/MetaCoin.sol";

contract TestMetacoin {
    function testInitialBalanceUsingDeployedContract() public {
        MetaCoin meta = MetaCoin(DeployedAddresses.MetaCoin());

        uint expected = 1000000 * 10 ** 18;

        Assert.equal(
            meta.balanceOf(msg.sender),
            expected,
            "Owner should have X MetaCoin initially"
        );
    }

    function testInitialBalanceWithNewMetaCoin() public {
        MetaCoin meta = new MetaCoin();

        uint expected = 1000000 * 10 ** 18;
        address admin = 0x7293a4a0ba78529E1355dD2caF811279332947F7;

        Assert.equal(
            meta.balanceOf(address(admin)),
            expected,
            "Owner should have x MetaCoin initially"
        );
    }
}
