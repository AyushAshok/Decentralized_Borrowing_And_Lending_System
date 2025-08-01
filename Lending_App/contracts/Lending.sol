// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Lending {
    enum State {Requested,Funded,Repaid,Defaulted,Cancelled}

    struct Loan {
        address borrower;
        address lender;
        uint256 requested_amt;
        uint256 repay_amt;
        uint256 interest_rate;
        State state;
        uint256 date;
        uint256 collateral_amt;
    }

    mapping(address => Loan) public loans;
    uint256 public Balance;
    mapping(address => uint256) public lenderContributions;

    event Requested(address indexed borrower,address indexed lender,uint256 amount);
    event Funded(address indexed borrower,address indexed lender,uint256 amount);
    event Repaid(address indexed borrower,address indexed lender,uint256 amount);
    event LoanCancelled(address indexed borrower, uint256 amount);
    event Defaulted(address indexed borrower,address indexed lender,uint256 amount);

    function addFund() public payable {
        require(msg.value > 0, "Must send some ETH");
        Balance += msg.value;
        lenderContributions[msg.sender] += msg.value;
    }

    function requestLoan(uint256 amt, address lender) public payable {
        require(amt > 0, "Loan amount must be > 0");
        require(lender != address(0), "Invalid lender address");
        require(lenderContributions[lender] > 5,"Lender has not contributed atleast 5 ETH to pool");
        require(msg.value >= (amt * 10) / 100,"Collateral must be >= 10% of loan");

        Loan storage existingLoan = loans[msg.sender];
        require(existingLoan.state == State.Defaulted || existingLoan.state == State.Repaid || existingLoan.state == State.Cancelled || existingLoan.state == State(0),"Repay or cancel existing loan first");

        uint256 repay_amt = RepayAmount(amt);

        loans[msg.sender] = Loan({
            borrower: msg.sender,
            lender: lender,
            requested_amt: amt,
            repay_amt: repay_amt,
            interest_rate: 6,
            state: State.Requested,
            date: block.timestamp,
            collateral_amt: msg.value
        });

        emit Requested(msg.sender, lender, amt);
    }

    function RepayAmount(uint256 amt) internal pure returns (uint256) {
        uint256 interest = (amt * 6) / 100;
        return amt + interest;
    }

    function fundLoan(address borrower) external payable {
        Loan storage loan = loans[borrower];
        require(loan.state == State.Requested, "Loan not in requested state");
        require(
            msg.sender == loan.lender,
            "Only the selected lender can fund this loan"
        );
        require(msg.value == loan.requested_amt, "Incorrect ETH amount sent");

        payable(borrower).transfer(msg.value);
        loan.state = State.Funded;
        loan.date = block.timestamp;

        emit Funded(borrower, msg.sender, msg.value);
    }

    function repayLoan() public payable {
        Loan storage loan = loans[msg.sender];
        require(loan.state == State.Funded, "Loan not in active state");
        require(msg.value == loan.repay_amt, "Incorrect repay amount");

        payable(loan.lender).transfer(msg.value);
        loan.state = State.Repaid;
        payable(msg.sender).transfer(loan.collateral_amt);

        emit Repaid(msg.sender, loan.lender, msg.value);
    }

    // Cancel a loan (only by borrower)
    function cancelLoan() public {
        Loan storage loan = loans[msg.sender];
        require(loan.state == State.Requested,"Can only cancel requested loans");

        loan.state = State.Cancelled;
        payable(msg.sender).transfer(loan.collateral_amt);

        emit LoanCancelled(msg.sender, loan.requested_amt);
    }

    // Liquidate collateral (only by lender)
    function liquidateCollateral(address borrower) public {
        Loan storage loan = loans[borrower];

        require(loan.state == State.Funded, "Loan must be in Funded state");
        require(msg.sender == loan.lender, "Only the lender can liquidate");
        require(block.timestamp > loan.date + 1 minutes, "Loan not overdue");

        loan.state = State.Defaulted;
        payable(msg.sender).transfer(loan.collateral_amt);

        emit Defaulted(borrower, msg.sender, loan.collateral_amt);
    }
}
