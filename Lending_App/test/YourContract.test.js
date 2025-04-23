const YourContract = artifacts.require("Lending");

contract("YourContract", accounts => {
    it("should emit debug events during liquidation", async () => {
        const instance = await YourContract.deployed();

        const borrowerAddress = '0xB56f908942683b5Cb2643Fa13F5eBAB18820b340';
        // Your lender address
        const lenderAddress = '0x5Bff29f667f69418b433BE4c91Ce75738F750fc2';

        const tx = await instance.liquidateCollateral(borrowerAddress, { from: lenderAddress });

        tx.logs.forEach(log => {
            if (log.event === "Debug") {
                console.log("💬 Debug:", log.args.message);
            }
        });
    });
});
